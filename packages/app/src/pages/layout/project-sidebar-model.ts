import type { SessionMessageInfo } from "@opencode-ai/client/promise"
import type { Session } from "@opencode-ai/sdk/v2/client"

export function sidebarAncestors(id: string | undefined, sessions: readonly Session[]) {
  const map = new Map(sessions.map((session) => [session.id, session]))
  const seen = new Set<string>()
  const visit = (current: string | undefined): string[] => {
    if (!current || seen.has(current)) return []
    seen.add(current)
    const parent = map.get(current)?.parentID
    return parent ? [parent, ...visit(parent)] : []
  }
  return visit(id)
}

export function sidebarOutcome(message: SessionMessageInfo | undefined) {
  if (message?.type !== "assistant") return "idle"
  if (message.error || message.finish === "error" || message.finish === "content-filter") return "failed"
  if (message.time.completed && message.finish === "stop") return "complete"
  return "idle"
}
