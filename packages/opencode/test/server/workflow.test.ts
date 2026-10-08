import path from "node:path"
import { symlink } from "node:fs/promises"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { Workflow } from "@opencode-ai/schema/workflow"
import { TestInstance, tmpdir } from "../fixture/fixture"
import { pollWithTimeout, it } from "../lib/effect"
import { Server } from "../../src/server/server"

// Web handler exercises the full typed routes without needing a listening socket.
function requestInDirectory(url: string, directory: string, init: RequestInit = {}) {
  return Effect.promise(async () => {
    const response = await Server.Default().app.request(url, {
      ...init,
      headers: { ...Object.fromEntries(new Headers(init.headers)), "x-opencode-directory": directory },
    })
    return { status: response.status, json: Effect.promise(() => response.json()) }
  })
}
const definition = (directory: string): Workflow.Definition => ({
  version: 1,
  id: "example",
  name: "Release review",
  directory,
  description: "Check before publishing",
  updatedAt: 0,
  nodes: [
    { id: "start", name: "Start", x: 0, y: 0, kind: "start" },
    { id: "confirm", name: "Review", x: 200, y: 0, kind: "approval", instructions: "Review the input." },
  ],
  edges: [{ id: "next", from: "start", to: "confirm" }],
})
const json = (body: unknown) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) })

it.instance(
  "workflows run beyond the start request and persist approval history",
  () =>
    Effect.gen(function* () {
      const project = yield* TestInstance
      const save = yield* requestInDirectory("/workflow", project.directory, {
        method: "PUT",
        ...json(definition(project.directory)),
      })
      expect(save.status).toBe(200)
      const start = yield* requestInDirectory("/workflow/example/run", project.directory, {
        method: "POST",
        ...json({ input: "Ready to ship" }),
      })
      expect(start.status).toBe(200)
      const run = yield* Schema.decodeUnknownEffect(Workflow.Run)(yield* start.json)
      const waiting = yield* pollWithTimeout(
        Effect.gen(function* () {
          const progress = yield* requestInDirectory(`/workflow/run/${run.id}`, project.directory)
          expect(progress.status).toBe(200)
          const current = yield* Schema.decodeUnknownEffect(Workflow.Run)(yield* progress.json)
          return current.status === "waiting" ? current : undefined
        }),
        "workflow never reached approval",
      )
      expect(waiting.steps.find((step) => step.nodeID === "start")?.output).toBe("Ready to ship")
      const approve = yield* requestInDirectory(`/workflow/run/${run.id}/approve`, project.directory, {
        method: "POST",
        ...json({ nodeID: "confirm" }),
      })
      expect(approve.status).toBe(200)
      const completed = yield* pollWithTimeout(
        Effect.gen(function* () {
          const progress = yield* requestInDirectory(`/workflow/run/${run.id}`, project.directory)
          const current = yield* Schema.decodeUnknownEffect(Workflow.Run)(yield* progress.json)
          return current.status === "completed" ? current : undefined
        }),
        "approved workflow never completed",
      )
      expect(completed.steps.every((step) => step.status === "completed")).toBe(true)
      const history = yield* requestInDirectory("/workflow/example/runs", project.directory)
      expect(history.status).toBe(200)
      expect(yield* history.json).toMatchObject([{ id: run.id, status: "completed" }])
    }),
  { git: true, config: { formatter: false, lsp: false } },
)

it.instance(
  "workflow routes reject mismatched project saves and isolate run IDs",
  () =>
    Effect.gen(function* () {
      const project = yield* TestInstance
      const outside = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir({ git: true })),
        (directory) => Effect.promise(() => directory[Symbol.asyncDispose]()),
      )
      const wrong = yield* requestInDirectory("/workflow", project.directory, {
        method: "PUT",
        ...json(definition(outside.path)),
      })
      expect(wrong.status).toBe(400)
      expect(yield* wrong.json).toMatchObject({
        _tag: "WorkflowInvalidError",
        message: "A workflow must be saved to the selected project directory.",
      })
      const missing = yield* requestInDirectory("/workflow/run/run-missing", outside.path)
      expect(missing.status).toBe(404)
      expect(yield* missing.json).toMatchObject({ _tag: "WorkflowNotFoundError", message: expect.any(String) })
    }),
  { git: true, config: { formatter: false, lsp: false } },
)

it.instance(
  "an unavailable selected model fails its step instead of falling back",
  () =>
    Effect.gen(function* () {
      const project = yield* TestInstance
      const workflow = definition(project.directory)
      const task: Workflow.Node = {
        id: "work",
        name: "Explicit model",
        x: 200,
        y: 0,
        kind: "task",
        prompt: "Respond",
        model: { providerID: "workflow-missing", modelID: "workflow-missing" },
        skills: [],
        mcpServers: [],
      }
      const save = yield* requestInDirectory("/workflow", project.directory, {
        method: "PUT",
        ...json({ ...workflow, nodes: [workflow.nodes[0], task], edges: [{ id: "next", from: "start", to: "work" }] }),
      })
      expect(save.status).toBe(200)
      const start = yield* requestInDirectory("/workflow/example/run", project.directory, {
        method: "POST",
        ...json({ input: "Test" }),
      })
      const run = yield* Schema.decodeUnknownEffect(Workflow.Run)(yield* start.json)
      const failed = yield* pollWithTimeout(
        Effect.gen(function* () {
          const progress = yield* requestInDirectory(`/workflow/run/${run.id}`, project.directory)
          const current = yield* Schema.decodeUnknownEffect(Workflow.Run)(yield* progress.json)
          return current.status === "failed" ? current : undefined
        }),
        "unavailable model did not fail",
      )
      expect(failed.steps.find((step) => step.nodeID === "work")?.status).toBe("failed")
      expect(failed.error).toContain("workflow-missing")
    }),
  { git: true, config: { formatter: false, lsp: false } },
)

it.instance(
  "direct MCP execution honors project ask permission and exposes its waiting session",
  () =>
    Effect.gen(function* () {
      const project = yield* TestInstance
      const workflow = definition(project.directory)
      const mcp: Workflow.Node = {
        id: "tool",
        name: "Run MCP",
        kind: "mcp",
        x: 200,
        y: 0,
        server: "demo",
        tool: "mark",
        arguments: { payload: "{{input}}", prior: "{{steps.start}}" },
      }
      const save = yield* requestInDirectory("/workflow", project.directory, {
        method: "PUT",
        ...json({ ...workflow, nodes: [workflow.nodes[0], mcp], edges: [{ id: "next", from: "start", to: "tool" }] }),
      })
      expect(save.status).toBe(200)
      const start = yield* requestInDirectory("/workflow/example/run", project.directory, {
        method: "POST",
        ...json({ input: "Test" }),
      })
      const run = yield* Schema.decodeUnknownEffect(Workflow.Run)(yield* start.json)
      const permission = yield* pollWithTimeout(
        Effect.gen(function* () {
          const response = yield* requestInDirectory("/permission", project.directory)
          const pending = yield* Schema.decodeUnknownEffect(
            Schema.Array(
              Schema.Struct({
                id: PermissionV1.ID,
                sessionID: PermissionV1.Request.fields.sessionID,
                permission: Schema.String,
                metadata: Schema.Unknown,
              }),
            ),
          )(yield* response.json)
          return pending.find((item) => item.permission === "demo_mark")
        }),
        "MCP permission was never requested",
        "15 seconds",
      )
      expect(permission.metadata).toMatchObject({ arguments: { payload: "Test", prior: "Test" } })
      expect(yield* Effect.promise(() => Bun.file(`${project.directory}/marker`).exists())).toBe(false)
      const progress = yield* requestInDirectory(`/workflow/run/${run.id}`, project.directory)
      const current = yield* Schema.decodeUnknownEffect(Workflow.Run)(yield* progress.json)
      expect(current.steps.find((step) => step.nodeID === "tool")?.sessionID).toBe(permission.sessionID)
      const approved = yield* requestInDirectory(`/permission/${permission.id}/reply`, project.directory, {
        method: "POST",
        ...json({ reply: "once" }),
      })
      expect(approved.status).toBe(200)
      const completed = yield* pollWithTimeout(
        Effect.gen(function* () {
          const progress = yield* requestInDirectory(`/workflow/run/${run.id}`, project.directory)
          const current = yield* Schema.decodeUnknownEffect(Workflow.Run)(yield* progress.json)
          return current.status === "completed" ? current : undefined
        }),
        "approved MCP did not finish",
      )
      expect(completed.steps.find((step) => step.nodeID === "tool")?.output).toContain("tool completed")
      expect(yield* Effect.promise(() => Bun.file(`${project.directory}/marker`).text())).toBe("called")
    }),
  {
    git: true,
    config: () => ({
      formatter: false,
      lsp: false,
      permission: { demo_mark: "ask" },
      mcp: {
        demo: {
          type: "local",
          command: [process.execPath, path.join(import.meta.dir, "../workflow/fixtures/mcp.ts"), "marker"],
        },
      },
    }),
  },
  60000,
)

it.instance(
  "workflow saves canonicalize project directory aliases",
  () =>
    Effect.gen(function* () {
      const project = yield* TestInstance
      const alias = path.join(project.directory, "project-alias")
      yield* Effect.promise(() => symlink(project.directory, alias))
      const save = yield* requestInDirectory("/workflow", alias, { method: "PUT", ...json(definition(alias)) })
      expect(save.status).toBe(200)
      const saved = yield* Schema.decodeUnknownEffect(Workflow.Definition)(yield* save.json)
      expect(saved.directory).toBe(project.directory)
      for (const directory of [project.directory, alias]) {
        const list = yield* requestInDirectory("/workflow", directory)
        expect(list.status).toBe(200)
        expect(yield* list.json).toMatchObject([{ id: saved.id, directory: project.directory }])
      }
    }),
  { git: true, config: { formatter: false, lsp: false } },
)
