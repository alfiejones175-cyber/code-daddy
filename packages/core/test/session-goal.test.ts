import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionGoal } from "@opencode-ai/core/session/goal"
import { SessionGoalTable, SessionTable } from "@opencode-ai/core/session/sql"
import { SystemContext } from "@opencode-ai/core/system-context"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, SessionGoal.node])))
const sessionID = SessionV2.ID.make("ses_goal_test")

const setup = Effect.gen(function* () {
  const { db } = yield* Database.Service
  yield* db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
    .run()
    .pipe(Effect.orDie)
  yield* db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: Project.ID.global,
      slug: "goal",
      directory: "/project",
      title: "goal",
      version: "test",
    })
    .run()
    .pipe(Effect.orDie)
})

describe("SessionGoal", () => {
  it.effect("persists objective, lifecycle, progress, blockers, and evidence", () =>
    Effect.gen(function* () {
      yield* setup
      const goals = yield* SessionGoal.Service
      const { db } = yield* Database.Service

      expect(yield* goals.get(sessionID)).toBeUndefined()
      expect(
        yield* goals.set({
          sessionID,
          objective: "Ship the durable goal feature",
          acceptanceCriteria: ["State survives restart", "The next turn sees its status"],
          budget: 1200,
          progress: "Migration is ready",
          blockers: ["Need server contract review"],
        }),
      ).toEqual({
        objective: "Ship the durable goal feature",
        acceptanceCriteria: ["State survives restart", "The next turn sees its status"],
        budget: 1200,
        status: "active",
        progress: "Migration is ready",
        blockers: ["Need server contract review"],
      })
      expect(
        yield* db
          .select()
          .from(SessionGoalTable)
          .where(eq(SessionGoalTable.session_id, sessionID))
          .get()
          .pipe(Effect.orDie),
      ).toMatchObject({
        session_id: sessionID,
        objective: "Ship the durable goal feature",
        acceptance_criteria: ["State survives restart", "The next turn sees its status"],
        budget: 1200,
        status: "active",
        progress: "Migration is ready",
        blockers: ["Need server contract review"],
      })

      expect(yield* goals.pause(sessionID)).toMatchObject({ status: "paused" })
      expect(yield* goals.block({ sessionID, blockers: ["Waiting for review"], progress: "Core is ready" })).toMatchObject({
        status: "blocked",
        progress: "Core is ready",
        blockers: ["Waiting for review"],
      })
      expect(yield* goals.block({ sessionID, blockers: ["Waiting for final review"] })).toMatchObject({
        status: "blocked",
        progress: "Core is ready",
        blockers: ["Waiting for final review"],
      })
      expect(yield* goals.resume(sessionID)).toMatchObject({
        status: "active",
        progress: "Core is ready",
        blockers: ["Waiting for final review"],
      })
      expect(yield* goals.complete({ sessionID, evidence: "bun typecheck passed" })).toEqual({
        objective: "Ship the durable goal feature",
        acceptanceCriteria: ["State survives restart", "The next turn sees its status"],
        budget: 1200,
        status: "completed",
        progress: "Core is ready",
        blockers: [],
        evidence: "bun typecheck passed",
      })

      expect(
        yield* goals.set({
          sessionID,
          objective: "Ship the durable goal feature",
          progress: "Validation complete",
        }),
      ).toMatchObject({ status: "completed", progress: "Validation complete", evidence: "bun typecheck passed" })

      expect(
        yield* goals.set({
          sessionID,
          objective: "Ship the finished feature",
          acceptanceCriteria: ["Starts a new lifecycle"],
        }),
      ).toEqual({
        objective: "Ship the finished feature",
        acceptanceCriteria: ["Starts a new lifecycle"],
        status: "active",
        blockers: [],
      })
      expect(
        yield* goals.set({
          sessionID,
          objective: "Ship the finished feature",
          progress: "Ready for final validation",
          blockers: ["Need a release candidate"],
        }),
      ).toMatchObject({
        status: "active",
        progress: "Ready for final validation",
        blockers: ["Need a release candidate"],
      })
    }),
  )

  it.effect("updates active goal context at a provider-turn boundary", () =>
    Effect.gen(function* () {
      yield* setup
      const goals = yield* SessionGoal.Service
      yield* goals.set({
        sessionID,
        objective: "Verify context",
        acceptanceCriteria: ["Show the status"],
        budget: 64,
        progress: "Runner reloads context",
        blockers: ["Awaiting input"],
      })

      const context = yield* goals.context(sessionID)
      const initialized = yield* SystemContext.initialize(context)
      expect(initialized.baseline).toBe(
        [
          "<session-goal>",
          "Objective: Verify context",
          "Acceptance criteria:",
          "- Show the status",
          "Advisory budget: 64 tokens",
          "Status: active",
          "Progress: Runner reloads context",
          "Blockers:",
          "- Awaiting input",
          "</session-goal>",
        ].join("\n"),
      )

      yield* goals.pause(sessionID)
      expect(yield* SystemContext.reconcile(context, initialized.snapshot)).toMatchObject({
        _tag: "Updated",
        text: [
          "The session goal has changed.",
          "",
          "<session-goal>",
          "Objective: Verify context",
          "Acceptance criteria:",
          "- Show the status",
          "Advisory budget: 64 tokens",
          "Status: paused",
          "Progress: Runner reloads context",
          "Blockers:",
          "- Awaiting input",
          "</session-goal>",
        ].join("\n"),
      })

      yield* goals.clear(sessionID)
      expect(yield* SystemContext.reconcile(yield* goals.context(sessionID), initialized.snapshot)).toMatchObject({
        _tag: "Updated",
        text: "The session goal was cleared.",
      })
    }),
  )
})
