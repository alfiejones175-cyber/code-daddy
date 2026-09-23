import { Schema } from "effect"
import { MCP } from "@opencode-ai/schema/mcp"
import { Routine } from "@opencode-ai/schema/routine"
import { SessionGoal } from "@opencode-ai/schema/session-goal"
import { SessionRecovery } from "@opencode-ai/schema/session-recovery"
import type { ServerConnection } from "@/context/server"
import { authTokenFromCredentials } from "./server"

type Location = { directory: string; workspaceID?: string }
const QueueItem = Schema.Struct({ id: Schema.String, order: Schema.Number, text: Schema.String })

// The desktop app pins an older client. Keep new, schema-validated endpoints at
// this boundary until that client can be upgraded as a whole.
export function createWorkspaceApi(input: { server: ServerConnection.HttpBase; fetch?: typeof fetch }) {
  const request = async (method: "GET" | "POST" | "DELETE", path: string, location?: Location, body?: unknown) => {
    const url = new URL(input.server.url.replace(/\/$/, "") + path)
    if (location) {
      url.searchParams.set("location[directory]", location.directory)
      if (location.workspaceID) url.searchParams.set("location[workspace]", location.workspaceID)
    }
    const headers = new Headers()
    if (input.server.password)
      headers.set(
        "Authorization",
        `Basic ${authTokenFromCredentials({ username: input.server.username, password: input.server.password })}`,
      )
    if (body !== undefined) headers.set("Content-Type", "application/json")
    const response = await (input.fetch ?? globalThis.fetch)(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if (response.status === 204) return undefined
    const result: unknown = await response.json()
    return result && typeof result === "object" && "data" in result ? result.data : result
  }

  return {
    capabilities: async (location: Location) =>
      Schema.decodeUnknownSync(Schema.Array(MCP.Info))(await request("GET", "/api/mcp", location)),
    test: async (location: Location, id: string) =>
      Schema.decodeUnknownSync(MCP.Info)(await request("POST", `/api/mcp/${encodeURIComponent(id)}/test`, location)),
    reconnect: async (location: Location, id: string) =>
      Schema.decodeUnknownSync(MCP.Info)(
        await request("POST", `/api/mcp/${encodeURIComponent(id)}/reconnect`, location),
      ),
    disconnect: async (location: Location, id: string) =>
      Schema.decodeUnknownSync(MCP.Info)(
        await request("POST", `/api/mcp/${encodeURIComponent(id)}/disconnect`, location),
      ),
    routines: async () => Schema.decodeUnknownSync(Schema.Array(Routine.Info))(await request("GET", "/api/routine")),
    createRoutine: async (value: Routine.Create) =>
      Schema.decodeUnknownSync(Routine.Info)(await request("POST", "/api/routine", undefined, value)),
    pauseRoutine: async (id: Routine.ID) =>
      Schema.decodeUnknownSync(Routine.Info)(await request("POST", `/api/routine/${encodeURIComponent(id)}/pause`)),
    resumeRoutine: async (id: Routine.ID) =>
      Schema.decodeUnknownSync(Routine.Info)(await request("POST", `/api/routine/${encodeURIComponent(id)}/resume`)),
    deleteRoutine: async (id: Routine.ID) => {
      await request("DELETE", `/api/routine/${encodeURIComponent(id)}`)
    },
    routineRuns: async (id: Routine.ID) =>
      Schema.decodeUnknownSync(Schema.Array(Routine.Run))(
        await request("GET", `/api/routine/${encodeURIComponent(id)}/run`),
      ),
    setup: async (location: Location, preset: "browser" | "xcode" | "openai-docs" | "github") =>
      Schema.decodeUnknownSync(MCP.Info)(await request("POST", `/api/mcp/preset/${preset}`, location)),
    addRemote: async (location: Location, input: { name: string; url: string }) =>
      Schema.decodeUnknownSync(MCP.Info)(await request("POST", "/api/mcp/remote", location, input)),
    remove: async (location: Location, id: string) =>
      Schema.decodeUnknownSync(MCP.Info)(await request("DELETE", `/api/mcp/${encodeURIComponent(id)}`, location)),
    goal: async (location: Location, id: string) =>
      Schema.decodeUnknownSync(Schema.NullOr(SessionGoal.Info))(
        await request("GET", `/api/session/${encodeURIComponent(id)}/goal`, location),
      ),
    setGoal: async (location: Location, id: string, value: SessionGoal.Set) =>
      Schema.decodeUnknownSync(SessionGoal.Info)(
        await request("POST", `/api/session/${encodeURIComponent(id)}/goal`, location, value),
      ),
    pauseGoal: async (location: Location, id: string) =>
      Schema.decodeUnknownSync(SessionGoal.Info)(
        await request("POST", `/api/session/${encodeURIComponent(id)}/goal/pause`, location),
      ),
    resumeGoal: async (location: Location, id: string) =>
      Schema.decodeUnknownSync(SessionGoal.Info)(
        await request("POST", `/api/session/${encodeURIComponent(id)}/goal/resume`, location),
      ),
    completeGoal: async (location: Location, id: string, evidence: string) =>
      Schema.decodeUnknownSync(SessionGoal.Info)(
        await request("POST", `/api/session/${encodeURIComponent(id)}/goal/complete`, location, { evidence }),
      ),
    clearGoal: async (location: Location, id: string) => {
      await request("POST", `/api/session/${encodeURIComponent(id)}/goal/clear`, location)
    },
    queued: async (location: Location, id: string) =>
      Schema.decodeUnknownSync(Schema.Array(QueueItem))(
        await request("GET", `/api/session/${encodeURIComponent(id)}/queue`, location),
      ),
    cancelQueued: async (location: Location, id: string, messageID: string) => {
      await request("DELETE", `/api/session/${encodeURIComponent(id)}/queue/${encodeURIComponent(messageID)}`, location)
    },
    recovery: async (location: Location, id: string) =>
      Schema.decodeUnknownSync(SessionRecovery.Status)(
        await request("GET", `/api/session/${encodeURIComponent(id)}/recovery`, location),
      ),
    resume: async (location: Location, id: string) => {
      await request("POST", `/api/session/${encodeURIComponent(id)}/resume`, location)
    },
  }
}
