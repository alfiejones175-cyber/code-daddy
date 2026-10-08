import path from "node:path"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { WorkflowEngine } from "@opencode-ai/core/workflow"
import { WorkflowHarness } from "@opencode-ai/core/workflow-harness"
import { Workflow } from "@opencode-ai/schema/workflow"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import { Auth } from "@/auth"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { MCP } from "@/mcp"
import { Plugin } from "@/plugin"
import { Permission } from "@/permission"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { ToolRegistry } from "@/tool/registry"
import { Skill } from "@/skill"
import { WorkflowSkill } from "@/workflow/skill"
import { WorkflowRuntime } from "@/workflow/runtime"
import { InstanceHttpApi } from "../api"
import {
  WorkflowConflictError,
  WorkflowInvalidError,
  WorkflowNotFoundError,
  WorkflowServerError,
} from "../groups/workflow"

const executors = new Map<
  string,
  (node: Workflow.Node, context: WorkflowEngine.Context) => Promise<WorkflowEngine.Result>
>()
const engine = WorkflowEngine.create({
  root: path.join(Global.Path.data, "workflows"),
  execute: (node, context) => {
    const execute = executors.get(context.directory)
    if (!execute) throw new WorkflowSkill.RequestError("Open this project before continuing its workflow.")
    return execute(node, context)
  },
})
function failure(error: unknown) {
  if (error instanceof WorkflowSkill.RequestError) return new WorkflowInvalidError({ message: error.message })
  if (Provider.ModelNotFoundError.isInstance(error))
    return new WorkflowInvalidError({
      message: "The selected model is unavailable. Choose a connected model from the workflow catalog.",
    })
  if (error instanceof WorkflowEngine.Error) {
    if (error.code === "not_found") return new WorkflowNotFoundError({ message: error.message })
    if (error.code === "conflict") return new WorkflowConflictError({ message: error.message })
    return new WorkflowInvalidError({ message: error.message })
  }
  return new WorkflowServerError({
    message: "The workflow operation failed. Check server logs and provider connectivity.",
  })
}
const request = <A>(run: (signal: AbortSignal) => Promise<A>) => Effect.tryPromise({ try: run, catch: failure })

export const workflowHandlers = HttpApiBuilder.group(InstanceHttpApi, "workflow", (handlers) =>
  Effect.gen(function* () {
    const auth = yield* Auth.Service
    const session = yield* Session.Service
    const prompt = yield* SessionPrompt.Service
    const provider = yield* Provider.Service
    const skill = yield* Skill.Service
    const mcp = yield* MCP.Service
    const agent = yield* Agent.Service
    const config = yield* Config.Service
    const registry = yield* ToolRegistry.Service
    const permission = yield* Permission.Service
    const plugin = yield* Plugin.Service
    const current = Effect.fn("WorkflowHttpApi.current")(function* () {
      const directory = yield* InstanceState.directory
      if (yield* InstanceState.workspaceID)
        return yield* new WorkflowInvalidError({
          message: "Workflows currently run in local project directories. Open this project locally to use workflows.",
        })
      const runtime = yield* WorkflowRuntime.make({
        session,
        prompt,
        provider,
        skill,
        mcp,
        agent,
        config,
        registry,
        permission,
        plugin,
        auth,
      })
      executors.set(directory, runtime.execute)
      return { directory, runtime, engine }
    })
    return handlers
      .handle("list", () =>
        Effect.gen(function* () {
          const state = yield* current()
          return yield* request(() => state.engine.list(state.directory))
        }),
      )
      .handle("save", (ctx) =>
        Effect.gen(function* () {
          const state = yield* current()
          if (FSUtil.resolve(ctx.payload.directory) !== state.directory)
            return yield* new WorkflowInvalidError({
              message: "A workflow must be saved to the selected project directory.",
            })
          return yield* request(() => state.engine.save({ ...ctx.payload, directory: state.directory }))
        }),
      )
      .handle("catalog", () =>
        Effect.gen(function* () {
          const state = yield* current()
          return yield* request(() => state.runtime.catalog())
        }),
      )
      .handle("teach", (ctx) =>
        Effect.gen(function* () {
          const state = yield* current()
          return yield* request((signal) => state.runtime.teach(ctx.payload, signal))
        }),
      )
      .handle("saveSkill", (ctx) =>
        Effect.gen(function* () {
          const state = yield* current()
          return yield* request(() => WorkflowSkill.saveSkill(state.directory, ctx.payload))
        }),
      )
      .handle("remove", (ctx) =>
        Effect.gen(function* () {
          const state = yield* current()
          yield* request(() => state.engine.remove(ctx.params.workflowID, state.directory))
          return true
        }),
      )
      .handle("runs", (ctx) =>
        Effect.gen(function* () {
          const state = yield* current()
          return yield* request(() => state.engine.runs(ctx.params.workflowID, state.directory))
        }),
      )
      .handle("start", (ctx) =>
        Effect.gen(function* () {
          const state = yield* current()
          return yield* request(() => state.engine.start(ctx.params.workflowID, state.directory, ctx.payload.input))
        }),
      )
      .handle("harness", (ctx) =>
        Effect.gen(function* () {
          const state = yield* current()
          return yield* request(() => state.engine.harness(ctx.params.workflowID, state.directory, ctx.params.nodeID))
        }),
      )
      .handle("saveHarness", (ctx) =>
        Effect.gen(function* () {
          const state = yield* current()
          return yield* request(() =>
            state.engine.saveHarness(ctx.params.workflowID, state.directory, ctx.params.nodeID, ctx.payload),
          )
        }),
      )
      .handle("designHarness", (ctx) =>
        Effect.gen(function* () {
          const state = yield* current()
          const definition = yield* request(() => state.engine.get(ctx.params.workflowID, state.directory))
          const lab = yield* request(() =>
            state.engine.harness(ctx.params.workflowID, state.directory, ctx.params.nodeID),
          )
          if (
            (lab.draft?.revision ?? null) !== ctx.payload.expectedRevision ||
            lab.nodeFingerprint !== ctx.payload.nodeFingerprint
          )
            return yield* new WorkflowConflictError({
              message: "The step or harness draft changed. Reload it before designing another revision.",
            })
          const node = definition.nodes.find((node) => node.id === ctx.params.nodeID)
          if (!node) return yield* new WorkflowNotFoundError({ message: "The workflow step was not found." })
          if (
            (node.kind !== "task" && node.kind !== "computer") ||
            WorkflowHarness.nodeFingerprint(node) !== lab.nodeFingerprint
          )
            return yield* new WorkflowConflictError({
              message: "The step changed while loading its harness. Reload it before designing another revision.",
            })
          const spec = yield* request((signal) =>
            state.runtime.design(node, ctx.payload, lab.draft, lab.trials, signal),
          )
          return yield* request(() =>
            state.engine.saveHarness(ctx.params.workflowID, state.directory, ctx.params.nodeID, {
              spec,
              goal: ctx.payload.goal,
              feedback: ctx.payload.feedback,
              expectedRevision: ctx.payload.expectedRevision,
              nodeFingerprint: ctx.payload.nodeFingerprint,
            }),
          )
        }),
      )
      .handle("testHarness", (ctx) =>
        Effect.gen(function* () {
          const state = yield* current()
          return yield* request(() =>
            state.engine.testHarness(ctx.params.workflowID, state.directory, ctx.params.nodeID, ctx.payload),
          )
        }),
      )
      .handle("acceptHarness", (ctx) =>
        Effect.gen(function* () {
          const state = yield* current()
          return yield* request(() =>
            state.engine.acceptHarness(ctx.params.workflowID, state.directory, ctx.params.nodeID, ctx.payload),
          )
        }),
      )
      .handle("getRun", (ctx) =>
        Effect.gen(function* () {
          const state = yield* current()
          return yield* request(() => state.engine.getRun(ctx.params.runID, state.directory))
        }),
      )
      .handle("approve", (ctx) =>
        Effect.gen(function* () {
          const state = yield* current()
          return yield* request(() => state.engine.approve(ctx.params.runID, state.directory, ctx.payload.nodeID))
        }),
      )
      .handle("cancel", (ctx) =>
        Effect.gen(function* () {
          const state = yield* current()
          return yield* request(() => state.engine.cancel(ctx.params.runID, state.directory))
        }),
      )
  }),
)
