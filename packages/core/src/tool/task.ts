export * as TaskTool from "./task"

import { createHash } from "node:crypto"
import { eq } from "drizzle-orm"
import { Cause, DateTime, Deferred, Effect, Exit, Layer, Option, Schema } from "effect"
import { ToolFailure } from "@opencode-ai/llm"
import { AgentV2 } from "../agent"
import { Catalog } from "../catalog"
import { Database } from "../database/database"
import { makeLocationNode, type LocationNode } from "../effect/app-node"
import { EventV2 } from "../event"
import { Location } from "../location"
import { ModelV2 } from "../model"
import { PermissionV2 } from "../permission"
import { PositiveInt } from "../schema"
import { SessionV2 } from "../session"
import { SessionEvent } from "../session/event"
import { SessionAccess } from "../session/access"
import { SessionInput } from "../session/input"
import { SessionMessage } from "../session/message"
import { SessionTable } from "../session/sql"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "task"
export const maxDepth = 2
export const maxConcurrent = 4
export const Input = Schema.Struct({
  description: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(160)),
  prompt: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(32000)),
  subagent_type: AgentV2.ID,
  task_id: SessionV2.ID.pipe(Schema.optional),
  model: ModelV2.Ref.pipe(Schema.optional),
  max_turns: PositiveInt.check(Schema.isLessThanOrEqualTo(100)).pipe(Schema.optional),
})
export const Output = Schema.Struct({
  sessionID: SessionV2.ID,
  status: Schema.Literals(["completed", "failed", "cancelled"]),
  text: Schema.String,
})
export type Output = typeof Output.Type

/** Stable across restarts, including providers that reuse call IDs in different turns. */
export function identity(context: Tool.Context) {
  const key = createHash("sha256")
    .update(JSON.stringify([context.sessionID, context.assistantMessageID, context.toolCallID]))
    .digest("hex")
  return { sessionID: SessionV2.ID.make(`ses_task_${key}`), messageID: SessionMessage.ID.make(`msg_task_${key}`) }
}

function requestKey(input: typeof Input.Type) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.description,
        input.prompt,
        input.subagent_type,
        input.task_id ?? null,
        input.model ? [input.model.providerID, input.model.id, input.model.variant ?? "default"] : null,
        input.max_turns ?? null,
      ]),
    )
    .digest("hex")
}

function outputForPrompt(
  messages: SessionMessage.Message[],
  messageID: SessionMessage.ID,
  sessionID: SessionV2.ID,
): Output {
  const prompt = messages.findIndex((message) => message.id === messageID)
  if (prompt < 0)
    return {
      sessionID,
      status: "failed",
      text: "The delegated prompt could not be found in the subchat history.",
    }
  const nextPrompt = messages.findIndex((message, index) => index > prompt && message.type === "user")
  const assistant = messages
    .slice(prompt + 1, nextPrompt < 0 ? undefined : nextPrompt)
    .findLast((message) => message.type === "assistant")
  if (assistant?.type !== "assistant")
    return {
      sessionID,
      status: "failed",
      text: "The delegated task ended without an assistant result.",
    }
  const text = assistant.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
  const reason = assistant.error?.message
    ? `Delegated task failed: ${assistant.error.message}`
    : !assistant.time.completed
      ? "The delegated task ended before the assistant response completed."
      : assistant.finish !== "stop"
        ? `The delegated task stopped with finish reason: ${assistant.finish ?? "unknown"}.`
        : undefined
  if (!reason) return { sessionID, status: "completed", text }
  return { sessionID, status: "failed", text: [text, reason].filter(Boolean).join("\n\n") }
}

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const access = yield* SessionAccess.Service
    const permission = yield* PermissionV2.Service
    const catalog = yield* Catalog.Service
    const agents = yield* AgentV2.Service
    const location = yield* Location.Service
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    const running = new Map<
      SessionV2.ID,
      { fingerprint: string; done: Deferred.Deferred<Output, ToolFailure>; target: SessionV2.ID }
    >()
    const available = (yield* agents.all()).filter((agent) => !agent.hidden && agent.mode !== "primary")
    const progress = (context: Tool.Context, output: Output | { sessionID: SessionV2.ID; status: "running" }) =>
      events
        .publish(SessionEvent.Tool.Progress, {
          sessionID: context.sessionID,
          assistantMessageID: context.assistantMessageID,
          callID: context.toolCallID,
          timestamp: DateTime.nowUnsafe(),
          structured: output,
          content: [],
        })
        .pipe(Effect.asVoid)

    const run = Effect.fn("TaskTool.run")(function* (
      input: typeof Input.Type,
      context: Tool.Context,
      fingerprint: string,
    ) {
      const sessions = yield* access.current
      if (!sessions) return yield* new ToolFailure({ message: "Session execution is unavailable" })
      const invocation = identity(context)
      const ids = { ...invocation, sessionID: input.task_id ?? invocation.sessionID }
      const parent = yield* sessions.get(context.sessionID)
      if (parent.location.directory !== location.directory || parent.location.workspaceID !== location.workspaceID)
        return yield* new ToolFailure({ message: "Delegation cannot cross Locations" })
      const agent = yield* agents.get(input.subagent_type)
      if (!agent || agent.hidden || agent.mode === "primary")
        return yield* new ToolFailure({ message: `Unknown or unavailable subagent: ${input.subagent_type}` })
      let ancestor = parent
      let depth = 1
      while (ancestor.parentID) {
        if (depth >= maxDepth) return yield* new ToolFailure({ message: `Delegation is limited to ${maxDepth} levels` })
        ancestor = yield* sessions.get(ancestor.parentID)
        depth++
      }
      yield* permission.assert({
        action: name,
        resources: [input.subagent_type],
        sessionID: context.sessionID,
        agent: context.agent,
        source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
      })
      const row = yield* database.db
        .select()
        .from(SessionTable)
        .where(eq(SessionTable.id, ids.sessionID))
        .get()
        .pipe(Effect.orDie)
      if (
        input.task_id &&
        (!row ||
          row.parent_id !== parent.id ||
          row.directory !== location.directory ||
          (row.workspace_id ?? undefined) !== location.workspaceID ||
          row.agent !== input.subagent_type)
      )
        return yield* new ToolFailure({
          message: "task_id must identify an existing direct child with the same agent and Location",
        })
      if (
        row &&
        (row.parent_id !== parent.id ||
          row.directory !== location.directory ||
          (row.workspace_id ?? undefined) !== location.workspaceID)
      )
        return yield* new ToolFailure({ message: "The delegated child no longer belongs to this parent and Location" })
      if (!input.task_id && row && row.metadata?.task !== fingerprint)
        return yield* new ToolFailure({ message: "Conflicting retry of delegated task" })
      if (input.task_id && input.max_turns && row?.metadata?.maxTurns !== String(input.max_turns))
        return yield* new ToolFailure({ message: "Follow-up max_turns must match the child session's budget" })
      const owner = yield* sessions.message({ sessionID: context.sessionID, messageID: context.assistantMessageID })
      const call =
        owner?.type === "assistant"
          ? owner.content.find((part) => part.type === "tool" && part.id === context.toolCallID)
          : undefined
      if (
        owner?.type !== "assistant" ||
        !call ||
        call.type !== "tool" ||
        call.name !== name ||
        call.state.status === "pending"
      )
        return yield* new ToolFailure({ message: "Delegation requires a recorded parent tool call" })
      const recordedInput = Schema.decodeUnknownOption(Input)(call.state.input)
      if (Option.isNone(recordedInput) || requestKey(input) !== requestKey(recordedInput.value))
        return yield* new ToolFailure({ message: "Delegated input does not match its recorded tool call" })
      const completed = Schema.decodeUnknownOption(Output)(call.state.structured)
      if (Option.isSome(completed) && completed.value.sessionID === ids.sessionID) return completed.value
      const selectedModel = owner.model
      if (input.model && !input.task_id) {
        const availableModel = (yield* catalog.model.available()).find(
          (item) => item.providerID === input.model?.providerID && item.id === input.model.id,
        )
        if (!availableModel || (input.model.variant && !availableModel.variants.some((variant) => variant.id === input.model?.variant)))
          return yield* new ToolFailure({ message: `Requested model is unavailable: ${input.model.providerID}/${input.model.id}` })
        yield* permission.assert({
          action: "provider.use",
          resources: [input.model.providerID],
          sessionID: context.sessionID,
          agent: context.agent,
          source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
        })
      }
      const child = input.task_id
        ? yield* sessions.get(input.task_id)
        : yield* sessions.create({
            id: ids.sessionID,
            parentID: parent.id,
            location: parent.location,
            title: input.description,
            agent: agent.id,
            model: input.model ?? selectedModel,
            metadata: { task: fingerprint, ...(input.max_turns ? { maxTurns: String(input.max_turns) } : {}) },
          })
      if (
        input.task_id &&
        (input.model &&
          (!child.model ||
            child.model.providerID !== input.model.providerID ||
            child.model.id !== input.model.id ||
            (child.model.variant ?? "default") !== (input.model.variant ?? "default")))
      )
        return yield* new ToolFailure({ message: "Follow-up model must match the child session's selected model" })
      const recorded = yield* SessionInput.find(database.db, ids.messageID)
      const active = (yield* sessions.active).has(child.id)
      if (input.task_id && !recorded && active)
        return yield* new ToolFailure({
          message: "The subchat is already running; wait or steer it directly before delegating a follow-up",
        })
      if (recorded?.promotedSeq !== undefined && !active) {
        const history = yield* sessions.messages({ sessionID: child.id, order: "asc" })
        const output = outputForPrompt(history, ids.messageID, child.id)
        yield* progress(context, output)
        return output
      }
      yield* sessions.prompt({ id: ids.messageID, sessionID: child.id, prompt: { text: input.prompt }, resume: false })
      yield* progress(context, { sessionID: child.id, status: "running" })
      const result = yield* sessions.resume(child.id).pipe(
        Effect.exit,
        Effect.onInterrupt(() =>
          sessions.interrupt(child.id).pipe(
            Effect.andThen(
              progress(context, {
                sessionID: child.id,
                status: "cancelled",
                text: "Delegated task cancelled with its parent.",
              }),
            ),
          ),
        ),
      )
      if (Exit.isFailure(result)) {
        if (Cause.hasDies(result.cause)) return yield* Effect.failCause(result.cause)
        const output: Output = {
          sessionID: child.id,
          status: Cause.hasInterruptsOnly(result.cause) ? "cancelled" : "failed",
          text: Cause.hasInterruptsOnly(result.cause)
            ? "Delegated task cancelled."
            : `Delegated task failed: ${String(Cause.squash(result.cause))}`,
        }
        yield* progress(context, output)
        return output
      }
      const messages = yield* sessions.messages({ sessionID: child.id, order: "asc" })
      const output = outputForPrompt(messages, ids.messageID, child.id)
      yield* progress(context, output)
      return output
    })

    yield* tools
      .register({
        [name]: Tool.make({
          description: `Delegate one bounded task to an inspectable child chat and await its result. Supply task_id only to explicitly continue a previously returned direct child. Inherits project, selected model and permission ceiling. Maximum ${maxConcurrent} concurrent children per Location and ${maxDepth} nesting levels. Available agents: ${available.map((agent) => `${agent.id}: ${agent.description ?? "general assistance"}`).join("; ")}.`,
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [
            { type: "text", text: `Subchat ${output.sessionID} (${output.status})\n${output.text}` },
          ],
          execute: (input, context) =>
            Effect.uninterruptibleMask((restore) =>
              Effect.gen(function* () {
                const id = identity(context).sessionID
                const fingerprint = requestKey(input)
                const existing = running.get(id)
                if (existing) {
                  if (existing.fingerprint !== fingerprint)
                    return yield* new ToolFailure({ message: "Conflicting retry of delegated task" })
                  return yield* restore(Deferred.await(existing.done))
                }
                const target = input.task_id ?? id
                if (Array.from(running.values()).some((entry) => entry.target === target))
                  return yield* new ToolFailure({ message: "Another delegated call already owns this subchat" })
                if (running.size >= maxConcurrent)
                  return yield* new ToolFailure({
                    message: `At most ${maxConcurrent} delegated tasks can run in this Location`,
                  })
                const done = yield* Deferred.make<Output, ToolFailure>()
                running.set(id, { fingerprint, done, target })
                return yield* restore(
                  run(input, context, fingerprint).pipe(
                    Effect.mapError((error) =>
                      error instanceof ToolFailure ? error : new ToolFailure({ message: error.message }),
                    ),
                  ),
                ).pipe(
                  Effect.onExit((exit) => Deferred.done(done, exit)),
                  Effect.ensuring(Effect.sync(() => running.delete(id))),
                )
              }),
            ),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node: LocationNode<never> = makeLocationNode({
  name: "tool/task",
  layer,
  deps: [
    ToolRegistry.node,
    PermissionV2.node,
    AgentV2.node,
    Location.node,
    Database.node,
    EventV2.node,
    SessionAccess.node,
    Catalog.node,
  ],
})
