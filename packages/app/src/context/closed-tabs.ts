import type { SessionTab, Tab } from "./tabs"

export type ClosedTab = {
  tab: Tab
  index: number
}

const CLOSED_TAB_LIMIT = 25

export function pushClosedTab(stack: ClosedTab[], tab: Tab, index: number): ClosedTab[] {
  return [...stack, { tab: { ...tab }, index }].slice(-CLOSED_TAB_LIMIT)
}

// Pops the most recently closed tab that is not open again,
// discarding stale entries along the way.
export function takeClosedTab(stack: ClosedTab[], tabs: Tab[]): { entry?: ClosedTab; stack: ClosedTab[] } {
  const remaining = [...stack]
  while (remaining.length) {
    const entry = remaining.pop()
    if (entry && !isOpen(tabs, entry.tab)) return { entry, stack: remaining }
  }
  return { stack: remaining }
}

export function removeClosedTabs(stack: ClosedTab[], server: SessionTab["server"], sessionIDs: string[]) {
  const removed = new Set(sessionIDs)
  return stack.filter(
    (entry) => entry.tab.server !== server || entry.tab.type !== "session" || !removed.has(entry.tab.sessionId),
  )
}

export function removeClosedServerTabs(stack: ClosedTab[], server: SessionTab["server"]) {
  return {
    draftIDs: stack.flatMap((entry) =>
      entry.tab.type === "draft" && entry.tab.server === server ? [entry.tab.draftID] : [],
    ),
    stack: stack.filter((entry) => entry.tab.server !== server),
  }
}

export function nextTabAfterClose(tabs: Tab[], index: number, active: boolean) {
  if (!active) return undefined
  return tabs[index + 1] ?? tabs[index - 1] ?? null
}

function isOpen(tabs: Tab[], tab: Tab) {
  if (tab.type === "draft") return tabs.some((item) => item.type === "draft" && item.draftID === tab.draftID)
  return tabs.some((item) => item.type === "session" && item.server === tab.server && item.sessionId === tab.sessionId)
}
