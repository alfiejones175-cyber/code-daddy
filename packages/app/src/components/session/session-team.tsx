import { A } from "@solidjs/router"
import { For, Show, createEffect, createMemo, onCleanup, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { ServerConnection } from "@/context/server"
import { useProviders } from "@/hooks/use-providers"
import { normalizeSessionInfo } from "@/utils/session"
import { sessionHref } from "@/utils/session-route"
import { sidebarOutcome } from "@/pages/layout/project-sidebar-model"
import "./session-team.css"

export function SessionTeam(props: { directory: string; sessionID: string; onPreparePrompt: (text: string) => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  const sdk = useServerSDK()
  const sync = useServerSync()
  const providers = useProviders(() => props.directory)
  const [state, setState] = createStore({ agent: "", model: "", prompt: "", turns: "10", stopping: "", failed: false })
  const agents = () =>
    sync()
      .child(props.directory)[0]
      .agent.filter((agent) => !agent.hidden && agent.mode !== "primary")
  const models = createMemo(() =>
    providers.connected().flatMap((provider) =>
      Object.values(provider.models).map((model) => ({
        key: `${provider.id}/${model.id}`,
        provider: provider.id,
        model,
      })),
    ),
  )
  const [children, setChildren] = createStore({
    scope: "",
    id: "",
    data: [] as ReturnType<typeof normalizeSessionInfo>[],
    cursor: undefined as string | undefined,
    loading: false,
    loadingMore: false,
    failed: false,
  })
  let requestVersion = 0
  const removed = new Set<string>()
  const merge = (items: ReturnType<typeof normalizeSessionInfo>[]) => {
    const byID = new Map(children.data.filter((item) => !removed.has(item.id)).map((item) => [item.id, item]))
    items.forEach((item) => byID.set(item.id, item))
    return [...byID.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  }
  const load = async (cursor?: string) => {
    const server = sdk()
    const scope = server.scope
    const id = props.sessionID
    const version = cursor ? requestVersion : ++requestVersion
    const sameSession = children.scope === scope && children.id === id
    if (!cursor && !sameSession) removed.clear()
    setChildren(
      cursor
        ? { loadingMore: true, failed: false }
        : {
            scope,
            id,
            data: sameSession ? children.data : [],
            cursor: sameSession ? children.cursor : undefined,
            loading: true,
            loadingMore: false,
            failed: false,
          },
    )
    const result = await server.api.session
      .list({ parentID: id, limit: 100, order: "asc", cursor })
      .catch(() => undefined)
    if (version !== requestVersion || scope !== sdk().scope || id !== props.sessionID) return
    if (!result) {
      setChildren(cursor ? { loadingMore: false, failed: true } : { loading: false, loadingMore: false, failed: true })
      return
    }
    const items = result.data.map(normalizeSessionInfo).filter((item) => !removed.has(item.id))
    items.forEach((item) => sync().session.remember(item))
    const nextCursor = !cursor && children.cursor ? children.cursor : (result.cursor.next ?? undefined)
    setChildren({ data: merge(items), cursor: nextCursor, loading: false, loadingMore: false, failed: false })
  }
  const list = () => (children.scope === sdk().scope && children.id === props.sessionID ? children.data : [])
  const timestamp = createMemo(
    () =>
      new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
  )
  createEffect(() => {
    const server = sdk()
    props.sessionID
    untrack(() => void load())
    onCleanup(
      server.event.listen((event) => {
        if (
          event.details.type !== "session.created" &&
          event.details.type !== "session.updated" &&
          event.details.type !== "session.deleted"
        )
          return
        const properties = event.details.properties as { info?: { id?: string; parentID?: string }; sessionID?: string }
        const info = properties.info
        const childID = info?.id ?? properties.sessionID
        if (info?.parentID !== props.sessionID && !(childID && children.data.some((item) => item.id === childID)))
          return
        if (event.details.type === "session.deleted" && childID) {
          removed.add(childID)
          setChildren("data", (items) => items.filter((item) => item.id !== childID))
        }
        void load()
      }),
    )
  })
  const status = (id: string) => {
    const data = sync().session.data
    if (data.permission[id]?.length || data.question[id]?.length) return "waiting"
    if (data.session_working(id)) return "running"
    return sidebarOutcome(data.session_message[id]?.at(-1))
  }
  const stop = async (id: string) => {
    if (state.stopping) return
    setState({ stopping: id, failed: false })
    await sdk()
      .api.session.interrupt({ sessionID: id })
      .catch(() => setState("failed", true))
    setState("stopping", "")
  }
  const valid = () =>
    !!(state.agent || agents()[0]?.name) &&
    !!state.prompt.trim() &&
    Number.isInteger(Number(state.turns)) &&
    Number(state.turns) >= 1 &&
    Number(state.turns) <= 100
  const prepare = () => {
    if (!valid()) return
    const model = models().find((item) => item.key === state.model)
    const input = {
      description: state.prompt.trim().slice(0, 160),
      prompt: state.prompt.trim(),
      subagent_type: state.agent || agents()[0]?.name,
      max_turns: Number(state.turns),
      ...(model ? { model: { providerID: model.provider, id: model.model.id } } : {}),
    }
    dialog.close()
    props.onPreparePrompt(language.t("team.delegatePrompt", { input: JSON.stringify(input, null, 2) }))
  }

  return (
    <Dialog title={language.t("team.title")} size="large">
      <div class="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 pb-5" data-component="session-team">
        <p class="text-13-regular text-text-weak">{language.t("team.description")}</p>
        <Show when={children.loading}>
          <p role="status">{language.t("common.loading")}</p>
        </Show>
        <Show when={children.failed || state.failed}>
          <div role="alert" class="flex items-center gap-3">
            <p>{language.t("common.requestFailed")}</p>
            <Button onClick={() => void load()}>{language.t("common.retry")}</Button>
          </div>
        </Show>
        <div class="team-activity">
          <For each={list()}>
            {(child) => {
              const current = () => sync().session.get(child.id) ?? child
              const outcome = () => status(child.id)
              const updated = () => current().time.updated
              return (
                <div class="team-activity-row" data-session-id={child.id} data-status={outcome()}>
                  <div class="team-activity-identity" aria-hidden="true">
                    <Icon
                      name={outcome() === "complete" ? "check" : outcome() === "failed" ? "circle-x" : "branch"}
                      size="small"
                    />
                  </div>
                  <div class="team-activity-detail">
                    <A
                      class="team-activity-title"
                      href={sessionHref(ServerConnection.key(sdk().server), child.id)}
                      onClick={() => dialog.close()}
                    >
                      {current().title || child.id}
                    </A>
                    <div class="team-activity-meta">
                      <Show when={current().agent}>{(agent) => <span>{agent()}</span>}</Show>
                      <Show when={current().model?.id}>
                        {(model) => <span class="team-activity-model">{model()}</span>}
                      </Show>
                    </div>
                    <div class="team-activity-state">
                      <span class="team-activity-status" data-status={outcome()}>
                        <span aria-hidden="true" />
                        {language.t(`team.status.${outcome()}`)}
                      </span>
                      <Show when={updated()}>
                        {(time) => (
                          <time
                            dateTime={new Date(time()).toISOString()}
                            title={language.t("team.updated", { time: timestamp().format(time()) })}
                          >
                            {timestamp().format(time())}
                          </time>
                        )}
                      </Show>
                    </div>
                  </div>
                  <Show when={outcome() === "running" || outcome() === "waiting"}>
                    <Button
                      class="team-activity-stop"
                      variant="secondary"
                      disabled={!!state.stopping}
                      onClick={() => void stop(child.id)}
                    >
                      {language.t("prompt.action.stop")}
                    </Button>
                  </Show>
                </div>
              )
            }}
          </For>
          <Show when={!children.loading && !children.failed && !list().length}>
            <p class="text-13-regular text-text-weak">{language.t("team.empty")}</p>
          </Show>
          <Show when={children.cursor}>
            <Button variant="ghost" disabled={children.loadingMore} onClick={() => void load(children.cursor)}>
              <Show when={!children.loadingMore} fallback={language.t("common.loading")}>
                {language.t("common.loadMore")}
              </Show>
            </Button>
          </Show>
        </div>
        <form
          class="flex flex-col gap-3 border-t border-border-weak-base pt-4"
          onSubmit={(event) => {
            event.preventDefault()
            prepare()
          }}
        >
          <h3 class="text-14-medium text-text-strong">{language.t("team.newTask")}</h3>
          <TextField
            label={language.t("team.task")}
            value={state.prompt}
            onChange={(value) => setState("prompt", value)}
            multiline
          />
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="flex min-w-0 flex-col gap-1 text-13-regular">
              {language.t("team.agent")}
              <select
                class="min-w-0 rounded border border-border-weak-base bg-background-base p-2"
                value={state.agent || agents()[0]?.name || ""}
                onChange={(event) => setState("agent", event.currentTarget.value)}
              >
                <For each={agents()}>{(agent) => <option value={agent.name}>{agent.name}</option>}</For>
              </select>
            </label>
            <label class="flex min-w-0 flex-col gap-1 text-13-regular">
              {language.t("team.model")}
              <select
                class="min-w-0 rounded border border-border-weak-base bg-background-base p-2"
                value={state.model}
                onChange={(event) => setState("model", event.currentTarget.value)}
              >
                <option value="">{language.t("team.inheritModel")}</option>
                <For each={models()}>
                  {(item) => (
                    <option value={item.key}>
                      {item.provider} / {item.model.name}
                    </option>
                  )}
                </For>
              </select>
            </label>
          </div>
          <TextField
            label={language.t("team.turnBudget")}
            type="number"
            min={1}
            max={100}
            value={state.turns}
            onChange={(value) => setState("turns", value)}
          />
          <p class="text-12-regular text-text-weak">{language.t("team.budgetHint")}</p>
          <Button type="submit" variant="primary" disabled={!valid()}>
            {language.t("team.prepare")}
          </Button>
        </form>
      </div>
    </Dialog>
  )
}
