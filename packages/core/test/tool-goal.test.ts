import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { PermissionV2 } from "@opencode-ai/core/permission"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionGoal } from "@opencode-ai/core/session/goal"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { GoalTool } from "@opencode-ai/core/tool/goal"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { ToolOutputStore } from "@opencode-ai/core/tool-output-store"
import { testEffect } from "./lib/effect"
import { executeTool, settleTool, toolDefinitions, toolIdentity } from "./lib/tool"

const sessionID = SessionV2.ID.make("ses_goal_tool_test")
const assertions: PermissionV2.AssertInput[] = []
const permission = Layer.succeed(
  PermissionV2.Service,
  PermissionV2.Service.of({
    assert: (input) => Effect.sync(() => assertions.push(input)),
    ask: () => Effect.die("unused"),
    reply: () => Effect.die("unused"),
    get: () => Effect.die("unused"),
    forSession: () => Effect.die("unused"),
    list: () => Effect.die("unused"),
  }),
)
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([Database.node, SessionGoal.node, ToolRegistry.node, ToolRegistry.toolsNode, GoalTool.node]),
    [
      [PermissionV2.node, permission],
      [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
    ],
  ),
)

const setup = Effect.gen(function* () {
  assertions.length = 0
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
      slug: "goal-tool",
      directory: "/project",
      title: "goal tool",
      version: "test",
    })
    .run()
    .pipe(Effect.orDie)
})

const call = (input: typeof GoalTool.Input.Type, id = "call-goal") => ({
  sessionID,
  ...toolIdentity,
  call: { type: "tool-call" as const, id, name: GoalTool.name, input },
})

describe("GoalTool", () => {
  it.effect("registers a durable set, blocked resume, and completion path", () =>
    Effect.gen(function* () {
      yield* setup
      const registry = yield* ToolRegistry.Service
      const goals = yield* SessionGoal.Service
      expect((yield* toolDefinitions(registry)).map((tool) => tool.name)).toEqual([GoalTool.name])

      expect(
        yield* settleTool(
          registry,
          call({ action: "set", objective: "Finish Core slice", acceptance_criteria: ["Tests pass"], budget: 400 }),
        ),
      ).toMatchObject({
        result: {
          type: "text",
          value: JSON.stringify(
            {
              objective: "Finish Core slice",
              acceptanceCriteria: ["Tests pass"],
              budget: 400,
              status: "active",
              blockers: [],
            },
            null,
            2,
          ),
        },
      })
      expect(yield* goals.get(sessionID)).toMatchObject({ objective: "Finish Core slice", status: "active" })
      expect(
        yield* settleTool(
          registry,
          call({ action: "block", blockers: ["Need a test environment"], progress: "Implementation is ready" }),
        ),
      ).toMatchObject({ result: { type: "text" } })
      expect(yield* goals.get(sessionID)).toMatchObject({
        status: "blocked",
        progress: "Implementation is ready",
        blockers: ["Need a test environment"],
      })
      expect(yield* settleTool(registry, call({ action: "resume" }, "resume-goal"))).toMatchObject({
        result: { type: "text" },
      })
      expect(yield* goals.get(sessionID)).toMatchObject({ status: "active", blockers: ["Need a test environment"] })
      expect(
        yield* settleTool(registry, call({ action: "complete", evidence: "targeted test passed" }, "complete-goal")),
      ).toMatchObject({
        result: { type: "text" },
      })
      expect(yield* goals.get(sessionID)).toMatchObject({ status: "completed", evidence: "targeted test passed" })
      expect(assertions.map((assertion) => assertion.action)).toEqual([
        GoalTool.name,
        GoalTool.name,
        GoalTool.name,
        GoalTool.name,
      ])
    }),
  )

  it.effect("requires evidence before completing a goal", () =>
    Effect.gen(function* () {
      yield* setup
      const registry = yield* ToolRegistry.Service
      yield* settleTool(registry, call({ action: "set", objective: "Finish Core slice" }))

      expect(yield* executeTool(registry, call({ action: "complete" }, "complete-without-evidence"))).toEqual({
        type: "error",
        value: "Completion requires validation evidence",
      })
      expect(yield* (yield* SessionGoal.Service).get(sessionID)).toMatchObject({ status: "active" })
    }),
  )

  it.effect("requires blockers before marking a goal blocked", () =>
    Effect.gen(function* () {
      yield* setup
      const registry = yield* ToolRegistry.Service
      yield* settleTool(registry, call({ action: "set", objective: "Finish Core slice" }))

      expect(yield* executeTool(registry, call({ action: "block" }, "block-without-reason"))).toEqual({
        type: "error",
        value: "Blocking a goal requires at least one blocker",
      })
      expect(yield* (yield* SessionGoal.Service).get(sessionID)).toMatchObject({ status: "active" })
    }),
  )
})
