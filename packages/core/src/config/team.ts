export * as ConfigTeam from "./team"

import { AgentTeam } from "@opencode-ai/schema/agent-team"

export const Info = AgentTeam.Info
export type Info = AgentTeam.Info
export const Teams = AgentTeam.Teams
export type Teams = AgentTeam.Teams
export const Default = AgentTeam.Default
export const DraftRequest = AgentTeam.DraftRequest
export const Draft = AgentTeam.Draft

// A later team entry replaces its roster; deep merging would resurrect removed roles.
export function resolve(documents: readonly { teams?: Teams; default_team?: string | null }[]) {
  return documents.reduce<{ teams: Teams; default_team?: string | null }>(
    (result, document) => ({
      teams: { ...result.teams, ...document.teams },
      default_team: document.default_team === undefined ? result.default_team : document.default_team,
    }),
    { teams: {} },
  )
}

export function leadID(name: string) {
  return `team-${name}`
}

export function roleID(name: string, role: string) {
  return `${leadID(name)}/${role}`
}

export function validate(
  teams: Teams | undefined,
  defaultTeam: string | null | undefined,
  agents: readonly { id: string; mode: "primary" | "subagent" | "all"; hidden?: boolean }[],
) {
  if (defaultTeam && (!teams?.[defaultTeam] || teams[defaultTeam].disabled))
    throw new Error(`default_team: Unknown or disabled team "${defaultTeam}"`)
  const available = new Map(agents.map((agent) => [agent.id, agent]))
  Object.entries(teams ?? {}).forEach(([name, team]) => {
    if (team.disabled) return
    const lead = available.get(team.lead)
    if (!lead || lead.hidden || lead.mode === "subagent")
      throw new Error(`teams.${name}.lead: "${team.lead}" must be an available primary agent`)
    if (!Object.keys(team.roles).length) throw new Error(`teams.${name}.roles: Add at least one role`)
    if (available.has(leadID(name))) throw new Error(`teams.${name}: Agent "${leadID(name)}" already exists`)
    Object.entries(team.roles).forEach(([role, info]) => {
      const agent = available.get(info.agent)
      if (!agent || agent.hidden || agent.mode === "primary")
        throw new Error(`teams.${name}.roles.${role}.agent: "${info.agent}" must be an available subagent`)
      if (available.has(roleID(name, role)))
        throw new Error(`teams.${name}.roles.${role}: Agent "${roleID(name, role)}" already exists`)
    })
    if (team.review && !team.roles[team.review.role])
      throw new Error(`teams.${name}.review.role: Unknown role "${team.review.role}"`)
    if (team.workflow) {
      const steps = new Map<string, AgentTeam.Step>()
      team.workflow.forEach((step) => {
        if (steps.has(step.id)) throw new Error(`teams.${name}.workflow: Duplicate step "${step.id}"`)
        if (!team.roles[step.role]) throw new Error(`teams.${name}.workflow.${step.id}.role: Unknown role "${step.role}"`)
        steps.set(step.id, step)
      })
      team.workflow.forEach((step) =>
        (step.dependsOn ?? []).forEach((dependency) => {
          if (!steps.has(dependency))
            throw new Error(`teams.${name}.workflow.${step.id}.dependsOn: Unknown step "${dependency}"`)
        }),
      )
      const visiting = new Set<string>()
      const visited = new Set<string>()
      const visit = (id: string) => {
        if (visiting.has(id)) throw new Error(`teams.${name}.workflow: Cyclic dependency at "${id}"`)
        if (visited.has(id)) return
        visiting.add(id)
        ;(steps.get(id)?.dependsOn ?? []).forEach(visit)
        visiting.delete(id)
        visited.add(id)
      }
      steps.forEach((_, id) => visit(id))
    }
  })
}

export function prompt(name: string, team: Info) {
  return [
    `You are the lead of the ${name} team.`,
    team.instructions,
    "Break the user's task into bounded assignments. Delegate using the task tool to the fixed roles below. Give each assignment an objective, acceptance criteria and explicit file ownership. Run independent investigations concurrently within the runtime's limits; coordinate overlapping edits. Review each child's result, changed files and check evidence before handing work to another role. Continue an existing assignment using its returned task_id and the same role. Use a new child for a different role. Address failed or incomplete work and report the final outcome with evidence.",
    team.skills?.length
      ? `Lead skills to load before coordinating: ${team.skills.join(", ")}. These are permitted skills selected for the lead profile.`
      : undefined,
    team.workflow?.length
      ? [
          "Use the configured workflow as orchestration guidance. Dependencies describe order and handoffs; they are not a durable scheduler or proof that a step ran.",
          "For every step, pass its stated inputs and prior artifacts to the assigned role, collect its named deliverables, and record check evidence. If a check fails or a reviewer finds an issue, send the artifact back to its owning role with concrete findings, then rerun the affected checks and review. Do not report success when a required review is missing, inconclusive, or unresolved.",
          "Workflow steps:",
          ...team.workflow.map((step) => JSON.stringify(step)),
        ].join("\n" )
      : undefined,
    team.review
      ? `Reserve ${roleID(name, team.review.role)} for the final independent review; assign implementation work to the other roles.`
      : undefined,
    team.review &&
      `Before your final response, delegate an independent review to ${roleID(name, team.review.role)} after the implementation work is complete. Give it the requirements and changed-file diff, collect its findings, and address material issues. This is a prompted workflow; completion is not programmatically gated. ${team.review.jev ? "When available, use the advisory Jev code-review tool (jev_review_code in V1 or plugin_jev_review_code_* in V2) with bounded, redacted diffs; report if it is unavailable." : ""}`,
    team.review?.checklist?.length
      ? `Review checklist:\n${team.review.checklist.map((item) => `- ${item}`).join("\n")}`
      : undefined,
    "Team roles:",
    ...Object.entries(team.roles).map(([role, info]) =>
      JSON.stringify({
        role,
        subagent_type: roleID(name, role),
        source_agent: info.agent,
        instructions: info.instructions,
        skills: info.skills,
        standards: info.standards,
        review_only: info.kind === "reviewer" || team.review?.role === role,
      }),
    ),
  ]
    .filter((text) => text !== undefined)
    .join("\n\n")
}

export function rolePrompt(role: string, info: AgentTeam.Role, review?: AgentTeam.Review) {
  return [
    `Your assigned team role is ${role}.`,
    info.instructions,
    info.skills?.length
      ? `Required skills: ${info.skills.join(", ")}. Read each assigned skill before doing the task.`
      : undefined,
    info.standards?.length ? `Work standards:\n${info.standards.map((item) => `- ${item}`).join("\n")}` : undefined,
    (info.kind === "reviewer" || review?.role === role)
      ? [
          "You are the independent reviewer for this team. Inspect the requested changes and supplied evidence without modifying files or delegating work. Report concrete findings with file references and explain when you find no material issue.",
          review?.checklist?.length
            ? `Review checklist:\n${review.checklist.map((item) => `- ${item}`).join("\n")}`
            : undefined,
          review?.jev
            ? "Use the advisory Jev code-review tool when available (jev_review_code in V1 or plugin_jev_review_code_* in V2), with small redacted diff excerpts; it cannot establish test results or approve completion."
            : undefined,
        ]
          .filter((text) => text !== undefined)
          .join("\n\n")
      : undefined,
  ]
    .filter((text) => text !== undefined)
    .join("\n\n")
}

export function commands(teams: Teams | undefined, defaultTeam?: string | null) {
  return Object.entries(teams ?? {})
    .filter(([, team]) => !team.disabled)
    .flatMap(([name, team]) => {
      const command = {
        name: leadID(name),
        agent: leadID(name),
        description: team.description ?? `Assign a task to the ${name} team`,
        template: "$ARGUMENTS",
        subtask: false,
      }
      return defaultTeam === name ? [command, { ...command, name: "team" }] : [command]
    })
}
