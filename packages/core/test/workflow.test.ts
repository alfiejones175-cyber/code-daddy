import { describe, expect, test } from "bun:test"
import path from "node:path"
import { createHash } from "node:crypto"
import { readdir, stat } from "node:fs/promises"
import { Workflow } from "@opencode-ai/schema/workflow"
import { WorkflowEngine } from "../src/workflow"
import { tmpdir } from "./fixture/tmpdir"

const model = { providerID: "test", modelID: "vision" }
const start: Workflow.Node = { id: "start", kind: "start", name: "Start", x: 0, y: 0 }
const task = (id: string): Workflow.Node => ({
  id,
  kind: "task",
  name: id,
  x: 100,
  y: 0,
  prompt: "Do the task",
  model,
  skills: [],
  mcpServers: [],
})
const edge = (from: string, to: string, outcome?: "yes" | "no"): Workflow.Edge => ({
  id: `${from}_${to}_${outcome ?? "next"}`,
  from,
  to,
  ...(outcome ? { outcome } : {}),
})
function definition(
  directory: string,
  nodes: Workflow.Node[] = [start, task("task")],
  edges: Workflow.Edge[] = [edge("start", "task")],
): Workflow.Definition {
  return { version: 1, id: "workflow", name: "Workflow", directory, description: "", nodes, edges, updatedAt: 1 }
}
async function until(
  engine: ReturnType<typeof WorkflowEngine.create>,
  id: string,
  directory: string,
  status: Workflow.Run["status"],
) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const run = await engine.getRun(id, directory)
    if (run.status === status) return run
    if (["completed", "failed", "cancelled", "interrupted"].includes(run.status))
      throw new Error(`Expected ${status}, got ${run.status}: ${run.error}`)
    await Bun.sleep(5)
  }
  throw new Error(`Timed out waiting for ${status}`)
}

describe("durable workflow engine", () => {
  test.each(["yes", "no"] as const)(
    "routes %s decisions, skips inactive branches and runs a merge once",
    async (outcome) => {
      await using tmp = await tmpdir()
      const called: string[] = []
      const engine = WorkflowEngine.create({
        root: path.join(tmp.path, "storage"),
        execute: async (node, context) => {
          called.push(node.id)
          expect(context.directory).toBe(tmp.path)
          expect(context.outputs.start).toBe("request")
          if (node.id === "merge") expect(context.outputs[outcome]).toBe(outcome)
          return { output: node.id, ...(node.kind === "decision" ? { outcome } : {}), sessionID: "session" }
        },
      })
      await engine.save(
        definition(
          tmp.path,
          [
            start,
            {
              id: "decision",
              kind: "decision",
              name: "Decide",
              x: 1,
              y: 1,
              model: "clef",
              question: "Pass?",
              threshold: 0.9,
            },
            task("no"),
            task("yes"),
            task("merge"),
          ],
          [
            edge("start", "decision"),
            edge("decision", "yes", "yes"),
            edge("decision", "no", "no"),
            edge("yes", "merge"),
            edge("no", "merge"),
          ],
        ),
      )
      const run = await engine.start("workflow", tmp.path, "request")
      const done = await until(engine, run.id, tmp.path, "completed")
      expect(called).toEqual(["decision", outcome, "merge"])
      expect(done.steps.find((step) => step.nodeID === (outcome === "yes" ? "no" : "yes"))?.status).toBe("skipped")
      expect(done.steps.find((step) => step.nodeID === "merge")?.sessionID).toBe("session")
    },
  )

  test("approval survives a new engine and uses its frozen definition without replaying completed work", async () => {
    await using tmp = await tmpdir()
    const root = path.join(tmp.path, "storage")
    const calls: string[] = []
    const execute = async (node: Workflow.Node) => {
      calls.push(node.id)
      return { output: node.id }
    }
    const engine = WorkflowEngine.create({ root, execute })
    await engine.save(
      definition(
        tmp.path,
        [
          start,
          task("before"),
          { id: "approval", kind: "approval", name: "Review", x: 2, y: 0, instructions: "Review this" },
          task("after"),
        ],
        [edge("start", "before"), edge("before", "approval"), edge("approval", "after")],
      ),
    )
    const run = await engine.start("workflow", tmp.path, "input")
    await until(engine, run.id, tmp.path, "waiting")
    await expect(engine.start("workflow", tmp.path, "duplicate")).rejects.toMatchObject({ code: "conflict" })
    await expect(engine.remove("workflow", tmp.path)).rejects.toMatchObject({ code: "conflict" })
    await engine.save(definition(tmp.path))
    const restarted = WorkflowEngine.create({ root, execute })
    await restarted.approve(run.id, tmp.path, "approval")
    const done = await until(restarted, run.id, tmp.path, "completed")
    expect(calls).toEqual(["before", "after"])
    expect(done.definition.nodes.map((node) => node.id)).toEqual(["start", "before", "approval", "after"])
    await expect(restarted.approve(run.id, tmp.path, "approval")).rejects.toMatchObject({ code: "conflict" })
    await restarted.remove("workflow", tmp.path)
    expect(await restarted.list(tmp.path)).toEqual([])
    expect(await restarted.runs("workflow", tmp.path)).toHaveLength(1)
  })

  test("failed tools stop downstream work and retain the failure", async () => {
    await using tmp = await tmpdir()
    const calls: string[] = []
    const engine = WorkflowEngine.create({
      root: path.join(tmp.path, "storage"),
      execute: async (node) => {
        calls.push(node.id)
        throw new Error("Tool unavailable")
      },
    })
    await engine.save(
      definition(tmp.path, [start, task("task"), task("after")], [edge("start", "task"), edge("task", "after")]),
    )
    const run = await engine.start("workflow", tmp.path, "")
    const failed = await until(engine, run.id, tmp.path, "failed")
    expect(calls).toEqual(["task"])
    expect(failed.error).toBe("Tool unavailable")
    expect(failed.steps[1]?.status).toBe("failed")
    expect(failed.steps[2]?.status).toBe("pending")
  })

  test("cancellation aborts execution, keeps its terminal state and prevents overlapping restart", async () => {
    await using tmp = await tmpdir()
    const entered = Promise.withResolvers<AbortSignal>()
    const release = Promise.withResolvers<WorkflowEngine.Result>()
    const calls: string[] = []
    const engine = WorkflowEngine.create({
      root: path.join(tmp.path, "storage"),
      execute: async (node, context) => {
        calls.push(node.id)
        entered.resolve(context.signal)
        return release.promise
      },
    })
    await engine.save(
      definition(tmp.path, [start, task("task"), task("after")], [edge("start", "task"), edge("task", "after")]),
    )
    const run = await engine.start("workflow", tmp.path, "")
    const signal = await entered.promise
    await expect(engine.start("workflow", tmp.path, "duplicate")).rejects.toMatchObject({ code: "conflict" })
    await engine.cancel(run.id, tmp.path)
    expect(signal.aborted).toBe(true)
    await expect(engine.start("workflow", tmp.path, "too early")).rejects.toMatchObject({ code: "conflict" })
    release.resolve({ output: "Late result" })
    await Bun.sleep(20)
    const cancelled = await engine.getRun(run.id, tmp.path)
    expect(cancelled.status).toBe("cancelled")
    expect(cancelled.steps[1]?.status).toBe("cancelled")
    expect(cancelled.steps[1]?.output).toBeUndefined()
    expect(calls).toEqual(["task"])
  })

  test("orphaned running records become interrupted with no execution or approval retry", async () => {
    await using tmp = await tmpdir()
    const root = path.join(tmp.path, "storage")
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<WorkflowEngine.Result>()
    const engine = WorkflowEngine.create({
      root,
      execute: async () => {
        entered.resolve()
        return release.promise
      },
    })
    await engine.save(definition(tmp.path))
    const run = await engine.start("workflow", tmp.path, "")
    await entered.promise
    const calls: string[] = []
    const restarted = WorkflowEngine.create({
      root,
      execute: async (node) => {
        calls.push(node.id)
        return { output: "" }
      },
    })
    const recovered = await restarted.getRun(run.id, tmp.path)
    expect(recovered.status).toBe("interrupted")
    expect(recovered.steps[1]?.status).toBe("failed")
    await expect(restarted.approve(run.id, tmp.path, "approval")).rejects.toMatchObject({ code: "conflict" })
    release.resolve({ output: "Late result" })
    await Bun.sleep(20)
    expect((await restarted.getRun(run.id, tmp.path)).status).toBe("interrupted")
    expect(calls).toEqual([])
  })

  test("isolates projects and IDs and writes private atomic JSON files", async () => {
    await using tmp = await tmpdir()
    const root = path.join(tmp.path, "storage")
    const engine = WorkflowEngine.create({ root, execute: async () => ({ output: "done" }) })
    const other = path.join(tmp.path, "other")
    await engine.save(definition(tmp.path))
    expect(await engine.list(other)).toEqual([])
    await expect(engine.start("workflow", other, "")).rejects.toMatchObject({ code: "not_found" })
    const run = await engine.start("workflow", tmp.path, "")
    await until(engine, run.id, tmp.path, "completed")
    await expect(engine.getRun(run.id, other)).rejects.toMatchObject({ code: "not_found" })
    await expect(engine.cancel(run.id, other)).rejects.toMatchObject({ code: "not_found" })
    await expect(engine.getRun("../../escape", tmp.path)).rejects.toMatchObject({ code: "invalid" })
    expect(await engine.runs("workflow", other)).toEqual([])
    const folder = path.join(root, createHash("sha256").update(tmp.path).digest("hex"), "runs")
    expect(await readdir(folder)).toEqual([`${run.id}.json`])
    expect((await stat(path.join(folder, `${run.id}.json`))).mode & 0o777).toBe(0o600)
    expect((await stat(folder)).mode & 0o777).toBe(0o700)
  })

  test("rejects invalid graphs, duplicate IDs, dangling edges and empty task configuration", async () => {
    await using tmp = await tmpdir()
    const engine = WorkflowEngine.create({
      root: path.join(tmp.path, "storage"),
      execute: async () => ({ output: "" }),
    })
    const invalid = [
      definition(tmp.path, [task("task")], []),
      definition(tmp.path, [start, { ...start, id: "other" }], [edge("start", "other")]),
      definition(tmp.path, [start, task("task"), task("task")]),
      definition(tmp.path, [start, task("task")], [edge("start", "missing")]),
      definition(tmp.path, [start, task("task")], [edge("start", "task"), edge("task", "start")]),
      definition(tmp.path, [start, task("task")], []),
      definition(tmp.path, [start, { ...task("task"), kind: "task", prompt: "", model, skills: [], mcpServers: [] }]),
      definition(tmp.path, [start, task("task")], [edge("start", "task", "yes")]),
      definition(
        tmp.path,
        [
          start,
          { id: "d", kind: "decision", name: "Decision", x: 1, y: 1, question: "Yes?", model: "clef", threshold: 0.9 },
          task("task"),
        ],
        [edge("start", "d"), edge("d", "task", "yes")],
      ),
    ]
    for (const value of invalid) await expect(engine.save(value)).rejects.toMatchObject({ code: "invalid" })
    expect(await engine.list(tmp.path)).toEqual([])
  })

  test("missing decision output fails rather than silently choosing a branch", async () => {
    await using tmp = await tmpdir()
    const calls: string[] = []
    const engine = WorkflowEngine.create({
      root: path.join(tmp.path, "storage"),
      execute: async (node) => {
        calls.push(node.id)
        return { output: "uncertain" }
      },
    })
    await engine.save(
      definition(
        tmp.path,
        [
          start,
          {
            id: "decision",
            kind: "decision",
            name: "Decide",
            x: 1,
            y: 1,
            model: "clef",
            question: "Pass?",
            threshold: 0.9,
          },
          task("yes"),
          task("no"),
        ],
        [edge("start", "decision"), edge("decision", "yes", "yes"), edge("decision", "no", "no")],
      ),
    )
    const run = await engine.start("workflow", tmp.path, "")
    expect((await until(engine, run.id, tmp.path, "failed")).error).toBe("Decision did not return yes or no")
    expect(calls).toEqual(["decision"])
  })

  test("cancelling a paused approval prevents all continuation", async () => {
    await using tmp = await tmpdir()
    const calls: string[] = []
    const engine = WorkflowEngine.create({
      root: path.join(tmp.path, "storage"),
      execute: async (node) => {
        calls.push(node.id)
        return { output: "done" }
      },
    })
    await engine.save(
      definition(
        tmp.path,
        [
          start,
          { id: "approval", kind: "approval", name: "Review", x: 2, y: 0, instructions: "Review" },
          task("after"),
        ],
        [edge("start", "approval"), edge("approval", "after")],
      ),
    )
    const run = await engine.start("workflow", tmp.path, "")
    await until(engine, run.id, tmp.path, "waiting")
    await engine.cancel(run.id, tmp.path)
    await expect(engine.approve(run.id, tmp.path, "approval")).rejects.toMatchObject({ code: "conflict" })
    expect((await engine.getRun(run.id, tmp.path)).status).toBe("cancelled")
    expect(calls).toEqual([])
  })

  test("a stale approval retry cannot approve the next consecutive approval", async () => {
    await using tmp = await tmpdir()
    const engine = WorkflowEngine.create({
      root: path.join(tmp.path, "storage"),
      execute: async () => ({ output: "done" }),
    })
    await engine.save(
      definition(
        tmp.path,
        [
          start,
          { id: "first", kind: "approval", name: "First review", x: 1, y: 0, instructions: "Review first" },
          { id: "second", kind: "approval", name: "Second review", x: 2, y: 0, instructions: "Review second" },
        ],
        [edge("start", "first"), edge("first", "second")],
      ),
    )
    const run = await engine.start("workflow", tmp.path, "")
    await until(engine, run.id, tmp.path, "waiting")
    await engine.approve(run.id, tmp.path, "first")
    const waiting = await until(engine, run.id, tmp.path, "waiting")
    expect(waiting.steps.find((step) => step.status === "waiting")?.nodeID).toBe("second")
    await expect(engine.approve(run.id, tmp.path, "first")).rejects.toMatchObject({ code: "conflict" })
    expect((await engine.getRun(run.id, tmp.path)).steps.find((step) => step.nodeID === "second")?.status).toBe(
      "waiting",
    )
    await engine.approve(run.id, tmp.path, "second")
    expect(
      (await until(engine, run.id, tmp.path, "completed")).steps.every((step) => step.status === "completed"),
    ).toBe(true)
  })

  test("persists a session before executor completion and ignores reports and output after cancellation", async () => {
    await using tmp = await tmpdir()
    const entered = Promise.withResolvers<WorkflowEngine.Context>()
    const release = Promise.withResolvers<WorkflowEngine.Result>()
    const engine = WorkflowEngine.create({
      root: path.join(tmp.path, "storage"),
      execute: async (node, context) => {
        await context.reportSession("early-session")
        entered.resolve(context)
        return release.promise
      },
    })
    await engine.save(definition(tmp.path))
    const run = await engine.start("workflow", tmp.path, "")
    const context = await entered.promise
    const executing = await engine.getRun(run.id, tmp.path)
    expect(executing.status).toBe("running")
    expect(executing.steps.find((step) => step.nodeID === "task")?.sessionID).toBe("early-session")
    await engine.cancel(run.id, tmp.path)
    await context.reportSession("late-session")
    release.resolve({ output: "late output", sessionID: "late-result-session" })
    await Bun.sleep(20)
    const cancelled = await engine.getRun(run.id, tmp.path)
    expect(cancelled.status).toBe("cancelled")
    expect(cancelled.steps.find((step) => step.nodeID === "task")?.sessionID).toBe("early-session")
    expect(cancelled.steps.find((step) => step.nodeID === "task")?.output).toBeUndefined()
  })

  test("bounds concurrently executing workflows", async () => {
    await using tmp = await tmpdir()
    const release = Promise.withResolvers<WorkflowEngine.Result>()
    const engine = WorkflowEngine.create({ root: path.join(tmp.path, "storage"), execute: () => release.promise })
    const runs: Workflow.Run[] = []
    for (const index of Array.from({ length: 9 }, (_, index) => index)) {
      await engine.save({ ...definition(tmp.path), id: `workflow_${index}` })
      if (index < 8) runs.push(await engine.start(`workflow_${index}`, tmp.path, ""))
    }
    await expect(engine.start("workflow_8", tmp.path, "")).rejects.toMatchObject({ code: "conflict" })
    await Promise.all(runs.map((run) => engine.cancel(run.id, tmp.path)))
    release.resolve({ output: "done" })
    await Bun.sleep(30)
  })
})
