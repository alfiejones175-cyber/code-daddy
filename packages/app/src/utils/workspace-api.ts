import { Schema } from "effect"
import { MCP } from "@opencode-ai/schema/mcp"
import { SessionRecovery } from "@opencode-ai/schema/session-recovery"
import type { ServerConnection } from "@/context/server"
import { authTokenFromCredentials } from "./server"

type Location = { directory: string; workspaceID?: string }

// The desktop app pins an older client. Keep new, schema-validated endpoints at
// this boundary until that client can be upgraded as a whole.
export function createWorkspaceApi(input: { server: ServerConnection.HttpBase; fetch?: typeof fetch }) {
  const request = async (method: "GET" | "POST", path: string, location: Location, body?: unknown) => {
    const url = new URL(input.server.url.replace(/\/$/, "") + path)
    url.searchParams.set("location[directory]", location.directory)
    if (location.workspaceID) url.searchParams.set("location[workspace]", location.workspaceID)
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
    if (response.status === 204) return
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
    setup: async (location: Location, preset: "browser" | "xcode") =>
      Schema.decodeUnknownSync(MCP.Info)(await request("POST", `/api/mcp/preset/${preset}`, location)),
    recovery: async (location: Location, id: string) =>
      Schema.decodeUnknownSync(SessionRecovery.Status)(
        await request("GET", `/api/session/${encodeURIComponent(id)}/recovery`, location),
      ),
    resume: async (location: Location, id: string) => {
      await request("POST", `/api/session/${encodeURIComponent(id)}/resume`, location)
    },
  }
}
