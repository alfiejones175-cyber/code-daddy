import { createQuery } from "@tanstack/solid-query"
import { Option, Schema } from "effect"
import { AgentTeam } from "@opencode-ai/schema/agent-team"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { TextareaV2 } from "@opencode-ai/ui/v2/textarea-v2"
import { createMemo, For, Show, type Component } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import { pathKey } from "@/utils/path-key"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"
import "./teams.css"

type RoleDraft = { id: number; name: string; agent: string; instructions: string }
type TeamOption = { name: string }
type AgentOption = { name: string; mode: string }
type TeamInfo = Omit<AgentTeam.Info, "roles"> & { roles: Record<string, AgentTeam.Role> }

const TEAM_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const decodeRecord = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))
const decodeTeam = Schema.decodeUnknownOption(AgentTeam.Info)
const decodeRole = Schema.decodeUnknownOption(AgentTeam.Role)

export const SettingsTeamsV2: Component = () => {
  const language = useLanguage()
  const serverSync = useServerSync()
  const [ui, setUI] = createStore({
    selected: undefined as string | undefined,
    saveState: "idle" as "idle" | "saving" | "saved" | "error",
  })
  let nextRoleID = 0
  const [draft, setDraft] = createStore({
    name: "",
    description: "",
    lead: "",
    instructions: "",
    roles: [] as RoleDraft[],
    isDefault: false,
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
                  if (!decoded) return []
                  return [[role, decoded]]
                }),
              ),
            },
          ],
        ]
      }),
    )
  }
  const teamOptions = createMemo<TeamOption[]>(() =>
    Object.entries(savedTeams())
      .filter(([, team]) => !team.disabled)
      .map(([name]) => ({ name })),
  )
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
      .map((agent) => ({ name: agent.name, mode: agent.mode })),
  )
  const leads = createMemo(() => agents().filter((agent) => agent.mode !== "subagent"))
  const roleAgents = createMemo(() => agents().filter((agent) => agent.mode !== "primary"))
  const existingName = () => (ui.selected === "__new__" ? undefined : ui.selected)
  const valid = createMemo(() => {
    const name = draft.name.trim()
    const roles = draft.roles
    const roleNames = roles.map((role) => role.name.trim())
    const duplicateRole = new Set(roleNames).size !== roleNames.length
    const duplicateTeam = !!savedTeams()[name] && !savedTeams()[name].disabled && name !== existingName()
    return (
      agentsQuery.isSuccess &&
      TEAM_NAME.test(name) &&
      !duplicateTeam &&
      !!draft.lead &&
      leads().some((agent) => agent.name === draft.lead) &&
      roles.length > 0 &&
      !duplicateRole &&
      roles.every(
        (role) =>
          TEAM_NAME.test(role.name.trim()) && !!role.agent && roleAgents().some((agent) => agent.name === role.agent),
      )
    )
  })

  const load = (name: string | undefined) => {
    if (!name) {
      setDraft({ name: "", description: "", lead: "", instructions: "", roles: [], isDefault: false })
      setUI("saveState", "idle")
      return
    }
    const team = savedTeams()[name]
    if (!team) return
    setDraft({
      name,
      description: team.description ?? "",
      lead: team.lead,
      instructions: team.instructions ?? "",
      roles: Object.entries(team.roles).map(([role, info]) => ({
        id: nextRoleID++,
        name: role,
        agent: info.agent,
        instructions: info.instructions ?? "",
      })),
      isDefault: serverSync().data.config.default_team === name,
    })
    setUI("saveState", "idle")
  }

  const choose = (name: string | undefined) => {
    setUI("selected", name)
    load(name)
  }

  const create = () => {
    setUI("selected", "__new__")
    setDraft({
      name: "",
      description: "",
      lead: leads()[0]?.name ?? "",
      instructions: "",
      roles: roleAgents()[0]
        ? [{ id: nextRoleID++, name: "research", agent: roleAgents()[0].name, instructions: "" }]
        : [],
      isDefault: false,
    })
    setUI("saveState", "idle")
  }

  const save = async () => {
    if (!valid()) return
    setUI("saveState", "saving")
    const name = draft.name.trim()
    const roles: Record<string, AgentTeam.Role> = Object.fromEntries(
      draft.roles.map((role) => [
        role.name.trim(),
        { agent: role.agent, ...(role.instructions.trim() ? { instructions: role.instructions.trim() } : {}) },
      ]),
    )
    const info: AgentTeam.Info = {
      lead: draft.lead,
      roles,
      ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
      ...(draft.instructions.trim() ? { instructions: draft.instructions.trim() } : {}),
    }
    const oldName = existingName()
    const defaultTeam = draft.isDefault ? name : null
    const defaultChanged = draft.isDefault || serverSync().data.config.default_team === oldName
    const teams =
      oldName && oldName !== name
        ? { [oldName]: { ...savedTeams()[oldName], disabled: true }, [name]: info }
        : { [name]: info }
    await serverSync()
      .updateConfig({
        teams,
        ...(defaultChanged ? { default_team: defaultTeam } : {}),
      })
      .then(() => {
        setUI({ selected: name, saveState: "saved" })
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
        teams: { [name]: { ...team, disabled: true } },
        ...(serverSync().data.config.default_team === name ? { default_team: null } : {}),
      })
      .then(() => choose(undefined))
      .catch(() => setUI("saveState", "error"))
  }

  return (
    <>
      <header class="settings-v2-tab-header settings-v2-teams-header">
        <div class="settings-v2-teams-header-row">
          <div>
            <h2 class="settings-v2-tab-title">{language.t("settings.teams.title")}</h2>
            <p class="settings-v2-teams-description">{language.t("settings.teams.description")}</p>
          </div>
          <ButtonV2 data-action="settings-team-create" icon="plus" onClick={create}>
            {language.t("settings.teams.create")}
          </ButtonV2>
        </div>
      </header>

      <div class="settings-v2-tab-body settings-v2-teams">
        <div class="settings-v2-teams-layout">
          <nav class="settings-v2-teams-list" aria-label={language.t("settings.teams.saved")}>
            <Show when={teamOptions().length > 0} fallback={<p>{language.t("settings.teams.empty")}</p>}>
              <For each={teamOptions()}>
                {(team) => (
                  <button
                    type="button"
                    class="settings-v2-teams-item"
                    classList={{ "settings-v2-teams-item-selected": ui.selected === team.name }}
                    aria-current={ui.selected === team.name ? "page" : undefined}
                    onClick={() => choose(team.name)}
                  >
                    <span>{team.name}</span>
                    <Show when={team.name === serverSync().data.config.default_team}>
                      <span class="settings-v2-teams-default">{language.t("settings.teams.default")}</span>
                    </Show>
                  </button>
                )}
              </For>
            </Show>
          </nav>

          <Show
            when={ui.selected}
            fallback={<div class="settings-v2-teams-placeholder">{language.t("settings.teams.select")}</div>}
          >
            <section class="settings-v2-teams-editor" aria-label={language.t("settings.teams.editor")}>
              <Show when={agentsQuery.isError}>
                <p class="settings-v2-teams-error" role="alert">
                  {language.t("settings.teams.agentLoadError")}
                </p>
              </Show>
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
                  title={language.t("settings.teams.descriptionField")}
                  description={language.t("settings.teams.descriptionHint")}
                >
                  <TextInputV2
                    value={draft.description}
                    onInput={(event) => setDraft("description", event.currentTarget.value)}
                    aria-label={language.t("settings.teams.descriptionField")}
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
                  title={language.t("settings.teams.instructions")}
                  description={language.t("settings.teams.instructionsHint")}
                >
                  <TextareaV2
                    value={draft.instructions}
                    onInput={(event) => setDraft("instructions", event.currentTarget.value)}
                    aria-label={language.t("settings.teams.instructions")}
                  />
                </SettingsRowV2>
                <SettingsRowV2
                  title={language.t("settings.teams.default")}
                  description={language.t("settings.teams.defaultHint")}
                >
                  <label class="settings-v2-teams-default-control">
                    <input
                      data-action="settings-team-default"
                      type="checkbox"
                      checked={draft.isDefault}
                      onChange={(event) => setDraft("isDefault", event.currentTarget.checked)}
                    />
                    {language.t("settings.teams.default")}
                  </label>
                </SettingsRowV2>
              </SettingsListV2>

              <div class="settings-v2-teams-roles">
                <div class="settings-v2-teams-roles-heading">
                  <div>
                    <h3>{language.t("settings.teams.roles")}</h3>
                    <p>{language.t("settings.teams.rolesHint")}</p>
                  </div>
                  <ButtonV2
                    data-action="settings-team-role-add"
                    size="small"
                    icon="plus"
                    onClick={() =>
                      setDraft("roles", draft.roles.length, {
                        id: nextRoleID++,
                        name: "",
                        agent: roleAgents()[0]?.name ?? "",
                        instructions: "",
                      })
                    }
                  >
                    {language.t("settings.teams.addRole")}
                  </ButtonV2>
                </div>
                <Show when={draft.roles.length > 0} fallback={<p>{language.t("settings.teams.noRoles")}</p>}>
                  <For each={draft.roles}>
                    {(role, index) => (
                      <div class="settings-v2-teams-role" data-role-id={role.id}>
                        <label>
                          <span>{language.t("settings.teams.roleName")}</span>
                          <TextInputV2
                            value={role.name}
                            onInput={(event) => setDraft("roles", index(), "name", event.currentTarget.value)}
                            invalid={role.name.length > 0 && !TEAM_NAME.test(role.name.trim())}
                            aria-label={language.t("settings.teams.roleName")}
                          />
                        </label>
                        <label>
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
                        <label class="settings-v2-teams-role-instructions">
                          <span>{language.t("settings.teams.roleInstructions")}</span>
                          <TextareaV2
                            value={role.instructions}
                            onInput={(event) => setDraft("roles", index(), "instructions", event.currentTarget.value)}
                            aria-label={language.t("settings.teams.roleInstructions")}
                          />
                        </label>
                        <ButtonV2
                          data-action="settings-team-role-remove"
                          size="small"
                          variant="ghost-muted"
                          icon="xmark-small"
                          aria-label={language.t("settings.teams.removeRole", { role: role.name || index() + 1 })}
                          onClick={() => setDraft("roles", (roles) => roles.filter((_, at) => at !== index()))}
                        />
                      </div>
                    )}
                  </For>
                </Show>
              </div>

              <footer class="settings-v2-teams-actions">
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
                  disabled={!valid() || ui.saveState === "saving"}
                >
                  {ui.saveState === "saving" ? language.t("settings.teams.saving") : language.t("settings.teams.save")}
                </ButtonV2>
              </footer>
            </section>
          </Show>
        </div>
      </div>
    </>
  )
}
