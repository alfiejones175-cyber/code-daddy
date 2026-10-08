import { Option, Schema } from "effect"
import { Workflow } from "@opencode-ai/schema/workflow"
import type { ServerConnection } from "@/context/server"
import { authTokenFromCredentials } from "./server"

const definitions = Schema.Array(Workflow.Definition)
const runs = Schema.Array(Workflow.Run)
const skillSaved = Schema.Struct({ name: Schema.String, content: Schema.String })
const declaredError = Schema.UnknownFromJsonString.pipe(
  Schema.decodeTo(
    Schema.Struct({
      _tag: Schema.Literals(["WorkflowInvalidError", "WorkflowNotFoundError", "WorkflowConflictError"]),
      message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(600)),
    }),
  ),
)

export class WorkflowRequestError extends Error {
  constructor(
    readonly tag: "WorkflowInvalidError" | "WorkflowNotFoundError" | "WorkflowConflictError",
    message: string,
  ) {
    super(message)
    this.name = "WorkflowRequestError"
  }
}

export function createWorkflowApi(input: {
  server: ServerConnection.HttpBase
  directory: string
  signal?: AbortSignal
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}) {
  const request = async (path: string, options?: { method?: string; body?: unknown }) => {
    const url = new URL(`${input.server.url.replace(/\/$/, "")}/workflow${path}`)
    url.searchParams.set("directory", input.directory)
    const response = await (input.fetch ?? globalThis.fetch)(url, {
      signal: input.signal,
      method: options?.method ?? "GET",
      headers: {
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...(input.server.password
          ? {
              Authorization: `Basic ${authTokenFromCredentials({ username: input.server.username, password: input.server.password })}`,
            }
          : {}),
      },
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
    })
    if (!response.ok) {
      const declared = await workflowRequestError(response)
      throw declared ?? new Error(`${response.status} ${response.statusText}`)
    }
    if (response.status === 204) return undefined
    return (await response.json()) as unknown
  }

  return {
    list: async () => Schema.decodeUnknownSync(definitions)(await request("")),
    save: async (definition: Workflow.Definition) =>
      Schema.decodeUnknownSync(Workflow.Definition)(await request("", { method: "PUT", body: definition })),
    remove: async (id: string) => request(`/${encodeURIComponent(id)}`, { method: "DELETE" }),
    catalog: async () => Schema.decodeUnknownSync(Workflow.Catalog)(await request("/catalog")),
    history: async (id: string) => Schema.decodeUnknownSync(runs)(await request(`/${encodeURIComponent(id)}/runs`)),
    start: async (id: string, body: { input: string }) =>
      Schema.decodeUnknownSync(Workflow.Run)(await request(`/${encodeURIComponent(id)}/run`, { method: "POST", body })),
    run: async (id: string) => Schema.decodeUnknownSync(Workflow.Run)(await request(`/run/${encodeURIComponent(id)}`)),
    approve: async (id: string, nodeID: string) =>
      request(`/run/${encodeURIComponent(id)}/approve`, { method: "POST", body: { nodeID } }),
    cancel: async (id: string) => request(`/run/${encodeURIComponent(id)}/cancel`, { method: "POST", body: {} }),
    teach: async (body: Workflow.TeachRequest) =>
      Schema.decodeUnknownSync(Workflow.SkillDraft)(await request("/teach", { method: "POST", body })),
    saveSkill: async (body: Workflow.SkillDraft) =>
      Schema.decodeUnknownSync(skillSaved)(await request("/skill", { method: "POST", body })),
    harness: async (workflowID: string, nodeID: string) =>
      Schema.decodeUnknownSync(Workflow.HarnessLab)(
        await request(`/${encodeURIComponent(workflowID)}/node/${encodeURIComponent(nodeID)}/harness`),
      ),
    saveHarness: async (workflowID: string, nodeID: string, body: Workflow.HarnessSaveRequest) =>
      Schema.decodeUnknownSync(Workflow.HarnessDraft)(
        await request(`/${encodeURIComponent(workflowID)}/node/${encodeURIComponent(nodeID)}/harness`, {
          method: "PUT",
          body,
        }),
      ),
    designHarness: async (workflowID: string, nodeID: string, body: Workflow.HarnessDesignRequest) =>
      Schema.decodeUnknownSync(Workflow.HarnessDraft)(
        await request(`/${encodeURIComponent(workflowID)}/node/${encodeURIComponent(nodeID)}/harness/design`, {
          method: "POST",
          body,
        }),
      ),
    testHarness: async (workflowID: string, nodeID: string, body: Workflow.HarnessTestRequest) =>
      Schema.decodeUnknownSync(Workflow.Run)(
        await request(`/${encodeURIComponent(workflowID)}/node/${encodeURIComponent(nodeID)}/harness/test`, {
          method: "POST",
          body,
        }),
      ),
    acceptHarness: async (workflowID: string, nodeID: string, body: Workflow.HarnessAcceptRequest) =>
      Schema.decodeUnknownSync(Workflow.Definition)(
        await request(`/${encodeURIComponent(workflowID)}/node/${encodeURIComponent(nodeID)}/harness/accept`, {
          method: "POST",
          body,
        }),
      ),
  }
}

export type WorkflowApi = ReturnType<typeof createWorkflowApi>

async function workflowRequestError(response: Response) {
  if (![400, 404, 409].includes(response.status) || !response.headers.get("Content-Type")?.includes("application/json"))
    return
  const text = await readErrorBody(response).catch(() => undefined)
  if (text === undefined) return
  const error = Schema.decodeUnknownOption(declaredError)(text)
  if (Option.isNone(error)) return
  const status = { WorkflowInvalidError: 400, WorkflowNotFoundError: 404, WorkflowConflictError: 409 }
  if (status[error.value._tag] !== response.status || !error.value.message.trim()) return
  return new WorkflowRequestError(error.value._tag, error.value.message.trim())
}

async function readErrorBody(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) return
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    size += chunk.value.byteLength
    if (size > 8192) {
      await reader.cancel()
      return
    }
    chunks.push(chunk.value)
  }
  const body = new Uint8Array(size)
  let offset = 0
  chunks.forEach((chunk) => {
    body.set(chunk, offset)
    offset += chunk.byteLength
  })
  return new TextDecoder().decode(body)
}
