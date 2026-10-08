import { AgentTeam } from "@opencode-ai/schema/agent-team"
import { Schema } from "effect"
import type { ServerSDK } from "@/context/server-sdk"
import { authTokenFromCredentials } from "./server"

export type TeamTemplateProfile = {
  name: string
  mode: string
  permission: { permission: string; pattern: string; action: "allow" | "ask" | "deny" }[]
}

export type TeamTemplate = "website-delivery" | "build-review" | "blank"

const websiteWorkflow = [
  {
    id: "discovery",
    title: "Research and frame the request",
    role: "researcher",
    instructions:
      "Research the supplied requirements and current codebase independently. Return a concise problem statement, unknowns, constraints, and evidence with source references. Do not edit files.",
    deliverables: ["Requirements and constraints", "Open questions with evidence"],
    checks: ["Separate verified facts from assumptions", "Cover the user's stated goals"],
  },
  {
    id: "ui-plan",
    title: "Plan the interface",
    role: "ui-planner",
    instructions:
      "Inspect the current interface and plan the user journey, page structure, visual direction, responsive behavior, and acceptance criteria. Return a diagram or annotated layout proposal. Do not edit files.",
    dependsOn: ["discovery"],
    deliverables: ["User journey and interface plan", "Visible layout diagram", "Accessibility and responsive checks"],
    checks: ["Tie each major choice to a requirement", "Identify existing components to reuse"],
  },
  {
    id: "frontend-plan",
    title: "Plan the frontend work",
    role: "frontend-planner",
    instructions:
      "Inspect the frontend architecture and turn the interface proposal into bounded implementation tasks. Identify files, component boundaries, dependencies, and verification commands. Do not edit files.",
    dependsOn: ["discovery", "ui-plan"],
    deliverables: ["Frontend task plan with file ownership", "Build and interaction checks"],
    checks: ["Call out conflicts and assumptions", "Keep implementation aligned with the UI proposal"],
  },
  {
    id: "backend-plan",
    title: "Plan backend and data work",
    role: "backend-planner",
    instructions:
      "Inspect backend and data requirements. Propose the smallest API, persistence, and validation changes needed, with file ownership and verification. Do not edit files.",
    dependsOn: ["discovery"],
    deliverables: ["Backend and data plan", "API and persistence checks"],
    checks: ["Preserve existing contracts and local data", "Separate required changes from optional ideas"],
  },
  {
    id: "proposal",
    title: "Regroup and choose a proposal",
    role: "lead",
    instructions:
      "Regroup the research and three area plans. Present a concise shared proposal with alternatives, tradeoffs, open questions, and visible diagrams or annotated layouts. Ask the user to decide unresolved product questions before implementation. Wait for explicit user approval at this checkpoint.",
    dependsOn: ["ui-plan", "frontend-plan", "backend-plan"],
    deliverables: ["Consolidated proposal", "Options and tradeoffs", "User decisions recorded"],
    checks: ["Resolve blocking questions with the user", "Keep UI, frontend, and backend plans consistent"],
    approval: true,
  },
  {
    id: "ui-design",
    title: "Design the approved interface",
    role: "ui-designer",
    instructions:
      "Translate the approved proposal into concrete interface states, content hierarchy, responsive behavior, and interaction details. Hand the agreed design to the frontend builder.",
    dependsOn: ["proposal"],
    deliverables: ["Approved interface specification", "Interaction and responsive states"],
    checks: ["Match the approved decisions", "Cover loading, empty, error, and narrow layouts"],
  },
  {
    id: "backend-build",
    title: "Build backend changes",
    role: "backend-builder",
    instructions:
      "Implement the approved backend and data plan. Keep changes within assigned files, preserve existing data, and report concrete checks and any unresolved issue.",
    dependsOn: ["proposal"],
    deliverables: ["Backend implementation", "Test or typecheck evidence"],
    checks: ["Validate inputs and persisted data", "Run relevant package checks"],
  },
  {
    id: "frontend-build",
    title: "Build the interface",
    role: "frontend-builder",
    instructions:
      "Implement the approved interface using the design handoff and agreed frontend plan. Keep changes within assigned files and report interaction, accessibility, and responsive checks.",
    dependsOn: ["ui-design", "frontend-plan"],
    deliverables: ["Frontend implementation", "Responsive and interaction evidence"],
    checks: ["Match the approved interface specification", "Run relevant package checks"],
  },
  {
    id: "ui-review",
    title: "Review the interface",
    role: "ui-reviewer",
    instructions:
      "Independently review the interface against the approved decisions, accessibility, responsive behavior, and visual consistency. Do not edit files. Return actionable findings with file references.",
    dependsOn: ["frontend-build"],
    deliverables: ["UI findings or a clear no-findings report"],
    checks: ["Check keyboard focus and narrow layouts", "Compare the result with the approved design"],
  },
  {
    id: "frontend-review",
    title: "Review frontend implementation",
    role: "frontend-reviewer",
    instructions:
      "Independently inspect the frontend diff and check evidence for correctness, maintainability, and requirement coverage. Do not modify files. Return actionable findings with file references.",
    dependsOn: ["frontend-build"],
    deliverables: ["Frontend findings or a clear no-findings report"],
    checks: ["Check behavior and error recovery", "Identify unnecessary complexity"],
  },
  {
    id: "backend-review",
    title: "Review backend implementation",
    role: "backend-reviewer",
    instructions:
      "Independently inspect the backend and data diff for correctness, validation, compatibility, and preservation of existing data. Do not modify files. Return actionable findings with file references.",
    dependsOn: ["backend-build"],
    deliverables: ["Backend findings or a clear no-findings report"],
    checks: ["Check contract and persistence behavior", "Identify unverified assumptions"],
  },
  {
    id: "qa",
    title: "Verify the full change",
    role: "qa",
    instructions:
      "Run the relevant checks across the implemented UI and backend. Verify the approved requirements and report exact commands, results, and gaps. Do not treat review findings as test evidence.",
    dependsOn: ["ui-review", "frontend-review", "backend-review"],
    deliverables: ["Verification report with commands and results"],
    checks: ["Cover each approved acceptance criterion", "Report failed or skipped checks plainly"],
  },
  {
    id: "final-review",
    title: "Review the complete delivery",
    role: "final-review",
    instructions:
      "Independently review the final diff, QA evidence, and unresolved findings against the approved proposal. Do not edit files. Report material issues and whether the delivery is ready to hand back.",
    dependsOn: ["qa"],
    deliverables: ["Final findings and readiness assessment"],
    checks: ["Verify requirement coverage and check evidence", "Call out unresolved material findings"],
  },
] as const

const buildReviewWorkflow = [
  {
    id: "plan",
    title: "Plan the change",
    role: "planner",
    instructions: "Inspect the request and codebase. Return a bounded plan with assumptions, files, and acceptance checks. Do not edit files.",
    deliverables: ["Plan with file ownership", "Acceptance checks"],
    checks: ["Separate facts from assumptions"],
  },
  {
    id: "build",
    title: "Build the change",
    role: "builder",
    instructions: "Implement the agreed plan and report changed files with relevant check evidence.",
    dependsOn: ["plan"],
    deliverables: ["Implementation", "Check evidence"],
    checks: ["Stay within assigned scope"],
  },
  {
    id: "review",
    title: "Review the change",
    role: "reviewer",
    instructions: "Independently inspect the diff and check evidence. Do not edit files. Report actionable findings with references.",
    dependsOn: ["build"],
    deliverables: ["Review findings or a clear no-findings report"],
    checks: ["Check requirements, evidence, and unnecessary complexity"],
  },
] as const

export function createTeamTemplate(input: {
  template: TeamTemplate
  agents: readonly TeamTemplateProfile[]
  skills: readonly { name: string }[]
}) {
  const leads = input.agents.filter((agent) => agent.mode !== "subagent")
  const members = input.agents.filter((agent) => agent.mode !== "primary")
  const lead = leads[0]
  const findMember = (hint: string) =>
    members.find((agent) => agent.name.toLowerCase().includes(hint)) ?? members[0]
  const assignedSkills = (profile: TeamTemplateProfile | undefined, names: readonly string[]) => {
    if (!profile) return []
    const installed = new Set(input.skills.map((skill) => skill.name))
    return names.filter(
      (name) =>
        installed.has(name) &&
        !profile.permission.findLast(
          (rule) =>
            (rule.permission === "skill" || rule.permission === "*") &&
            (rule.pattern === "*" || rule.pattern === name),
        )?.action.includes("deny"),
    )
  }
  if (input.template === "blank")
    return { lead: lead?.name ?? "", description: "", skills: [], roles: {}, workflow: [], review: undefined }
  const compact = input.template === "build-review"
  const definitions = compact
    ? [
        { name: "planner", hint: "plan", kind: "worker", skills: ["team-planning"] },
        { name: "builder", hint: "build", kind: "worker", skills: ["team-frontend-build"] },
        { name: "reviewer", hint: "review", kind: "reviewer", skills: ["team-review"] },
      ]
    : [
        { name: "researcher", hint: "research", kind: "worker", skills: ["team-research"] },
        { name: "ui-planner", hint: "plan", kind: "worker", skills: ["team-planning"] },
        { name: "ui-designer", hint: "design", kind: "worker", skills: ["team-ui-design"] },
        { name: "ui-reviewer", hint: "review", kind: "reviewer", skills: ["team-review"] },
        { name: "frontend-planner", hint: "plan", kind: "worker", skills: ["team-planning"] },
        { name: "frontend-builder", hint: "build", kind: "worker", skills: ["team-frontend-build"] },
        { name: "frontend-reviewer", hint: "review", kind: "reviewer", skills: ["team-review"] },
        { name: "backend-planner", hint: "plan", kind: "worker", skills: ["team-planning"] },
        { name: "backend-builder", hint: "backend", kind: "worker", skills: ["team-backend-build"] },
        { name: "backend-reviewer", hint: "review", kind: "reviewer", skills: ["team-review"] },
        { name: "qa", hint: "qa", kind: "worker", skills: ["team-qa"] },
        { name: "final-review", hint: "review", kind: "reviewer", skills: ["team-review"] },
      ]
  const workflow = compact
    ? buildReviewWorkflow.map((step) => ({ ...step }))
    : websiteWorkflow.map((step) => ({ ...step }))
  const roles = Object.fromEntries(
    definitions.flatMap((definition) => {
      const profile = findMember(definition.hint)
      if (!profile) return []
      return [[definition.name, {
        agent: profile.name,
        kind: definition.kind as "worker" | "reviewer",
        description: definition.name.replaceAll("-", " "),
        skills: assignedSkills(profile, definition.skills),
        instructions: `Complete the ${definition.name.replaceAll("-", " ")} assignment. Return the named deliverables and check evidence. Escalate blockers instead of making product decisions outside your role.`,
        standards: ["Cite evidence and changed files", "State assumptions and unresolved work"],
      }]]
    }),
  )
  if (!lead) return { lead: "", roles, workflow }
  const finalRole = compact ? "reviewer" : "final-review"
  const finalReviewer = roles[finalRole]
  return {
    description: compact ? "Plan, build, and independently review a focused change." : "Research, design, build, and independently review a website delivery.",
    lead: lead.name,
    skills: assignedSkills(lead, ["team-planning"]),
    roles,
    workflow: workflow.map((step) => ({ ...step, role: step.role === "lead" ? "researcher" : step.role })),
    review: finalReviewer ? { role: finalRole, checklist: ["Check approved requirements and changed files", "Verify check evidence", "Report unresolved material findings"] } : undefined,
  }
}

export function teamSkillResearchPrompt(name: string, team: AgentTeam.Info) {
  return [
    "Help me refine this saved agent team. Research high-quality skills relevant to its purpose and individual roles, using available search tools and primary sources such as the skill author's official repository or documentation. Inspect each shortlisted SKILL.md and its supporting scripts; distinguish verified available skills, online candidates, and skills that need to be authored. Cite exact source URLs and explain why each candidate fits a role. Preserve explicitly assigned skills and allow no new skill when none fits.",
    "Propose concise member work standards, role-specific harness instructions and measurable checks. Keep the team small and the implementation simple. Include an independent reviewer with evidence-based checks of requirement coverage, testing and unnecessary complexity. Use Jev's advisory code-review tool if available for small supplied diffs; do not treat it as test evidence or a completion gate. Explain skill permissions and supporting dependencies that matter for this team. Return a reviewable team configuration and a plan for any new skill or harness. Do not install downloaded skills, change configuration or run their scripts in this research task.",
    JSON.stringify({ name, team }),
  ].join("\n\n")
}

export async function loadTeamSkills(serverSDK: ServerSDK, directory: string) {
  const skills =
    (await serverSDK.protocol) === "v1"
      ? ((await serverSDK.createClient({ directory, throwOnError: true }).app.skills()).data ?? [])
      : (await serverSDK.currentApi.skill.list({ location: { directory } })).data
  return skills
    .map((skill) => ({ name: skill.name, description: skill.description }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function generateTeamDraft(input: {
  goal: string
  providers?: string[]
  model: AgentTeam.DraftRequest["model"]
  directory: string
  serverSDK: Pick<ServerSDK, "protocol" | "server">
  signal?: AbortSignal
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}) {
  const native = (await input.serverSDK.protocol) === "v2"
  const server = input.serverSDK.server.http
  const url = new URL(`${server.url.replace(/\/$/, "")}${native ? "/api/team/draft" : "/team/draft"}`)
  url.searchParams.set(native ? "location[directory]" : "directory", input.directory)
  const response = await (input.fetch ?? globalThis.fetch)(url, {
    method: "POST",
    signal: input.signal,
    headers: {
      "Content-Type": "application/json",
      ...(server.password
        ? {
            Authorization: `Basic ${authTokenFromCredentials({ username: server.username, password: server.password })}`,
          }
        : {}),
    },
    body: JSON.stringify(
      Schema.encodeSync(AgentTeam.DraftRequest)({ goal: input.goal, model: input.model, providers: input.providers }),
    ),
  })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined)
    const service = body && typeof body === "object" && "service" in body ? body.service : undefined
    throw new TeamDraftError(
      service === "team_draft_invalid"
        ? "invalid"
        : service === "team_draft_unavailable"
          ? "unavailable"
          : service === "team_draft_timeout"
            ? "timeout"
            : "generation",
    )
  }
  return Schema.decodeUnknownSync(AgentTeam.Draft)(await response.json())
}

export class TeamDraftError extends Error {
  constructor(readonly reason: "invalid" | "unavailable" | "timeout" | "generation") {
    super(reason)
  }
}
