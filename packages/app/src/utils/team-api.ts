import { AgentTeam } from "@opencode-ai/schema/agent-team"
import { Schema, type Types } from "effect"
import type { ServerConnection } from "@/context/server"
import { authTokenFromCredentials } from "./server"

const settings = Schema.Struct({ data: AgentTeam.Settings })
const globalSettings = Schema.Struct({ data: AgentTeam.Settings, directory: Schema.String })

// Legacy SDK config and Solid stores use mutable arrays at their boundary.
// Clone the validated wire value without changing the public readonly schema.
export function mutableTeamSettings(input: AgentTeam.Settings) {
  return structuredClone(input) as Types.DeepMutable<AgentTeam.Settings>
}

// Keep the new team routes available while the app uses its pinned client.
export function createTeamApi(input: {
  server: ServerConnection.HttpBase
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}) {
  const request = async (path: string, directory?: string, body?: AgentTeam.Settings) => {
    const url = new URL(`${input.server.url.replace(/\/$/, "")}${path}`)
    if (directory) url.searchParams.set("location[directory]", directory)
    const response = await (input.fetch ?? globalThis.fetch)(url, {
      method: body ? "PATCH" : "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(input.server.password
          ? {
              Authorization: `Basic ${authTokenFromCredentials({ username: input.server.username, password: input.server.password })}`,
            }
          : {}),
      },
      ...(body ? { body: JSON.stringify(Schema.encodeSync(AgentTeam.Settings)(body)) } : {}),
    })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    const result: unknown = await response.json()
    return result
  }
  return {
    get: async (options?: { location?: { directory?: string } }) => {
      const result = Schema.decodeUnknownSync(settings)(await request("/api/team", options?.location?.directory))
      return { ...result, data: mutableTeamSettings(result.data) }
    },
    configGet: async () => {
      const result = Schema.decodeUnknownSync(globalSettings)(await request("/api/team/config"))
      return { ...result, data: mutableTeamSettings(result.data) }
    },
    configUpdate: async (body: AgentTeam.Settings) => {
      const result = Schema.decodeUnknownSync(globalSettings)(await request("/api/team/config", undefined, body))
      return { ...result, data: mutableTeamSettings(result.data) }
    },
  }
}

export type TeamApi = ReturnType<typeof createTeamApi>
