import { Binary } from "@opencode-ai/core/util/binary"
import { produce, reconcile, type SetStoreFunction, type Store } from "solid-js/store"
import type { Project, Session, Todo } from "@opencode-ai/sdk/v2/client"
import type { State, VcsCache } from "./types"
import { trimSessions } from "./session-trim"
import { dropSessionCaches } from "./session-cache"

export function applyGlobalEvent(input: {
  event: { type: string; properties?: unknown }
  project: Project[]
  setGlobalProject: (next: Project[] | ((draft: Project[]) => Project[])) => void
  refresh: () => void
}) {
  if (input.event.type === "global.disposed" || input.event.type === "server.connected") {
    input.refresh()
    return
  }

  if (input.event.type !== "project.updated") return
  const properties = input.event.properties as Project
  const result = Binary.search(input.project, properties.id, (s) => s.id)
  if (result.found) {
    input.setGlobalProject(
      produce((draft) => {
        // Project updates are complete snapshots. Omitted optional fields clear
        // previous appearance values (for example an agent resetting a logo).
        draft[result.index] = properties
      }),
    )
    return
  }
  input.setGlobalProject(
    produce((draft) => {
      draft.splice(result.index, 0, properties)
    }),
  )
}

function cleanupSessionCaches(
  setStore: SetStoreFunction<State>,
  sessionID: string,
  setSessionTodo?: (sessionID: string, todos: Todo[] | undefined) => void,
) {
  if (!sessionID) return
  setSessionTodo?.(sessionID, undefined)
  setStore(
    produce((draft) => {
      dropSessionCaches(draft, [sessionID])
    }),
  )
}

export function cleanupDroppedSessionCaches(
  store: Store<State>,
  setStore: SetStoreFunction<State>,
  next: Session[],
  setSessionTodo?: (sessionID: string, todos: Todo[] | undefined) => void,
) {
  const keep = new Set(next.map((item) => item.id))
  const stale = [
    ...Object.keys(store.message),
    ...Object.keys(store.session_diff),
    ...Object.keys(store.todo),
    ...Object.keys(store.permission),
    ...Object.keys(store.question),
    ...Object.keys(store.session_status),
    ...Object.values(store.part)
      .map((parts) => parts?.find((part) => !!part?.sessionID)?.sessionID)
      .filter((sessionID): sessionID is string => !!sessionID),
  ].filter((sessionID, index, list) => !keep.has(sessionID) && list.indexOf(sessionID) === index)
  if (stale.length === 0) return
  for (const sessionID of stale) {
    setSessionTodo?.(sessionID, undefined)
  }
  setStore(
    produce((draft) => {
      dropSessionCaches(draft, stale)
    }),
  )
}

export function applyDirectoryEvent(input: {
  event: { type: string; properties?: unknown }
  store: Store<State>
  setStore: SetStoreFunction<State>
  push: (directory: string) => void
  directory: string
  loadLsp: () => void
  loadReferences?: () => void
  vcsCache?: VcsCache
  setSessionTodo?: (sessionID: string, todos: Todo[] | undefined) => void
  retainedLimit?: number
  permission?: State["permission"]
}) {
  const event = input.event
  const limit = Math.max(input.store.limit, input.retainedLimit ?? 0)
  switch (event.type) {
    case "server.instance.disposed": {
      input.push(input.directory)
      return
    }
    case "session.created": {
      const info = (event.properties as { info: Session }).info
      const result = Binary.search(input.store.session, info.id, (s) => s.id)
      if (result.found) {
        input.setStore("session", result.index, reconcile(info))
        break
      }
      const next = input.store.session.slice()
      next.splice(result.index, 0, info)
      const trimmed = trimSessions(next, { limit, permission: input.permission ?? input.store.permission })
      input.setStore("session", reconcile(trimmed, { key: "id" }))
      cleanupDroppedSessionCaches(input.store, input.setStore, trimmed, input.setSessionTodo)
      if (!info.parentID) input.setStore("sessionTotal", (value) => value + 1)
      break
    }
    case "session.updated": {
      const info = (event.properties as { info: Session }).info
      const result = Binary.search(input.store.session, info.id, (s) => s.id)
      if (info.time.archived) {
        if (!result.found) break
        if (input.store.session[result.index]!.time.archived === info.time.archived) break
        input.setStore(
          "session",
          produce((draft) => {
            draft.splice(result.index, 1)
          }),
        )
        cleanupSessionCaches(input.setStore, info.id, input.setSessionTodo)
        if (info.parentID) break
        input.setStore("sessionTotal", (value) => Math.max(0, value - 1))
        break
      }
      if (result.found) {
        input.setStore("session", result.index, reconcile(info))
        break
      }
      const next = input.store.session.slice()
      next.splice(result.index, 0, info)
      const trimmed = trimSessions(next, { limit, permission: input.permission ?? input.store.permission })
      input.setStore("session", reconcile(trimmed, { key: "id" }))
      cleanupDroppedSessionCaches(input.store, input.setStore, trimmed, input.setSessionTodo)
      break
    }
    case "session.deleted": {
      const properties = event.properties as { sessionID?: string; info?: Session }
      const sessionID = properties.info?.id ?? properties.sessionID
      if (!sessionID) break
      const result = Binary.search(input.store.session, sessionID, (s) => s.id)
      const info = properties.info ?? (result.found ? input.store.session[result.index] : undefined)
      if (result.found) {
        input.setStore(
          "session",
          produce((draft) => {
            draft.splice(result.index, 1)
          }),
        )
      }
      cleanupSessionCaches(input.setStore, sessionID, input.setSessionTodo)
      if (info?.parentID) break
      input.setStore("sessionTotal", (value) => Math.max(0, value - 1))
      break
    }
    case "session.renamed": {
      const properties = event.properties as { sessionID: string; title: string }
      const result = Binary.search(input.store.session, properties.sessionID, (session) => session.id)
      if (!result.found) break
      input.setStore("session", result.index, (session) => ({
        ...session,
        title: properties.title,
        time: { ...session.time, updated: Date.now() },
      }))
      break
    }
    case "session.usage.updated": {
      const properties = event.properties as Pick<Session, "cost" | "tokens"> & { sessionID: string }
      const result = Binary.search(input.store.session, properties.sessionID, (session) => session.id)
      if (!result.found) break
      input.setStore("session", result.index, (session) => ({
        ...session,
        cost: properties.cost,
        tokens: properties.tokens,
      }))
      break
    }
    case "session.moved": {
      const properties = event.properties as {
        sessionID: string
        location: { directory: string; workspaceID?: string }
        projectID?: string
        subpath?: string
      }
      const result = Binary.search(input.store.session, properties.sessionID, (session) => session.id)
      if (!result.found) break
      if (properties.location.directory === input.directory) {
        input.setStore("session", result.index, (session) => ({
          ...session,
          projectID: properties.projectID ?? session.projectID,
          workspaceID: properties.location.workspaceID,
          directory: properties.location.directory,
          path: properties.subpath,
          time: { ...session.time, updated: Date.now() },
        }))
        break
      }
      const info = input.store.session[result.index]
      input.setStore(
        "session",
        produce((draft) => void draft.splice(result.index, 1)),
      )
      if (!info?.parentID) input.setStore("sessionTotal", (value) => Math.max(0, value - 1))
      break
    }
    case "vcs.branch.updated": {
      const props = event.properties as { branch?: string }
      if (input.store.vcs?.branch === props.branch) break
      const next = { ...input.store.vcs, branch: props.branch }
      input.setStore("vcs", next)
      if (input.vcsCache) input.vcsCache.setStore("value", next)
      break
    }
    case "lsp.updated": {
      input.loadLsp()
      break
    }
    case "reference.updated": {
      input.loadReferences?.()
      break
    }
  }
}
