import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { DateTime, Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Project } from "@opencode-ai/core/project"
import { Routine } from "@opencode-ai/core/routine"
import { RoutineScheduler } from "@opencode-ai/core/routine/scheduler"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionV2 } from "@opencode-ai/core/session"
import { RoutineRunTable, RoutineTable, SessionTable } from "@opencode-ai/core/session/sql"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { SessionInput } from "@opencode-ai/schema/session-input"
import { testEffect } from "./lib/effect"

const sessionID = SessionV2.ID.make("ses_routine_test")
const admitted: string[] = []
const sessions = Layer.mock(SessionV2.Service)({
  prompt: (input) =>
    Effect.sync(() => {
      if (!input.id) throw new Error("Routine scheduler must provide a stable message ID")
      admitted.push(input.id)
      return SessionInput.Admitted.make({
        id: input.id,
        sessionID: input.sessionID,
        admittedSeq: admitted.length,
        prompt: { text: input.prompt.text },
        delivery: input.delivery ?? "steer",
        timeCreated: DateTime.makeUnsafe(0),
      })
    }),
  goal: {
    get: () => Effect.die("unused"),
    set: () => Effect.die("unused"),
    pause: () => Effect.die("unused"),
    resume: () => Effect.die("unused"),
    block: () => Effect.die("unused"),
    complete: () => Effect.die("unused"),
    clear: () => Effect.die("unused"),
  },
  revert: {
    stage: () => Effect.die("unused"),
    clear: () => Effect.die("unused"),
    commit: () => Effect.die("unused"),
  },
})
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, Routine.node, RoutineScheduler.node]), [
    [SessionV2.node, sessions],
  ]),
)

const setup = Effect.gen(function* () {
  const { db } = yield* Database.Service
  yield* db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
  yield* db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: Project.ID.global,
      slug: "routine",
      directory: "/project",
      title: "routine",
      version: "test",
    })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
})

describe("Routine", () => {
  it.effect("persists lifecycle state and cancels unadmitted claims when paused", () =>
    Effect.gen(function* () {
      yield* setup
      const routines = yield* Routine.Service
      const { db } = yield* Database.Service
      const created = yield* routines.create({
        sessionID,
        name: "Daily check",
        prompt: "Check the repository",
        intervalMs: 60_000,
      })
      const now = Date.now()
      yield* db
        .update(RoutineTable)
        .set({ next_run_at: now })
        .where(eq(RoutineTable.id, created.id))
        .run()
        .pipe(Effect.orDie)
      const [claim] = yield* routines.claimDue({ now, limit: 10 })
      expect(claim?.run.status).toBe("claimed")
      expect((yield* routines.pause(created.id)).status).toBe("paused")
      expect(
        yield* db
          .select({ status: RoutineRunTable.status })
          .from(RoutineRunTable)
          .where(eq(RoutineRunTable.id, claim!.run.id))
          .get()
          .pipe(Effect.orDie),
      ).toEqual({ status: "cancelled" })
      const resumed = yield* routines.resume(created.id)
      expect(resumed.status).toBe("active")
      expect(yield* routines.list({ sessionID })).toHaveLength(1)
    }),
  )

  it.effect("recovers a claimed run after restart through one idempotent prompt admission", () =>
    Effect.gen(function* () {
      yield* setup
      const routines = yield* Routine.Service
      const scheduler = yield* RoutineScheduler.Service
      const { db } = yield* Database.Service
      const created = yield* routines.create({
        sessionID,
        name: "Restart recovery",
        prompt: "Summarize current work",
        intervalMs: 60_000,
      })
      yield* db
        .update(RoutineTable)
        .set({ next_run_at: 0 })
        .where(eq(RoutineTable.id, created.id))
        .run()
        .pipe(Effect.orDie)
      const [claim] = yield* routines.claimDue({ now: 0, limit: 10 })
      expect(claim).toBeDefined()
      const before = admitted.length
      yield* scheduler.tick()
      yield* scheduler.tick()
      expect(admitted.slice(before)).toEqual([claim!.run.messageID])
      expect(yield* routines.runs({ routineID: created.id, limit: 10 })).toMatchObject([
        { id: claim!.run.id, status: "admitted", messageID: claim!.run.messageID },
      ])
      expect(yield* routines.claimDue({ now: 0, limit: 10 })).toEqual([])
    }),
  )

  it.effect("returns the newest run first before applying the history limit", () =>
    Effect.gen(function* () {
      yield* setup
      const routines = yield* Routine.Service
      const { db } = yield* Database.Service
      const created = yield* routines.create({
        sessionID,
        name: "Recent history",
        prompt: "Check recent work",
        intervalMs: 60_000,
      })
      yield* db
        .update(RoutineTable)
        .set({ next_run_at: 100 })
        .where(eq(RoutineTable.id, created.id))
        .run()
        .pipe(Effect.orDie)
      yield* routines.claimDue({ now: 100, limit: 10 })
      yield* db
        .update(RoutineTable)
        .set({ next_run_at: 200 })
        .where(eq(RoutineTable.id, created.id))
        .run()
        .pipe(Effect.orDie)
      yield* routines.claimDue({ now: 200, limit: 10 })
      expect(
        (yield* routines.runs({ routineID: created.id, limit: 1 })).map((run) =>
          DateTime.toEpochMillis(run.scheduledAt),
        ),
      ).toEqual([200])
    }),
  )
})
