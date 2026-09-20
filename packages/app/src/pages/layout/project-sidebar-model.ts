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

export function sidebarSessionUsage(id: string, sessions: readonly Session[]) {
  const byID = new Map(sessions.map((session) => [session.id, session]))
  const children = sessions.reduce((result, session) => {
    if (!session.parentID) return result
    result.set(session.parentID, [...(result.get(session.parentID) ?? []), session.id])
    return result
  }, new Map<string, string[]>())
  const seen = new Set<string>()
  const visit = (sessionID: string): ReturnType<typeof own> => {
    if (seen.has(sessionID)) return own()
    seen.add(sessionID)
    return (children.get(sessionID) ?? []).reduce((total, childID) => {
      const child = visit(childID)
      return {
        input: total.input + child.input,
        output: total.output + child.output,
        reasoning: total.reasoning + child.reasoning,
        cacheRead: total.cacheRead + child.cacheRead,
        cacheWrite: total.cacheWrite + child.cacheWrite,
        cost: total.cost + child.cost,
        tokenizedSessions: total.tokenizedSessions + child.tokenizedSessions,
        costedSessions: total.costedSessions + child.costedSessions,
      }
    }, own(byID.get(sessionID)))
  }
  return visit(id)
}

function own(session?: Session) {
  return {
    input: session?.tokens?.input ?? 0,
    output: session?.tokens?.output ?? 0,
    reasoning: session?.tokens?.reasoning ?? 0,
    cacheRead: session?.tokens?.cache.read ?? 0,
    cacheWrite: session?.tokens?.cache.write ?? 0,
    cost: session?.cost ?? 0,
    tokenizedSessions: session?.tokens ? 1 : 0,
    costedSessions: session?.cost === undefined ? 0 : 1,
  }
}
