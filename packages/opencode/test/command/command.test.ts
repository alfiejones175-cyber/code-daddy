import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Exit } from "effect"
import { Command } from "../../src/command"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(LayerNode.compile(Command.node))

it.instance(
  "registers a command for every active configured team and aliases the default",
  () =>
    Effect.gen(function* () {
      const commands = yield* Command.Service.use((service) => service.list())
      const team = commands.find((item) => item.name === "team")
      const review = commands.find((item) => item.name === "team-review")

      expect(team?.agent).toBe("team-review")
      expect(team?.template).toBe("$ARGUMENTS")
      expect(team?.subtask).toBe(false)
      expect(review?.agent).toBe("team-review")
      expect(review?.description).toBe("Review the task")
      expect(commands.some((item) => item.name === "team-disabled")).toBe(false)
    }),
  {
    config: {
      agent: {
        lead: { mode: "primary" },
        reviewer: { mode: "subagent" },
      },
      teams: {
        review: {
          description: "Review the task",
          lead: "lead",
          roles: { reviewer: { agent: "reviewer" } },
        },
        disabled: {
          lead: "lead",
          roles: { reviewer: { agent: "reviewer" } },
          disabled: true,
        },
      },
      default_team: "review",
    },
  },
)

it.instance(
  "rejects generated team commands that collide with configured commands",
  () =>
    Effect.gen(function* () {
      const exit = yield* Command.Service.use((service) => service.list()).pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain('Agent team command "/team-review"')
    }),
  {
    config: {
      agent: {
        lead: { mode: "primary" },
        reviewer: { mode: "subagent" },
      },
      command: { "team-review": { template: "manual command" } },
      teams: {
        review: {
          lead: "lead",
          roles: { reviewer: { agent: "reviewer" } },
        },
      },
    },
  },
)

it.instance(
  "rejects the default team alias when it collides with another command",
  () =>
    Effect.gen(function* () {
      const exit = yield* Command.Service.use((service) => service.list()).pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain('Agent team command "/team"')
    }),
  {
    config: {
      agent: {
        lead: { mode: "primary" },
        reviewer: { mode: "subagent" },
      },
      command: { team: { template: "manual command" } },
      teams: {
        review: {
          lead: "lead",
          roles: { reviewer: { agent: "reviewer" } },
        },
      },
      default_team: "review",
    },
  },
)
