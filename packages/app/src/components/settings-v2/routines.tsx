import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { TextareaV2 } from "@opencode-ai/ui/v2/textarea-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { DateTime } from "effect"
import { For, Show, createEffect, createMemo, createResource } from "solid-js"
import { createStore } from "solid-js/store"
import { Routine } from "@opencode-ai/schema/routine"
import { Session } from "@opencode-ai/schema/session"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerProtocol, useServerSDK } from "@/context/server-sdk"
import { createWorkspaceApi } from "@/utils/workspace-api"
import { SettingsListV2 } from "./parts/list"
import "./settings-v2.css"

const maxIntervalMinutes = 43_200

export function SettingsRoutinesV2(props: { sessionID?: string }) {
  const language = useLanguage()
  const platform = usePlatform()
  const sdk = useServerSDK()
  const protocol = useServerProtocol()
  const [store, setStore] = createStore({
    name: "",
    sessionID: props.sessionID ?? "",
    prompt: "",
    intervalMinutes: "60",
    busy: undefined as string | undefined,
    error: undefined as string | undefined,
    history: undefined as Routine.ID | undefined,
  })
  const scope = createMemo(() => (protocol() === "v2" ? sdk().scope : undefined))
  const api = () => createWorkspaceApi({ server: sdk().server.http, fetch: platform.fetch })
  const [routines, routineActions] = createResource(scope, () => api().routines())
  const [sessions] = createResource(scope, async () => (await sdk().api.session.list({ limit: 100 })).data)
  const [runs, runActions] = createResource(
    () => (scope() && store.history ? { scope: scope()!, id: store.history } : undefined),
    (input) => api().routineRuns(input.id),
  )

  createEffect(() => {
    if (!props.sessionID || store.sessionID) return
    setStore("sessionID", props.sessionID)
  })

  const supported = () => protocol() === "v2"
  const list = createMemo(() => routines() ?? [])

  const refresh = () => {
    void routineActions.refetch()
    if (store.history) void runActions.refetch()
  }

  const create = async () => {
    if (store.busy) return
    const intervalMinutes = Number(store.intervalMinutes)
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > maxIntervalMinutes) {
      setStore("error", language.t("settings.routines.invalidInterval"))
      return
    }
    if (!store.name.trim() || !store.sessionID || !store.prompt.trim()) {
      setStore("error", language.t("settings.routines.createFailed"))
      return
    }
    setStore({ busy: "create", error: undefined })
    await api()
      .createRoutine({
        name: store.name.trim(),
        sessionID: Session.ID.make(store.sessionID),
        prompt: store.prompt.trim(),
        intervalMs: intervalMinutes * 60_000,
      })
      .then(() => {
        setStore({ name: "", prompt: "", intervalMinutes: "60" })
        refresh()
      })
      .catch(() => setStore("error", language.t("settings.routines.createFailed")))
    setStore("busy", undefined)
  }

  const update = async (routine: Routine.Info, action: "pause" | "resume" | "delete") => {
    if (store.busy) return
    if (action === "delete" && !window.confirm(language.t("settings.routines.deleteConfirm", { name: routine.name })))
      return
    setStore({ busy: `${action}:${routine.id}`, error: undefined })
    await (
      action === "pause"
        ? api().pauseRoutine(routine.id)
        : action === "resume"
          ? api().resumeRoutine(routine.id)
          : api().deleteRoutine(routine.id)
    )
      .then(() => {
        if (action === "delete" && store.history === routine.id) setStore("history", undefined)
        refresh()
      })
      .catch(() => setStore("error", language.t("settings.routines.actionFailed")))
    setStore("busy", undefined)
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <h2 class="settings-v2-tab-title">{language.t("settings.routines.title")}</h2>
        <p class="settings-v2-routines-description">{language.t("settings.routines.description")}</p>
        <p class="settings-v2-routines-description">{language.t("settings.routines.limitations")}</p>
      </div>
      <div class="settings-v2-tab-body settings-v2-routines">
        <Show
          when={supported()}
          fallback={<p class="settings-v2-routines-status">{language.t("settings.routines.unsupported")}</p>}
        >
          <Show when={store.error}>
            {(error) => (
              <p role="alert" class="settings-v2-routines-error">
                {error()}
              </p>
            )}
          </Show>
          <Show when={routines.error}>
            <div role="alert" class="settings-v2-routines-status">
              <span>{language.t("settings.routines.loadFailed")}</span>
              <ButtonV2 type="button" variant="neutral" onClick={refresh}>
                {language.t("common.retry")}
              </ButtonV2>
            </div>
          </Show>
          <Show when={!routines.loading && !routines.error}>
            <Show
              when={list().length > 0}
              fallback={<p class="settings-v2-routines-status">{language.t("settings.routines.empty")}</p>}
            >
              <SettingsListV2>
                <For each={list()}>
                  {(routine) => (
                    <div class="settings-v2-routine" data-routine={routine.id}>
                      <div class="settings-v2-routine-copy">
                        <div class="settings-v2-routine-title-row">
                          <span class="settings-v2-routine-name">{routine.name}</span>
                          <span class="settings-v2-routine-status" data-status={routine.status}>
                            {language.t(`settings.routines.status.${routine.status}`)}
                          </span>
                        </div>
                        <span class="settings-v2-routine-meta">{routine.sessionID}</span>
                        <p class="settings-v2-routine-prompt">{routine.prompt}</p>
                        <span class="settings-v2-routine-meta">
                          {language.t("settings.routines.nextRun", {
                            time: new Date(DateTime.toEpochMillis(routine.nextRunAt)).toLocaleString(),
                          })}
                        </span>
                      </div>
                      <div class="settings-v2-routine-actions">
                        <ButtonV2
                          type="button"
                          variant="neutral"
                          disabled={!!store.busy}
                          onClick={() => void update(routine, routine.status === "active" ? "pause" : "resume")}
                        >
                          {language.t(
                            routine.status === "active" ? "settings.routines.pause" : "settings.routines.resume",
                          )}
                        </ButtonV2>
                        <ButtonV2
                          type="button"
                          variant="ghost"
                          disabled={!!store.busy}
                          onClick={() => setStore("history", store.history === routine.id ? undefined : routine.id)}
                        >
                          {language.t(
                            store.history === routine.id
                              ? "settings.routines.history.hide"
                              : "settings.routines.history",
                          )}
                        </ButtonV2>
                        <ButtonV2
                          type="button"
                          variant="ghost"
                          disabled={!!store.busy}
                          onClick={() => void update(routine, "delete")}
                        >
                          {language.t("settings.routines.delete")}
                        </ButtonV2>
                      </div>
                      <Show when={store.history === routine.id}>
                        <div class="settings-v2-routine-history">
                          <Show
                            when={runs.loading}
                            fallback={
                              <Show when={runs.error} fallback={<RunHistory runs={runs() ?? []} language={language} />}>
                                <div class="settings-v2-routines-status" role="alert">
                                  <span>{language.t("settings.routines.historyFailed")}</span>
                                  <ButtonV2 type="button" variant="neutral" onClick={() => void runActions.refetch()}>
                                    {language.t("common.retry")}
                                  </ButtonV2>
                                </div>
                              </Show>
                            }
                          >
                            <span class="settings-v2-routine-meta">{language.t("common.loading")}</span>
                          </Show>
                        </div>
                      </Show>
                    </div>
                  )}
                </For>
              </SettingsListV2>
            </Show>
          </Show>
          <form
            class="settings-v2-routines-form"
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          >
            <h3 class="settings-v2-section-title">{language.t("settings.routines.create")}</h3>
            <label>
              <span>{language.t("settings.routines.name")}</span>
              <TextInputV2
                appearance="base"
                value={store.name}
                placeholder={language.t("settings.routines.namePlaceholder")}
                onInput={(event) => setStore("name", event.currentTarget.value)}
              />
            </label>
            <label>
              <span>{language.t("settings.routines.session")}</span>
              <select value={store.sessionID} onChange={(event) => setStore("sessionID", event.currentTarget.value)}>
                <option value="">{language.t("settings.routines.sessionPlaceholder")}</option>
                <For each={sessions() ?? []}>
                  {(session) => <option value={session.id}>{session.title || session.id}</option>}
                </For>
              </select>
            </label>
            <label>
              <span>{language.t("settings.routines.prompt")}</span>
              <TextareaV2
                rows={3}
                value={store.prompt}
                placeholder={language.t("settings.routines.promptPlaceholder")}
                onInput={(event) => setStore("prompt", event.currentTarget.value)}
              />
            </label>
            <label>
              <span>{language.t("settings.routines.schedule")}</span>
              <div class="settings-v2-routines-interval">
                <TextInputV2
                  appearance="base"
                  type="number"
                  min="1"
                  max={maxIntervalMinutes}
                  value={store.intervalMinutes}
                  onInput={(event) => setStore("intervalMinutes", event.currentTarget.value)}
                />
                <span>{language.t("settings.routines.minutes")}</span>
              </div>
            </label>
            <ButtonV2 type="submit" variant="contrast" disabled={store.busy === "create"}>
              {language.t("settings.routines.create")}
            </ButtonV2>
          </form>
        </Show>
      </div>
    </>
  )
}

function RunHistory(props: { runs: ReadonlyArray<Routine.Run>; language: ReturnType<typeof useLanguage> }) {
  return (
    <Show
      when={props.runs.length > 0}
      fallback={<span class="settings-v2-routine-meta">{props.language.t("settings.routines.history.empty")}</span>}
    >
      <For each={props.runs}>
        {(run) => (
          <div class="settings-v2-routine-run">
            <span>{new Date(DateTime.toEpochMillis(run.scheduledAt)).toLocaleString()}</span>
            <span>{props.language.t(`settings.routines.run.${run.status}`)}</span>
            <span class="settings-v2-routine-meta">
              {props.language.t("settings.routines.run.session", { id: run.sessionID })}
            </span>
            <span class="settings-v2-routine-meta">
              {props.language.t("settings.routines.run.message", { id: run.messageID })}
            </span>
            <Show when={run.error}>{(error) => <span class="settings-v2-routine-run-error">{error()}</span>}</Show>
          </div>
        )}
      </For>
    </Show>
  )
}
