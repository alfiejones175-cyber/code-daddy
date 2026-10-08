import path from "node:path"
import { expect, test } from "bun:test"
import { Workflow } from "@opencode-ai/schema/workflow"
import { WorkflowEngine } from "../src/workflow"
import { tmpdir } from "./fixture/tmpdir"

const model = { providerID: "test", modelID: "cheap" }
const start: Workflow.Node = { id: "start", kind: "start", name: "Start", x: 0, y: 0 }
const task = {
  id: "task",
  kind: "task",
  name: "Task",
  x: 100,
  y: 0,
  prompt: "Complete the input",
  model,
  skills: [],
  mcpServers: [],
} satisfies Workflow.Node

function definition(directory: string): Workflow.Definition {
  return {
    version: 1,
    id: "workflow",
    name: "Workflow",
    directory,
    description: "",
    nodes: [start, task],
    edges: [{ id: "start_task", from: "start", to: "task" }],
    updatedAt: 1,
  }
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

const spec: Workflow.HarnessSpec = {
  model,
  instructions: "Return a JSON answer for the input.",
  modelReason: "Small model for a bounded extraction.",
  allowedTools: [],
  timeoutSeconds: 30,
  maxOutputChars: 1000,
  outputFormat: "json",
  requiredJsonKeys: ["answer"],
  checklist: ["The answer addresses the supplied input."],
}

test("ordinary definition saves cannot forge accepted harness metadata", async () => {
  await using tmp = await tmpdir()
  const engine = WorkflowEngine.create({ root: path.join(tmp.path, "storage"), execute: async () => ({ output: "" }) })
  await engine.save(definition(tmp.path))
  const forged: Workflow.HarnessAccepted = {
    spec,
    fingerprint: "0".repeat(64),
    testRunID: "unverified",
    acceptedAt: Date.now(),
  }
  await expect(
    engine.save({
      ...definition(tmp.path),
      nodes: [start, { ...task, harness: forged }],
    }),
  ).rejects.toMatchObject({ code: "conflict" })
  expect((await engine.get("workflow", tmp.path)).nodes.find((node) => node.id === "task")).not.toHaveProperty(
    "harness",
  )
})

test("harness drafts persist and exact revision and node fingerprint guard updates", async () => {
  await using tmp = await tmpdir()
  const root = path.join(tmp.path, "storage")
  const engine = WorkflowEngine.create({ root, execute: async () => ({ output: "{}" }) })
  await engine.save(definition(tmp.path))
  const initial = await engine.harness("workflow", tmp.path, "task")
  expect(initial.draft).toBeUndefined()
  expect(initial.trials).toEqual([])

  const draft = await engine.saveHarness("workflow", tmp.path, "task", {
    spec,
    goal: "Extract an answer",
    feedback: "",
    expectedRevision: null,
    nodeFingerprint: initial.nodeFingerprint,
  })
  expect(draft.spec).toEqual(spec)
  expect(
    (
      await WorkflowEngine.create({ root, execute: async () => ({ output: "{}" }) }).harness(
        "workflow",
        tmp.path,
        "task",
      )
    ).draft,
  ).toEqual(draft)
  await expect(
    engine.saveHarness("workflow", tmp.path, "task", {
      spec: { ...spec, instructions: "Changed" },
      goal: "Extract an answer",
      feedback: "",
      expectedRevision: null,
      nodeFingerprint: initial.nodeFingerprint,
    }),
  ).rejects.toMatchObject({ code: "conflict" })

  const next = await engine.saveHarness("workflow", tmp.path, "task", {
    spec: { ...spec, instructions: "Answer with valid JSON." },
    goal: "Extract an answer",
    feedback: "Fix the JSON shape.",
    expectedRevision: draft.revision,
    nodeFingerprint: initial.nodeFingerprint,
  })
  expect(next.revision).not.toBe(draft.revision)
  await expect(
    engine.saveHarness("workflow", tmp.path, "task", {
      spec,
      goal: "Extract an answer",
      feedback: "",
      expectedRevision: draft.revision,
      nodeFingerprint: initial.nodeFingerprint,
    }),
  ).rejects.toMatchObject({ code: "conflict" })
  await engine.save({ ...definition(tmp.path), nodes: [start, { ...task, prompt: "Changed task" }] })
  await expect(
    engine.saveHarness("workflow", tmp.path, "task", {
      spec,
      goal: "Extract an answer",
      feedback: "",
      expectedRevision: next.revision,
      nodeFingerprint: initial.nodeFingerprint,
    }),
  ).rejects.toMatchObject({ code: "conflict" })
})

test("a harness trial executes only its selected node with the candidate and fixture outputs", async () => {
  await using tmp = await tmpdir()
  const called: string[] = []
  const engine = WorkflowEngine.create({
    root: path.join(tmp.path, "storage"),
    execute: async (node, context) => {
      called.push(node.id)
      expect(context.input).toBe("trial input")
      expect(context.outputs).toEqual({ start: "fixture output" })
      expect(context.harness).toEqual(spec)
      return { output: '{"answer":"ok"}', validation: { passed: true, errors: [] }, sessionID: "trial-session" }
    },
  })
  await engine.save(definition(tmp.path))
  const lab = await engine.harness("workflow", tmp.path, "task")
  const draft = await engine.saveHarness("workflow", tmp.path, "task", {
    spec,
    goal: "Extract an answer",
    feedback: "",
    expectedRevision: null,
    nodeFingerprint: lab.nodeFingerprint,
  })
  const started = await engine.testHarness("workflow", tmp.path, "task", {
    revision: draft.revision,
    input: "trial input",
    outputs: { start: "fixture output" },
  })
  const completed = await until(engine, started.id, tmp.path, "completed")
  expect(called).toEqual(["task"])
  expect(completed.trial).toMatchObject({ nodeID: "task", revision: draft.revision, spec })
  expect(completed.steps.find((step) => step.nodeID === "task")).toMatchObject({
    status: "completed",
    output: '{"answer":"ok"}',
    sessionID: "trial-session",
    validation: { passed: true, errors: [] },
  })
  expect((await engine.harness("workflow", tmp.path, "task")).trials.map((run) => run.id)).toContain(started.id)
})

test("failed validation retains the trial output and cannot be accepted", async () => {
  await using tmp = await tmpdir()
  const engine = WorkflowEngine.create({
    root: path.join(tmp.path, "storage"),
    execute: async () => ({ output: "not JSON", validation: { passed: false, errors: ["Invalid JSON"] } }),
  })
  await engine.save(definition(tmp.path))
  const draft = await engine.saveHarness("workflow", tmp.path, "task", {
    spec,
    goal: "Extract an answer",
    feedback: "",
    expectedRevision: null,
    nodeFingerprint: (await engine.harness("workflow", tmp.path, "task")).nodeFingerprint,
  })
  const trial = await engine.testHarness("workflow", tmp.path, "task", {
    revision: draft.revision,
    input: "trial input",
    outputs: {},
  })
  const failed = await until(engine, trial.id, tmp.path, "failed")
  expect(failed.steps.find((step) => step.nodeID === "task")).toMatchObject({
    output: "not JSON",
    validation: { passed: false, errors: ["Invalid JSON"] },
  })
  await expect(
    engine.acceptHarness("workflow", tmp.path, "task", {
      revision: draft.revision,
      testRunID: trial.id,
    }),
  ).rejects.toMatchObject({ code: "conflict" })
})

test("a trial without validation evidence fails even when its executor returns output", async () => {
  await using tmp = await tmpdir()
  const engine = WorkflowEngine.create({
    root: path.join(tmp.path, "storage"),
    execute: async () => ({ output: '{"answer":"unsupported"}' }),
  })
  await engine.save(definition(tmp.path))
  const draft = await engine.saveHarness("workflow", tmp.path, "task", {
    spec,
    goal: "Extract an answer",
    feedback: "",
    expectedRevision: null,
    nodeFingerprint: (await engine.harness("workflow", tmp.path, "task")).nodeFingerprint,
  })
  const trial = await engine.testHarness("workflow", tmp.path, "task", {
    revision: draft.revision,
    input: "trial input",
    outputs: {},
  })
  const failed = await until(engine, trial.id, tmp.path, "failed")
  expect(failed.steps.find((step) => step.nodeID === "task")).toMatchObject({
    status: "failed",
    output: '{"answer":"unsupported"}',
    error: "Harness execution did not return validation evidence",
  })
  await expect(
    engine.acceptHarness("workflow", tmp.path, "task", { revision: draft.revision, testRunID: trial.id }),
  ).rejects.toMatchObject({ code: "conflict" })
})

test("cancelled trials cannot commit late output or become accepted", async () => {
  await using tmp = await tmpdir()
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const engine = WorkflowEngine.create({
    root: path.join(tmp.path, "storage"),
    execute: async () => {
      entered.resolve()
      await release.promise
      return { output: '{"answer":"late"}', validation: { passed: true, errors: [] } }
    },
  })
  await engine.save(definition(tmp.path))
  const draft = await engine.saveHarness("workflow", tmp.path, "task", {
    spec,
    goal: "Extract an answer",
    feedback: "",
    expectedRevision: null,
    nodeFingerprint: (await engine.harness("workflow", tmp.path, "task")).nodeFingerprint,
  })
  const trial = await engine.testHarness("workflow", tmp.path, "task", {
    revision: draft.revision,
    input: "trial input",
    outputs: {},
  })
  await entered.promise
  await engine.cancel(trial.id, tmp.path)
  release.resolve()
  await Bun.sleep(20)
  const cancelled = await engine.getRun(trial.id, tmp.path)
  expect(cancelled.status).toBe("cancelled")
  expect(cancelled.steps.find((step) => step.nodeID === "task")?.output).toBeUndefined()
  await expect(
    engine.acceptHarness("workflow", tmp.path, "task", {
      revision: draft.revision,
      testRunID: trial.id,
    }),
  ).rejects.toMatchObject({ code: "conflict" })
})

test("interrupted trials cannot be accepted and remain project scoped", async () => {
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
  const draft = await engine.saveHarness("workflow", tmp.path, "task", {
    spec,
    goal: "Extract an answer",
    feedback: "",
    expectedRevision: null,
    nodeFingerprint: (await engine.harness("workflow", tmp.path, "task")).nodeFingerprint,
  })
  const trial = await engine.testHarness("workflow", tmp.path, "task", {
    revision: draft.revision,
    input: "trial input",
    outputs: {},
  })
  await entered.promise
  const restarted = WorkflowEngine.create({ root, execute: async () => ({ output: "unexpected" }) })
  const interrupted = await restarted.getRun(trial.id, tmp.path)
  expect(interrupted.status).toBe("interrupted")
  expect(interrupted.trial?.revision).toBe(draft.revision)
  await expect(
    restarted.acceptHarness("workflow", tmp.path, "task", { revision: draft.revision, testRunID: trial.id }),
  ).rejects.toMatchObject({ code: "conflict" })
  const other = path.join(tmp.path, "other")
  await expect(restarted.getRun(trial.id, other)).rejects.toMatchObject({ code: "not_found" })
  await expect(restarted.harness("workflow", other, "task")).rejects.toMatchObject({ code: "not_found" })
  release.resolve({ output: '{"answer":"late"}', validation: { passed: true, errors: [] } })
  await Bun.sleep(10)
  expect((await restarted.getRun(trial.id, tmp.path)).status).toBe("interrupted")
})

test("acceptance requires the current candidate, a passing exact trial, and an unchanged node", async () => {
  await using tmp = await tmpdir()
  const engine = WorkflowEngine.create({
    root: path.join(tmp.path, "storage"),
    execute: async () => ({ output: '{"answer":"ok"}', validation: { passed: true, errors: [] } }),
  })
  await engine.save(definition(tmp.path))
  const fingerprint = (await engine.harness("workflow", tmp.path, "task")).nodeFingerprint
  const first = await engine.saveHarness("workflow", tmp.path, "task", {
    spec,
    goal: "Extract an answer",
    feedback: "",
    expectedRevision: null,
    nodeFingerprint: fingerprint,
  })
  const firstTrial = await engine.testHarness("workflow", tmp.path, "task", {
    revision: first.revision,
    input: "sample",
    outputs: {},
  })
  await until(engine, firstTrial.id, tmp.path, "completed")
  const second = await engine.saveHarness("workflow", tmp.path, "task", {
    spec: { ...spec, instructions: "Return a complete answer as JSON." },
    goal: "Extract an answer",
    feedback: "Needs detail.",
    expectedRevision: first.revision,
    nodeFingerprint: fingerprint,
  })
  await expect(
    engine.acceptHarness("workflow", tmp.path, "task", {
      revision: first.revision,
      testRunID: firstTrial.id,
    }),
  ).rejects.toMatchObject({ code: "conflict" })
  await expect(
    engine.acceptHarness("workflow", tmp.path, "task", {
      revision: second.revision,
      testRunID: firstTrial.id,
    }),
  ).rejects.toMatchObject({ code: "conflict" })
  const secondTrial = await engine.testHarness("workflow", tmp.path, "task", {
    revision: second.revision,
    input: "sample",
    outputs: {},
  })
  await until(engine, secondTrial.id, tmp.path, "completed")
  await engine.save({ ...definition(tmp.path), nodes: [start, { ...task, model: { ...model, modelID: "changed" } }] })
  await expect(
    engine.acceptHarness("workflow", tmp.path, "task", {
      revision: second.revision,
      testRunID: secondTrial.id,
    }),
  ).rejects.toMatchObject({ code: "conflict" })
})

test("accepted harness changes the node model, runs in full workflows and stays frozen in a started run", async () => {
  await using tmp = await tmpdir()
  const release = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  const calls: { model: Workflow.Model; harness?: Workflow.HarnessSpec }[] = []
  const engine = WorkflowEngine.create({
    root: path.join(tmp.path, "storage"),
    execute: async (node, context) => {
      if (node.kind !== "task" && node.kind !== "computer") throw new Error("Unexpected node")
      calls.push({ model: node.model, harness: context.harness })
      if (!context.harness) throw new Error("Expected a harness override")
      if (calls.length === 2) {
        entered.resolve()
        await release.promise
      }
      return { output: '{"answer":"ok"}', validation: { passed: true, errors: [] } }
    },
  })
  await engine.save(definition(tmp.path))
  const acceptedSpec = { ...spec, model: { providerID: "test", modelID: "smaller" } }
  const draft = await engine.saveHarness("workflow", tmp.path, "task", {
    spec: acceptedSpec,
    goal: "Extract an answer",
    feedback: "",
    expectedRevision: null,
    nodeFingerprint: (await engine.harness("workflow", tmp.path, "task")).nodeFingerprint,
  })
  const trial = await engine.testHarness("workflow", tmp.path, "task", {
    revision: draft.revision,
    input: "sample",
    outputs: {},
  })
  await until(engine, trial.id, tmp.path, "completed")
  const accepted = await engine.acceptHarness("workflow", tmp.path, "task", {
    revision: draft.revision,
    testRunID: trial.id,
  })
  const node = accepted.nodes.find((item) => item.id === "task")
  expect(node?.kind).toBe("task")
  if (node?.kind !== "task") throw new Error("Expected task")
  expect(node.model).toEqual(acceptedSpec.model)
  expect(node.harness).toMatchObject({ spec: acceptedSpec, testRunID: trial.id })

  const started = await engine.start("workflow", tmp.path, "full input")
  await entered.promise
  await engine.save({ ...accepted, nodes: [start, { ...task, prompt: "Revised task" }] })
  release.resolve()
  const completed = await until(engine, started.id, tmp.path, "completed")
  expect(calls).toHaveLength(2)
  expect(calls[0]).toEqual({ model, harness: acceptedSpec })
  expect(calls[1]).toEqual({ model: acceptedSpec.model, harness: acceptedSpec })
  const frozen = completed.definition.nodes.find((item) => item.id === "task")
  expect(frozen?.kind).toBe("task")
  if (frozen?.kind !== "task") throw new Error("Expected task")
  expect(frozen.harness).toEqual(node.harness)
  expect((await engine.get("workflow", tmp.path)).nodes.find((item) => item.id === "task")).not.toEqual(frozen)
})
