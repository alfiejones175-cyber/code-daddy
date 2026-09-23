export * as Routine from "./routine"

import { and, asc, desc, eq, lte } from "drizzle-orm"
import { Context, DateTime, Effect, Layer, Schema } from "effect"
import { Routine as SchemaRoutine } from "@opencode-ai/schema/routine"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"
import { SessionMessage } from "./session/message"
import { SessionSchema } from "./session/schema"
import { RoutineRunTable, RoutineTable, SessionTable } from "./session/sql"

export const ID = SchemaRoutine.ID
export type ID = SchemaRoutine.ID
export const RunID = SchemaRoutine.RunID
export type RunID = SchemaRoutine.RunID
export const Info = SchemaRoutine.Info
export type Info = SchemaRoutine.Info
export const Run = SchemaRoutine.Run
export type Run = SchemaRoutine.Run
export const Create = SchemaRoutine.Create
export type Create = SchemaRoutine.Create

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("Routine.NotFoundError", {
  routineID: ID,
}) {}

export class SessionNotFoundError extends Schema.TaggedErrorClass<SessionNotFoundError>()(
  "Routine.SessionNotFoundError",
  {
    sessionID: SessionSchema.ID,
  },
) {}

export type Claim = { readonly routine: Info; readonly run: Run }

export interface Interface {
  readonly create: (input: Create) => Effect.Effect<Info, SessionNotFoundError>
  readonly list: (input?: { readonly sessionID?: SessionSchema.ID }) => Effect.Effect<ReadonlyArray<Info>>
  readonly get: (routineID: ID) => Effect.Effect<Info | undefined>
  readonly pause: (routineID: ID) => Effect.Effect<Info, NotFoundError>
  readonly resume: (routineID: ID) => Effect.Effect<Info, NotFoundError>
  readonly remove: (routineID: ID) => Effect.Effect<void, NotFoundError>
  readonly runs: (input: {
    readonly routineID: ID
    readonly limit: number
  }) => Effect.Effect<ReadonlyArray<Run>, NotFoundError>
  readonly claimDue: (input: { readonly now: number; readonly limit: number }) => Effect.Effect<ReadonlyArray<Claim>>
  readonly getClaim: (runID: RunID) => Effect.Effect<Claim | undefined>
  readonly pending: (limit: number) => Effect.Effect<ReadonlyArray<Claim>>
  readonly admit: (input: { readonly runID: RunID; readonly admittedSeq: number }) => Effect.Effect<void>
  readonly fail: (input: { readonly runID: RunID; readonly error: string }) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/Routine") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    const get = Effect.fn("Routine.get")(function* (routineID: ID) {
      const row = yield* db.select().from(RoutineTable).where(eq(RoutineTable.id, routineID)).get().pipe(Effect.orDie)
      return row ? fromRoutineRow(row) : undefined
    })

    const requireRoutine = Effect.fn("Routine.require")(function* (routineID: ID) {
      const routine = yield* get(routineID)
      if (!routine) return yield* new NotFoundError({ routineID })
      return routine
    })

    const create = Effect.fn("Routine.create")(function* (input: Create) {
      const session = yield* db
        .select({ id: SessionTable.id })
        .from(SessionTable)
        .where(eq(SessionTable.id, input.sessionID))
        .get()
        .pipe(Effect.orDie)
      if (!session) return yield* new SessionNotFoundError({ sessionID: input.sessionID })
      const now = Date.now()
      const routine = Info.make({
        id: ID.create(),
        sessionID: input.sessionID,
        name: input.name,
        prompt: input.prompt,
        intervalMs: input.intervalMs,
        status: "active",
        nextRunAt: DateTime.makeUnsafe(now + input.intervalMs),
        time: { created: DateTime.makeUnsafe(now), updated: DateTime.makeUnsafe(now) },
      })
      yield* db
        .insert(RoutineTable)
        .values({
          id: routine.id,
          session_id: routine.sessionID,
          name: routine.name,
          prompt: routine.prompt,
          interval_ms: routine.intervalMs,
          status: routine.status,
          next_run_at: DateTime.toEpochMillis(routine.nextRunAt),
          time_created: now,
          time_updated: now,
        })
        .run()
        .pipe(Effect.orDie)
      return routine
    })

    const list = Effect.fn("Routine.list")(function* (input?: { readonly sessionID?: SessionSchema.ID }) {
      const query = db.select().from(RoutineTable)
      const rows = yield* (
        input?.sessionID
          ? query.where(eq(RoutineTable.session_id, input.sessionID)).orderBy(asc(RoutineTable.time_created)).all()
          : query.orderBy(asc(RoutineTable.time_created)).all()
      ).pipe(Effect.orDie)
      return rows.map(fromRoutineRow)
    })

    const pause = Effect.fn("Routine.pause")(function* (routineID: ID) {
      const routine = yield* requireRoutine(routineID)
      const now = Date.now()
      yield* db
        .transaction((tx) =>
          Effect.all([
            tx
              .update(RoutineTable)
              .set({ status: "paused", time_updated: now })
              .where(eq(RoutineTable.id, routineID))
              .run(),
            tx
              .update(RoutineRunTable)
              .set({ status: "cancelled", time_updated: now })
              .where(and(eq(RoutineRunTable.routine_id, routineID), eq(RoutineRunTable.status, "claimed")))
              .run(),
          ]),
        )
        .pipe(Effect.orDie)
      return Info.make({ ...routine, status: "paused", time: { ...routine.time, updated: DateTime.makeUnsafe(now) } })
    })

    const resume = Effect.fn("Routine.resume")(function* (routineID: ID) {
      const routine = yield* requireRoutine(routineID)
      const now = Date.now()
      const nextRunAt = now + routine.intervalMs
      yield* db
        .update(RoutineTable)
        .set({ status: "active", next_run_at: nextRunAt, time_updated: now })
        .where(eq(RoutineTable.id, routineID))
        .run()
        .pipe(Effect.orDie)
      return Info.make({
        ...routine,
        status: "active",
        nextRunAt: DateTime.makeUnsafe(nextRunAt),
        time: { ...routine.time, updated: DateTime.makeUnsafe(now) },
      })
    })

    const remove = Effect.fn("Routine.remove")(function* (routineID: ID) {
      yield* requireRoutine(routineID)
      yield* db.delete(RoutineTable).where(eq(RoutineTable.id, routineID)).run().pipe(Effect.orDie)
    })

    const runs = Effect.fn("Routine.runs")(function* (input: { readonly routineID: ID; readonly limit: number }) {
      yield* requireRoutine(input.routineID)
      const rows = yield* db
        .select()
        .from(RoutineRunTable)
        .where(eq(RoutineRunTable.routine_id, input.routineID))
        .orderBy(desc(RoutineRunTable.scheduled_at))
        .limit(input.limit)
        .all()
        .pipe(Effect.orDie)
      return rows.map(fromRunRow)
    })

    const claimDue = Effect.fn("Routine.claimDue")(function* (input: { readonly now: number; readonly limit: number }) {
      const due = yield* db
        .select()
        .from(RoutineTable)
        .where(and(eq(RoutineTable.status, "active"), lte(RoutineTable.next_run_at, input.now)))
        .orderBy(asc(RoutineTable.next_run_at))
        .limit(input.limit)
        .all()
        .pipe(Effect.orDie)
      return (yield* Effect.forEach(due, (candidate) =>
        db
          .transaction((tx) =>
            Effect.gen(function* () {
              const routine = yield* tx
                .select()
                .from(RoutineTable)
                .where(
                  and(
                    eq(RoutineTable.id, candidate.id),
                    eq(RoutineTable.status, "active"),
                    eq(RoutineTable.next_run_at, candidate.next_run_at),
                  ),
                )
                .get()
              if (!routine) return
              const claimedAt = input.now
              const stored = yield* tx
                .insert(RoutineRunTable)
                .values({
                  id: RunID.create(),
                  routine_id: routine.id,
                  session_id: routine.session_id,
                  message_id: SessionMessage.ID.create(),
                  scheduled_at: routine.next_run_at,
                  status: "claimed",
                  claimed_at: claimedAt,
                  time_created: claimedAt,
                  time_updated: claimedAt,
                })
                .onConflictDoNothing()
                .returning()
                .get()
              if (!stored) return
              const skipped = Math.floor((input.now - routine.next_run_at) / routine.interval_ms) + 1
              yield* tx
                .update(RoutineTable)
                .set({ next_run_at: routine.next_run_at + skipped * routine.interval_ms, time_updated: input.now })
                .where(eq(RoutineTable.id, routine.id))
                .run()
              return { routine: fromRoutineRow(routine), run: fromRunRow(stored) }
            }),
          )
          .pipe(Effect.orDie),
      )).filter((claim): claim is Claim => claim !== undefined)
    })

    const getClaim = Effect.fn("Routine.getClaim")(function* (runID: RunID) {
      const run = yield* db
        .select()
        .from(RoutineRunTable)
        .where(and(eq(RoutineRunTable.id, runID), eq(RoutineRunTable.status, "claimed")))
        .get()
        .pipe(Effect.orDie)
      if (!run) return
      const routine = yield* get(ID.make(run.routine_id))
      if (!routine || routine.status !== "active") return
      return { routine, run: fromRunRow(run) }
    })

    const pending = Effect.fn("Routine.pending")(function* (limit: number) {
      const rows = yield* db
        .select()
        .from(RoutineRunTable)
        .where(eq(RoutineRunTable.status, "claimed"))
        .orderBy(asc(RoutineRunTable.claimed_at))
        .limit(limit)
        .all()
        .pipe(Effect.orDie)
      return (yield* Effect.forEach(rows, (run) => getClaim(RunID.make(run.id)))).filter(
        (claim): claim is Claim => claim !== undefined,
      )
    })

    const admit = Effect.fn("Routine.admit")(function* (input: {
      readonly runID: RunID
      readonly admittedSeq: number
    }) {
      yield* db
        .update(RoutineRunTable)
        .set({ status: "admitted", admitted_seq: input.admittedSeq, error: null, time_updated: Date.now() })
        .where(and(eq(RoutineRunTable.id, input.runID), eq(RoutineRunTable.status, "claimed")))
        .run()
        .pipe(Effect.orDie)
    })

    const fail = Effect.fn("Routine.fail")(function* (input: { readonly runID: RunID; readonly error: string }) {
      yield* db
        .update(RoutineRunTable)
        .set({ status: "failed", error: input.error, time_updated: Date.now() })
        .where(and(eq(RoutineRunTable.id, input.runID), eq(RoutineRunTable.status, "claimed")))
        .run()
        .pipe(Effect.orDie)
    })

    return Service.of({ create, list, get, pause, resume, remove, runs, claimDue, getClaim, pending, admit, fail })
  }),
)

function fromRoutineRow(row: typeof RoutineTable.$inferSelect): Info {
  return Info.make({
    id: ID.make(row.id),
    sessionID: SessionSchema.ID.make(row.session_id),
    name: row.name,
    prompt: row.prompt,
    intervalMs: row.interval_ms,
    status: SchemaRoutine.Status.make(row.status as SchemaRoutine.Status),
    nextRunAt: DateTime.makeUnsafe(row.next_run_at),
    time: { created: DateTime.makeUnsafe(row.time_created), updated: DateTime.makeUnsafe(row.time_updated) },
  })
}

function fromRunRow(row: typeof RoutineRunTable.$inferSelect): Run {
  return Run.make({
    id: RunID.make(row.id),
    routineID: ID.make(row.routine_id),
    sessionID: SessionSchema.ID.make(row.session_id),
    messageID: SessionMessage.ID.make(row.message_id),
    scheduledAt: DateTime.makeUnsafe(row.scheduled_at),
    status: SchemaRoutine.RunStatus.make(row.status as SchemaRoutine.RunStatus),
    admittedSeq: row.admitted_seq ?? undefined,
    error: row.error ?? undefined,
    time: { claimed: DateTime.makeUnsafe(row.claimed_at), updated: DateTime.makeUnsafe(row.time_updated) },
  })
}

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })
