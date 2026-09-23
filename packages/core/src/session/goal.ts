export * as SessionGoal from "./goal"

import { eq } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { SessionGoal as SchemaSessionGoal } from "@opencode-ai/schema/session-goal"
import { Database } from "../database/database"
import { makeLocationNode } from "../effect/app-node"
import { SystemContext } from "../system-context"
import { SessionSchema } from "./schema"
import { SessionGoalTable } from "./sql"

export const Status = SchemaSessionGoal.Status
export type Status = SchemaSessionGoal.Status
export const Info = SchemaSessionGoal.Info
export type Info = SchemaSessionGoal.Info
export const SetInput = SchemaSessionGoal.SessionSet
export type SetInput = SchemaSessionGoal.SessionSet
export const BlockInput = SchemaSessionGoal.SessionBlock
export type BlockInput = SchemaSessionGoal.SessionBlock

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("SessionGoal.NotFoundError", {
  sessionID: SessionSchema.ID,
}) {}

export interface Interface {
  readonly get: (sessionID: SessionSchema.ID) => Effect.Effect<Info | undefined>
  readonly set: (input: SetInput) => Effect.Effect<Info>
  readonly pause: (sessionID: SessionSchema.ID) => Effect.Effect<Info, NotFoundError>
  readonly resume: (sessionID: SessionSchema.ID) => Effect.Effect<Info, NotFoundError>
  readonly block: (input: BlockInput) => Effect.Effect<Info, NotFoundError>
  readonly complete: (input: { readonly sessionID: SessionSchema.ID; readonly evidence: string }) => Effect.Effect<Info, NotFoundError>
  readonly clear: (sessionID: SessionSchema.ID) => Effect.Effect<void>
  readonly context: (sessionID: SessionSchema.ID) => Effect.Effect<SystemContext.SystemContext>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/SessionGoal") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    const get = Effect.fn("SessionGoal.get")(function* (sessionID: SessionSchema.ID) {
      const row = yield* db
        .select()
        .from(SessionGoalTable)
        .where(eq(SessionGoalTable.session_id, sessionID))
        .get()
        .pipe(Effect.orDie)
      return row ? fromRow(row) : undefined
    })

    const set = Effect.fn("SessionGoal.set")(function* (input: SetInput) {
      const existing = yield* get(input.sessionID)
      const next =
        existing?.objective === input.objective
          ? {
              objective: input.objective,
              acceptanceCriteria: input.acceptanceCriteria ?? existing.acceptanceCriteria,
              budget: input.budget ?? existing.budget,
              status: existing.status,
              progress: input.progress ?? existing.progress,
              blockers: input.blockers ?? existing.blockers,
              evidence: input.evidence ?? existing.evidence,
            }
          : {
              objective: input.objective,
              acceptanceCriteria: input.acceptanceCriteria ?? [],
              budget: input.budget,
              status: "active" as const,
              progress: input.progress,
              blockers: input.blockers ?? [],
              evidence: undefined,
            }
      yield* db
        .insert(SessionGoalTable)
        .values({
          session_id: input.sessionID,
          objective: next.objective,
          acceptance_criteria: next.acceptanceCriteria,
          budget: next.budget,
          status: next.status,
          progress: next.progress,
          blockers: next.blockers,
          evidence: next.evidence,
        })
        .onConflictDoUpdate({
          target: SessionGoalTable.session_id,
          set: {
            objective: next.objective,
            acceptance_criteria: next.acceptanceCriteria,
            budget: next.budget,
            status: next.status,
            progress: next.progress,
            blockers: next.blockers,
            evidence: next.evidence,
            time_updated: Date.now(),
          },
        })
        .run()
        .pipe(Effect.orDie)
      return Info.make(next)
    })

    const transition = Effect.fn("SessionGoal.transition")(function* (
      sessionID: SessionSchema.ID,
      status: Status,
      changes: Partial<Pick<Info, "evidence" | "progress" | "blockers">> = {},
    ) {
      const existing = yield* get(sessionID)
      if (!existing) return yield* new NotFoundError({ sessionID })
      const next = { ...existing, status, ...changes }
      yield* db
        .update(SessionGoalTable)
        .set({
          status: next.status,
          progress: next.progress,
          blockers: next.blockers,
          evidence: next.evidence,
          time_updated: Date.now(),
        })
        .where(eq(SessionGoalTable.session_id, sessionID))
        .run()
        .pipe(Effect.orDie)
      return next
    })

    const context = Effect.fn("SessionGoal.context")(function* (sessionID: SessionSchema.ID) {
      const goal = yield* get(sessionID)
      if (!goal) return SystemContext.empty
      return SystemContext.make({
        key: SystemContext.Key.make("core/session-goal"),
        codec: Schema.toCodecJson(Info),
        load: get(sessionID).pipe(Effect.map((current) => current ?? SystemContext.unavailable)),
        baseline: render,
        update: (_previous, current) => `The session goal has changed.\n\n${render(current)}`,
        removed: () => "The session goal was cleared.",
      })
    })

    return Service.of({
      get,
      set,
      pause: (sessionID) => transition(sessionID, "paused"),
      resume: (sessionID) => transition(sessionID, "active"),
      block: (input) =>
        transition(input.sessionID, "blocked", {
          blockers: input.blockers,
          ...(input.progress === undefined ? {} : { progress: input.progress }),
        }),
      complete: ({ sessionID, evidence }) => transition(sessionID, "completed", { evidence, blockers: [] }),
      clear: Effect.fn("SessionGoal.clear")(function* (sessionID) {
        yield* db.delete(SessionGoalTable).where(eq(SessionGoalTable.session_id, sessionID)).run().pipe(Effect.orDie)
      }),
      context,
    })
  }),
)

function fromRow(row: typeof SessionGoalTable.$inferSelect): Info {
  return Info.make({
    objective: row.objective,
    acceptanceCriteria: row.acceptance_criteria,
    budget: row.budget ?? undefined,
    status: Status.make(row.status as Status),
    progress: row.progress ?? undefined,
    blockers: row.blockers ?? [],
    evidence: row.evidence ?? undefined,
  })
}

function render(goal: Info) {
  return [
    "<session-goal>",
    `Objective: ${goal.objective}`,
    ...(goal.acceptanceCriteria.length === 0
      ? []
      : ["Acceptance criteria:", ...goal.acceptanceCriteria.map((criterion) => `- ${criterion}`)]),
    ...(goal.budget === undefined ? [] : [`Advisory budget: ${goal.budget} tokens`]),
    `Status: ${goal.status}`,
    ...(goal.progress === undefined ? [] : [`Progress: ${goal.progress}`]),
    ...(goal.blockers.length === 0 ? [] : ["Blockers:", ...goal.blockers.map((blocker) => `- ${blocker}`)]),
    ...(goal.evidence === undefined ? [] : [`Evidence: ${goal.evidence}`]),
    "</session-goal>",
  ].join("\n")
}

export const node = makeLocationNode({ service: Service, layer, deps: [Database.node] })
