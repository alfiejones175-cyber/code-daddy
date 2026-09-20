import { A } from "@solidjs/router"
import type { SessionMessageInfo } from "@opencode-ai/client/promise"
import { createEffect, createMemo, createUniqueId, For, Index, on, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { createMediaQuery } from "@solid-primitives/media"
import { makeEventListener } from "@solid-primitives/event-listener"
import { base64Encode } from "@opencode-ai/core/util/encode"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { Icon } from "@opencode-ai/ui/icon"
import { Popover } from "@opencode-ai/ui/popover"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ProjectAvatar } from "@opencode-ai/ui/v2/project-avatar-v2"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { useDirectoryPicker } from "@/components/directory-picker"
import { useSettingsDialog } from "@/components/settings-dialog"
import { useCommand } from "@/context/command"
import { useGlobal, type ServerCtx } from "@/context/global"
import { useLanguage } from "@/context/language"
import { getProjectAvatarVariant, useLayout, type LocalProject } from "@/context/layout"
import { useNotification } from "@/context/notification"
import { ServerConnection, useServer } from "@/context/server"
import { draftHref, useTabs, type Tab } from "@/context/tabs"
import { createTabPromptState } from "@/context/prompt"
import { pathKey } from "@/utils/path-key"
import { normalizeSessionInfo } from "@/utils/session"
import { sessionHref } from "@/utils/session-route"
import { sessionTitle } from "@/utils/session-title"
import { sessionPermissionRequest, sessionQuestionRequest } from "../session/composer/session-request-tree"
import {
  compareSessionTime,
  displayName,
  getProjectAvatarSource,
  homeProjectDirectories,
  sortedRootSessions,
} from "./helpers"
import { sidebarAncestors, sidebarOutcome, sidebarSessionUsage } from "./project-sidebar-model"
import "./project-sidebar.css"

const activityDays = 42
const activityDayMs = 24 * 60 * 60 * 1000

function sessionTokenTotal(session: Session) {
  const tokens = session.tokens
  if (!tokens) return 0
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
}

function usageActivity(sessions: Session[]) {
  const today = new Date()
  const start =
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - (activityDays - 1) * activityDayMs
  const values = new Map<number, number>()
  sessions.forEach((session) => {
    const updated = new Date(session.time.updated ?? session.time.created)
    const day = Date.UTC(updated.getUTCFullYear(), updated.getUTCMonth(), updated.getUTCDate())
    if (day < start) return
    values.set(day, (values.get(day) ?? 0) + sessionTokenTotal(session))
  })
  const max = Math.max(...values.values(), 0)
  return Array.from({ length: activityDays }, (_, index) => {
    const date = start + index * activityDayMs
    const tokens = values.get(date) ?? 0
    const level = tokens === 0 || max === 0 ? 0 : Math.max(1, Math.ceil((Math.log1p(tokens) / Math.log1p(max)) * 4))
    return { date, tokens, level }
  })
}

export function ProjectSidebar() {
  const layout = useLayout()
  const language = useLanguage()
  const global = useGlobal()
  const server = useServer()
  const tabs = useTabs()
  const command = useCommand()
  const pickDirectory = useDirectoryPicker()
  const settings = useSettingsDialog()
  const providers = useSettingsDialog("providers")
  const compact = createMediaQuery("(max-width: 767px)")
  const reducedMotion = createMediaQuery("(prefers-reduced-motion: reduce)")
  const id = createUniqueId()
  const [state, setState] = createStore({ search: "", failed: false, instant: false, scrim: false })
  let toggleButton: HTMLButtonElement | undefined
  let panel: HTMLElement | undefined
  let list: HTMLDivElement | undefined
  let marker: HTMLDivElement | undefined
  let markerRow: HTMLElement | undefined
  const draft = createMemo(() => {
    const route = layout.route()
    if (route.type !== "draft") return
    return tabs.store.filter((item) => item.type === "draft").find((item) => item.draftID === route.draftID)
  })
  const connection = createMemo(() => {
    const route = layout.route()
    const key = route.type === "home" ? layout.home.selection().server : (draft()?.server ?? route.server ?? server.key)
    return global.servers.list().find((item) => ServerConnection.key(item) === key)
  })
  const context = createMemo(() => {
    const conn = connection()
    return conn ? global.ensureServerCtx(conn) : undefined
  })
  const sessionID = createMemo(() => {
    const route = layout.route()
    return route.type === "session" ? route.sessionId : undefined
  })
  const session = createMemo(() => {
    const id = sessionID()
    return id ? context()?.sync.session.get(id) : undefined
  })
  // A resource here would suspend the same navigation that supplies the selected session.
  createEffect(
    on([context, sessionID], ([ctx, id]) => {
      setState("failed", false)
      if (!ctx || !id) return
      let stale = false
      onCleanup(() => {
        stale = true
      })
      void ctx.sync.session.lineage.resolve(id).catch(() => {
        if (!stale) setState("failed", true)
      })
    }),
  )
  const directory = createMemo(() => {
    const route = layout.route()
    if (route.type === "session") return session()?.directory
    if (route.type === "draft") return draft()?.directory
    if (route.type === "dir-new-sesssion") return route.dir
    return layout.home.selection().directory
  })
  const projects = createMemo(() => context()?.projects.list() ?? [])
  const usageSessions = createMemo(() =>
    Object.values(context()?.sync.session.data.info ?? {}).filter(
      (session): session is Session => !!session && !session.time.archived,
    ),
  )
  const connectedProviders = createMemo(() => {
    const ctx = context()
    if (!ctx) return []
    const dir = directory()
    return (
      dir ? ctx.sync.child(dir, { bootstrap: false })[0].provider.connected : ctx.sync.data.provider.connected
    ).slice(0, 3)
  })
  const current = createMemo(() => {
    const dir = directory()
    if (!dir) return
    return projects().find((project) =>
      [project.worktree, ...(project.sandboxes ?? [])].some((path) => pathKey(path) === pathKey(dir)),
    )
  })
  const filtered = createMemo(() =>
    projects().filter((project) =>
      `${displayName(project)} ${project.worktree}`.toLocaleLowerCase().includes(state.search.toLocaleLowerCase()),
    ),
  )
  const opened = () => (compact() ? layout.mobileSidebar.opened() : layout.sidebar.opened())
  const close = () => {
    toggleButton?.focus()
    if (compact()) layout.mobileSidebar.hide()
    if (!compact()) layout.sidebar.close()
  }
  const toggle = (instant = false) => {
    setState("instant", instant)
    if (opened()) return close()
    if (compact()) layout.mobileSidebar.show()
    if (!compact()) layout.sidebar.open()
  }
  const chooseProject = () => {
    const conn = connection()
    if (!conn) return
    if (compact()) close()
    pickDirectory({
      server: conn,
      title: language.t("command.project.open"),
      multiple: true,
      onSelect: (result) => {
        const dirs = homeProjectDirectories(result)
        const ctx = global.ensureServerCtx(conn)
        dirs.forEach((dir) => ctx.projects.open(dir))
        if (dirs[0]) {
          void tabs.newDraft({ server: ServerConnection.key(conn), directory: dirs[0] }, "")
          if (compact()) close()
        }
      },
    })
  }
  const newChat = (dir = directory()) => {
    const conn = connection()
    if (!conn) return
    if (!dir) return chooseProject()
    void tabs.newDraft({ server: ServerConnection.key(conn), directory: dir }, "")
    if (compact()) close()
  }
  const openSettings = (connections = false) => {
    const conn = connection()
    if (conn) global.settings.server.set(ServerConnection.key(conn))
    if (compact()) close()
    if (connections) return providers()
    settings()
  }
  command.register("project-sidebar", () => [
    {
      id: "sidebar.toggle",
      title: language.t("command.sidebar.toggle"),
      category: language.t("command.category.view"),
      keybind: "mod+shift+b",
      onSelect: (source) => toggle(source === "keybind"),
    },
  ])
  createEffect(() => {
    if (!panel) return
    panel.inert = !opened()
    if (compact() && opened()) queueMicrotask(() => panel?.querySelector<HTMLElement>("input, button, a")?.focus())
  })
  createEffect(on(compact, () => layout.mobileSidebar.hide(), { defer: true }))
  createEffect(() => {
    if (!compact()) {
      setState("scrim", false)
      return
    }
    if (opened()) {
      setState("scrim", true)
      return
    }
    if (!state.scrim) return
    const timer = window.setTimeout(() => setState("scrim", false), state.instant || reducedMotion() ? 0 : 220)
    onCleanup(() => window.clearTimeout(timer))
  })
  createEffect(() => {
    if (!list || !marker) return
    let frame: number | undefined
    let markerY: number | undefined
    let markerAnimation: Animation | undefined
    const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule)
    const mutations = new MutationObserver(schedule)
    const sync = () => {
      frame = undefined
      const row = list?.querySelector<HTMLElement>('.sidebar-chat-row[data-selected="true"]')
      if (!list || !marker || !row || !row.getClientRects().length) {
        marker?.setAttribute("data-visible", "false")
        if (markerRow) resize?.unobserve(markerRow)
        markerRow = undefined
        markerY = undefined
        return
      }
      if (markerRow !== row) {
        if (markerRow) resize?.unobserve(markerRow)
        resize?.observe(row)
        markerRow = row
      }
      const listBounds = list.getBoundingClientRect()
      const rowBounds = row.getBoundingClientRect()
      const nextY = rowBounds.top - listBounds.top + list.scrollTop
      marker.style.height = `${rowBounds.height}px`
      marker.style.transform = `translate3d(0, ${nextY}px, 0)`
      if (markerY !== undefined && markerY !== nextY && !reducedMotion()) {
        markerAnimation?.cancel()
        markerAnimation = marker.animate(
          [
            { transform: `translate3d(0, ${markerY}px, 0)` },
            { transform: `translate3d(${nextY > markerY ? 7 : -7}px, ${markerY + (nextY - markerY) * 0.62}px, 0)` },
            { transform: `translate3d(0, ${nextY}px, 0)` },
          ],
          { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        )
      }
      markerY = nextY
      marker.setAttribute("data-visible", "true")
      marker.setAttribute("data-ready", "true")
    }
    function schedule() {
      if (frame !== undefined) return
      frame = requestAnimationFrame(sync)
    }
    resize?.observe(list)
    mutations.observe(list, {
      attributes: true,
      attributeFilter: ["data-selected", "hidden"],
      childList: true,
      subtree: true,
    })
    list.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    schedule()
    onCleanup(() => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      markerAnimation?.cancel()
      resize?.disconnect()
      mutations.disconnect()
      list?.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
    })
  })
  makeEventListener(document, "keydown", (event) => {
    if (!compact() || !opened()) return
    if (event.key === "Escape") {
      event.preventDefault()
      setState("instant", true)
      close()
      return
    }
    if (event.key !== "Tab" || !panel) return
    const controls = Array.from(panel.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input")).filter(
      (item) => item.getClientRects().length > 0,
    )
    if (event.shiftKey && document.activeElement === controls[0]) {
      event.preventDefault()
      controls.at(-1)?.focus()
    }
    if (!event.shiftKey && document.activeElement === controls.at(-1)) {
      event.preventDefault()
      controls[0]?.focus()
    }
  })
  return (
    <aside data-component="project-sidebar" data-open={opened()} data-instant={state.instant}>
      <div class="project-sidebar-rail">
        <TooltipV2 value={language.t("sidebar.toggle")} placement="right">
          <button
            ref={toggleButton}
            type="button"
            data-action="sidebar-toggle"
            class="sidebar-icon sidebar-toggle"
            aria-label={language.t("sidebar.toggle")}
            aria-expanded={opened()}
            aria-controls={id}
            onClick={(event) => toggle(event.detail === 0)}
          >
            <Icon name={opened() ? "chevron-left" : "chevron-right"} size="small" />
          </button>
        </TooltipV2>
        <TooltipV2 value={language.t("sidebar.newChat")} placement="right">
          <button
            type="button"
            data-action={opened() ? undefined : "sidebar-new-chat"}
            class="sidebar-icon sidebar-rail-action"
            disabled={!connection()}
            aria-label={language.t("sidebar.newChat")}
            onClick={() => newChat()}
          >
            <Icon name="new-session" size="small" />
          </button>
        </TooltipV2>
        <div class="sidebar-rail-spacer" />
        <TooltipV2 value={language.t("command.project.open")} placement="right">
          <button
            type="button"
            data-action={opened() ? undefined : "sidebar-open-project"}
            class="sidebar-icon sidebar-rail-action"
            disabled={!connection()}
            aria-label={language.t("command.project.open")}
            onClick={chooseProject}
          >
            <Icon name="folder-add-left" size="small" />
          </button>
        </TooltipV2>
        <TooltipV2 value={language.t("sidebar.settings")} placement="right">
          <button
            type="button"
            data-action={opened() ? undefined : "sidebar-settings"}
            class="sidebar-icon sidebar-rail-action"
            aria-label={language.t("sidebar.settings")}
            onClick={() => openSettings()}
          >
            <Icon name="settings-gear" size="small" />
          </button>
        </TooltipV2>
      </div>
      <Show when={compact() && state.scrim}>
        <div class="project-sidebar-scrim" data-active={opened()} onClick={close} aria-hidden="true" />
      </Show>
      <nav
        ref={panel}
        id={id}
        class="project-sidebar-panel"
        aria-label={language.t("sidebar.nav.projectsAndSessions")}
        aria-hidden={!opened()}
      >
        <div class="project-sidebar-heading">
          <span>{language.t("home.projects")}</span>
          <div class="sidebar-heading-actions">
            <button
              type="button"
              class="sidebar-icon sidebar-panel-close"
              aria-label={language.t("common.close")}
              onClick={close}
            >
              <Icon name="chevron-left" size="small" />
            </button>
            <TooltipV2 value={language.t("command.project.open")} placement="bottom">
              <button
                type="button"
                class="sidebar-icon"
                data-action={opened() ? "sidebar-open-project" : undefined}
                aria-label={language.t("command.project.open")}
                disabled={!connection()}
                onClick={chooseProject}
              >
                <Icon name="folder-add-left" size="small" />
              </button>
            </TooltipV2>
          </div>
        </div>
        <button
          type="button"
          data-action={opened() ? "sidebar-new-chat" : undefined}
          class="sidebar-new-chat"
          onClick={() => newChat()}
          disabled={!connection()}
        >
          <Icon name="plus" size="small" />
          <span>{language.t("sidebar.newChat")}</span>
        </button>
        <div data-component="sidebar-current-project" class="sidebar-current-project" title={directory()}>
          {current() ? displayName(current()!) : language.t("sidebar.noProject")}
        </div>
        <Show when={projects().length > 5}>
          <input
            class="sidebar-project-search"
            type="search"
            value={state.search}
            aria-label={language.t("session.new.project.search")}
            placeholder={language.t("common.search.placeholder")}
            onInput={(event) => setState("search", event.currentTarget.value)}
          />
        </Show>
        <div ref={list} class="project-sidebar-list">
          <div ref={marker} class="sidebar-active-marker" aria-hidden="true" />
          <Show when={state.failed}>
            <p class="sidebar-empty" role="status">
              {language.t("common.requestFailed")}
            </p>
          </Show>
          <For each={filtered()}>
            {(project) => (
              <Show when={context()}>
                {(ctx) => (
                  <ProjectGroup
                    project={project}
                    context={ctx()}
                    directory={directory()}
                    sessionID={sessionID()}
                    newChat={() => newChat(project.worktree)}
                    onNavigate={() => {
                      if (compact()) close()
                    }}
                  />
                )}
              </Show>
            )}
          </For>
          <Show when={projects().length === 0}>
            <div class="sidebar-empty">
              <p>{language.t("sidebar.empty.title")}</p>
              <button type="button" onClick={chooseProject} disabled={!connection()}>
                {language.t("command.project.open")}
              </button>
            </div>
          </Show>
          <Show when={projects().length > 0 && filtered().length === 0}>
            <p class="sidebar-empty">{language.t("palette.empty")}</p>
          </Show>
        </div>
        <div class="sidebar-footer">
          <Show when={context()}>{(ctx) => <AppUsageActivity context={ctx()} sessions={usageSessions()} />}</Show>
          <div class="sidebar-footer-actions">
            <button type="button" class="sidebar-connections" onClick={() => openSettings(true)}>
              <span class="sidebar-provider-icons">
                <Show when={connectedProviders().length} fallback={<Icon name="providers" size="small" />}>
                  <For each={connectedProviders()}>
                    {(id) => (
                      <span title={id}>
                        <ProviderIcon id={id} />
                      </span>
                    )}
                  </For>
                </Show>
              </span>
              <span>{language.t("settings.providers.title")}</span>
              <Icon name="chevron-right" size="small" />
            </button>
            <TooltipV2 value={language.t("sidebar.settings")} placement="top">
              <button
                type="button"
                class="sidebar-icon"
                data-action={opened() ? "sidebar-settings" : undefined}
                aria-label={language.t("sidebar.settings")}
                onClick={() => openSettings()}
              >
                <Icon name="settings-gear" size="small" />
              </button>
            </TooltipV2>
          </div>
        </div>
      </nav>
    </aside>
  )
}

function ProjectGroup(props: {
  project: LocalProject
  context: ServerCtx
  directory?: string
  sessionID?: string
  newChat: () => void
  onNavigate: () => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const tabs = useTabs()
  const id = createUniqueId()
  const [state, setState] = createStore({ expanded: props.project.expanded, limit: 5, loading: false, failed: false })
  const active = createMemo(
    () =>
      !!props.directory &&
      [props.project.worktree, ...(props.project.sandboxes ?? [])].some(
        (dir) => pathKey(dir) === pathKey(props.directory!),
      ),
  )
  const directories = createMemo(() => [props.project.worktree, ...(props.project.sandboxes ?? [])])
  const drafts = createMemo(() =>
    tabs.store.filter(
      (tab): tab is Extract<Tab, { type: "draft" }> =>
        tab.type === "draft" &&
        tab.server === ServerConnection.key(props.context.sdk.server) &&
        directories().some((directory) => pathKey(directory) === pathKey(tab.directory)),
    ),
  )
  const stores = createMemo(() => directories().map((dir) => props.context.sync.child(dir, { bootstrap: false })[0]))
  const root = createMemo(() =>
    props.sessionID ? props.context.sync.session.lineage.peek(props.sessionID)?.root : undefined,
  )
  const sessions = createMemo(() => {
    const selected = root()
    const items = stores().flatMap((store) => sortedRootSessions(store, Date.now()))
    if (
      selected &&
      !selected.time.archived &&
      directories().some((dir) => pathKey(dir) === pathKey(selected.directory)) &&
      !items.some((item) => item.id === selected.id)
    )
      items.push(selected)
    return items.sort(compareSessionTime)
  })
  const visible = createMemo(() =>
    sessions().filter((session, index) => index < state.limit || session.id === root()?.id),
  )
  createEffect(
    on(
      () => props.project.expanded,
      (value) => setState("expanded", value),
      { defer: true },
    ),
  )
  const load = async (limit = state.limit) => {
    setState({ loading: true, failed: false })
    await Promise.all(directories().map((dir) => props.context.sync.project.loadSessions(dir, { limit }))).catch(() =>
      setState("failed", true),
    )
    setState("loading", false)
  }
  createEffect(
    on([active, () => props.sessionID], ([value]) => {
      if (value) setState("expanded", true)
    }),
  )
  createEffect(
    on(
      () => state.expanded,
      (value) => {
        if (value) void load()
      },
    ),
  )
  return (
    <section data-component="project-group" data-project={base64Encode(props.project.worktree)} data-active={active()}>
      <div class="sidebar-project-heading">
        <TooltipV2 value={language.t("dialog.project.edit.title")} placement="right">
          <button
            type="button"
            class="sidebar-project-logo"
            data-action="project-edit"
            aria-label={language.t("dialog.project.edit.title")}
            aria-describedby={`${id}-name`}
            onClick={async () => {
              const { DialogEditProjectV2 } = await import("@/components/dialog-edit-project-v2")
              props.onNavigate()
              dialog.show(() => <DialogEditProjectV2 server={props.context.sdk.server} project={props.project} />)
            }}
          >
            <ProjectAvatar
              fallback={displayName(props.project)}
              src={getProjectAvatarSource(props.project.id, props.project.icon)}
              variant={getProjectAvatarVariant(props.project.icon?.color ?? "blue")}
            />
            <span class="sidebar-logo-edit">
              <Icon name="edit" size="small" />
            </span>
          </button>
        </TooltipV2>
        <button
          type="button"
          data-action="project-toggle"
          aria-expanded={state.expanded}
          aria-controls={id}
          class="sidebar-project-toggle"
          onClick={() => {
            setState("expanded", !state.expanded)
            if (state.expanded) props.context.projects.expand(props.project.worktree)
            if (!state.expanded) props.context.projects.collapse(props.project.worktree)
          }}
        >
          <span id={`${id}-name`} title={props.project.worktree}>
            {displayName(props.project)}
          </span>
          <Icon name="chevron-down" size="small" class="sidebar-chevron" classList={{ collapsed: !state.expanded }} />
        </button>
        <button
          type="button"
          class="sidebar-icon sidebar-project-new"
          aria-label={language.t("sidebar.newChat")}
          onClick={props.newChat}
        >
          <Icon name="plus" size="small" />
        </button>
      </div>
      <div id={id} hidden={!state.expanded} class="sidebar-project-chats">
        <For each={drafts()}>
          {(draft) => <SidebarDraft draft={draft} context={props.context} onNavigate={props.onNavigate} />}
        </For>
        <For each={visible()}>
          {(session) => (
            <SidebarSession
              session={session}
              context={props.context}
              activeID={props.sessionID}
              ancestors={[]}
              onNavigate={props.onNavigate}
            />
          )}
        </For>
        <Show when={state.loading}>
          <p class="sidebar-hint" role="status">
            {language.t("common.loading")}
          </p>
        </Show>
        <Show when={state.failed}>
          <button type="button" class="sidebar-hint" onClick={() => void load()}>
            {language.t("wsl.onboarding.refresh")}
          </button>
        </Show>
        <Show when={!state.loading && !state.failed && sessions().length === 0 && drafts().length === 0}>
          <button type="button" class="sidebar-hint" onClick={props.newChat}>
            {language.t("sidebar.newChat")}
          </button>
        </Show>
        <Show
          when={
            sessions().length > state.limit ||
            stores().some((store) => store.sessionTotal > sortedRootSessions(store, Date.now()).length)
          }
        >
          <button
            type="button"
            class="sidebar-hint"
            disabled={state.loading}
            onClick={() => {
              setState("limit", state.limit + 20)
              void load(state.limit)
            }}
          >
            {language.t("sidebar.showMore")}
          </button>
        </Show>
      </div>
    </section>
  )
}

function AppUsageActivity(props: { context: ServerCtx; sessions: Session[] }) {
  const language = useLanguage()
  const [state, setState] = createStore({
    loading: false,
    loaded: false,
    failed: false,
    providers: [] as { id: string; tokens: number; cost: number }[],
  })
  const format = createMemo(
    () => new Intl.NumberFormat(language.intl(), { notation: "compact", maximumFractionDigits: 1 }),
  )
  const date = createMemo(() => new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric" }))
  const days = createMemo(() => usageActivity(props.sessions))
  const total = createMemo(() => days().reduce((sum, day) => sum + day.tokens, 0))
  const label = () => `${format().format(total())} ${language.t("context.usage.tokens")}`
  const money = (value: number) =>
    new Intl.NumberFormat(language.intl(), { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(
      value,
    )
  const loadProviders = async () => {
    if (state.loading || state.loaded) return
    setState({ loading: true, failed: false })
    const result = await (async () => {
      if ((await props.context.sdk.protocol) !== "v2") return []
      const messages = await Promise.all(
        props.sessions.map((session) =>
          props.context.sdk.api.message
            .list({ sessionID: session.id, order: "asc", limit: 100 })
            .catch(() => ({ data: [] })),
        ),
      )
      const providers = new Map<string, { tokens: number; cost: number }>()
      messages
        .flatMap((result) => result.data)
        .forEach((message) => {
          if (message.type !== "assistant") return
          const current = providers.get(message.model.providerID) ?? { tokens: 0, cost: 0 }
          const tokens = message.tokens
          current.tokens +=
            (tokens?.input ?? 0) +
            (tokens?.output ?? 0) +
            (tokens?.reasoning ?? 0) +
            (tokens?.cache.read ?? 0) +
            (tokens?.cache.write ?? 0)
          current.cost += message.cost ?? 0
          providers.set(message.model.providerID, current)
        })
      return Array.from(providers, ([id, usage]) => ({ id, ...usage })).sort((a, b) => b.tokens - a.tokens)
    })().catch(() => undefined)
    if (!result) {
      setState({ loading: false, failed: true })
      return
    }
    setState({ loading: false, loaded: true, providers: result })
  }

  return (
    <Popover
      placement="right-start"
      modal
      title={language.t("context.stats.totalTokens")}
      class="sidebar-usage-popover sidebar-project-activity-popover"
      triggerAs="button"
      triggerProps={{
        type: "button",
        class: "sidebar-app-usage",
        "aria-label": label(),
        onClick: () => void loadProviders(),
      }}
      trigger={
        <>
          <span class="sidebar-project-activity-preview" aria-hidden="true">
            <For each={days().slice(-6)}>{(day) => <span data-level={day.level} />}</For>
          </span>
          <span>{language.t("context.stats.totalTokens")}</span>
          <strong>{format().format(total())}</strong>
          <Icon name="chevron-right" size="small" />
        </>
      }
    >
      <div class="sidebar-project-activity-details">
        <div class="sidebar-usage-total">
          <strong>{format().format(total())}</strong>
          <span>{language.t("context.usage.tokens")}</span>
        </div>
        <div class="sidebar-project-activity-grid" role="img" aria-label={label()}>
          <For each={days()}>
            {(day) => (
              <span
                data-level={day.level}
                title={`${date().format(day.date)}: ${format().format(day.tokens)} ${language.t("context.usage.tokens")}`}
                aria-hidden="true"
                style={{ "--activity-delay": `${day.level * 18}ms` }}
              />
            )}
          </For>
        </div>
        <Show when={state.loading}>
          <p class="sidebar-hint" role="status">
            {language.t("common.loading")}
          </p>
        </Show>
        <Show when={state.loaded}>
          <dl class="sidebar-app-usage-providers">
            <For each={state.providers}>
              {(provider) => (
                <div>
                  <dt>{provider.id}</dt>
                  <dd>
                    {format().format(provider.tokens)} {language.t("context.usage.tokens")} · {money(provider.cost)}
                  </dd>
                </div>
              )}
            </For>
          </dl>
        </Show>
        <Show when={state.failed}>
          <p class="sidebar-hint">{language.t("common.requestFailed")}</p>
        </Show>
      </div>
    </Popover>
  )
}

function SidebarDraft(props: { draft: Extract<Tab, { type: "draft" }>; context: ServerCtx; onNavigate: () => void }) {
  const language = useLanguage()
  const layout = useLayout()
  const tabs = useTabs()
  const prompt = createMemo(() =>
    createTabPromptState(tabs, props.draft, props.context.sdk.scope, { draftID: props.draft.draftID }),
  )
  const title = createMemo(
    () =>
      prompt()
        .current()
        .filter((part) => part.type === "text")
        .map((part) => part.content)
        .join(" ")
        .trim() || language.t("command.session.new"),
  )
  const active = () => {
    const route = layout.route()
    return route.type === "draft" && route.draftID === props.draft.draftID
  }
  return (
    <div class="sidebar-chat-row" data-selected={active()}>
      <span class="sidebar-disclosure" aria-hidden="true">
        <Icon name="edit" size="small" />
      </span>
      <A
        href={draftHref(props.draft.draftID)}
        data-draft-id={props.draft.draftID}
        aria-current={active() ? "page" : undefined}
        class="sidebar-chat-link"
        title={title()}
        onClick={props.onNavigate}
      >
        <span class="sidebar-chat-title">{title()}</span>
      </A>
    </div>
  )
}

function SidebarSession(props: {
  session: Session
  context: ServerCtx
  activeID?: string
  ancestors: string[]
  onNavigate: () => void
}) {
  const language = useLanguage()
  const notification = useNotification()
  const id = createUniqueId()
  const [state, setState] = createStore({
    expanded: false,
    loading: false,
    loaded: false,
    failed: false,
    cursor: undefined as string | undefined,
    latest: undefined as SessionMessageInfo | undefined,
  })
  const key = () => ServerConnection.key(props.context.sdk.server)
  const known = createMemo(() =>
    Object.values(props.context.sync.session.data.info).filter((item): item is Session => !!item),
  )
  const children = createMemo(() =>
    known()
      .filter(
        (item) =>
          item.parentID === props.session.id &&
          !item.time.archived &&
          !props.ancestors.includes(item.id) &&
          item.id !== props.session.id,
      )
      .sort((a, b) => a.time.created - b.time.created),
  )
  const requests = createMemo(
    () =>
      sessionPermissionRequest(known(), props.context.sync.session.data.permission, props.session.id) ||
      sessionQuestionRequest(known(), props.context.sync.session.data.question, props.session.id),
  )
  const status = createMemo(() => {
    if (requests()) return "waiting"
    if (props.context.sync.session.data.session_working(props.session.id)) return "working"
    if (props.session.parentID)
      return sidebarOutcome(props.context.sync.session.data.session_message[props.session.id]?.at(-1) ?? state.latest)
    const notices = notification.ensureServerState(key()).session
    if (notices.unseenHasError(props.session.id)) return "failed"
    if (notices.all(props.session.id).some((item) => item.type === "turn-complete")) return "complete"
    return "idle"
  })
  createEffect(
    on(
      () => props.context.sync.session.data.session_working(props.session.id),
      (working) => {
        if (!props.session.parentID || working) return
        let stale = false
        onCleanup(() => {
          stale = true
        })
        void props.context.sdk.protocol
          .then(async (protocol) => {
            if (protocol !== "v2") return
            const result = await props.context.sdk.api.message.list({
              sessionID: props.session.id,
              order: "desc",
              limit: 1,
            })
            if (!stale) setState("latest", result.data[0])
          })
          .catch(() => {})
      },
    ),
  )
  const statusLabel = () => {
    if (status() === "working") return language.t("ui.sessionTurn.status.thinking")
    if (status() === "failed") return language.t("notification.session.error.title")
    if (status() === "waiting")
      return language.t(
        sessionPermissionRequest(known(), props.context.sync.session.data.permission, props.session.id)
          ? "notification.permission.title"
          : "notification.question.title",
      )
    return language.t("notification.session.responseReady.title")
  }
  const unread = () => notification.ensureServerState(key()).session.unseenCount(props.session.id) > 0
  const load = async (cursor?: string) => {
    if (state.loading) return
    setState({ loading: true, failed: false })
    const result = await (async () => {
      if ((await props.context.sdk.protocol) === "v1") {
        const result = await props.context.sdk.client.session.children({
          sessionID: props.session.id,
          directory: props.session.directory,
        })
        return { data: result.data ?? [], cursor: undefined }
      }
      const result = await props.context.sdk.api.session.list({
        parentID: props.session.id,
        limit: 50,
        order: "asc",
        cursor,
      })
      return { data: result.data.map(normalizeSessionInfo), cursor: result.cursor.next }
    })().catch(() => undefined)
    if (result) {
      result.data.filter((item) => item.parentID === props.session.id).forEach(props.context.sync.session.remember)
      setState({ loaded: true, cursor: result.cursor ?? undefined })
    }
    setState({ loading: false, failed: !result })
  }
  createEffect(() => {
    if (!props.activeID || props.activeID === props.session.id) return
    if (sidebarAncestors(props.activeID, known()).includes(props.session.id)) setState("expanded", true)
  })
  createEffect(
    on(
      () => state.expanded,
      (value) => {
        if (value) void load()
      },
    ),
  )
  return (
    <div class="sidebar-chat-branch" data-child={props.ancestors.length > 0}>
      <div class="sidebar-chat-row" data-selected={props.activeID === props.session.id}>
        <button
          type="button"
          data-action="session-children-toggle"
          class="sidebar-disclosure"
          aria-label={language.t(state.expanded ? "session.todo.collapse" : "session.todo.expand")}
          aria-describedby={`${id}-title`}
          aria-expanded={state.expanded}
          aria-controls={id}
          disabled={props.ancestors.length >= 8}
          onClick={() => setState("expanded", !state.expanded)}
        >
          <Icon name="chevron-down" size="small" class="sidebar-chevron" classList={{ collapsed: !state.expanded }} />
        </button>
        <A
          href={sessionHref(key(), props.session.id)}
          data-session-id={props.session.id}
          aria-current={props.activeID === props.session.id ? "page" : undefined}
          class="sidebar-chat-link"
          title={sessionTitle(props.session.title)}
          onClick={props.onNavigate}
        >
          <span id={`${id}-title`} class="sidebar-chat-title">
            {sessionTitle(props.session.title)}
          </span>
          <Show when={status() !== "idle"}>
            <span
              class="sidebar-chat-status"
              data-status={status()}
              role="img"
              aria-label={statusLabel()}
              title={statusLabel()}
            />
          </Show>
          <Show when={unread() && props.activeID !== props.session.id}>
            <span class="sidebar-unread" role="img" aria-label={statusLabel()} />
          </Show>
        </A>
        <SidebarUsage
          session={props.context.sync.session.get(props.session.id) ?? props.session}
          sessions={known()}
          titleID={`${id}-title`}
        />
      </div>
      <Show when={state.expanded}>
        <div id={id} class="sidebar-child-chats">
          <For each={children()}>
            {(child) => (
              <SidebarSession
                session={child}
                context={props.context}
                activeID={props.activeID}
                ancestors={[...props.ancestors, props.session.id]}
                onNavigate={props.onNavigate}
              />
            )}
          </For>
          <Show when={state.loading}>
            <p class="sidebar-hint" role="status">
              {language.t("common.loading")}
            </p>
          </Show>
          <Show when={state.failed}>
            <button type="button" class="sidebar-hint" onClick={() => void load(state.cursor)}>
              {language.t("wsl.onboarding.refresh")}
            </button>
          </Show>
          <Show when={state.loaded && !state.loading && children().length === 0}>
            <p class="sidebar-hint">{language.t("home.sessions.empty")}</p>
          </Show>
          <Show when={state.cursor}>
            <button type="button" class="sidebar-hint" disabled={state.loading} onClick={() => void load(state.cursor)}>
              {language.t("sidebar.showMore")}
            </button>
          </Show>
        </div>
      </Show>
    </div>
  )
}

function SidebarUsage(props: { session: Session; sessions: Session[]; titleID: string }) {
  const language = useLanguage()
  const [state, setState] = createStore({ tick: false })
  let initialized = false
  let previous: number | undefined
  let frame: number | undefined
  let timer: number | undefined
  const format = createMemo(
    () => new Intl.NumberFormat(language.intl(), { notation: "compact", maximumFractionDigits: 1 }),
  )
  const usage = createMemo(() => sidebarSessionUsage(props.session.id, props.sessions))
  const total = () => {
    if (usage().tokenizedSessions === 0) return undefined
    return usage().input + usage().output + usage().reasoning + usage().cacheRead + usage().cacheWrite
  }
  const number = (value: number | undefined) => (value === undefined ? "—" : value.toLocaleString(language.intl()))
  const compact = () => {
    const value = total()
    return value === undefined ? "—" : format().format(value)
  }
  createEffect(() => {
    const value = total()
    if (!initialized) {
      initialized = true
      previous = value
      return
    }
    if (value === previous) return
    previous = value
    setState("tick", false)
    if (frame) cancelAnimationFrame(frame)
    if (timer) window.clearTimeout(timer)
    frame = requestAnimationFrame(() => {
      setState("tick", true)
      timer = window.setTimeout(() => setState("tick", false), 1000)
    })
  })
  onCleanup(() => {
    if (frame) cancelAnimationFrame(frame)
    if (timer) window.clearTimeout(timer)
  })
  return (
    <div class="sidebar-usage-control" data-session-usage={props.session.id}>
      <Popover
        placement="right-start"
        modal
        title={language.t("context.stats.totalTokens")}
        class="sidebar-usage-popover"
        triggerAs="button"
        triggerProps={{
          type: "button",
          class: "sidebar-usage",
          "aria-label": `${language.t("context.stats.totalTokens")}: ${number(total())}`,
          "aria-describedby": props.titleID,
        }}
        trigger={
          <>
            <span class="sidebar-usage-value" classList={{ tick: state.tick }}>
              <Index each={compact().split("")}>
                {(character, index) => (
                  <span class="sidebar-usage-digit" style={{ "--sidebar-digit-delay": `${index * 70}ms` }}>
                    {character()}
                  </span>
                )}
              </Index>
            </span>
            <span>{language.t("context.usage.tokens")}</span>
          </>
        }
      >
        <div class="sidebar-usage-details">
          <p class="sidebar-usage-session">{sessionTitle(props.session.title)}</p>
          <div class="sidebar-usage-total">
            <strong>{number(total())}</strong>
            <span>{language.t("context.usage.tokens")}</span>
          </div>
          <dl>
            <div>
              <dt>{language.t("context.stats.inputTokens")}</dt>
              <dd>{number(usage().tokenizedSessions ? usage().input : undefined)}</dd>
            </div>
            <div>
              <dt>{language.t("context.stats.outputTokens")}</dt>
              <dd>{number(usage().tokenizedSessions ? usage().output : undefined)}</dd>
            </div>
            <div>
              <dt>{language.t("context.stats.reasoningTokens")}</dt>
              <dd>{number(usage().tokenizedSessions ? usage().reasoning : undefined)}</dd>
            </div>
            <div>
              <dt>{language.t("context.stats.cacheTokens")}</dt>
              <dd>
                {number(usage().tokenizedSessions ? usage().cacheRead : undefined)} /{" "}
                {number(usage().tokenizedSessions ? usage().cacheWrite : undefined)}
              </dd>
            </div>
            <div>
              <dt>{language.t("context.stats.totalCost")}</dt>
              <dd>
                {usage().costedSessions === 0
                  ? "—"
                  : new Intl.NumberFormat(language.intl(), {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 4,
                    }).format(usage().cost)}
              </dd>
            </div>
          </dl>
        </div>
      </Popover>
    </div>
  )
}
