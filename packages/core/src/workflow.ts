export * as WorkflowEngine from "./workflow"

import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { chmod, mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises"
import { Workflow } from "@opencode-ai/schema/workflow"
import { Option, Schema } from "effect"
import { WorkflowHarness } from "./workflow-harness"

export class Error extends globalThis.Error {
  constructor(
    message: string,
    readonly code: "not_found" | "invalid" | "conflict" = "invalid",
  ) {
    super(message)
    this.name = "WorkflowError"
  }
}

export type Context = {
  input: string
  outputs: Record<string, string>
  signal: AbortSignal
  directory: string
  reportSession: (sessionID: string) => Promise<void>
  harness?: Workflow.HarnessSpec
}
export type Result = {
  output: string
  sessionID?: string
  outcome?: "yes" | "no"
  validation?: Workflow.Validation
}

export function create(options: { root: string; execute: (node: Workflow.Node, context: Context) => Promise<Result> }) {
  const active = new Map<string, AbortController>()
  const owners = new Map<string, string>()
  const serial = { tail: Promise.resolve() }
  const lock = <T>(action: () => Promise<T>) => {
    const next = serial.tail.then(action)
    serial.tail = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }
  const scope = (directory: string) => {
    if (!path.isAbsolute(directory)) throw new Error("Workflow project directory must be absolute")
    const canonical = path.resolve(directory)
    return { directory: canonical, root: path.join(options.root, createHash("sha256").update(canonical).digest("hex")) }
  }
  const filename = (directory: string, kind: "definitions" | "runs", id: string) => {
    decode(Workflow.ID, id)
    return path.join(scope(directory).root, kind, `${id}.json`)
  }
  const write = async (filepath: string, value: Workflow.Definition | Workflow.Run | Workflow.HarnessDraft) => {
    await mkdir(path.dirname(filepath), { recursive: true, mode: 0o700 })
    await chmod(path.dirname(filepath), 0o700)
    const temporary = `${filepath}.${randomUUID()}.tmp`
    const file = await open(temporary, "wx", 0o600)
    await file.writeFile(JSON.stringify(value))
    await file.sync()
    await file.close()
    await rename(temporary, filepath)
    const folder = await open(path.dirname(filepath), "r")
    await folder.sync()
    await folder.close()
  }
  const readDefinition = async (id: string, directory: string) => {
    const definition = decode(Workflow.Definition, await readJSON(filename(directory, "definitions", id)))
    if (definition.id !== id || definition.directory !== scope(directory).directory)
      throw new Error("Workflow belongs to another project")
    validate(definition)
    return definition
  }
  const task = (definition: Workflow.Definition, nodeID: string) => {
    const node = definition.nodes.find((node) => node.id === nodeID)
    if (!node || (node.kind !== "task" && node.kind !== "computer"))
      throw new Error("Harnesses belong to an AI task or computer task")
    return node
  }
  const labFile = (id: string, directory: string, nodeID: string) => {
    decode(Workflow.ID, id)
    decode(Workflow.ID, nodeID)
    return path.join(scope(directory).root, "harnesses", id, `${nodeID}.json`)
  }
  const readDraft = async (id: string, directory: string, nodeID: string) => {
    const source = await readJSON(labFile(id, directory, nodeID)).catch((error: unknown) => {
      if (error instanceof Error && error.code === "not_found") return undefined
      throw error
    })
    return source === undefined ? undefined : decode(Workflow.HarnessDraft, source)
  }
  const readRun = async (id: string, directory: string) => {
    const run = decode(Workflow.Run, await readJSON(filename(directory, "runs", id)))
    if (
      run.id !== id ||
      run.workflowID !== run.definition.id ||
      run.definition.directory !== scope(directory).directory
    )
      throw new Error("Workflow run belongs to another project")
    validate(run.definition)
    if (run.trial) {
      const node = task(run.definition, run.trial.nodeID)
      if (
        !WorkflowHarness.valid(run.trial.spec) ||
        WorkflowHarness.fingerprint(node, run.trial.spec) !== run.trial.fingerprint
      )
        throw new Error("Workflow harness trial has an invalid snapshot")
    }
    if (
      run.steps.length !== run.definition.nodes.length ||
      run.definition.nodes.some((node) => run.steps.filter((step) => step.nodeID === node.id).length !== 1)
    )
      throw new Error("Workflow run has invalid steps")
    if (run.status !== "running" || active.has(run.id)) return run
    // Provider work may have had side effects before the process stopped. Never replay it.
    const interrupted: Workflow.Run = {
      ...run,
      status: "interrupted",
      updatedAt: Date.now(),
      error: "Execution was interrupted. Review completed steps before starting a new run.",
      steps: run.steps.map((step) =>
        step.status === "running"
          ? { ...step, status: "failed", error: "Execution interrupted", finishedAt: Date.now() }
          : step,
      ),
    }
    await write(filename(directory, "runs", run.id), interrupted)
    return interrupted
  }
  const ids = async (directory: string, kind: "definitions" | "runs") =>
    readdir(path.join(scope(directory).root, kind)).then(
      (files) => files.filter((file) => /^[a-zA-Z0-9_-]{1,100}\.json$/.test(file)).map((file) => file.slice(0, -5)),
      (error: unknown) => {
        if (isMissing(error)) return []
        throw error
      },
    )
  const readRuns = async (directory: string) =>
    Promise.all((await ids(directory, "runs")).map((id) => readRun(id, directory)))
  const available = async (id: string, directory: string) => {
    if (active.size >= 8) throw new Error("Eight workflows are already executing", "conflict")
    if (
      owners.has(`${scope(directory).directory}:${id}`) ||
      (await readRuns(directory)).some((run) => run.workflowID === id && ["running", "waiting"].includes(run.status))
    )
      throw new Error("This workflow already has an active run or harness trial", "conflict")
  }
  const update = async (run: Workflow.Run) => {
    const next = decode(Workflow.Run, { ...run, updatedAt: Date.now() })
    await write(filename(run.definition.directory, "runs", run.id), next)
    return next
  }
  const launch = (run: Workflow.Run) => {
    const controller = new AbortController()
    active.set(run.id, controller)
    const owner = `${run.definition.directory}:${run.workflowID}`
    owners.set(owner, run.id)
    void drain(run.id, run.definition.directory, controller)
      .catch(async (error: unknown) => {
        await lock(async () => {
          const current = await readRun(run.id, run.definition.directory)
          if (current.status !== "running") return
          await update({
            ...current,
            status: "failed",
            error: message(error),
            steps: current.steps.map((step) =>
              step.status === "running"
                ? { ...step, status: "failed", error: message(error), finishedAt: Date.now() }
                : step,
            ),
          })
        })
      })
      .finally(() => {
        if (active.get(run.id) !== controller) return
        active.delete(run.id)
        if (owners.get(owner) === run.id) owners.delete(owner)
      })
      .catch(() => undefined)
  }
  const drain = async (id: string, directory: string, controller: AbortController) => {
    while (!controller.signal.aborted) {
      const work = await lock(async () => {
        const run = await readRun(id, directory)
        if (run.status !== "running" || controller.signal.aborted) return
        const node = run.definition.nodes.find((node) => {
          if (run.steps.find((step) => step.nodeID === node.id)?.status !== "pending") return false
          return run.definition.edges
            .filter((edge) => edge.to === node.id)
            .every((edge) =>
              run.steps.some((step) => step.nodeID === edge.from && ["completed", "skipped"].includes(step.status)),
            )
        })
        if (!node) {
          await update({ ...run, status: "completed" })
          return
        }
        const incoming = run.definition.edges.filter((edge) => edge.to === node.id)
        const enabled =
          run.trial?.nodeID === node.id ||
          node.kind === "start" ||
          incoming.some((edge) => {
            const prior = run.steps.find((step) => step.nodeID === edge.from)
            return prior?.status === "completed" && (!edge.outcome || prior.outcome === edge.outcome)
          })
        const status = !enabled ? "skipped" : node.kind === "approval" ? "waiting" : "running"
        const next = await update({
          ...run,
          status: status === "waiting" ? "waiting" : "running",
          steps: run.steps.map((step) =>
            step.nodeID === node.id
              ? { ...step, status, startedAt: Date.now(), ...(status === "skipped" ? { finishedAt: Date.now() } : {}) }
              : step,
          ),
        })
        return { run: next, node, status }
      })
      if (!work || work.status === "waiting") return
      if (work.status === "skipped") continue
      const result = await (
        work.node.kind === "start"
          ? Promise.resolve<Result>({ output: work.run.input })
          : options.execute(work.node, {
              input: work.run.input,
              outputs:
                work.run.trial?.outputs ??
                Object.fromEntries(
                  work.run.steps
                    .filter((step) => step.status === "completed")
                    .map((step) => [step.nodeID, step.output ?? ""]),
                ),
              signal: controller.signal,
              directory,
              harness:
                work.run.trial?.spec ??
                (work.node.kind === "task" || work.node.kind === "computer" ? work.node.harness?.spec : undefined),
              reportSession: (sessionID) =>
                lock(async () => {
                  const run = await readRun(id, directory)
                  if (
                    run.status !== "running" ||
                    controller.signal.aborted ||
                    run.steps.find((step) => step.nodeID === work.node.id)?.status !== "running"
                  )
                    return
                  await update({
                    ...run,
                    steps: run.steps.map((step) => (step.nodeID === work.node.id ? { ...step, sessionID } : step)),
                  })
                }),
            })
      ).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      )
      await lock(async () => {
        const run = await readRun(id, directory)
        if (run.status !== "running" || controller.signal.aborted) return
        const error =
          "error" in result
            ? message(result.error)
            : work.node.kind === "decision" && !result.value.outcome
              ? "Decision did not return yes or no"
              : (work.run.trial ||
                    ((work.node.kind === "task" || work.node.kind === "computer") && work.node.harness)) &&
                  !result.value.validation
                ? "Harness execution did not return validation evidence"
                : result.value.validation?.passed === false
                  ? result.value.validation.errors.join("; ").slice(0, 100_000) || "Harness output validation failed"
                  : undefined
        await update({
          ...run,
          status: error ? "failed" : "running",
          ...(error ? { error } : {}),
          steps: run.steps.map((step) =>
            step.nodeID === work.node.id
              ? {
                  ...step,
                  status: error ? "failed" : "completed",
                  finishedAt: Date.now(),
                  ...("value" in result ? result.value : {}),
                  ...(error ? { error } : {}),
                }
              : step,
          ),
        })
      })
    }
  }
  return {
    get: (id: string, directory: string) => lock(() => readDefinition(id, directory)),
    list: (directory: string) =>
      lock(async () => Promise.all((await ids(directory, "definitions")).map((id) => readDefinition(id, directory)))),
    save: (input: Workflow.Definition) =>
      lock(async () => {
        const definition = decode(Workflow.Definition, input)
        const next = { ...definition, directory: scope(definition.directory).directory, updatedAt: Date.now() }
        validate(next)
        if (next.nodes.some((node) => (node.kind === "task" || node.kind === "computer") && node.harness)) {
          const previous = await readDefinition(next.id, next.directory).catch((error: unknown) => {
            if (error instanceof Error && error.code === "not_found") return undefined
            throw error
          })
          next.nodes.forEach((node) => {
            if ((node.kind !== "task" && node.kind !== "computer") || !node.harness) return
            const saved = previous?.nodes.find((item) => item.id === node.id)
            if (
              !saved ||
              (saved.kind !== "task" && saved.kind !== "computer") ||
              JSON.stringify(saved.harness) !== JSON.stringify(node.harness)
            )
              throw new Error("Test and accept a harness in this project before saving it on a step", "conflict")
          })
        }
        await write(filename(next.directory, "definitions", next.id), next)
        return next
      }),
    remove: (id: string, directory: string) =>
      lock(async () => {
        await readDefinition(id, directory)
        if (
          (await readRuns(directory)).some(
            (run) => run.workflowID === id && ["running", "waiting"].includes(run.status),
          )
        )
          throw new Error("Cancel the active workflow run before deleting this workflow", "conflict")
        await unlink(filename(directory, "definitions", id))
      }),
    runs: (id: string, directory: string) =>
      lock(async () => {
        decode(Workflow.ID, id)
        return (await readRuns(directory))
          .filter((run) => run.workflowID === id)
          .sort((a, b) => b.createdAt - a.createdAt)
      }),
    getRun: (id: string, directory: string) => lock(() => readRun(id, directory)),
    harness: (id: string, directory: string, nodeID: string) =>
      lock(async (): Promise<Workflow.HarnessLab> => {
        const node = task(await readDefinition(id, directory), nodeID)
        const draft = await readDraft(id, directory, nodeID)
        return {
          nodeFingerprint: WorkflowHarness.nodeFingerprint(node),
          ...(draft ? { draft } : {}),
          trials: (await readRuns(directory))
            .filter((run) => run.workflowID === id && run.trial?.nodeID === nodeID)
            .sort((a, b) => b.createdAt - a.createdAt),
        }
      }),
    saveHarness: (id: string, directory: string, nodeID: string, input: Workflow.HarnessSaveRequest) =>
      lock(async () => {
        const request = decode(Workflow.HarnessSaveRequest, input)
        const node = task(await readDefinition(id, directory), nodeID)
        const prior = await readDraft(id, directory, nodeID)
        if (
          (prior?.revision ?? null) !== request.expectedRevision ||
          WorkflowHarness.nodeFingerprint(node) !== request.nodeFingerprint
        )
          throw new Error("The step or harness draft changed. Reload it before saving another revision.", "conflict")
        if (!WorkflowHarness.valid(request.spec)) throw new Error("Harness instructions, tools, and checks are invalid")
        const draft = decode(Workflow.HarnessDraft, {
          revision: randomUUID(),
          nodeFingerprint: request.nodeFingerprint,
          goal: request.goal,
          feedback: request.feedback,
          spec: request.spec,
          updatedAt: Date.now(),
        })
        await write(labFile(id, directory, nodeID), draft)
        return draft
      }),
    testHarness: (id: string, directory: string, nodeID: string, input: Workflow.HarnessTestRequest) =>
      lock(async () => {
        const request = decode(Workflow.HarnessTestRequest, input)
        const definition = await readDefinition(id, directory)
        const node = task(definition, nodeID)
        const draft = await readDraft(id, directory, nodeID)
        if (
          !draft ||
          draft.revision !== request.revision ||
          draft.nodeFingerprint !== WorkflowHarness.nodeFingerprint(node)
        )
          throw new Error("The step or draft changed. Save a fresh harness draft before testing.", "conflict")
        if (!WorkflowHarness.valid(draft.spec)) throw new Error("Invalid harness draft")
        const ancestors = new Set<string>()
        const visit = (id: string) =>
          definition.edges
            .filter((edge) => edge.to === id)
            .forEach((edge) => {
              if (ancestors.has(edge.from)) return
              ancestors.add(edge.from)
              visit(edge.from)
            })
        visit(nodeID)
        if (Object.keys(request.outputs).some((key) => !ancestors.has(key)))
          throw new Error("Trial output fixtures must name an earlier step in this workflow")
        if (JSON.stringify(request.outputs).length > 500_000)
          throw new Error("Trial output fixtures exceed the size limit")
        await available(id, directory)
        const run = decode(Workflow.Run, {
          id: randomUUID(),
          workflowID: id,
          definition,
          input: request.input,
          status: "running",
          steps: definition.nodes.map((node) => ({
            nodeID: node.id,
            status: node.id === nodeID ? "pending" : "skipped",
          })),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          trial: {
            nodeID,
            revision: draft.revision,
            fingerprint: WorkflowHarness.fingerprint(node, draft.spec),
            spec: draft.spec,
            outputs: request.outputs,
          },
        })
        await write(filename(directory, "runs", run.id), run)
        launch(run)
        return run
      }),
    acceptHarness: (id: string, directory: string, nodeID: string, input: Workflow.HarnessAcceptRequest) =>
      lock(async () => {
        const request = decode(Workflow.HarnessAcceptRequest, input)
        const definition = await readDefinition(id, directory)
        const node = task(definition, nodeID)
        const draft = await readDraft(id, directory, nodeID)
        const run = await readRun(request.testRunID, directory)
        if (
          !draft ||
          draft.revision !== request.revision ||
          draft.nodeFingerprint !== WorkflowHarness.nodeFingerprint(node) ||
          run.workflowID !== id ||
          run.trial?.nodeID !== nodeID ||
          run.trial.revision !== draft.revision ||
          run.trial.fingerprint !== WorkflowHarness.fingerprint(node, draft.spec) ||
          run.status !== "completed" ||
          !run.steps.some((step) => step.nodeID === nodeID && step.status === "completed" && step.validation?.passed)
        )
          throw new Error("Accept a successful trial of the current step and exact harness revision.", "conflict")
        const accepted = { ...node, model: draft.spec.model }
        const next = decode(Workflow.Definition, {
          ...definition,
          updatedAt: Date.now(),
          nodes: definition.nodes.map((item) =>
            item.id !== nodeID
              ? item
              : {
                  ...accepted,
                  harness: {
                    spec: draft.spec,
                    fingerprint: WorkflowHarness.fingerprint(accepted, draft.spec),
                    testRunID: run.id,
                    acceptedAt: Date.now(),
                  },
                },
          ),
        })
        await write(filename(directory, "definitions", id), next)
        return next
      }),
    start: (id: string, directory: string, input: string) =>
      lock(async () => {
        const definition = await readDefinition(id, directory)
        definition.nodes.forEach((node) => {
          if ((node.kind !== "task" && node.kind !== "computer") || !node.harness) return
          if (
            !WorkflowHarness.valid(node.harness.spec) ||
            node.harness.fingerprint !== WorkflowHarness.fingerprint(node, node.harness.spec)
          )
            throw new Error("A step changed after harness acceptance. Test and accept its harness again.", "conflict")
        })
        await available(id, directory)
        const run = decode(Workflow.Run, {
          id: randomUUID(),
          workflowID: id,
          definition,
          input,
          status: "running",
          steps: definition.nodes.map((node) => ({ nodeID: node.id, status: "pending" })),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        await write(filename(directory, "runs", run.id), run)
        launch(run)
        return run
      }),
    approve: (id: string, directory: string, nodeID: string) =>
      lock(async () => {
        decode(Workflow.ID, nodeID)
        const run = await readRun(id, directory)
        if (run.status !== "waiting") throw new Error("Workflow is not waiting for approval", "conflict")
        if (active.size >= 8) throw new Error("Eight workflows are already executing", "conflict")
        const waiting = run.steps.filter((step) => step.status === "waiting")
        if (
          waiting.length !== 1 ||
          run.definition.nodes.find((node) => node.id === waiting[0]!.nodeID)?.kind !== "approval"
        )
          throw new Error("Workflow has no valid approval step")
        if (waiting[0]!.nodeID !== nodeID)
          throw new Error("This approval request is stale. Review the current approval step.", "conflict")
        const next = await update({
          ...run,
          status: "running",
          steps: run.steps.map((step) =>
            step.status === "waiting"
              ? { ...step, status: "completed", output: "Approved", finishedAt: Date.now() }
              : step,
          ),
        })
        launch(next)
        return next
      }),
    cancel: (id: string, directory: string) =>
      lock(async () => {
        const run = await readRun(id, directory)
        if (!["running", "waiting"].includes(run.status)) return run
        active.get(id)?.abort()
        return update({
          ...run,
          status: "cancelled",
          steps: run.steps.map((step) =>
            ["pending", "waiting", "running"].includes(step.status)
              ? { ...step, status: "cancelled", finishedAt: Date.now() }
              : step,
          ),
        })
      }),
  }
}

function decode<T>(schema: Schema.Decoder<T>, input: unknown): T {
  const decoded = Schema.decodeUnknownOption(schema)(input)
  if (Option.isNone(decoded)) throw new Error("Invalid workflow data")
  return decoded.value
}

function readJSON(filepath: string): Promise<unknown> {
  return readFile(filepath, "utf8")
    .then((source) => decode(Schema.UnknownFromJsonString, source))
    .catch((error: unknown) => {
      if (isMissing(error)) throw new Error("Workflow or run was not found", "not_found")
      if (error instanceof SyntaxError) throw new Error("Invalid stored workflow JSON")
      throw error
    })
}

function isMissing(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}

function message(error: unknown) {
  return (error instanceof globalThis.Error ? error.message : String(error)).slice(0, 100_000)
}

export function validate(definition: Workflow.Definition) {
  if (definition.nodes.filter((node) => node.kind === "start").length !== 1)
    throw new Error("A workflow needs exactly one start step")
  if (new Set(definition.nodes.map((node) => node.id)).size !== definition.nodes.length)
    throw new Error("Workflow step IDs must be unique")
  if (new Set(definition.edges.map((edge) => edge.id)).size !== definition.edges.length)
    throw new Error("Workflow connection IDs must be unique")
  if (
    new Set(definition.edges.map((edge) => `${edge.from}:${edge.to}:${edge.outcome ?? ""}`)).size !==
    definition.edges.length
  )
    throw new Error("Duplicate workflow connection")
  definition.nodes.forEach((node) => {
    if (!node.name.trim()) throw new Error("Workflow steps need a name")
    if (
      (node.kind === "task" || node.kind === "computer") &&
      (!node.model.providerID.trim() ||
        !node.model.modelID.trim() ||
        [...node.skills, ...node.mcpServers].some((name) => !name.trim()))
    )
      throw new Error("Task model, skill and MCP names cannot be blank")
    if ((node.kind === "task" || node.kind === "computer") && !node.prompt.trim())
      throw new Error("Task steps need instructions")
    if (node.kind === "mcp" && (!node.server.trim() || !node.tool.trim()))
      throw new Error("MCP steps need a server and tool")
    if (node.kind === "decision" && !node.question.trim()) throw new Error("Decision steps need a question")
    const outgoing = definition.edges.filter((edge) => edge.from === node.id)
    if (
      node.kind === "decision" &&
      (!outgoing.some((edge) => edge.outcome === "yes") ||
        !outgoing.some((edge) => edge.outcome === "no") ||
        outgoing.some((edge) => !edge.outcome))
    )
      throw new Error("Decision connections need both yes and no outcomes")
    if (node.kind !== "decision" && outgoing.some((edge) => edge.outcome))
      throw new Error("Only decisions can have conditional connections")
  })
  definition.edges.forEach((edge) => {
    if (
      !definition.nodes.some((node) => node.id === edge.from) ||
      !definition.nodes.some((node) => node.id === edge.to)
    )
      throw new Error("Workflow connection references a missing step")
  })
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error("Workflow connections must not contain a cycle")
    if (visited.has(id)) return
    visiting.add(id)
    definition.edges.filter((edge) => edge.from === id).forEach((edge) => visit(edge.to))
    visiting.delete(id)
    visited.add(id)
  }
  visit(definition.nodes.find((node) => node.kind === "start")!.id)
  if (visited.size !== definition.nodes.length) throw new Error("Every workflow step must be reachable from start")
}
