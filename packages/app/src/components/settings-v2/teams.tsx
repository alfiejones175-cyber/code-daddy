import { createQuery } from "@tanstack/solid-query"
import { Option, Schema } from "effect"
import { AgentTeam } from "@opencode-ai/schema/agent-team"
import { Wildcard } from "@opencode-ai/core/util/wildcard"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { TextareaV2 } from "@opencode-ai/ui/v2/textarea-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createEffect, createMemo, For, onCleanup, Show, type Component } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useTabs } from "@/context/tabs"
import { ServerConnection } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { pathKey } from "@/utils/path-key"
import { Persist, persisted } from "@/utils/persist"
import {
  createTeamTemplate,
  loadTeamSkills,
  generateTeamDraft,
  teamSkillResearchPrompt,
  TeamDraftError,
  type TeamTemplate,
} from "@/utils/team-design"
import { ExternalLink } from "@/components/external-link"
import { isFreeModel } from "@/components/free-model"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"
import "./teams.css"

type RoleDraft = {
  id: number
  name: string
  agent: string
  model: string
  modelReason: string
  instructions: string
  skills: string[]
  standards: string[]
  kind?: "worker" | "reviewer"
  description: string
}
type AgentOption = {
  name: string
  mode: string
  permission: { permission: string; pattern: string; action: "allow" | "ask" | "deny" }[]
}
type DraftModel = {
  key: string
  providerID: string
  modelID: string
  name: string
  provider: string
  member: boolean
  cost: "free" | "priced" | undefined
}
type TeamInfo = Omit<AgentTeam.Info, "roles"> & { roles: Record<string, AgentTeam.Role> }
type WritableTeamInfo = {
  description?: string
  lead: string
  model?: string
  modelReason?: string
  roles: Record<
    string,
    {
      agent: string
      model?: string
      modelReason?: string
      instructions?: string
      skills?: string[]
      standards?: string[]
      kind?: "worker" | "reviewer"
      description?: string
    }
  >
  skills?: string[]
  workflow?: AgentTeam.Step[]
  instructions?: string
  review?: { role: string; checklist?: string[]; jev?: boolean }
  disabled?: boolean
}
type Step = "overview" | "purpose" | "members" | "review"
type TeamForm = {
  goal: string
  name: string
  description: string
  lead: string
  leadModel: string
  leadModelReason: string
  leadSkills: string[]
  providers: string
  instructions: string
  roles: RoleDraft[]
  workflow: AgentTeam.Step[]
  reviewRole: string
  reviewChecklist: string
  reviewJev?: boolean
  model: string
  isDefault: boolean
}

const TEAM_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const NO_SELECTION = "__none__"
const decodeRecord = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))
const decodeTeam = Schema.decodeUnknownOption(AgentTeam.Info)
const decodeRole = Schema.decodeUnknownOption(AgentTeam.Role)

export const SettingsTeamsV2: Component = () => {
  const language = useLanguage()
  const dialog = useDialog()
  const platform = usePlatform()
  const tabs = useTabs()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const [ui, setUI] = createStore({
    selected: undefined as string | undefined,
    step: "overview" as Step,
    activeRoleID: undefined as number | undefined,
    recovered: false,
    saveState: "idle" as "idle" | "saving" | "saved" | "error",
    generating: false,
    generationError: undefined as TeamDraftError["reason"] | undefined,
    modelSearch: "",
    researching: undefined as string | undefined,
    researchError: undefined as string | undefined,
    skillState: "loading" as "loading" | "ready" | "error",
    skills: [] as { name: string; description?: string }[],
  })
  let nextRoleID = 0
  let draftController: AbortController | undefined
  onCleanup(() => draftController?.abort())
  const [draft, setDraft] = createStore<TeamForm>({
    goal: "",
    name: "",
    description: "",
    lead: "",
    leadModel: "",
    leadModelReason: "",
    leadSkills: [] as string[],
    providers: "__all__",
    instructions: "",
    roles: [] as RoleDraft[],
    workflow: [] as AgentTeam.Step[],
    reviewRole: "",
    reviewChecklist: "",
    reviewJev: undefined as boolean | undefined,
    model: "",
    isDefault: false,
  })
  const [recoverable, setRecoverable, , recoverableReady] = persisted(
    Persist.serverGlobal(serverSDK().scope, "team-builder-draft-v1"),
    createStore({
      draft: undefined as TeamForm | undefined,
      selected: undefined as string | undefined,
      step: "purpose" as Step,
    }),
  )
  let restored = false
  createEffect(() => {
    if (!recoverableReady()) return
    if (restored) return
    restored = true
    const value = recoverable.draft
    if (!value || !recoverable.selected) return
    setDraft(value)
    setUI({ selected: recoverable.selected, step: recoverable.step })
  })
  createEffect(() => {
    if (!restored || ui.step === "overview" || ui.selected === undefined) return
    setRecoverable({ draft: structuredClone(draft), selected: ui.selected, step: ui.step })
  })
  const draftModels = createMemo<DraftModel[]>(() => {
    const catalog = serverSync().data.provider
    const connected = new Set(catalog.connected)
    return [...catalog.all.values()]
      .filter((provider) => connected.has(provider.id))
      .flatMap((provider) =>
        Object.values(provider.models).map((model) => {
          const costs = model.cost
            ? [
                model.cost,
                ...(model.cost.tiers ?? []),
                ...(model.cost.experimentalOver200K ? [model.cost.experimentalOver200K] : []),
              ]
            : []
          const values = costs.flatMap((cost) => [cost.input, cost.output, cost.cache.read, cost.cache.write])
          const knownCost = values.length > 0 && values.every((value) => Number.isFinite(value) && value >= 0)
          const cost: DraftModel["cost"] = isFreeModel({ ...model, provider })
            ? "free"
            : knownCost
              ? "priced"
              : undefined
          const modelName = `${provider.name} / ${model.name}`
          return {
            key: `${provider.id}/${model.id}`,
            providerID: provider.id,
            modelID: model.id,
            provider: provider.name,
            member: model.capabilities.toolcall && model.capabilities.output.text && model.status !== "deprecated",
            name: cost
              ? language.t(cost === "free" ? "settings.teams.freeModel" : "settings.teams.pricedModel", {
                  model: modelName,
                })
              : modelName,
            cost,
          }
        }),
      )
      .sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name))
  })
  const filteredDraftModels = createMemo(() => {
    const search = ui.modelSearch.trim().toLowerCase()
    return draftModels().filter((model) => `${model.name} ${model.key}`.toLowerCase().includes(search))
  })
  const memberModels = createMemo(() => draftModels().filter((model) => model.member))
  const availableDraftModel = createMemo(() => draftModels().find((model) => model.key === draft.model))
  const configuredDraftModel = () => {
    const model = serverSync().data.provider.defaultModel
    if (!model) return ""
    const key = `${model.providerID}/${model.modelID}`
    return draftModels().some((item) => item.key === key) ? key : ""
  }
  const toWritableTeam = (team: TeamInfo): WritableTeamInfo => ({
    ...team,
    roles: Object.fromEntries(
      Object.entries(team.roles).map(([role, value]) => [
        role,
        {
          agent: value.agent,
          ...(value.kind ? { kind: value.kind } : {}),
          ...(value.description ? { description: value.description } : {}),
          ...(value.model ? { model: value.model } : {}),
          ...(value.modelReason ? { modelReason: value.modelReason } : {}),
          ...(value.instructions ? { instructions: value.instructions } : {}),
          ...(value.skills ? { skills: [...value.skills] } : {}),
          ...(value.standards ? { standards: [...value.standards] } : {}),
        },
      ]),
    ),
    ...(team.skills ? { skills: [...team.skills] } : {}),
    ...(team.workflow ? { workflow: structuredClone(team.workflow) } : {}),
    review: team.review
      ? {
          role: team.review.role,
          ...(team.review.checklist ? { checklist: [...team.review.checklist] } : {}),
          ...(typeof team.review.jev === "boolean" ? { jev: team.review.jev } : {}),
        }
      : undefined,
  })
  const agentsQuery = createQuery(() => serverSync().queryOptions.agents(pathKey(serverSync().data.path.config)))
  const savedTeams = (): Record<string, TeamInfo> => {
    const stored = Option.getOrElse(decodeRecord(serverSync().data.config.teams), () => ({}))
    return Object.fromEntries(
      Object.entries(stored).flatMap(([name, raw]) => {
        const team = Option.getOrElse(decodeTeam(raw), () => undefined)
        if (!team) return []
        const roles = Option.getOrElse(decodeRecord(team.roles), () => ({}))
        return [
          [
            name,
            {
              ...team,
              roles: Object.fromEntries(
                Object.entries(roles).flatMap(([role, info]) => {
                  const decoded = Option.getOrElse(decodeRole(info), () => undefined)
                  return decoded ? [[role, decoded]] : []
                }),
              ),
            },
          ],
        ]
      }),
    )
  }
  const teams = createMemo(() => Object.entries(savedTeams()).filter(([, team]) => !team.disabled))
  const generatedAgentIDs = createMemo(
    () =>
      new Set(
        Object.entries(savedTeams()).flatMap(([name, team]) => {
          if (team.disabled) return []
          return [`team-${name}`, ...Object.keys(team.roles).map((role) => `team-${name}/${role}`)]
        }),
      ),
  )
  const agents = createMemo<AgentOption[]>(() =>
    (agentsQuery.data ?? [])
      .filter((agent) => !agent.hidden && !generatedAgentIDs().has(agent.name))
      .map((agent) => ({ name: agent.name, mode: agent.mode, permission: agent.permission })),
  )
  const leads = createMemo(() => agents().filter((agent) => agent.mode !== "subagent"))
  const roleAgents = createMemo(() => agents().filter((agent) => agent.mode !== "primary"))
  const skillDenied = (role: RoleDraft, skill: string) =>
    roleAgents()
      .find((agent) => agent.name === role.agent)
      ?.permission.findLast((rule) => Wildcard.match("skill", rule.permission) && Wildcard.match(skill, rule.pattern))
      ?.action === "deny"
  const roleSkills = (role: RoleDraft) => ui.skills.filter((skill) => !skillDenied(role, skill.name))
  const activeRoleIndex = createMemo(() => draft.roles.findIndex((role) => role.id === ui.activeRoleID))
  const workflowValid = createMemo(() => {
    const ids = new Set(draft.workflow.map((step) => step.id))
    const roles = new Set(draft.roles.map((role) => role.name))
    if (ids.size !== draft.workflow.length) return false
    if (draft.workflow.some((step) => !roles.has(step.role))) return false
    if (draft.workflow.some((step) => (step.dependsOn ?? []).some((id) => !ids.has(id)))) return false
    const visiting = new Set<string>()
    const visited = new Set<string>()
    const visit = (id: string): boolean => {
      if (visiting.has(id)) return false
      if (visited.has(id)) return true
      visiting.add(id)
      const step = draft.workflow.find((item) => item.id === id)
      if (step?.dependsOn?.some((dependency) => !visit(dependency))) return false
      visiting.delete(id)
      visited.add(id)
      return true
    }
    return [...ids].every(visit)
  })
  const selectedModelUnavailable = createMemo(
    () =>
      (!!draft.leadModel && !draftModels().some((model) => model.key === draft.leadModel)) ||
      draft.roles.some((role) => !!role.model && !memberModels().some((model) => model.key === role.model)),
  )
  const skillsUnavailable = createMemo(
    () =>
      draft.leadSkills.some(
        (skill) => !ui.skills.some((item) => item.name === skill) ||
          leads().find((agent) => agent.name === draft.lead)?.permission.findLast(
            (rule) => Wildcard.match("skill", rule.permission) && Wildcard.match(skill, rule.pattern),
          )?.action === "deny",
      ) ||
      draft.roles.some((role) => role.skills.some((skill) => !roleSkills(role).some((item) => item.name === skill))),
  )
  const selectedSavedTeam = createMemo(() => {
    const selected = ui.selected
    return selected ? teams().find(([name]) => name === selected)?.[1] : undefined
  })
  const existingName = () => (ui.selected === "__new__" ? undefined : ui.selected)
  const valid = createMemo(() => {
    const name = draft.name.trim()
    const roleNames = draft.roles.map((role) => role.name.trim())
    const current = existingName()
    const duplicateTeam = !!savedTeams()[name] && !savedTeams()[name].disabled && name !== current
    return (
      agentsQuery.isSuccess &&
      TEAM_NAME.test(name) &&
      !duplicateTeam &&
      !!draft.lead &&
      leads().some((agent) => agent.name === draft.lead) &&
      draft.roles.length > 0 &&
      new Set(roleNames).size === roleNames.length &&
      draft.roles.every(
        (role) =>
          TEAM_NAME.test(role.name.trim()) && role.agent && roleAgents().some((agent) => agent.name === role.agent),
      ) &&
      !!draft.reviewRole &&
      roleNames.includes(draft.reviewRole) &&
      workflowValid()
    )
  })
  const readyToUse = createMemo(
    () => valid() && ui.skillState === "ready" && !selectedModelUnavailable() && !skillsUnavailable(),
  )

  const load = (name: string | undefined) => {
    draftController?.abort()
    setUI({ generating: false, generationError: undefined, step: "overview", saveState: "idle" })
    if (!name) {
      setDraft({
        goal: "",
        name: "",
        description: "",
        lead: "",
        leadModel: "",
        leadModelReason: "",
        leadSkills: [],
        providers: "__all__",
        instructions: "",
        roles: [],
        workflow: [],
        reviewRole: "",
        reviewChecklist: "",
        reviewJev: undefined,
        model: "",
        isDefault: false,
      })
      return
    }
    const team = savedTeams()[name]
    if (!team) return
    setDraft({
      goal: team.description ?? "",
      name,
      description: team.description ?? "",
      lead: team.lead,
      leadModel: team.model ?? "",
      leadModelReason: team.modelReason ?? "",
      leadSkills: [...(team.skills ?? [])],
      providers: "__all__",
      instructions: team.instructions ?? "",
      roles: Object.entries(team.roles).map(([role, info]) => ({
        id: nextRoleID++,
        name: role,
        agent: info.agent,
        kind: info.kind,
        description: info.description ?? "",
        model: info.model ?? "",
        modelReason: info.modelReason ?? "",
        instructions: info.instructions ?? "",
        skills: [...(info.skills ?? [])],
        standards: [...(info.standards ?? [])],
      })),
      workflow: structuredClone(team.workflow ?? []),
      reviewRole: team.review?.role ?? "",
      reviewChecklist: team.review?.checklist?.join("\n") ?? "",
      reviewJev: team.review?.jev,
      model: configuredDraftModel(),
      isDefault: serverSync().data.config.default_team === name,
    })
  }

  const choose = (name: string | undefined) => {
    setUI("selected", name)
    load(name)
    if (name) void loadSkills()
  }

  const beginCreate = () => {
    setUI({ selected: "__new__", step: "purpose", saveState: "idle", generationError: undefined, modelSearch: "" })
    setDraft({
      goal: "",
      name: "",
      description: "",
      lead: leads()[0]?.name ?? "",
      leadModel: "",
      leadModelReason: "",
      leadSkills: [],
      providers: "__all__",
      instructions: "",
      reviewRole: "",
      reviewChecklist: "",
      reviewJev: undefined,
      model: configuredDraftModel(),
      isDefault: false,
      roles: [],
      workflow: [],
    })
    void loadSkills()
  }

  const generate = async () => {
    const model = availableDraftModel()
    if (!model || !draft.goal.trim()) return
    draftController?.abort()
    const controller = new AbortController()
    draftController = controller
    setUI({ generating: true, generationError: undefined })
    try {
      const result = await generateTeamDraft({
        goal: draft.goal.trim(),
        model: { providerID: model.providerID, modelID: model.modelID },
        providers: draft.providers === "__all__" ? undefined : [draft.providers],
        directory: serverSync().data.path.config,
        serverSDK: serverSDK(),
        signal: controller.signal,
        fetch: platform.fetch,
      })
      if (controller.signal.aborted) return
      const generatedRoles = Object.entries(result.team.roles).map(([role, info]) => ({
        id: nextRoleID++,
        name: role,
        agent: info.agent,
        kind: info.kind,
        description: info.description ?? "",
        model: info.model ?? "",
        modelReason: info.modelReason ?? "",
        instructions: info.instructions ?? "",
        skills: [...(info.skills ?? [])],
        standards: [...(info.standards ?? [])],
      }))
      setDraft({
        name: result.name,
        description: draft.description.trim() || result.team.description || draft.goal.trim(),
        lead: result.team.lead,
        leadModel: result.team.model ?? "",
        leadModelReason: result.team.modelReason ?? "",
        leadSkills: [...(result.team.skills ?? [])],
        instructions: result.team.instructions ?? "",
        roles: generatedRoles,
        workflow: structuredClone(result.team.workflow ?? []),
        reviewRole: result.team.review?.role ?? "",
        reviewChecklist: result.team.review?.checklist?.join("\n") ?? "",
        reviewJev: result.team.review?.jev,
      })
      setUI("step", "members")
    } catch (error) {
      if (!controller.signal.aborted)
        setUI("generationError", error instanceof TeamDraftError ? error.reason : "generation")
    } finally {
      if (draftController === controller) {
        draftController = undefined
        setUI("generating", false)
      }
    }
  }

  const cancelGeneration = () => {
    draftController?.abort()
    draftController = undefined
    setUI("generating", false)
  }

  const loadSkills = async () => {
    setUI("skillState", "loading")
    try {
      setUI("skills", await loadTeamSkills(serverSDK(), serverSync().data.path.config))
      setUI("skillState", "ready")
    } catch {
      setUI("skillState", "error")
    }
  }

  const applyTemplate = async (template: TeamTemplate) => {
    if (ui.skillState !== "ready") await loadSkills()
    const result = createTeamTemplate({
      template,
      agents: agents(),
      skills: ui.skills,
    })
    const roles = Object.entries(result.roles).map(([name, info]) => ({
      id: nextRoleID++,
      name,
      agent: info.agent,
      model: "",
      modelReason: "",
      instructions: info.instructions,
      skills: [...info.skills],
      standards: [...info.standards],
      kind: info.kind,
      description: info.description,
    }))
    setDraft({
      goal: draft.goal,
      name: template === "website-delivery" ? "website-delivery" : template === "build-review" ? "build-review" : "",
      description: result.description ?? draft.goal.trim(),
      lead: result.lead || leads()[0]?.name || "",
      leadModel: "",
      leadModelReason: "",
      leadSkills: [...(result.skills ?? [])],
      providers: draft.providers,
      instructions:
        template === "website-delivery"
          ? "Coordinate discovery and area planning in parallel. Regroup with the user at the proposal checkpoint, show diagrams and options, and wait for explicit decisions before building. Follow workflow dependencies and collect each deliverable and check as guidance; the runtime does not enforce a durable schedule."
          : "Coordinate bounded assignments, collect the stated deliverables and check evidence, and address independent review findings before reporting completion.",
      roles,
      workflow: result.workflow as AgentTeam.Step[],
      reviewRole: result.review?.role ?? "",
      reviewChecklist: result.review?.checklist?.join("\n") ?? "",
      reviewJev: undefined,
      model: draft.model,
      isDefault: false,
    })
    setUI({ step: "members", activeRoleID: roles[0]?.id })
  }

  const discardDraft = () => {
    setRecoverable({ draft: undefined, selected: undefined, step: "purpose" })
    setUI({ selected: undefined, step: "overview", activeRoleID: undefined, saveState: "idle" })
    load(undefined)
  }

  const saveDraftLocally = () => {
    setRecoverable({ draft: structuredClone(draft), selected: ui.selected ?? "__new__", step: ui.step })
    setUI("saveState", "saved")
  }

  const save = async () => {
    if (!valid()) return
    setUI("saveState", "saving")
    const name = draft.name.trim()
    const roles: WritableTeamInfo["roles"] = Object.fromEntries(
      draft.roles.map((role) => [
        role.name.trim(),
        {
          agent: role.agent,
          ...(role.kind ? { kind: role.kind } : {}),
          ...(role.description.trim() ? { description: role.description.trim() } : {}),
          ...(role.model ? { model: role.model } : {}),
          ...(role.modelReason ? { modelReason: role.modelReason } : {}),
          ...(role.instructions.trim() ? { instructions: role.instructions.trim() } : {}),
          ...(role.skills.length ? { skills: [...role.skills] } : {}),
          ...(role.standards.some((standard) => standard.trim())
            ? { standards: role.standards.map((standard) => standard.trim()).filter(Boolean) }
            : {}),
        },
      ]),
    )
    const info: WritableTeamInfo = {
      lead: draft.lead,
      ...(draft.leadModel ? { model: draft.leadModel } : {}),
      ...(draft.leadModelReason ? { modelReason: draft.leadModelReason } : {}),
      ...(draft.leadSkills.length ? { skills: [...draft.leadSkills] } : {}),
      roles,
      ...(draft.workflow.length ? { workflow: structuredClone(draft.workflow) } : {}),
      ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
      ...(draft.instructions.trim() ? { instructions: draft.instructions.trim() } : {}),
      ...(draft.reviewRole
        ? {
            review: {
              role: draft.reviewRole,
              ...(draft.reviewChecklist.trim()
                ? {
                    checklist: draft.reviewChecklist
                      .split("\n")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  }
                : {}),
              ...(typeof draft.reviewJev === "boolean" ? { jev: draft.reviewJev } : {}),
            },
          }
        : {}),
    }
    const oldName = existingName()
    const defaultTeam = draft.isDefault ? name : null
    const defaultChanged = draft.isDefault || serverSync().data.config.default_team === oldName
    const oldTeam = oldName ? savedTeams()[oldName] : undefined
    const replacement =
      oldName && oldName !== name && oldTeam
        ? { [oldName]: { ...toWritableTeam(oldTeam), disabled: true }, [name]: info }
        : { [name]: info }
    await serverSync()
      .updateConfig({ teams: replacement, ...(defaultChanged ? { default_team: defaultTeam } : {}) })
      .then(() => {
        setRecoverable({ draft: undefined, selected: undefined, step: "purpose" })
        setUI({ selected: name, step: "overview", saveState: "saved" })
      })
      .catch(() => setUI("saveState", "error"))
  }

  const remove = async () => {
    const name = existingName()
    if (!name) return
    const team = savedTeams()[name]
    if (!team) return
    setUI("saveState", "saving")
    await serverSync()
      .updateConfig({
        teams: { [name]: { ...toWritableTeam(team), disabled: true } },
        ...(serverSync().data.config.default_team === name ? { default_team: null } : {}),
      })
      .then(() => choose(undefined))
      .catch(() => setUI("saveState", "error"))
  }

  const researchSkills = async (name: string, team: TeamInfo) => {
    setUI({ researching: name, researchError: undefined })
    try {
      await tabs.newDraft(
        { server: ServerConnection.key(serverSDK().server), directory: serverSync().data.path.config },
        teamSkillResearchPrompt(name, team),
      )
      dialog.close()
    } catch {
      setUI({ researching: undefined, researchError: name })
    }
  }

  return (
    <>
      <header class="settings-v2-tab-header settings-v2-teams-header">
        <div class="settings-v2-teams-header-row">
          <div>
            <h2 class="settings-v2-tab-title">{language.t("settings.teams.title")}</h2>
            <p class="settings-v2-teams-description">{language.t("settings.teams.description")}</p>
          </div>
          <Show when={ui.step === "overview"}>
            <ButtonV2 data-action="settings-team-create" icon="plus" onClick={beginCreate}>
              {language.t("settings.teams.create")}
            </ButtonV2>
          </Show>
        </div>
      </header>

      <div class="settings-v2-tab-body settings-v2-teams">
        <Show
          when={ui.step === "overview"}
          fallback={
            <section class="settings-v2-teams-wizard" aria-label={language.t("settings.teams.editor")}>
              <div class="settings-v2-teams-steps" aria-label={language.t("settings.teams.steps")}>
                <span classList={{ "settings-v2-teams-step-active": ui.step === "purpose" }}>
                  {language.t("settings.teams.purposeStep")}
                </span>
                <span aria-hidden="true">›</span>
                <span classList={{ "settings-v2-teams-step-active": ui.step === "members" }}>
                  {language.t("settings.teams.teamStep")}
                </span>
                <span aria-hidden="true">›</span>
                <span classList={{ "settings-v2-teams-step-active": ui.step === "review" }}>
                  {language.t("settings.teams.reviewStep")}
                </span>
              </div>
              <Show when={agentsQuery.isError}>
                <p class="settings-v2-teams-error" role="alert">
                  {language.t("settings.teams.agentLoadError")}
                </p>
              </Show>

              <Show when={ui.step === "purpose"}>
                <section class="settings-v2-teams-purpose">
                  <div>
                    <h3>{language.t("settings.teams.purposeTitle")}</h3>
                    <p>{language.t("settings.teams.purposeHint")}</p>
                  </div>
                  <div class="settings-v2-teams-presets" aria-label={language.t("settings.teams.templateHint")}>
                    <p>{language.t("settings.teams.templateHint")}</p>
                    <ButtonV2 onClick={() => void applyTemplate("website-delivery")}>
                      {language.t("settings.teams.websitePreset")}
                    </ButtonV2>
                    <ButtonV2 variant="ghost-muted" onClick={() => void applyTemplate("build-review")}>
                      {language.t("settings.teams.buildReviewPreset")}
                    </ButtonV2>
                    <ButtonV2 variant="ghost-muted" onClick={() => void applyTemplate("blank")}>
                      {language.t("settings.teams.blankPreset")}
                    </ButtonV2>
                  </div>
                  <label class="settings-v2-teams-field">
                    <span>{language.t("settings.teams.goal")}</span>
                    <TextareaV2
                      value={draft.goal}
                      onInput={(event) => setDraft("goal", event.currentTarget.value)}
                      aria-label={language.t("settings.teams.goal")}
                      placeholder={language.t("settings.teams.goalPlaceholder")}
                    />
                  </label>
                  <SettingsListV2>
                    <SettingsRowV2
                      title={language.t("settings.teams.providerScope")}
                      description={language.t("settings.teams.providerScopeHint")}
                    >
                      <SelectV2
                        options={[
                          { id: "__all__", name: language.t("settings.teams.allProviders") },
                          ...Array.from(
                            new Map(
                              draftModels().map((model) => [
                                model.providerID,
                                { id: model.providerID, name: model.provider },
                              ]),
                            ).values(),
                          ),
                        ]}
                        current={{
                          id: draft.providers,
                          name:
                            draft.providers === "__all__"
                              ? language.t("settings.teams.allProviders")
                              : (draftModels().find((model) => model.providerID === draft.providers)?.provider ??
                                draft.providers),
                        }}
                        value={(item) => item.id}
                        label={(item) => item.name}
                        onSelect={(item) => item && setDraft("providers", item.id)}
                        aria-label={language.t("settings.teams.providerScope")}
                        placement="bottom-end"
                      />
                    </SettingsRowV2>
                    <SettingsRowV2
                      title={language.t("settings.teams.draftModel")}
                      description={language.t("settings.teams.draftModelHint")}
                    >
                      <TextInputV2
                        value={ui.modelSearch}
                        onInput={(event) => setUI("modelSearch", event.currentTarget.value)}
                        aria-label={language.t("dialog.model.search.placeholder")}
                        placeholder={language.t("dialog.model.search.placeholder")}
                      />
                      <SelectV2
                        options={filteredDraftModels()}
                        current={availableDraftModel()}
                        value={(model) => model.key}
                        label={(model) => model.name}
                        groupBy={(model) => model.provider}
                        onSelect={(model) => setDraft("model", model?.key ?? "")}
                        aria-label={language.t("settings.teams.draftModel")}
                        placeholder={language.t("settings.teams.chooseModel")}
                        disabled={draftModels().length === 0}
                        placement="bottom-end"
                      />
                      <Show when={draftModels().length > 0 && filteredDraftModels().length === 0}>
                        <p class="settings-v2-teams-model-note" role="status">
                          {language.t("dialog.model.empty")}
                        </p>
                      </Show>
                      <Show when={draftModels().length === 0}>
                        <p class="settings-v2-teams-model-note" role="status">
                          {language.t("settings.teams.noConnectedModels")}
                        </p>
                      </Show>
                      <Show when={draftModels().length > 0 && !availableDraftModel()}>
                        <p class="settings-v2-teams-model-note" role="status">
                          {language.t("settings.teams.modelRequired")}
                        </p>
                      </Show>
                    </SettingsRowV2>
                  </SettingsListV2>
                  <TeamBenchmarkLinks />
                  <SettingsListV2>
                    <SettingsRowV2
                      title={language.t("settings.teams.descriptionField")}
                      description={language.t("settings.teams.descriptionHint")}
                    >
                      <TextInputV2
                        value={draft.description}
                        onInput={(event) => setDraft("description", event.currentTarget.value)}
                        aria-label={language.t("settings.teams.descriptionField")}
                      />
                    </SettingsRowV2>
                  </SettingsListV2>
                  <Show when={ui.generationError}>
                    <p class="settings-v2-teams-error" role="alert">
                      {language.t(
                        ui.generationError === "invalid"
                          ? "settings.teams.draftInvalid"
                          : ui.generationError === "unavailable"
                            ? "settings.teams.draftUnavailable"
                            : ui.generationError === "timeout"
                              ? "settings.teams.draftTimeout"
                              : "settings.teams.draftError",
                      )}
                    </p>
                  </Show>
                </section>
              </Show>

              <Show when={ui.step === "members"}>
                <section class="settings-v2-teams-members">
                  <Show
                    when={
                      ui.skillState === "ready" &&
                      draft.roles.some((role) =>
                        role.skills.some((skill) => !roleSkills(role).some((item) => item.name === skill)),
                      )
                    }
                  >
                    <p class="settings-v2-teams-error" role="alert">
                      {language.t("settings.teams.skillsMissing")}
                    </p>
                  </Show>
                  <div class="settings-v2-teams-section-heading">
                    <div>
                      <h3>{language.t("settings.teams.membersTitle")}</h3>
                      <p>{language.t("settings.teams.membersHint")}</p>
                    </div>
                    <ButtonV2
                      data-action="settings-team-role-add"
                      size="small"
                      icon="plus"
                        onClick={() => {
                          const id = nextRoleID++
                          setDraft("roles", draft.roles.length, {
                            id,
                            name: "",
                            agent: roleAgents()[0]?.name ?? "",
                            model: "",
                            modelReason: "",
                            instructions: "",
                            skills: [],
                            standards: [],
                            kind: "worker",
                            description: "",
                          })
                          setUI("activeRoleID", id)
                        }}
                    >
                      {language.t("settings.teams.addRole")}
                    </ButtonV2>
                  </div>
                  <TeamBenchmarkLinks />
                  <SettingsListV2>
                    <SettingsRowV2
                      title={language.t("settings.teams.name")}
                      description={language.t("settings.teams.nameHint")}
                    >
                      <TextInputV2
                        data-action="settings-team-name"
                        value={draft.name}
                        onInput={(event) => setDraft("name", event.currentTarget.value)}
                        invalid={
                          draft.name.length > 0 &&
                          (!TEAM_NAME.test(draft.name.trim()) ||
                            (!!savedTeams()[draft.name.trim()] &&
                              !savedTeams()[draft.name.trim()].disabled &&
                              draft.name.trim() !== existingName()))
                        }
                        aria-label={language.t("settings.teams.name")}
                        autocomplete="off"
                      />
                    </SettingsRowV2>
                    <SettingsRowV2
                      title={language.t("settings.teams.lead")}
                      description={language.t("settings.teams.leadHint")}
                    >
                      <SelectV2
                        data-action="settings-team-lead"
                        options={leads()}
                        current={leads().find((agent) => agent.name === draft.lead)}
                        value={(agent) => agent.name}
                        label={(agent) => agent.name}
                        onSelect={(agent) => agent && setDraft("lead", agent.name)}
                        aria-label={language.t("settings.teams.lead")}
                        placement="bottom-end"
                      />
                    </SettingsRowV2>
                    <SettingsRowV2
                      title={language.t("settings.teams.leadModel")}
                      description={language.t("settings.teams.leadModelHint")}
                    >
                      <TeamModelSelect
                        models={memberModels()}
                        value={draft.leadModel}
                        onSelect={(value) => setDraft({ leadModel: value, leadModelReason: "" })}
                      />
                      <Show when={draft.leadModelReason}>
                        <p class="settings-v2-teams-model-note">
                          {language.t("settings.teams.modelRecommendation", { reason: draft.leadModelReason })}
                        </p>
                      </Show>
                    </SettingsRowV2>
                    <SettingsRowV2
                      title={language.t("settings.teams.instructions")}
                      description={language.t("settings.teams.instructionsHint")}
                    >
                      <TextareaV2
                        value={draft.instructions}
                        onInput={(event) => setDraft("instructions", event.currentTarget.value)}
                        aria-label={language.t("settings.teams.instructions")}
                      />
                    </SettingsRowV2>
                  </SettingsListV2>

                  <Show when={draft.roles.length > 0} fallback={<p>{language.t("settings.teams.noRoles")}</p>}>
                    <p class="settings-v2-teams-roster-hint">{language.t("settings.teams.memberDetailsHint")}</p>
                    <div class="settings-v2-teams-roster" role="group" aria-label={language.t("settings.teams.roster")}>
                      <For each={draft.roles}>
                        {(role) => (
                          <button
                            type="button"
                            classList={{ "settings-v2-teams-roster-selected": role.id === (ui.activeRoleID ?? draft.roles[0]?.id) }}
                            aria-pressed={role.id === (ui.activeRoleID ?? draft.roles[0]?.id)}
                            onClick={() => setUI("activeRoleID", role.id)}
                          >
                            <strong>{role.name || language.t("settings.teams.roleName")}</strong>
                            <span>{role.agent || language.t("settings.teams.roleAgent")}</span>
                          </button>
                        )}
                      </For>
                    </div>
                    <For each={draft.roles.filter((role) => role.id === (ui.activeRoleID ?? draft.roles[0]?.id))}>
                      {(role, index) => (
                        <article class="settings-v2-teams-role" data-role-id={role.id}>
                          <div class="settings-v2-teams-role-heading">
                            <strong>{role.name || language.t("settings.teams.roleName")}</strong>
                            <ButtonV2
                              data-action="settings-team-role-remove"
                              size="small"
                              variant="ghost-muted"
                              icon="xmark-small"
                              aria-label={language.t("settings.teams.removeRole", { role: role.name || index() + 1 })}
                              onClick={() => {
                                const next = draft.roles.find((item) => item.id !== role.id)
                                setDraft("roles", (roles) => roles.filter((_, at) => at !== index()))
                                setUI("activeRoleID", next?.id)
                                if (draft.reviewRole === role.name) setDraft("reviewRole", "")
                              }}
                            />
                          </div>
                          <div class="settings-v2-teams-role-fields">
                            <label class="settings-v2-teams-field">
                              <span>{language.t("settings.teams.roleName")}</span>
                              <TextInputV2
                                value={role.name}
                                onInput={(event) => {
                                  const value = event.currentTarget.value
                                  const reviewer = !!draft.reviewRole && draft.reviewRole === role.name
                                  setDraft("roles", index(), "name", value)
                                  if (reviewer) setDraft("reviewRole", value)
                                  setDraft("workflow", (steps) => steps.map((step) => step.role === role.name ? { ...step, role: value } : step))
                                }}
                                invalid={role.name.length > 0 && !TEAM_NAME.test(role.name.trim())}
                                aria-label={language.t("settings.teams.roleName")}
                              />
                            </label>
                            <label class="settings-v2-teams-field">
                              <span>{language.t("settings.teams.roleDescription")}</span>
                              <TextInputV2
                                value={role.description}
                                onInput={(event) => setDraft("roles", index(), "description", event.currentTarget.value)}
                                aria-label={language.t("settings.teams.roleDescription")}
                              />
                            </label>
                            <label class="settings-v2-teams-field">
                              <span>{language.t("settings.teams.roleKind")}</span>
                              <SelectV2
                                options={[
                                  { id: "worker", name: language.t("settings.teams.worker") },
                                  { id: "reviewer", name: language.t("settings.teams.reviewer") },
                                ]}
                                current={{
                                  id: role.kind ?? "worker",
                                  name: language.t(role.kind === "reviewer" ? "settings.teams.reviewer" : "settings.teams.worker"),
                                }}
                                value={(item) => item.id}
                                label={(item) => item.name}
                                onSelect={(item) => item && setDraft("roles", index(), "kind", item.id as "worker" | "reviewer")}
                                aria-label={language.t("settings.teams.roleKind")}
                                placement="bottom-end"
                              />
                            </label>
                            <label class="settings-v2-teams-field">
                              <span>{language.t("settings.teams.roleAgent")}</span>
                              <SelectV2
                                options={roleAgents()}
                                current={roleAgents().find((agent) => agent.name === role.agent)}
                                value={(agent) => agent.name}
                                label={(agent) => agent.name}
                                onSelect={(agent) => agent && setDraft("roles", index(), "agent", agent.name)}
                                aria-label={language.t("settings.teams.roleAgent")}
                                placement="bottom-end"
                              />
                            </label>
                            <div class="settings-v2-teams-field settings-v2-teams-field-wide">
                              <span>{language.t("settings.teams.memberModel")}</span>
                              <TeamModelSelect
                                models={memberModels()}
                                value={role.model}
                                onSelect={(value) => {
                                  setDraft("roles", index(), "model", value)
                                  setDraft("roles", index(), "modelReason", "")
                                }}
                              />
                              <Show when={role.modelReason}>
                                <p class="settings-v2-teams-model-note">
                                  {language.t("settings.teams.modelRecommendation", { reason: role.modelReason })}
                                </p>
                              </Show>
                            </div>
                            <label class="settings-v2-teams-field settings-v2-teams-field-wide">
                              <span>{language.t("settings.teams.roleInstructions")}</span>
                              <TextareaV2
                                value={role.instructions}
                                onInput={(event) =>
                                  setDraft("roles", index(), "instructions", event.currentTarget.value)
                                }
                                aria-label={language.t("settings.teams.roleInstructions")}
                              />
                            </label>
                          </div>
                          <p class="settings-v2-teams-model-note">
                            {language.t("settings.teams.assignedSkills", {
                              skills: role.skills.join(", ") || language.t("settings.teams.none"),
                            })}
                          </p>
                          <details class="settings-v2-teams-optional">
                            <summary>{language.t("settings.teams.memberDetails")}</summary>
                            <Show when={ui.skillState === "loading"}>
                              <p>{language.t("settings.teams.skillsLoading")}</p>
                            </Show>
                            <Show when={ui.skillState === "error"}>
                              <p role="alert">
                                {language.t("settings.teams.skillsError")}{" "}
                                <ButtonV2 size="small" variant="ghost-muted" onClick={() => void loadSkills()}>
                                  {language.t("settings.teams.retry")}
                                </ButtonV2>
                              </p>
                            </Show>
                            <Show when={ui.skillState === "ready" && roleSkills(role).length === 0}>
                              <p>{language.t("settings.teams.skillsEmpty")}</p>
                            </Show>
                            <Show
                              when={
                                role.skills.some((name) => !roleSkills(role).some((skill) => skill.name === name)) &&
                                ui.skillState !== "loading"
                              }
                            >
                              <p class="settings-v2-teams-error" role={ui.skillState === "error" ? "alert" : undefined}>
                                {language.t("settings.teams.skillsMissing")}
                              </p>
                              <fieldset class="settings-v2-teams-skills settings-v2-teams-skills-missing">
                                <legend>{language.t("settings.teams.skills")}</legend>
                                <For
                                  each={role.skills.filter(
                                    (name) => !roleSkills(role).some((skill) => skill.name === name),
                                  )}
                                >
                                  {(skill) => (
                                    <label>
                                      <input
                                        type="checkbox"
                                        checked
                                        onChange={() =>
                                          setDraft("roles", index(), "skills", (value) =>
                                            value.filter((name) => name !== skill),
                                          )
                                        }
                                      />
                                      <span>{language.t("settings.teams.skillUnavailable", { skill })}</span>
                                    </label>
                                  )}
                                </For>
                              </fieldset>
                            </Show>
                            <Show when={ui.skillState === "ready" && roleSkills(role).length > 0}>
                              <fieldset class="settings-v2-teams-skills">
                                <legend>{language.t("settings.teams.skills")}</legend>
                                <For each={roleSkills(role)}>
                                  {(skill) => (
                                    <label title={skill.description}>
                                      <input
                                        type="checkbox"
                                        checked={role.skills.includes(skill.name)}
                                        onChange={(event) =>
                                          setDraft("roles", index(), "skills", (value) =>
                                            event.currentTarget.checked
                                              ? [...value, skill.name]
                                              : value.filter((name) => name !== skill.name),
                                          )
                                        }
                                      />{" "}
                                      <span>{skill.name}</span>
                                      <Show when={skill.description}>
                                        <small>{skill.description}</small>
                                      </Show>
                                    </label>
                                  )}
                                </For>
                              </fieldset>
                            </Show>
                            <label class="settings-v2-teams-field">
                              <span>{language.t("settings.teams.standards")}</span>
                              <TextareaV2
                                value={role.standards.join("\n")}
                                onInput={(event) =>
                                  setDraft("roles", index(), "standards", event.currentTarget.value.split("\n"))
                                }
                                aria-label={language.t("settings.teams.standards")}
                                placeholder={language.t("settings.teams.standardsHint")}
                              />
                            </label>
                          </details>
                        </article>
                      )}
                    </For>
                  </Show>

                  <section class="settings-v2-teams-workflow">
                    <div class="settings-v2-teams-section-heading">
                      <div>
                        <h3>{language.t("settings.teams.workflow")}</h3>
                        <p>{language.t("settings.teams.workflowHint")}</p>
                      </div>
                      <ButtonV2
                        size="small"
                        icon="plus"
                        onClick={() =>
                          setDraft("workflow", (steps) => [
                            ...steps,
                            { id: `step-${steps.length + 1}`, title: "", role: draft.roles[0]?.name ?? "", instructions: "" },
                          ])
                        }
                      >
                        {language.t("settings.teams.addWorkflowStep")}
                      </ButtonV2>
                    </div>
                    <Show when={!workflowValid()}>
                      <p class="settings-v2-teams-error" role="alert">{language.t("settings.teams.workflowInvalid")}</p>
                    </Show>
                    <For each={draft.workflow}>
                      {(step, stepIndex) => (
                        <article class="settings-v2-teams-workflow-step">
                          <div class="settings-v2-teams-workflow-summary">
                            <strong>{step.title || language.t("settings.teams.stepTitle")}</strong>
                            <span>{draft.roles.find((role) => role.name === step.role)?.name ?? step.role}</span>
                            <span>{language.t("settings.teams.dependsOnCount", { count: step.dependsOn?.length ?? 0 })}</span>
                          </div>
                          <ul class="settings-v2-teams-workflow-output">
                            <li>
                              <strong>{language.t("settings.teams.stepDeliverables")}</strong>
                              <span>{step.deliverables?.join(" · ") || language.t("settings.teams.none")}</span>
                            </li>
                            <li>
                              <strong>{language.t("settings.teams.stepChecks")}</strong>
                              <span>{step.checks?.join(" · ") || language.t("settings.teams.none")}</span>
                            </li>
                          </ul>
                          <details class="settings-v2-teams-workflow-edit">
                            <summary>{language.t("settings.teams.editWorkflowStep")}</summary>
                            <label class="settings-v2-teams-field">
                              <span>{language.t("settings.teams.stepTitle")}</span>
                              <TextInputV2
                                value={step.title}
                                onInput={(event) => setDraft("workflow", stepIndex(), "title", event.currentTarget.value)}
                                aria-label={language.t("settings.teams.stepTitle")}
                              />
                            </label>
                            <label class="settings-v2-teams-field">
                              <span>{language.t("settings.teams.stepRole")}</span>
                              <SelectV2
                                options={draft.roles}
                                current={draft.roles.find((role) => role.name === step.role)}
                                value={(role) => role.name}
                                label={(role) => role.name || language.t("settings.teams.roleName")}
                                onSelect={(role) => role && setDraft("workflow", stepIndex(), "role", role.name)}
                                aria-label={language.t("settings.teams.stepRole")}
                                placement="bottom-end"
                              />
                            </label>
                            <fieldset class="settings-v2-teams-dependencies">
                              <legend>{language.t("settings.teams.stepDependencies")}</legend>
                              <For each={draft.workflow.filter((item) => item.id !== step.id)}>
                                {(dependency) => (
                                  <label>
                                    <input
                                      type="checkbox"
                                      checked={step.dependsOn?.includes(dependency.id) ?? false}
                                      onChange={(event) =>
                                        setDraft("workflow", stepIndex(), "dependsOn", (value) =>
                                          event.currentTarget.checked
                                            ? [...(value ?? []), dependency.id]
                                            : (value ?? []).filter((id) => id !== dependency.id),
                                        )
                                      }
                                    />
                                    <span>{dependency.title || dependency.id}</span>
                                  </label>
                                )}
                              </For>
                            </fieldset>
                            <label class="settings-v2-teams-field">
                              <span>{language.t("settings.teams.stepInstructions")}</span>
                              <TextareaV2
                                value={step.instructions}
                                onInput={(event) => setDraft("workflow", stepIndex(), "instructions", event.currentTarget.value)}
                                aria-label={language.t("settings.teams.stepInstructions")}
                              />
                            </label>
                            <label class="settings-v2-teams-field">
                              <span>{language.t("settings.teams.stepDeliverables")}</span>
                              <TextareaV2
                                value={(step.deliverables ?? []).join("\n")}
                                onInput={(event) => setDraft("workflow", stepIndex(), "deliverables", event.currentTarget.value.split("\n"))}
                                aria-label={language.t("settings.teams.stepDeliverables")}
                              />
                            </label>
                            <label class="settings-v2-teams-field">
                              <span>{language.t("settings.teams.stepChecks")}</span>
                              <TextareaV2
                                value={(step.checks ?? []).join("\n")}
                                onInput={(event) => setDraft("workflow", stepIndex(), "checks", event.currentTarget.value.split("\n"))}
                                aria-label={language.t("settings.teams.stepChecks")}
                              />
                            </label>
                            <label class="settings-v2-teams-approval">
                              <input
                                type="checkbox"
                                checked={step.approval ?? false}
                                onChange={(event) => setDraft("workflow", stepIndex(), "approval", event.currentTarget.checked)}
                              />
                              {language.t("settings.teams.approvalCheckpoint")}
                            </label>
                            <ButtonV2
                              variant="ghost-muted"
                              size="small"
                              onClick={() => setDraft("workflow", (steps) => steps.filter((_, at) => at !== stepIndex()))}
                            >
                              {language.t("settings.teams.removeWorkflowStep")}
                            </ButtonV2>
                          </details>
                        </article>
                      )}
                    </For>
                  </section>
                </section>
              </Show>

              <Show when={ui.step === "review"}>
                <section class="settings-v2-teams-review">
                    <div>
                      <h3>{language.t("settings.teams.reviewer")}</h3>
                      <p>{language.t("settings.teams.reviewerHint")}</p>
                    </div>
                    <SelectV2
                      options={[{ name: NO_SELECTION }, ...draft.roles.map((role) => ({ name: role.name }))]}
                      current={draft.reviewRole ? { name: draft.reviewRole } : { name: NO_SELECTION }}
                      value={(item) => item.name}
                      label={(item) => (item.name === NO_SELECTION ? language.t("settings.teams.none") : item.name)}
                      onSelect={(item) => {
                        const role = item?.name === NO_SELECTION ? "" : (item?.name ?? "")
                        setDraft("reviewRole", role)
                        const reviewer = draft.roles.find((member) => member.name === role)
                        if (reviewer) setDraft("roles", draft.roles.indexOf(reviewer), "kind", "reviewer")
                      }}
                      aria-label={language.t("settings.teams.reviewer")}
                      placement="bottom-end"
                    />
                    <Show when={draft.reviewRole}>
                      <label class="settings-v2-teams-field">
                        <span>{language.t("settings.teams.reviewChecklist")}</span>
                        <TextareaV2
                          value={draft.reviewChecklist}
                          onInput={(event) => setDraft("reviewChecklist", event.currentTarget.value)}
                          aria-label={language.t("settings.teams.reviewChecklist")}
                          placeholder={language.t("settings.teams.checklistHint")}
                        />
                      </label>
                    </Show>
                  </section>

                  <section class="settings-v2-teams-summary" aria-live="polite">
                    <h3>{language.t("settings.teams.summary")}</h3>
                    <p>{language.t("settings.teams.summaryLeadModel", { model: draft.leadModel || language.t("settings.teams.inheritModel") })}</p>
                    <p>{language.t("settings.teams.summaryMemberModels", { models: draft.roles.map((role) => `${role.name}: ${role.model || language.t("settings.teams.inheritModel")}`).join(" · ") || language.t("settings.teams.none") })}</p>
                    <p>
                      <strong>{draft.name || language.t("settings.teams.name")}</strong>
                      {draft.description ? ` · ${draft.description}` : ""}
                    </p>
                    <p>{language.t("settings.teams.summaryLead", { agent: draft.lead || "—" })}</p>
                    <p>
                      {language.t("settings.teams.summaryMembers", { count: draft.roles.length })}:{" "}
                      {draft.roles.map((role) => role.name || "—").join(", ") || "—"}
                    </p>
                    <p>
                      {language.t("settings.teams.summaryReviewer", {
                        role: draft.reviewRole || language.t("settings.teams.none"),
                      })}
                    </p>
                  </section>
                  <section class="settings-v2-teams-readiness" aria-live="polite">
                    <h3>{language.t("settings.teams.readiness")}</h3>
                    <Show when={!valid()}>
                      <p class="settings-v2-teams-error">{language.t("settings.teams.readinessIncomplete")}</p>
                    </Show>
                    <Show when={valid() && (selectedModelUnavailable() || skillsUnavailable() || ui.skillState === "error")}>
                      <p role="status">{language.t("settings.teams.readinessDisconnected")}</p>
                    </Show>
                    <Show when={readyToUse()}>
                      <p role="status">{language.t("settings.teams.readyToUse")}</p>
                    </Show>
                  </section>
                </section>
              </Show>

              <footer class="settings-v2-teams-actions">
                <ButtonV2 variant="ghost-muted" onClick={discardDraft}>
                  {language.t("settings.teams.discardDraft")}
                </ButtonV2>
                <ButtonV2 variant="ghost-muted" onClick={saveDraftLocally}>
                  {language.t("settings.teams.saveDraft")}
                </ButtonV2>
                <Show when={ui.saveState === "saved"}>
                  <span role="status">{language.t("settings.teams.draftSavedLocally")}</span>
                </Show>
                <Show when={ui.step === "purpose"}>
                  <Show
                    when={ui.generating}
                    fallback={
                      <ButtonV2
                        data-action="settings-team-generate"
                        onClick={() => void generate()}
                        disabled={!draft.goal.trim() || !agentsQuery.isSuccess || !availableDraftModel()}
                      >
                        {language.t("settings.teams.generateDraft")}
                      </ButtonV2>
                    }
                  >
                    <ButtonV2 variant="ghost-muted" onClick={cancelGeneration}>
                      {language.t("settings.teams.cancelDraft")}
                    </ButtonV2>
                    <span role="status">{language.t("settings.teams.generatingDraft")}</span>
                  </Show>
                  <ButtonV2
                    variant="contrast"
                    onClick={() => {
                      if (!draft.description.trim() && draft.goal.trim()) setDraft("description", draft.goal.trim())
                      setUI("step", "members")
                    }}
                    disabled={!agentsQuery.isSuccess}
                  >
                    {language.t("settings.teams.next")}
                  </ButtonV2>
                </Show>
                <Show when={ui.step === "members"}>
                  <ButtonV2 variant="ghost-muted" onClick={() => setUI("step", "purpose")}>
                    {language.t("settings.teams.back")}
                  </ButtonV2>
                  <ButtonV2 variant="contrast" onClick={() => setUI("step", "review")}>
                    {language.t("settings.teams.reviewStep")}
                  </ButtonV2>
                </Show>
                <Show when={ui.step === "review"}>
                  <ButtonV2 variant="ghost-muted" onClick={() => setUI("step", "members")}>
                    {language.t("settings.teams.back")}
                  </ButtonV2>
                  <label class="settings-v2-teams-default-control">
                    <input
                      data-action="settings-team-default"
                      type="checkbox"
                      checked={draft.isDefault}
                      onChange={(event) => setDraft("isDefault", event.currentTarget.checked)}
                    />
                    {language.t("settings.teams.default")}
                  </label>
                  <Show when={existingName()}>
                    <ButtonV2
                      data-action="settings-team-delete"
                      variant="danger"
                      onClick={() => void remove()}
                      disabled={ui.saveState === "saving"}
                    >
                      {language.t("settings.teams.delete")}
                    </ButtonV2>
                  </Show>
                  <span role="status" aria-live="polite">
                    <Show when={ui.saveState === "saved"}>{language.t("settings.teams.savedFeedback")}</Show>
                    <Show when={ui.saveState === "error"}>{language.t("settings.teams.saveError")}</Show>
                  </span>
                  <ButtonV2
                    data-action="settings-team-save"
                    variant="contrast"
                    onClick={() => void save()}
                    disabled={!readyToUse() || ui.saveState === "saving"}
                  >
                    {ui.saveState === "saving"
                      ? language.t("settings.teams.saving")
                      : language.t("settings.teams.save")}
                  </ButtonV2>
                </Show>
              </footer>
            </section>
          }
        >
          <section class="settings-v2-teams-overview">
            <p class="settings-v2-teams-research-hint">{language.t("settings.teams.researchHint")}</p>
            <Show
              when={teams().length > 0}
              fallback={
                <div class="settings-v2-teams-empty">
                  <h3>{language.t("settings.teams.empty")}</h3>
                  <ButtonV2 icon="plus" onClick={beginCreate}>
                    {language.t("settings.teams.create")}
                  </ButtonV2>
                </div>
              }
            >
              <For each={teams()}>
                {([name, team]) => (
                  <article class="settings-v2-teams-card">
                    <div class="settings-v2-teams-card-main">
                      <div>
                        <h3>{name}</h3>
                        <Show when={name === serverSync().data.config.default_team}>
                          <span class="settings-v2-teams-default">{language.t("settings.teams.default")}</span>
                        </Show>
                      </div>
                      <Show when={team.description}>
                        <p>{team.description}</p>
                      </Show>
                      <dl>
                        <div>
                          <dt>{language.t("settings.teams.lead")}</dt>
                          <dd>{language.t("settings.teams.cardLead", { agent: team.lead })}</dd>
                        </div>
                        <div>
                          <dt>{language.t("settings.teams.cardMembers", { count: Object.keys(team.roles).length })}</dt>
                          <dd>{Object.keys(team.roles).join(", ")}</dd>
                        </div>
                        <div>
                          <dt>{language.t("settings.teams.reviewer")}</dt>
                          <dd>
                            {language.t("settings.teams.cardReviewer", {
                              role: team.review?.role ?? language.t("settings.teams.none"),
                            })}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <div class="settings-v2-teams-card-actions">
                      <ButtonV2
                        data-action="settings-team-research-skills"
                        variant="ghost-muted"
                        disabled={!!ui.researching}
                        onClick={() => void researchSkills(name, team)}
                      >
                        {ui.researching === name
                          ? language.t("settings.teams.researchingSkills")
                          : language.t("settings.teams.researchSkills")}
                      </ButtonV2>
                      <ButtonV2
                        data-action="settings-team-edit"
                        variant="ghost-muted"
                        onClick={() => {
                          choose(name)
                          setUI("step", "members")
                        }}
                      >
                        {language.t("settings.teams.edit")}
                      </ButtonV2>
                      <Show when={ui.researchError === name}>
                        <p class="settings-v2-teams-error" role="alert">
                          {language.t("settings.teams.researchError")}
                        </p>
                      </Show>
                    </div>
                  </article>
                )}
              </For>
            </Show>
          </section>
        </Show>
      </div>
    </>
  )
}

const TeamModelSelect: Component<{ models: DraftModel[]; value: string; onSelect: (value: string) => void }> = (
  props,
) => {
  const language = useLanguage()
  const [ui, setUI] = createStore({ search: "" })
  const options = createMemo(() => [
    {
      key: NO_SELECTION,
      name: language.t("settings.teams.inheritModel"),
      provider: "",
      providerID: "",
      modelID: "",
      cost: undefined,
    },
    ...props.models.filter((model) =>
      `${model.name} ${model.key}`.toLowerCase().includes(ui.search.trim().toLowerCase()),
    ),
  ])
  return (
    <>
      <TextInputV2
        value={ui.search}
        onInput={(event) => setUI("search", event.currentTarget.value)}
        aria-label={language.t("dialog.model.search.placeholder")}
        placeholder={language.t("dialog.model.search.placeholder")}
      />
      <SelectV2
        options={options()}
        current={
          props.models.find((model) => model.key === props.value) ?? {
            key: props.value || NO_SELECTION,
            name: props.value || language.t("settings.teams.inheritModel"),
            provider: "",
            providerID: "",
            modelID: "",
            cost: undefined,
          }
        }
        value={(model) => model.key}
        label={(model) => model.name}
        groupBy={(model) => model.provider}
        onSelect={(model) => model && props.onSelect(model.key === NO_SELECTION ? "" : model.key)}
        aria-label={language.t("settings.teams.memberModel")}
        placement="bottom-end"
      />
      <Show when={props.value && !props.models.some((model) => model.key === props.value)}>
        <p class="settings-v2-teams-error" role="status">
          {language.t("settings.teams.memberModelUnavailable")}
        </p>
      </Show>
    </>
  )
}

const TeamBenchmarkLinks: Component = () => {
  const language = useLanguage()
  return (
    <details class="settings-v2-teams-benchmarks">
      <summary>{language.t("settings.teams.benchmarks")}</summary>
      <div>
        <p>{language.t("settings.teams.benchmarkHint")}</p>
        <ExternalLink href="https://artificialanalysis.ai/leaderboards/models">
          {language.t("settings.teams.benchmarkGeneral")}
        </ExternalLink>
        <ExternalLink href="https://www.swebench.com/">{language.t("settings.teams.benchmarkCoding")}</ExternalLink>
      </div>
    </details>
  )
}
