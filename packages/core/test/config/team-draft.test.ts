import { describe, expect, test } from "bun:test"
import { ConfigTeamDraft } from "@opencode-ai/core/config/team-draft"
import { Schema } from "effect"

const agents = [
  { id: "build", mode: "primary" as const, skills: [] },
  { id: "worker", mode: "subagent" as const, skills: ["testing"] },
  { id: "review", mode: "subagent" as const, skills: ["simplicity"] },
]
const models = [
  { id: "openai/gpt-6-astra", name: "Astra" },
  { id: "openrouter/example/fast", name: "Fast" },
]
const draft = {
  name: "delivery",
  team: {
    lead: "build",
    skills: [],
    roles: {
      implementation: {
        agent: "worker",
        kind: "worker" as const,
        description: "Implement the requested changes",
        skills: ["testing"],
        standards: ["Run the affected package checks"],
      },
      review: {
        agent: "review",
        kind: "reviewer" as const,
        description: "Review changes independently",
        skills: ["simplicity"],
        standards: ["Cite concrete issues in changed lines"],
      },
    },
    review: { role: "review", checklist: ["Inspect unnecessary abstractions"] },
    workflow: [
      {
        id: "discovery",
        title: "Agree on approach",
        role: "implementation",
        instructions: "Gather and share requirements before implementation.",
        dependsOn: [],
        deliverables: ["Shared plan"],
        checks: ["Open questions are resolved"],
        approval: true,
      },
    ],
  },
}

describe("team design drafts", () => {
  const generated = {
    ...draft,
    team: {
      ...draft.team,
      description: "Build and review changes",
      model: 0,
      modelReason: "Lead coordination",
      instructions: "Coordinate the team",
      roles: Object.entries(draft.team.roles).map(([name, role]) => ({
        name,
        ...role,
        model: 1,
        modelReason: "Bounded work",
        instructions: "",
      })),
      workflow: draft.team.workflow,
    },
  }

  test("uses a provider strict schema with fixed, required properties throughout", () => {
    const schema = Schema.toStandardJSONSchemaV1(ConfigTeamDraft.schema(agents))["~standard"].jsonSchema.output({
      target: "draft-07",
    })
    const inspect = (value: unknown) => {
      if (!value || typeof value !== "object") return
      expect(value).not.toHaveProperty("allOf")
      expect(value).not.toHaveProperty("patternProperties")
      if ("type" in value && value.type === "object" && "properties" in value) {
        expect(value).toHaveProperty("additionalProperties", false)
        expect(value).toHaveProperty("required", Object.keys(value.properties as object))
      }
      Object.values(value).forEach(inspect)
    }
    inspect(schema)
  })

  test("converts generated roles and still validates names, skills and review requirements", () => {
    expect(ConfigTeamDraft.fromGenerated(generated, agents, models).team.roles).toEqual(
      Object.fromEntries(
        generated.team.roles.map(({ name, ...role }) => [name, { ...role, model: models[role.model].id }]),
      ),
    )
    expect(() => ConfigTeamDraft.fromGenerated({ ...generated, name: "Invalid name" }, agents, models)).toThrow()
    expect(() =>
      ConfigTeamDraft.fromGenerated(
        { ...generated, team: { ...generated.team, roles: [...generated.team.roles, generated.team.roles[0]] } },
        agents,
        models,
      ),
    ).toThrow("duplicate role names")
    expect(() =>
      ConfigTeamDraft.fromGenerated(
        { ...generated, team: { ...generated.team, review: { role: "missing", checklist: ["Check evidence"] } } },
        agents,
        models,
      ),
    ).toThrow()
  })

  test("constrains generated source profiles by mode and rejects out-of-catalog models", () => {
    const decode = Schema.decodeUnknownSync(ConfigTeamDraft.schema(agents))
    expect(() => decode({ ...generated, team: { ...generated.team, lead: "invoice-agent-builder" } })).toThrow()
    expect(() => decode({ ...generated, team: { ...generated.team, lead: "worker" } })).toThrow()
    expect(() =>
      decode({ ...generated, team: { ...generated.team, roles: [{ ...generated.team.roles[0], agent: "build" }] } }),
    ).toThrow()
    expect(() =>
      ConfigTeamDraft.fromGenerated({ ...generated, team: { ...generated.team, model: 99 } }, agents, models),
    ).toThrow("outside the permitted")
    expect(() =>
      ConfigTeamDraft.fromGenerated({ ...generated, team: { ...generated.team, model: -1 } }, agents, models),
    ).toThrow("outside the permitted")
    expect(ConfigTeamDraft.fromGenerated(generated, agents, models).team.model).toBe(models[0].id)
  })

  test("accepts a draft with existing source agents and permitted skills", () => {
    expect(ConfigTeamDraft.validate(draft, agents)).toBe(draft)
  })

  test("rejects invented and denied skill assignments even when the model returns valid JSON", () => {
    expect(() =>
      ConfigTeamDraft.validate(
        {
          ...draft,
          team: {
            ...draft.team,
            roles: {
              ...draft.team.roles,
              implementation: { ...draft.team.roles.implementation, skills: ["simplicity"] },
            },
          },
        },
        agents,
      ),
    ).toThrow("unavailable or denied skill")
    expect(() =>
      ConfigTeamDraft.validate(
        {
          ...draft,
          team: {
            ...draft.team,
            roles: {
              ...draft.team.roles,
              implementation: { ...draft.team.roles.implementation, skills: ["invented"] },
            },
          },
        },
        agents,
      ),
    ).toThrow("unavailable or denied skill")
  })

  test("requires an independent reviewer and keeps external review opt-in", () => {
    expect(() => ConfigTeamDraft.validate({ ...draft, team: { ...draft.team, review: undefined } }, agents)).toThrow(
      "separate reviewer",
    )
    expect(() =>
      ConfigTeamDraft.validate({ ...draft, team: { ...draft.team, review: { role: "missing" } } }, agents),
    ).toThrow()
    expect(() =>
      ConfigTeamDraft.validate(
        { ...draft, team: { ...draft.team, review: { ...draft.team.review, jev: true } } },
        agents,
      ),
    ).toThrow("external review")
  })

  test("requires useful standards and a review checklist in generated drafts", () => {
    expect(() =>
      ConfigTeamDraft.validate(
        { ...draft, team: { ...draft.team, review: { role: "review", checklist: [] } } },
        agents,
      ),
    ).toThrow("review checklist")
    expect(() =>
      ConfigTeamDraft.validate(
        {
          ...draft,
          team: {
            ...draft.team,
            roles: { ...draft.team.roles, review: { agent: "review", kind: "reviewer", standards: [" "] } },
          },
        },
        agents,
      ),
    ).toThrow("work standards")
  })
})
