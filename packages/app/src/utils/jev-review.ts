import type { ServerConnection } from "@/context/server"
import { authTokenFromCredentials } from "./server"

export type JevAssessment = "supported" | "concern" | "insufficient_evidence"
export type JevCriterion = "requirements" | "checks" | "completion" | "errors"
export type JevReviewResult =
  | {
      status: "ok"
      advisory: true
      rubricVersion: string
      model: string
      questionVersion: string
      responseDigest: string
      evidenceDigest: string
      findings: Array<{ criterion: JevCriterion; assessment: JevAssessment; evidenceID?: string }>
    }
  | { status: "unavailable"; reason: string; message: string }
  | { status: "invalid_input"; reason: string; message: string }

export type JevReviewState = {
  status: "not_reviewed" | "reviewed" | "stale"
  responseDigest: string
  review: null | {
    createdAt: number
    responseDigest: string
    requirements: string[]
    evidence: Array<{ id: string; text: string; url?: string }>
    result: JevReviewResult
  }
}

export async function requestJevReview(input: {
  server: ServerConnection.HttpBase
  directory: string
  sessionID: string
  messageID: string
  payload?: { requirements: string[]; evidence: Array<{ id: string; text: string; url?: string }> }
  signal?: AbortSignal
  fetch?: typeof globalThis.fetch
}): Promise<JevReviewState> {
  const url = new URL(`${input.server.url.replace(/\/$/, "")}/session/${encodeURIComponent(input.sessionID)}/jev-review/${encodeURIComponent(input.messageID)}`)
  const response = await (input.fetch ?? globalThis.fetch)(url, {
    method: input.payload ? "POST" : "GET",
    signal: input.signal,
    headers: {
      "x-opencode-directory": encodeURIComponent(input.directory),
      ...(input.payload ? { "Content-Type": "application/json" } : {}),
      ...(input.server.password ? {
        Authorization: `Basic ${authTokenFromCredentials({ username: input.server.username, password: input.server.password })}`,
      } : {}),
    },
    ...(input.payload ? { body: JSON.stringify(input.payload) } : {}),
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  const body = await response.json()
  const state = body && typeof body === "object" && "data" in body ? body.data : body
  if (!state || typeof state !== "object" || !("status" in state) || !("responseDigest" in state))
    throw new Error("Invalid Jev review response")
  return state as JevReviewState
}
