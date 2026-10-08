import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Config } from "@opencode-ai/core/config"
import { ConfigTeam } from "@opencode-ai/core/config/team"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { ConfigMigrateV1 } from "@opencode-ai/core/v1/config/migrate"

const team = {
  lead: "build",
  model: "openai/gpt-6-astra",
  modelReason: "Coordinate review",
  roles: {
    reviewer: {
      agent: "reviewer",
      model: "openrouter/openai/gpt-6-astra",
      modelReason: "Independent review",
      instructions: "Inspect the changed files.",
      skills: ["code-review"],
      standards: ["Cite changed files."],
    },
    implementer: { agent: "implementer" },
  },
  review: { role: "reviewer", checklist: ["Check the public API."], jev: true },
  description: "Review and implement",
}

describe("agent team configuration", () => {
  test("decodes the same team in V1 and V2 and preserves it during migration", () => {
    const input = { teams: { delivery: team }, default_team: "delivery" }
    const legacy = Schema.decodeUnknownSync(ConfigV1.Info)(input)
    const native = Schema.decodeUnknownSync(Config.Info)(input)
    const migrated = Schema.decodeUnknownSync(Config.Info)(ConfigMigrateV1.migrate(legacy))

    expect(legacy.teams).toEqual(native.teams)
    expect(migrated.teams).toEqual(native.teams)
    expect(migrated.default_team).toBe("delivery")
    expect(ConfigMigrateV1.isV1(input)).toBe(false)
  })

  test("rejects invalid team and role names and incomplete tombstones", () => {
    for (const input of [
      { teams: { "Bad-Name": team } },
      { teams: { delivery: { ...team, roles: { "Bad-Role": { agent: "reviewer" } } } } },
      { teams: { delivery: { disabled: true } } },
    ]) {
      expect(Schema.decodeUnknownOption(ConfigV1.Info)(input)._tag).toBe("None")
      expect(Schema.decodeUnknownOption(Config.Info)(input)._tag).toBe("None")
    }
  })

  test("replaces a named roster and clears an inherited default", () => {
    const resolved = ConfigTeam.resolve([
      { teams: { delivery: team }, default_team: "delivery" },
      { teams: { delivery: { lead: "build", roles: { explorer: { agent: "explore" } } } } },
      { default_team: null },
    ])

    expect(Object.keys(resolved.teams.delivery.roles)).toEqual(["explorer"])
    expect(resolved.default_team).toBeNull()
    expect(Schema.decodeUnknownSync(ConfigV1.Info)(resolved).default_team).toBeNull()
    expect(Schema.decodeUnknownSync(Config.Info)(resolved).default_team).toBeNull()
  })

  test("validates source agents, active defaults, and generated-name collisions", () => {
    const agents = [
      { id: "build", mode: "primary" as const },
      { id: "reviewer", mode: "subagent" as const },
      { id: "implementer", mode: "all" as const },
    ]
    expect(() => ConfigTeam.validate({ delivery: team }, "delivery", agents)).not.toThrow()
    expect(() => ConfigTeam.validate({ delivery: team }, "missing", agents)).toThrow("default_team")
    expect(() => ConfigTeam.validate({ delivery: { ...team, disabled: true } }, "delivery", agents)).toThrow(
      "default_team",
    )
    expect(() =>
      ConfigTeam.validate(
        { delivery: { lead: "removed", roles: { old: { agent: "removed" } }, disabled: true } },
        null,
        agents,
      ),
    ).not.toThrow()
    expect(() => ConfigTeam.validate({ delivery: { ...team, lead: "reviewer" } }, undefined, agents)).toThrow(
      "teams.delivery.lead",
    )
    expect(() =>
      ConfigTeam.validate({ delivery: { ...team, roles: { reviewer: { agent: "build" } } } }, undefined, agents),
    ).toThrow("teams.delivery.roles.reviewer.agent")
    expect(() =>
      ConfigTeam.validate({ delivery: team }, undefined, [...agents, { id: "team-delivery", mode: "primary" }]),
    ).toThrow("already exists")
    expect(() =>
      ConfigTeam.validate({ delivery: team }, undefined, [
        ...agents,
        { id: "team-delivery/reviewer", mode: "subagent" },
      ]),
    ).toThrow("already exists")
  })

  test("generates commands only for active teams and aliases the default", () => {
    const commands = ConfigTeam.commands({ delivery: team, parked: { ...team, disabled: true } }, "delivery")

    expect(commands.map((command) => [command.name, command.agent])).toEqual([
      ["team-delivery", "team-delivery"],
      ["team", "team-delivery"],
    ])
    expect(ConfigTeam.commands({ delivery: team }, null).map((command) => command.name)).toEqual(["team-delivery"])
  })

  test("validates the configured independent review role and prompt guidance", () => {
    expect(() =>
      ConfigTeam.validate({ delivery: team }, null, [
        { id: "build", mode: "primary" },
        { id: "reviewer", mode: "subagent" },
        { id: "implementer", mode: "subagent" },
      ]),
    ).not.toThrow()
    expect(() =>
      ConfigTeam.validate({ delivery: { ...team, review: { ...team.review, role: "missing" } } }, null, [
        { id: "build", mode: "primary" },
        { id: "reviewer", mode: "subagent" },
        { id: "implementer", mode: "subagent" },
      ]),
    ).toThrow("teams.delivery.review.role")
    expect(ConfigTeam.prompt("delivery", team)).toContain("independent review")
    expect(ConfigTeam.prompt("delivery", team)).toContain("jev_review_code")
    expect(ConfigTeam.rolePrompt("reviewer", team.roles.reviewer, team.review)).toContain(
      "without modifying files or delegating work",
    )
    expect(ConfigTeam.rolePrompt("reviewer", team.roles.reviewer, team.review)).toContain("Cite changed files.")
    expect(ConfigTeam.rolePrompt("implementer", team.roles.implementer, team.review)).not.toContain(
      "read-only reviewer",
    )
  })

  test("validates workflow role references and dependency graphs", () => {
    const workflow = [
      { id: "research", title: "Research", role: "reviewer", instructions: "Find evidence." },
      { id: "plan", title: "Plan", role: "implementer", instructions: "Synthesize findings.", dependsOn: ["research"] },
    ]
    expect(() => ConfigTeam.validate({ delivery: { ...team, workflow } }, null, [
      { id: "build", mode: "primary" },
      { id: "reviewer", mode: "subagent" },
      { id: "implementer", mode: "subagent" },
    ])).not.toThrow()
    expect(() =>
      ConfigTeam.validate({ delivery: { ...team, workflow: [...workflow, workflow[0]] } }, null, [
        { id: "build", mode: "primary" },
        { id: "reviewer", mode: "subagent" },
        { id: "implementer", mode: "subagent" },
      ]),
    ).toThrow("Duplicate step")
    expect(() =>
      ConfigTeam.validate(
        { delivery: { ...team, workflow: [{ ...workflow[0], role: "missing" }] } },
        null,
        [
          { id: "build", mode: "primary" },
          { id: "reviewer", mode: "subagent" },
          { id: "implementer", mode: "subagent" },
        ],
      ),
    ).toThrow("Unknown role")
    expect(() =>
      ConfigTeam.validate(
        { delivery: { ...team, workflow: workflow.map((step) => ({ ...step, dependsOn: ["plan"] })) } },
        null,
        [
          { id: "build", mode: "primary" },
          { id: "reviewer", mode: "subagent" },
          { id: "implementer", mode: "subagent" },
        ],
      ),
    ).toThrow("Cyclic dependency")
  })
})
