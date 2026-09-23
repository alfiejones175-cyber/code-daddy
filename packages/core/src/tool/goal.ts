export * as GoalTool from "./goal"

import { ToolFailure } from "@opencode-ai/llm"
import { Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { PermissionV2 } from "../permission"
import { SessionGoal } from "../session/goal"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "goal"

export const Input = Schema.Struct({
  action: Schema.Literals(["get", "set", "pause", "resume", "block", "complete", "clear"]),
  objective: SessionGoal.Info.fields.objective.pipe(Schema.optional),
  acceptance_criteria: SessionGoal.Info.fields.acceptanceCriteria.pipe(Schema.optional),
  budget: SessionGoal.Info.fields.budget,
  progress: SessionGoal.Info.fields.progress,
  blockers: SessionGoal.Info.fields.blockers.pipe(Schema.optional),
  evidence: Schema.String.pipe(Schema.optional),
})

export const Output = Schema.Struct({
  goal: Schema.NullOr(SessionGoal.Info),
})
export type Output = typeof Output.Type

export const toModelOutput = (output: Output) => JSON.stringify(output.goal, null, 2)

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const goals = yield* SessionGoal.Service
    const permission = yield* PermissionV2.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description:
            "Read or maintain the durable objective for this session. Track progress and blockers, block or pause work when needed, resume it with saved context, complete it with validation evidence, or clear it. Budget is advisory.",
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: toModelOutput(output) }],
          execute: (input, context) =>
            Effect.gen(function* () {
              if (input.action === "get") return { goal: (yield* goals.get(context.sessionID)) ?? null }
              yield* permission
                .assert({
                  action: name,
                  resources: ["*"],
                  save: ["*"],
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
                })
                .pipe(Effect.mapError(() => new ToolFailure({ message: "Permission denied: goal" })))
              if (input.action === "set") {
                if (!input.objective)
                  return yield* new ToolFailure({ message: "A goal objective is required when setting a goal" })
                return {
                  goal: yield* goals.set({
                    sessionID: context.sessionID,
                    objective: input.objective,
                    acceptanceCriteria: input.acceptance_criteria,
                    budget: input.budget,
                    progress: input.progress,
                    blockers: input.blockers,
                    evidence: input.evidence,
                  }),
                }
              }
              if (input.action === "pause") return { goal: yield* goals.pause(context.sessionID) }
              if (input.action === "resume") return { goal: yield* goals.resume(context.sessionID) }
              if (input.action === "block") {
                if (!input.blockers?.length)
                  return yield* new ToolFailure({ message: "Blocking a goal requires at least one blocker" })
                return {
                  goal: yield* goals.block({
                    sessionID: context.sessionID,
                    blockers: input.blockers,
                    progress: input.progress,
                  }),
                }
              }
              if (input.action === "clear") {
                yield* goals.clear(context.sessionID)
                return { goal: null }
              }
              if (!input.evidence)
                return yield* new ToolFailure({ message: "Completion requires validation evidence" })
              return { goal: yield* goals.complete({ sessionID: context.sessionID, evidence: input.evidence }) }
            }).pipe(
              Effect.catchTag("SessionGoal.NotFoundError", () =>
                Effect.fail(new ToolFailure({ message: "Set a goal before changing its status" })),
              ),
            ),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/goal",
  layer,
  deps: [ToolRegistry.node, PermissionV2.node, SessionGoal.node],
})
