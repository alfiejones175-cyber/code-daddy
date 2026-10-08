import { describe, expect, test } from "bun:test"
import { eligibleTeamAgents, selectedTeam, teamWorkflowLayers } from "./team-workflow"

const teams = { website: { lead: "build", roles: { research: { agent: "explore" } } } }

describe("team selection", () => {
  test("offers only the selected team's roster while retaining ordinary delegation", () => {
    const agents = [
      { name: "general", mode: "subagent" },
      { name: "team-website/research", mode: "subagent" },
      { name: "team-other/research", mode: "subagent" },
      { name: "build", mode: "primary" },
    ]
    expect(eligibleTeamAgents(agents, teams, "team-website").map((item) => item.name)).toEqual([
      "team-website/research",
    ])
    expect(eligibleTeamAgents(agents, teams, "build")).toHaveLength(3)
    expect(selectedTeam(teams, "team-website/research")).toBeUndefined()
    expect(selectedTeam({ website: { ...teams.website, disabled: true } }, "team-website")).toBeUndefined()
  })
})

describe("workflow layout", () => {
  const step = (id: string, dependsOn: string[] = []) => ({ id, title: id, role: "research", instructions: "", dependsOn })
  test("groups independent research and waits for all dependencies at the checkpoint", () => {
    expect(
      teamWorkflowLayers([
        step("build", ["decision"]),
        step("ui"),
        step("backend"),
        { ...step("decision", ["ui", "backend"]), approval: true },
      ]).map((layer) => layer.map((item) => item.id)),
    ).toEqual([["ui", "backend"], ["decision"], ["build"]])
  })
  test("renders incomplete drafts without looping or dropping steps", () => {
    expect(teamWorkflowLayers([step("one", ["two"]), step("two", ["one"])]).flat()).toHaveLength(2)
    expect(teamWorkflowLayers([step("one", ["missing"])]).flat()).toHaveLength(1)
    expect(teamWorkflowLayers([])).toEqual([])
  })
})
