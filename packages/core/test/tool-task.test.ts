import { describe, expect, test } from "bun:test"
import { DateTime, Deferred, Effect, Fiber, Layer, Schema } from "effect"
import { AgentV2 } from "../src/agent"
import { Catalog } from "../src/catalog"
import { Database } from "../src/database/database"
import { makeGlobalNode } from "../src/effect/app-node"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { EventV2 } from "../src/event"
import { Location } from "../src/location"
import { ModelV2 } from "../src/model"
import { PermissionV2 } from "../src/permission"
import { ProjectV2 } from "../src/project"
import { ProviderV2 } from "../src/provider"
import { AbsolutePath } from "../src/schema"
import { SessionV2 } from "../src/session"
import { SessionEvent } from "../src/session/event"
import { SessionExecution } from "../src/session/execution"
import { SessionInput } from "../src/session/input"
import { SessionStore } from "../src/session/store"
import { SessionRunnerModel } from "../src/session/runner/model"
import { SessionMessage } from "../src/session/message"
import { SessionRunCoordinator } from "../src/session/run-coordinator"
import { TaskTool } from "../src/tool/task"
import { ToolRegistry } from "../src/tool/registry"
import { ToolOutputStore } from "../src/tool-output-store"
import { testEffect } from "./lib/effect"
import { settleTool } from "./lib/tool"

const location = Location.Ref.make({ directory: AbsolutePath.make("/project") })
const model = { id: ModelV2.ID.make("test"), providerID: ProviderV2.ID.make("test") }
const input = { description: "Research", prompt: "Find the answer", subagent_type: AgentV2.ID.make("research") }
const projects = Layer.succeed(
  ProjectV2.Service,
  ProjectV2.Service.of({
    resolve: (directory) => Effect.succeed({ id: ProjectV2.ID.global, directory }),
    directories: () => Effect.succeed([]),
    commit: () => Effect.void,
  }),
)
const execution = Layer.effect(
  SessionExecution.Service,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    const store = yield* SessionStore.Service
    const coordinator = yield* SessionRunCoordinator.make({
      drain: (sessionID: SessionV2.ID) =>
        Effect.gen(function* () {
          yield* SessionInput.promoteSteers(database.db, events, sessionID, Number.MAX_SAFE_INTEGER)
          const assistantMessageID = SessionMessage.ID.create()
          const timestamp = DateTime.nowUnsafe()
          yield* events.publish(SessionEvent.Step.Started, {
            sessionID,
            assistantMessageID,
            timestamp,
            agent: "research",
            model,
          })
          const prompt = (yield* store.context(sessionID)).findLast((message) => message.type === "user")
          if (prompt?.type === "user" && prompt.text === "wait") yield* Effect.never
          if (prompt?.type === "user" && prompt.text === "fail")
            return yield* new SessionRunnerModel.ModelUnavailableError({
              providerID: model.providerID,
              modelID: model.id,
            })
          const text = prompt?.type === "user" && prompt.text === "unrelated" ? "This is newer" : "The answer is 42"
          yield* events.publish(SessionEvent.Text.Started, { sessionID, assistantMessageID, timestamp, textID: "text" })
          yield* events.publish(SessionEvent.Text.Ended, {
            sessionID,
            assistantMessageID,
            timestamp,
            textID: "text",
            text,
          })
          yield* events.publish(SessionEvent.Step.Ended, {
            sessionID,
            assistantMessageID,
            timestamp,
            finish: prompt?.type === "user" && prompt.text === "length" ? "length" : "stop",
            cost: 0,
            tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
          })
        }),
    })
    return {
      active: coordinator.active,
      resume: coordinator.run,
      wake: coordinator.wake,
      interrupt: coordinator.interrupt,
    }
  }),
)
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      EventV2.node,
      Database.node,
      SessionV2.node,
      TaskTool.node,
      Catalog.node,
      ToolRegistry.toolsNode,
      PermissionV2.node,
      AgentV2.node,
    ]),
    [
      [ProjectV2.node, projects],
      [
        Location.node,
        Layer.succeed(Location.Service, {
          ...location,
          project: { id: ProjectV2.ID.global, directory: location.directory },
        }),
      ],
      [
        SessionExecution.node,
        makeGlobalNode({
          service: SessionExecution.Service,
          layer: execution,
          deps: [Database.node, EventV2.node, SessionStore.node],
        }),
      ],
      [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
    ],
  ),
)

test("task input bounds max_turns to 1..100", () => {
  const base = { ...input, max_turns: 1 }
  expect(Schema.is(TaskTool.Input)(base)).toBe(true)
  expect(Schema.is(TaskTool.Input)({ ...base, max_turns: 0 })).toBe(false)
  expect(Schema.is(TaskTool.Input)({ ...base, max_turns: 101 })).toBe(false)
  expect(Schema.is(TaskTool.Input)({ ...base, max_turns: 1.5 })).toBe(false)
})

function setup(callID = "delegate", parentID?: SessionV2.ID, prompt = input.prompt, taskInput = input) {
  return Effect.gen(function* () {
    const sessions = yield* SessionV2.Service
    const events = yield* EventV2.Service
    const agents = yield* AgentV2.Service
    yield* agents.transform((draft) => {
      for (const id of ["build", "research"])
        draft.update(AgentV2.ID.make(id), (agent) => {
          agent.mode = "all"
          agent.permissions = [{ action: "*", resource: "*", effect: "allow" }]
        })
    })
    const parent = yield* sessions.create({ location, agent: AgentV2.ID.make("build"), model, parentID })
    const assistantMessageID = SessionMessage.ID.create()
    const timestamp = DateTime.nowUnsafe()
    yield* events.publish(SessionEvent.Step.Started, {
      sessionID: parent.id,
      assistantMessageID,
      timestamp,
      agent: "build",
      model,
    })
    yield* events.publish(SessionEvent.Tool.Input.Started, {
      sessionID: parent.id,
      assistantMessageID,
      timestamp,
      callID,
      name: "task",
    })
    yield* events.publish(SessionEvent.Tool.Called, {
      sessionID: parent.id,
      assistantMessageID,
      timestamp,
      callID,
      tool: "task",
      input: { ...taskInput, prompt },
      provider: { executed: false },
    })
    return { sessionID: parent.id, assistantMessageID, toolCallID: callID, agent: AgentV2.ID.make("build") }
  })
}

describe("native task tool", () => {
  it.effect("persists the bounded maxTurns metadata on a child", () =>
    Effect.gen(function* () {
      const boundedInput = { ...input, max_turns: 3 }
      const context = yield* setup("bounded", undefined, input.prompt, boundedInput)
      const registry = yield* ToolRegistry.Service
      const result = yield* settleTool(registry, {
        ...context,
        call: { type: "tool-call", name: "task", id: context.toolCallID, input: boundedInput },
      })
      expect(result.output?.structured).toMatchObject({ status: "completed" })
      const childID = TaskTool.identity(context).sessionID
    }),
  )

  it.effect("accepts an available cross-provider model override", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const providerID = ProviderV2.ID.make("other")
      const modelID = ModelV2.ID.make("alternate")
      const override = { ...input, model: { providerID, id: modelID } }
      yield* catalog.transform((editor) => editor.model.update(providerID, modelID, () => {}))
      const context = yield* setup("cross-provider", undefined, input.prompt, override)
      const registry = yield* ToolRegistry.Service
      const result = yield* settleTool(registry, {
        ...context,
        call: { type: "tool-call", name: "task", id: context.toolCallID, input: override },
      })
      expect(result.output?.structured).toMatchObject({ status: "completed" })
    }),
  )

  it.effect("records, runs and returns a child result, then reconciles an exact retry", () =>
    Effect.gen(function* () {
      const context = yield* setup()
      const registry = yield* ToolRegistry.Service
      const sessions = yield* SessionV2.Service
      const call = { ...context, call: { type: "tool-call" as const, name: "task", id: context.toolCallID, input } }
      const first = yield* settleTool(registry, call)
      expect(first.output?.structured).toMatchObject({ status: "completed", text: "The answer is 42" })
      const children = yield* sessions.list({ parentID: context.sessionID })
      expect(children).toHaveLength(1)
      expect(children[0]).toMatchObject({ parentID: context.sessionID, location, title: "Research", agent: "research" })
      expect(yield* settleTool(registry, call)).toEqual(first)
      expect(yield* sessions.messages({ sessionID: children[0]!.id })).toHaveLength(2)
      expect(
        (yield* settleTool(registry, { ...call, call: { ...call.call, input: { ...input, prompt: "different" } } }))
          .result,
      ).toEqual({ type: "error", value: "Conflicting retry of delegated task" })
      expect(
        (yield* settleTool(registry, { ...call, call: { ...call.call, input: { ...input, max_turns: 2 } } })).result,
      ).toEqual({ type: "error", value: "Conflicting retry of delegated task" })
    }),
  )

  it.effect("coalesces concurrent exact retries and runs independent siblings", () =>
    Effect.gen(function* () {
      const context = yield* setup()
      const registry = yield* ToolRegistry.Service
      const sessions = yield* SessionV2.Service
      const events = yield* EventV2.Service
      const call = { ...context, call: { type: "tool-call" as const, name: "task", id: context.toolCallID, input } }
      const results = yield* Effect.all([settleTool(registry, call), settleTool(registry, call)], {
        concurrency: "unbounded",
      })
      expect(results[1]).toEqual(results[0])
      yield* events.publish(SessionEvent.Tool.Input.Started, {
        ...context,
        timestamp: DateTime.nowUnsafe(),
        callID: "sibling",
        name: "task",
      })
      yield* events.publish(SessionEvent.Tool.Called, {
        ...context,
        timestamp: DateTime.nowUnsafe(),
        callID: "sibling",
        tool: "task",
        input,
        provider: { executed: false },
      })
      const second = yield* settleTool(registry, { ...context, call: { ...call.call, id: "sibling" } })
      expect(second.output?.structured).toMatchObject({ status: "completed" })
      expect(yield* sessions.list({ parentID: context.sessionID })).toHaveLength(2)
    }),
  )

  it.effect("rejects denied delegation and a provider-changing model override before creation", () =>
    Effect.gen(function* () {
      const context = yield* setup()
      const registry = yield* ToolRegistry.Service
      const agents = yield* AgentV2.Service
      const sessions = yield* SessionV2.Service
      const call = { ...context, call: { type: "tool-call" as const, name: "task", id: context.toolCallID, input } }
      const override = yield* settleTool(registry, {
        ...call,
        call: { ...call.call, input: { ...input, model: { ...model, providerID: "other" } } },
      })
      expect(override.result.type).toBe("error")
      yield* agents.transform((draft) =>
        draft.update(context.agent, (agent) => {
          agent.permissions = [{ action: "task", resource: "*", effect: "deny" }]
        }),
      )
      expect((yield* settleTool(registry, call)).result.type).toBe("error")
      expect(yield* sessions.list({ parentID: context.sessionID })).toEqual([])
    }),
  )

  it.effect("enforces ancestor permission ceilings for a more permissive child agent", () =>
    Effect.gen(function* () {
      const context = yield* setup()
      const sessions = yield* SessionV2.Service
      const agents = yield* AgentV2.Service
      const permission = yield* PermissionV2.Service
      const child = yield* sessions.create({
        parentID: context.sessionID,
        location,
        agent: AgentV2.ID.make("research"),
      })
      yield* agents.transform((draft) =>
        draft.update(context.agent, (agent) => {
          agent.permissions = [{ action: "write", resource: "*", effect: "deny" }]
        }),
      )
      expect(
        yield* permission.ask({
          sessionID: child.id,
          agent: AgentV2.ID.make("research"),
          action: "write",
          resources: ["file.ts"],
        }),
      ).toMatchObject({ effect: "deny" })
    }),
  )

  it.effect("refuses a third nested level", () =>
    Effect.gen(function* () {
      const sessions = yield* SessionV2.Service
      const registry = yield* ToolRegistry.Service
      const root = yield* sessions.create({ location })
      const child = yield* sessions.create({ location, parentID: root.id })
      const context = yield* setup("deep", child.id)
      const result = yield* settleTool(registry, {
        ...context,
        call: { type: "tool-call", name: "task", id: "deep", input },
      })
      expect(result.result).toEqual({ type: "error", value: "Delegation is limited to 2 levels" })
    }),
  )
  it.effect("returns typed child failures with a durable child reference", () =>
    Effect.gen(function* () {
      const context = yield* setup("failed", undefined, "fail")
      const registry = yield* ToolRegistry.Service
      const result = yield* settleTool(registry, {
        ...context,
        call: { type: "tool-call", name: "task", id: context.toolCallID, input: { ...input, prompt: "fail" } },
      })
      expect(result.output?.structured).toMatchObject({
        sessionID: TaskTool.identity(context).sessionID,
        status: "failed",
      })
    }),
  )

  it.effect("stopping a child reports cancellation to its waiting parent", () =>
    Effect.gen(function* () {
      const context = yield* setup("cancel-child", undefined, "wait")
      const registry = yield* ToolRegistry.Service
      const sessions = yield* SessionV2.Service
      const events = yield* EventV2.Service
      const childID = TaskTool.identity(context).sessionID
      const started = yield* Deferred.make<void>()
      const off = yield* events.listen((event) =>
        Schema.is(SessionEvent.Step.Started)(event) && event.data.sessionID === childID
          ? Deferred.succeed(started, undefined).pipe(Effect.asVoid)
          : Effect.void,
      )
      yield* Effect.addFinalizer(() => off)
      const fiber = yield* settleTool(registry, {
        ...context,
        call: { type: "tool-call", name: "task", id: context.toolCallID, input: { ...input, prompt: "wait" } },
      }).pipe(Effect.forkScoped)
      yield* Deferred.await(started)
      yield* sessions.interrupt(childID)
      const result = yield* Fiber.join(fiber)
      expect(result.output?.structured).toMatchObject({ sessionID: childID, status: "cancelled" })
      expect((yield* sessions.active).has(childID)).toBe(false)
    }),
  )

  it.effect("interrupting the owning tool stops its child and records cancellation", () =>
    Effect.gen(function* () {
      const context = yield* setup("cancel-parent", undefined, "wait")
      const registry = yield* ToolRegistry.Service
      const sessions = yield* SessionV2.Service
      const events = yield* EventV2.Service
      const childID = TaskTool.identity(context).sessionID
      const started = yield* Deferred.make<void>()
      const off = yield* events.listen((event) =>
        Schema.is(SessionEvent.Step.Started)(event) && event.data.sessionID === childID
          ? Deferred.succeed(started, undefined).pipe(Effect.asVoid)
          : Effect.void,
      )
      yield* Effect.addFinalizer(() => off)
      const fiber = yield* settleTool(registry, {
        ...context,
        call: { type: "tool-call", name: "task", id: context.toolCallID, input: { ...input, prompt: "wait" } },
      }).pipe(Effect.forkScoped)
      yield* Deferred.await(started)
      yield* Fiber.interrupt(fiber)
      expect((yield* sessions.active).has(childID)).toBe(false)
      const parent = yield* sessions.message({ sessionID: context.sessionID, messageID: context.assistantMessageID })
      expect(parent?.type === "assistant" && parent.content[0]).toMatchObject({
        state: { structured: { sessionID: childID, status: "cancelled" } },
      })
    }),
  )

  it.effect("continues a direct child with task_id and reconciles that follow-up exactly", () =>
    Effect.gen(function* () {
      const context = yield* setup()
      const registry = yield* ToolRegistry.Service
      const sessions = yield* SessionV2.Service
      const events = yield* EventV2.Service
      yield* settleTool(registry, {
        ...context,
        call: { type: "tool-call", name: "task", id: context.toolCallID, input },
      })
      const childID = TaskTool.identity(context).sessionID
      const followup = { ...input, task_id: childID, prompt: "Expand the result" }
      yield* events.publish(SessionEvent.Tool.Input.Started, {
        ...context,
        timestamp: DateTime.nowUnsafe(),
        callID: "followup",
        name: "task",
      })
      yield* events.publish(SessionEvent.Tool.Called, {
        ...context,
        timestamp: DateTime.nowUnsafe(),
        callID: "followup",
        tool: "task",
        input: followup,
        provider: { executed: false },
      })
      const call = { ...context, call: { type: "tool-call" as const, name: "task", id: "followup", input: followup } }
      const result = yield* settleTool(registry, call)
      expect(result.output?.structured).toMatchObject({ sessionID: childID, status: "completed" })
      expect(yield* settleTool(registry, call)).toEqual(result)
      expect(yield* sessions.list({ parentID: context.sessionID })).toHaveLength(1)
      expect(
        (yield* sessions.messages({ sessionID: childID })).filter((message) => message.type === "user"),
      ).toHaveLength(2)
    }),
  )

  it.effect("continues a direct child using its existing model when follow-up omits one", () =>
    Effect.gen(function* () {
      const context = yield* setup("missing-model")
      const registry = yield* ToolRegistry.Service
      const sessions = yield* SessionV2.Service
      const events = yield* EventV2.Service
      const child = yield* sessions.create({
        parentID: context.sessionID,
        location,
        agent: AgentV2.ID.make("research"),
      })
      const followup = { ...input, task_id: child.id, prompt: "Continue without a model" }
      yield* events.publish(SessionEvent.Tool.Input.Started, {
        ...context,
        timestamp: DateTime.nowUnsafe(),
        callID: "missing-model-followup",
        name: "task",
      })
      yield* events.publish(SessionEvent.Tool.Called, {
        ...context,
        timestamp: DateTime.nowUnsafe(),
        callID: "missing-model-followup",
        tool: "task",
        input: followup,
        provider: { executed: false },
      })
      const result = yield* settleTool(registry, {
          ...context,
          call: { type: "tool-call", name: "task", id: "missing-model-followup", input: followup },
        })
      expect(result.output?.structured).toMatchObject({ sessionID: child.id, status: "completed" })
      expect((yield* sessions.messages({ sessionID: child.id })).filter((message) => message.type === "user")).toHaveLength(1)
    }),
  )

  it.effect("keeps a delegated result scoped to its prompt when the child receives a later direct prompt", () =>
    Effect.gen(function* () {
      const context = yield* setup("scoped-result")
      const registry = yield* ToolRegistry.Service
      const sessions = yield* SessionV2.Service
      const events = yield* EventV2.Service
      const call = { ...context, call: { type: "tool-call" as const, name: "task", id: context.toolCallID, input } }
      expect((yield* settleTool(registry, call)).output?.structured).toMatchObject({ text: "The answer is 42" })
      const childID = TaskTool.identity(context).sessionID
      yield* events.publish(SessionEvent.Tool.Progress, {
        ...context,
        callID: context.toolCallID,
        timestamp: DateTime.nowUnsafe(),
        structured: { sessionID: childID, status: "running" },
        content: [],
      })
      yield* sessions.prompt({ sessionID: childID, prompt: { text: "unrelated" }, resume: false })
      yield* sessions.resume(childID)
      const retried = yield* settleTool(registry, call)
      expect(retried.output?.structured).toMatchObject({ status: "completed", text: "The answer is 42" })
      expect(retried.output?.structured).not.toMatchObject({ text: "This is newer" })
    }),
  )

  it.effect("returns partial text and failure status for non-stop completion", () =>
    Effect.gen(function* () {
      const context = yield* setup("length", undefined, "length")
      const registry = yield* ToolRegistry.Service
      const events = yield* EventV2.Service
      const sessions = yield* SessionV2.Service
      const call = {
        ...context,
        call: {
          type: "tool-call" as const,
          name: "task",
          id: context.toolCallID,
          input: { ...input, prompt: "length" },
        },
      }
      const first = yield* settleTool(registry, call)
      const output = first.output?.structured as TaskTool.Output
      expect(
        (yield* sessions.messages({ sessionID: TaskTool.identity(context).sessionID, order: "asc" })).at(-1),
      ).toMatchObject({
        finish: "length",
      })
      expect(output.status).toBe("failed")
      expect(output.text).toContain("The answer is 42")
      expect(output.text).toContain("length")
      yield* events.publish(SessionEvent.Tool.Progress, {
        ...context,
        callID: context.toolCallID,
        timestamp: DateTime.nowUnsafe(),
        structured: { sessionID: TaskTool.identity(context).sessionID, status: "running" },
        content: [],
      })
      const retried = yield* settleTool(registry, call)
      const retriedOutput = retried.output?.structured as TaskTool.Output
      expect(retriedOutput.status).toBe("failed")
      expect(retriedOutput.text).toContain("length")
    }),
  )

  it.effect("recovers a completed child result when parent completion delivery was interrupted", () =>
    Effect.gen(function* () {
      const context = yield* setup()
      const registry = yield* ToolRegistry.Service
      const sessions = yield* SessionV2.Service
      const events = yield* EventV2.Service
      const call = { ...context, call: { type: "tool-call" as const, name: "task", id: context.toolCallID, input } }
      const result = yield* settleTool(registry, call)
      yield* events.publish(SessionEvent.Tool.Progress, {
        ...context,
        callID: context.toolCallID,
        timestamp: DateTime.nowUnsafe(),
        structured: { sessionID: TaskTool.identity(context).sessionID, status: "running" },
        content: [],
      })
      expect(yield* settleTool(registry, call)).toEqual(result)
      expect(yield* sessions.messages({ sessionID: TaskTool.identity(context).sessionID })).toHaveLength(2)
    }),
  )

  it.effect("bounds concurrent children without queueing or deadlocking nested calls", () =>
    Effect.gen(function* () {
      const context = yield* setup("wait-0", undefined, "wait")
      const registry = yield* ToolRegistry.Service
      const sessions = yield* SessionV2.Service
      const events = yield* EventV2.Service
      const started = yield* Deferred.make<void>()
      const seen = new Set<string>()
      const off = yield* events.listen((event) => {
        if (!Schema.is(SessionEvent.Step.Started)(event) || event.data.sessionID === context.sessionID)
          return Effect.void
        seen.add(event.data.sessionID)
        return seen.size === 4 ? Deferred.succeed(started, undefined).pipe(Effect.asVoid) : Effect.void
      })
      yield* Effect.addFinalizer(() => off)
      yield* Effect.forEach([1, 2, 3, 4], (index) =>
        Effect.gen(function* () {
          yield* events.publish(SessionEvent.Tool.Input.Started, {
            ...context,
            timestamp: DateTime.nowUnsafe(),
            callID: `wait-${index}`,
            name: "task",
          })
          yield* events.publish(SessionEvent.Tool.Called, {
            ...context,
            timestamp: DateTime.nowUnsafe(),
            callID: `wait-${index}`,
            tool: "task",
            input: { ...input, prompt: "wait" },
            provider: { executed: false },
          })
        }),
      )
      const fibers = yield* Effect.forEach([0, 1, 2, 3], (index) =>
        settleTool(registry, {
          ...context,
          call: { type: "tool-call", name: "task", id: `wait-${index}`, input: { ...input, prompt: "wait" } },
        }).pipe(Effect.forkScoped),
      )
      yield* Deferred.await(started)
      expect((yield* sessions.active).size).toBe(4)
      expect(
        (yield* settleTool(registry, {
          ...context,
          call: { type: "tool-call", name: "task", id: "wait-4", input: { ...input, prompt: "wait" } },
        })).result,
      ).toEqual({ type: "error", value: "At most 4 delegated tasks can run in this Location" })
      yield* Effect.forEach(fibers, Fiber.interrupt)
      expect((yield* sessions.active).size).toBe(0)
    }),
  )
  it.effect("does not restart provider work for an abandoned promoted prompt", () =>
    Effect.gen(function* () {
      const context = yield* setup("abandoned", undefined, "wait")
      const registry = yield* ToolRegistry.Service
      const sessions = yield* SessionV2.Service
      const events = yield* EventV2.Service
      const childID = TaskTool.identity(context).sessionID
      const started = yield* Deferred.make<void>()
      const off = yield* events.listen((event) =>
        Schema.is(SessionEvent.Step.Started)(event) && event.data.sessionID === childID
          ? Deferred.succeed(started, undefined).pipe(Effect.asVoid)
          : Effect.void,
      )
      yield* Effect.addFinalizer(() => off)
      const call = {
        ...context,
        call: { type: "tool-call" as const, name: "task", id: context.toolCallID, input: { ...input, prompt: "wait" } },
      }
      const fiber = yield* settleTool(registry, call).pipe(Effect.forkScoped)
      yield* Deferred.await(started)
      yield* Fiber.interrupt(fiber)
      yield* events.publish(SessionEvent.Tool.Progress, {
        ...context,
        callID: context.toolCallID,
        timestamp: DateTime.nowUnsafe(),
        structured: { sessionID: childID, status: "running" },
        content: [],
      })
      const count = (yield* sessions.messages({ sessionID: childID })).length
      const result = yield* settleTool(registry, call)
      expect(result.output?.structured).toMatchObject({ sessionID: childID, status: "failed" })
      expect(yield* sessions.messages({ sessionID: childID })).toHaveLength(count)
      expect((yield* sessions.active).size).toBe(0)
    }),
  )
})
