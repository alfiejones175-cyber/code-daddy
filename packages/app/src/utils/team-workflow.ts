import { AgentTeam } from "@opencode-ai/schema/agent-team"
import { Schema } from "effect"

const decodeTeams = Schema.decodeUnknownOption(AgentTeam.Teams)

export function selectedTeam(config: unknown, agent: string | undefined) {
  if (!agent) return
  const teams = decodeTeams(config).valueOrUndefined
  return Object.entries(teams ?? {}).find(([name, team]) => !team.disabled && `team-${name}` === agent)
}

export function eligibleTeamAgents<T extends { name: string; hidden?: boolean; mode: string }>(
  agents: readonly T[],
  config: unknown,
  current: string | undefined,
) {
  const team = selectedTeam(config, current)
  return agents.filter(
    (agent) =>
      !agent.hidden &&
      agent.mode !== "primary" &&
      (!team || Object.keys(team[1].roles).some((role) => agent.name === `team-${team[0]}/${role}`)),
  )
}

// A bounded topological layout also remains renderable while a draft has a cycle.
// The editor owns validation; the diagram never implies an invalid graph is runnable.
export function teamWorkflowLayers(steps: readonly AgentTeam.Step[]) {
  const pending = new Map(steps.map((step) => [step.id, step]))
  const visited = new Set<string>()
  const layers: AgentTeam.Step[][] = []
  while (pending.size) {
    const layer = [...pending.values()].filter((step) => (step.dependsOn ?? []).every((id) => visited.has(id)))
    if (!layer.length) {
      layers.push([...pending.values()])
      break
    }
    layers.push(layer)
    layer.forEach((step) => {
      pending.delete(step.id)
      visited.add(step.id)
    })
  }
  return layers
}
