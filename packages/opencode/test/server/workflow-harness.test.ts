import path from "node:path"
import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { Workflow } from "@opencode-ai/schema/workflow"
import { TestInstance } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"
import { reply, TestLLMServer } from "../lib/llm-server"
import { Server } from "../../src/server/server"

const it = testEffect(TestLLMServer.layer)
const request = Effect.fn("test.workflowHarness.request")(function* (url: string, method = "GET", body?: unknown) {
  const project = yield* TestInstance
  const response = yield* Effect.promise(async () =>
    Server.Default().app.request(url, {
      method,
      headers: { "x-opencode-directory": project.directory, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  )
  return { status: response.status, body: yield* Effect.promise(() => response.json()) }
})
const spec: Workflow.HarnessSpec = {
  model: { providerID: "workflow-test", modelID: "small" },
  instructions: "Extract one customer name. Return the JSON name field only.",
  modelReason: "Known cheap text model.",
  allowedTools: [],
  timeoutSeconds: 5,
  maxOutputChars: 100,
  outputFormat: "json",
  requiredJsonKeys: ["name"],
  checklist: ["The name matches the input."],
}
const init = (directory: string) =>
  Effect.gen(function* () {
    const llm = yield* TestLLMServer
    yield* Effect.promise(() =>
      Bun.write(
        path.join(directory, "opencode.json"),
        JSON.stringify({
          formatter: false,
          lsp: false,
          permission: { read: "deny", edit: { "*": "ask", "*.secret": "deny" } },
          provider: {
            "workflow-test": {
              name: "Workflow Test",
              npm: "@ai-sdk/openai-compatible",
              options: { apiKey: "test", baseURL: llm.url },
              models: {
                small: {
                  name: "Small",
                  tool_call: true,
                  limit: { context: 100000, output: 10000 },
                  cost: { input: 0.1, output: 0.2 },
                },
              },
            },
          },
        }),
      ),
    )
  })
const setup = Effect.fn("test.workflowHarness.setup")(function* () {
  const project = yield* TestInstance
  const definition: Workflow.Definition = {
    version: 1,
    id: "harness-example",
    name: "Customer extraction",
    directory: project.directory,
    description: "",
    updatedAt: 0,
    nodes: [
      { id: "start", name: "Start", kind: "start", x: 0, y: 0 },
      {
        id: "work",
        name: "Extract",
        kind: "task",
        x: 200,
        y: 0,
        prompt: "Extract the name.",
        model: { providerID: "unavailable-original", modelID: "original" },
        skills: [],
        mcpServers: [],
      },
    ],
    edges: [{ id: "next", from: "start", to: "work" }],
  }
  expect((yield* request("/workflow", "PUT", definition)).status).toBe(200)
  const lab = yield* request("/workflow/harness-example/node/work/harness")
  expect(lab.status).toBe(200)
  return yield* Schema.decodeUnknownEffect(Workflow.HarnessLab)(lab.body)
})
const base = "/workflow/harness-example/node/work/harness"
const draft = Effect.fn("test.workflowHarness.draft")(function* (lab: Workflow.HarnessLab, next: Workflow.HarnessSpec) {
  const response = yield* request(base, "PUT", {
    spec: next,
    goal: "Extract names",
    feedback: "",
    expectedRevision: lab.draft?.revision ?? null,
    nodeFingerprint: lab.nodeFingerprint,
  })
  expect(response.status).toBe(200)
  return yield* Schema.decodeUnknownEffect(Workflow.HarnessDraft)(response.body)
})
const progress = (id: string, status: Workflow.Run["status"]) =>
  pollWithTimeout(
    Effect.gen(function* () {
      const response = yield* request(`/workflow/run/${id}`)
      expect(response.status).toBe(200)
      const run = yield* Schema.decodeUnknownEffect(Workflow.Run)(response.body)
      return run.status === status ? run : undefined
    }),
    `Harness trial did not become ${status}`,
    "12 seconds",
  )

it.instance(
  "real harness execution pins model and instructions, gates edit aliases and honors project permissions",
  () =>
    Effect.gen(function* () {
      const llm = yield* TestLLMServer
      const project = yield* TestInstance
      const lab = yield* setup()
      const saved = yield* draft(lab, { ...spec, allowedTools: ["write", "read"], timeoutSeconds: 15 })
      const stale = yield* request(`${base}/design`, "POST", {
        designerModel: spec.model,
        executionModel: spec.model,
        goal: "Extract",
        feedback: "",
        expectedRevision: null,
        nodeFingerprint: lab.nodeFingerprint,
      })
      expect(stale.status).toBe(409)
      expect(yield* llm.calls).toBe(0)
      yield* llm.push(
        reply().tool("write", { filePath: path.join(project.directory, "customer.txt"), content: "Jane" }),
        reply().text('{"name":"Jane"}').stop(),
      )
      const response = yield* request(`${base}/test`, "POST", { revision: saved.revision, input: "Jane", outputs: {} })
      expect(response.status).toBe(200)
      const trial = yield* Schema.decodeUnknownEffect(Workflow.Run)(response.body)
      const pending = yield* pollWithTimeout(
        Effect.gen(function* () {
          const response = yield* request("/permission")
          const requests = yield* Schema.decodeUnknownEffect(
            Schema.Array(Schema.Struct({ id: Schema.String, permission: Schema.String, sessionID: Schema.String })),
          )(response.body)
          return requests.find((item) => item.permission === "edit")
        }),
        "Harness did not request edit approval",
      )
      const inputs = yield* llm.inputs
      expect(inputs).toHaveLength(1)
      expect(inputs[0].model).toBe("small")
      expect(JSON.stringify(inputs[0].messages)).toContain(spec.instructions)
      const tools = yield* Schema.decodeUnknownEffect(
        Schema.Array(Schema.Struct({ function: Schema.Struct({ name: Schema.String }) })),
      )(inputs[0].tools)
      expect(tools.map((tool) => tool.function.name)).toEqual(["write"])
      expect(yield* Effect.promise(() => Bun.file(path.join(project.directory, "customer.txt")).exists())).toBe(false)
      const running = yield* request(`/workflow/run/${trial.id}`)
      const active = yield* Schema.decodeUnknownEffect(Workflow.Run)(running.body)
      expect(active.steps.find((step) => step.nodeID === "work")?.sessionID).toBe(pending.sessionID)
      expect((yield* request(`/permission/${pending.id}/reply`, "POST", { reply: "once" })).status).toBe(200)
      const completed = yield* progress(trial.id, "completed")
      expect(completed.steps.find((step) => step.nodeID === "work")).toMatchObject({
        output: '{"name":"Jane"}',
        validation: { passed: true, errors: [] },
      })
      expect(yield* Effect.promise(() => Bun.file(path.join(project.directory, "customer.txt")).text())).toBe("Jane")
      const accepted = yield* request(`${base}/accept`, "POST", { revision: saved.revision, testRunID: trial.id })
      expect(accepted.status).toBe(200)
      const definition = yield* Schema.decodeUnknownEffect(Workflow.Definition)(accepted.body)
      expect(definition.nodes.find((node) => node.id === "work")).toMatchObject({
        model: spec.model,
        harness: { spec: saved.spec, testRunID: trial.id },
      })
      const persisted = yield* request(base)
      expect(persisted.body).toMatchObject({
        draft: { revision: saved.revision },
        trials: [{ id: trial.id, status: "completed" }],
      })
    }),
  { git: true, init },
  30000,
)

it.instance(
  "harness timeout and cancellation stop the real provider session and retain durable trial status",
  () =>
    Effect.gen(function* () {
      const llm = yield* TestLLMServer
      const lab = yield* setup()
      const saved = yield* draft(lab, spec)
      yield* llm.hang
      const response = yield* request(`${base}/test`, "POST", { revision: saved.revision, input: "Jane", outputs: {} })
      const trial = yield* Schema.decodeUnknownEffect(Workflow.Run)(response.body)
      yield* llm.wait(1)
      const failed = yield* progress(trial.id, "failed")
      expect(failed.error).toContain("5 second limit")
      expect(failed.steps.find((step) => step.nodeID === "work")?.sessionID).toBeDefined()
      const reject = yield* request(`${base}/accept`, "POST", { revision: saved.revision, testRunID: trial.id })
      expect(reject.status).toBe(409)
      yield* llm.hang
      const next = yield* request(`${base}/test`, "POST", { revision: saved.revision, input: "Jane", outputs: {} })
      const cancelled = yield* Schema.decodeUnknownEffect(Workflow.Run)(next.body)
      yield* llm.wait(2)
      expect((yield* request(`/workflow/run/${cancelled.id}/cancel`, "POST")).status).toBe(200)
      const stopped = yield* progress(cancelled.id, "cancelled")
      const sessionID = stopped.steps.find((step) => step.nodeID === "work")?.sessionID
      expect(sessionID).toBeDefined()
      yield* pollWithTimeout(
        Effect.gen(function* () {
          const response = yield* request("/session/status")
          const statuses = yield* Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Unknown))(
            response.body,
          )
          return sessionID && !Object.hasOwn(statuses, sessionID) ? true : undefined
        }),
        "Cancelled harness session did not become idle",
      )
      const statuses = yield* request("/session/status")
      const status = yield* Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Unknown))(statuses.body)
      expect(Object.hasOwn(status, failed.steps.find((step) => step.nodeID === "work")!.sessionID!)).toBe(false)
      const final = yield* request(`/workflow/run/${cancelled.id}`)
      expect(final.body).toMatchObject({ status: "cancelled" })
    }),
  { git: true, init },
  30000,
)

it.instance(
  "failed harness output is inspectable and refinement requires a new successful revision",
  () =>
    Effect.gen(function* () {
      const llm = yield* TestLLMServer
      const lab = yield* setup()
      const saved = yield* draft(lab, { ...spec, outputFormat: "text", requiredJsonKeys: [], maxOutputChars: 3 })
      yield* llm.text("Jane")
      const response = yield* request(`${base}/test`, "POST", { revision: saved.revision, input: "Jane", outputs: {} })
      const trial = yield* Schema.decodeUnknownEffect(Workflow.Run)(response.body)
      const failed = yield* progress(trial.id, "failed")
      expect(failed.steps.find((step) => step.nodeID === "work")).toMatchObject({
        output: "Jan",
        validation: { passed: false, errors: ["Output exceeds the 3 character limit."] },
        sessionID: expect.any(String),
      })
      const current = yield* Schema.decodeUnknownEffect(Workflow.HarnessLab)((yield* request(base)).body)
      const refined = yield* draft(current, spec)
      expect(refined.revision).not.toBe(saved.revision)
      expect(
        (yield* request(`${base}/accept`, "POST", { revision: refined.revision, testRunID: trial.id })).status,
      ).toBe(409)
      expect(
        (yield* request(`${base}/test`, "POST", { revision: saved.revision, input: "Jane", outputs: {} })).status,
      ).toBe(409)
      yield* llm.text('{"name":"Jane"}')
      const next = yield* Schema.decodeUnknownEffect(Workflow.Run)(
        (yield* request(`${base}/test`, "POST", { revision: refined.revision, input: "Jane", outputs: {} })).body,
      )
      yield* progress(next.id, "completed")
      expect(
        (yield* request(`${base}/accept`, "POST", { revision: refined.revision, testRunID: next.id })).status,
      ).toBe(200)
    }),
  { git: true, init },
  30000,
)
