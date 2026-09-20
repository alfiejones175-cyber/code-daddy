import type { Project } from "@opencode-ai/sdk/v2/client"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { OpenCode, type OpenCodeClient } from "@opencode-ai/client/promise"
import type { ServerConnection } from "@/context/server"
import { decode64 } from "@/utils/base64"
import { currentIntegrationFetch } from "./integration-fetch"

export function authTokenFromCredentials(input: { username?: string; password: string }) {
  return btoa(`${input.username ?? "opencode"}:${input.password}`)
}

export function authFromToken(token: string | null) {
  const decoded = decode64(token ?? undefined)
  if (!decoded) return
  const separator = decoded.indexOf(":")
  if (separator === -1) return
  return {
    username: decoded.slice(0, separator) || "opencode",
    password: decoded.slice(separator + 1),
  }
}

export function createSdkForServer({
  server,
  ...config
}: Omit<NonNullable<Parameters<typeof createOpencodeClient>[0]>, "baseUrl"> & {
  server: ServerConnection.HttpBase
}) {
  const auth = (() => {
    if (!server.password) return
    return {
      Authorization: `Basic ${authTokenFromCredentials({ username: server.username, password: server.password })}`,
    }
  })()

  return createOpencodeClient({
    ...config,
    headers: {
      ...(config.headers instanceof Headers ? Object.fromEntries(config.headers.entries()) : config.headers),
      ...auth,
    },
    baseUrl: server.url,
  })
}

export function createApiForServer(input: {
  server: ServerConnection.HttpBase
  fetch?: typeof globalThis.fetch
}): OpenCodeClient {
  return OpenCode.make({
    baseUrl: input.server.url,
    fetch: currentIntegrationFetch(input.fetch ?? globalThis.fetch),
    headers: input.server.password
      ? {
          Authorization: `Basic ${authTokenFromCredentials({
            username: input.server.username,
            password: input.server.password,
          })}`,
        }
      : undefined,
  })
}

export type ServerApi = OpenCodeClient

// This endpoint is newer than the vendored app client. Keep authentication and
// location scoping at the transport boundary until the next client release.
export async function updateProjectAppearance(input: {
  server: ServerConnection.HttpBase
  directory: string
  body: { name: string; icon: { url?: string; color: string; override: string }; commands: { start: string } }
  fetch?: typeof globalThis.fetch
}) {
  const url = new URL(`${input.server.url.replace(/\/$/, "")}/api/project/current/appearance`)
  const response = await (input.fetch ?? globalThis.fetch)(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-opencode-directory": encodeURIComponent(input.directory),
      ...(input.server.password
        ? {
            Authorization: `Basic ${authTokenFromCredentials({ username: input.server.username, password: input.server.password })}`,
          }
        : {}),
    },
    body: JSON.stringify(input.body),
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  const result = (await response.json()) as { data: Project }
  return result.data
}
