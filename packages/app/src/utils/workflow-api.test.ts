import { afterEach, expect, test } from "bun:test"
import { createServer, type Server } from "node:http"
import { once } from "node:events"
import type { Workflow } from "@opencode-ai/schema/workflow"
import { createWorkflowApi, WorkflowRequestError } from "./workflow-api"

const servers = new Set<Server>()
afterEach(() => {
  servers.forEach((server) => {
    server.closeAllConnections()
    server.close()
  })
  servers.clear()
})

test("harness transport keeps designer, execution, revision and trial acceptance identities separate", async () => {
  const spec: Workflow.HarnessSpec = {
    model: { providerID: "provider", modelID: "small-worker" },
    instructions: "Return a concise answer",
    modelReason: "Bounded task",
    allowedTools: [],
    timeoutSeconds: 30,
    maxOutputChars: 1000,
    outputFormat: "text",
    requiredJsonKeys: [],
    checklist: ["Check accuracy"],
  }
  const fingerprint = "a".repeat(64)
  const draft: Workflow.HarnessDraft = {
    revision: "revision_one",
    nodeFingerprint: fingerprint,
    goal: "Answer",
    feedback: "",
    spec,
    updatedAt: 1,
  }
  const saved = { ...draft, revision: "revision_two" }
  const definition: Workflow.Definition = {
    version: 1,
    id: "workflow_one",
    name: "Workflow",
    description: "",
    directory: "/harness project",
    updatedAt: 1,
    nodes: [
      {
        id: "task_one",
        name: "Task",
        x: 0,
        y: 0,
        kind: "task",
        prompt: "Answer",
        model: spec.model,
        skills: [],
        mcpServers: [],
        harness: { spec, fingerprint, testRunID: "trial_one", acceptedAt: 3 },
      },
    ],
    edges: [],
  }
  const run: Workflow.Run = {
    id: "trial_one",
    workflowID: definition.id,
    definition,
    input: "sample",
    status: "completed",
    steps: [{ nodeID: "task_one", status: "completed", validation: { passed: true, errors: [] } }],
    createdAt: 1,
    updatedAt: 2,
    trial: {
      nodeID: "task_one",
      revision: saved.revision,
      fingerprint,
      spec,
      outputs: { previous_step: "Sample output" },
    },
  }
  const calls: { path: string; method: string; body: unknown; directory: string | null }[] = []
  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.setHeader("Access-Control-Allow-Headers", "Content-Type")
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT")
    if (request.method === "OPTIONS") {
      response.writeHead(204)
      response.end()
      return
    }
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const url = new URL(request.url!, "http://localhost")
    calls.push({
      path: url.pathname,
      method: request.method!,
      body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined,
      directory: url.searchParams.get("directory"),
    })
    response.setHeader("Content-Type", "application/json")
    response.end(
      JSON.stringify(
        url.pathname.endsWith("/design")
          ? draft
          : url.pathname.endsWith("/test")
            ? run
            : url.pathname.endsWith("/accept")
              ? definition
              : request.method === "PUT"
                ? saved
                : { nodeFingerprint: fingerprint, trials: [] },
      ),
    )
  })
  servers.add(server)
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Missing test server address")
  const api = createWorkflowApi({
    server: { url: `http://127.0.0.1:${address.port}` },
    directory: definition.directory,
  })
  expect((await api.harness(definition.id, "task_one")).draft).toBeUndefined()
  const designed = await api.designHarness(definition.id, "task_one", {
    designerModel: { providerID: "provider", modelID: "large-designer" },
    executionModel: spec.model,
    goal: "Answer",
    feedback: "",
    expectedRevision: null,
    nodeFingerprint: fingerprint,
  })
  const edited = await api.saveHarness(definition.id, "task_one", {
    spec,
    goal: "Answer",
    feedback: "Be concise",
    expectedRevision: designed.revision,
    nodeFingerprint: fingerprint,
  })
  const trial = await api.testHarness(definition.id, "task_one", {
    revision: edited.revision,
    input: "sample",
    outputs: { previous_step: "Sample output" },
  })
  const accepted = await api.acceptHarness(definition.id, "task_one", {
    revision: edited.revision,
    testRunID: trial.id,
  })
  expect(calls.map((call) => call.method)).toEqual(["GET", "POST", "PUT", "POST", "POST"])
  expect(calls.map((call) => call.path)).toEqual([
    "/workflow/workflow_one/node/task_one/harness",
    "/workflow/workflow_one/node/task_one/harness/design",
    "/workflow/workflow_one/node/task_one/harness",
    "/workflow/workflow_one/node/task_one/harness/test",
    "/workflow/workflow_one/node/task_one/harness/accept",
  ])
  expect(calls.every((call) => call.directory === definition.directory)).toBe(true)
  expect(calls[1].body).toMatchObject({
    designerModel: { modelID: "large-designer" },
    executionModel: { modelID: "small-worker" },
    expectedRevision: null,
  })
  expect(calls[2].body).toMatchObject({ expectedRevision: "revision_one", nodeFingerprint: fingerprint })
  expect(calls[3].body).toEqual({
    revision: "revision_two",
    input: "sample",
    outputs: { previous_step: "Sample output" },
  })
  expect(calls[4].body).toEqual({ revision: "revision_two", testRunID: "trial_one" })
  const node = accepted.nodes[0]
  expect(node.kind === "task" && node.harness?.testRunID).toBe("trial_one")
})

test("workflow requests preserve project scope, authentication and approval identity", async () => {
  const calls: { url: URL; method: string; authorization: string | undefined; body: unknown }[] = []
  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type")
    response.setHeader("Access-Control-Allow-Methods", "GET, POST")
    if (request.method === "OPTIONS") {
      response.writeHead(204)
      response.end()
      return
    }
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    calls.push({
      url: new URL(request.url!, "http://localhost"),
      method: request.method!,
      authorization: request.headers.authorization,
      body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined,
    })
    response.setHeader("Content-Type", "application/json")
    response.end(JSON.stringify(request.method === "GET" ? [] : { ok: true }))
  })
  servers.add(server)
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Missing test server address")
  const api = createWorkflowApi({
    server: { url: `http://127.0.0.1:${address.port}`, username: "workflow", password: "test-password" },
    directory: "/project with spaces/α",
  })
  await api.list()
  await api.history("workflow_one")
  await api.approve("run_one", "approval_two")
  await api.cancel("run_one")
  expect(calls.map((call) => call.url.pathname)).toEqual([
    "/workflow",
    "/workflow/workflow_one/runs",
    "/workflow/run/run_one/approve",
    "/workflow/run/run_one/cancel",
  ])
  expect(calls.every((call) => call.url.searchParams.get("directory") === "/project with spaces/α")).toBe(true)
  expect(calls.every((call) => call.authorization === `Basic ${btoa("workflow:test-password")}`)).toBe(true)
  expect(calls[2].method).toBe("POST")
  expect(calls[2].body).toEqual({ nodeID: "approval_two" })
})

test("workflow transport rejects malformed server responses", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.setHeader("Content-Type", "application/json")
    response.end(JSON.stringify([{ id: "broken" }]))
  })
  servers.add(server)
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Missing test server address")
  const api = createWorkflowApi({ server: { url: `http://127.0.0.1:${address.port}` }, directory: "/project" })
  await expect(api.list()).rejects.toThrow()
})

test("aborted workflow scope cannot dispatch an approval", async () => {
  const calls = { count: 0 }
  const server = createServer((_request, response) => {
    calls.count += 1
    response.end("{}")
  })
  servers.add(server)
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Missing test server address")
  const controller = new AbortController()
  const api = createWorkflowApi({
    server: { url: `http://127.0.0.1:${address.port}` },
    directory: "/old-project",
    signal: controller.signal,
  })
  controller.abort()
  await expect(api.approve("run_one", "approval_one")).rejects.toThrow()
  expect(calls.count).toBe(0)
})

test("only bounded declared workflow errors expose their actionable message", async () => {
  const failures = [
    { status: 400, body: { _tag: "WorkflowInvalidError", message: "Connect every step to Start." }, safe: true },
    { status: 409, body: { _tag: "WorkflowConflictError", message: "This workflow is already running." }, safe: true },
    {
      status: 404,
      body: { _tag: "WorkflowNotFoundError", message: "This workflow was deleted. Refresh the list." },
      safe: true,
    },
    { status: 400, body: { message: "Undeclared backend details" }, safe: false },
    { status: 500, body: { _tag: "WorkflowServerError", message: "Private provider detail" }, safe: false },
    { status: 401, body: { _tag: "WorkflowInvalidError", message: "Authentication detail" }, safe: false },
    { status: 400, body: { _tag: "WorkflowConflictError", message: "Wrong status discriminator" }, safe: false },
    { status: 400, body: { _tag: "WorkflowInvalidError", message: "x".repeat(601) }, safe: false },
    {
      status: 400,
      body: { _tag: "WorkflowInvalidError", message: "Safe prefix", padding: "x".repeat(8192) },
      safe: false,
    },
    { status: 400, body: { _tag: "WorkflowInvalidError", message: "   " }, safe: false },
  ]
  const server = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.setHeader("Access-Control-Allow-Methods", "GET")
    if (request.method === "OPTIONS") {
      response.writeHead(204)
      response.end()
      return
    }
    const failure = failures[Number(new URL(request.url!, "http://localhost").searchParams.get("directory"))]!
    response.setHeader("Content-Type", "application/json")
    response.statusCode = failure.status
    response.end(JSON.stringify(failure.body))
  })
  servers.add(server)
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Missing test server address")
  await Promise.all(
    failures.map(async (failure, index) => {
      const api = createWorkflowApi({ server: { url: `http://127.0.0.1:${address.port}` }, directory: String(index) })
      const error: unknown = await api.list().catch((error: unknown) => error)
      expect(error instanceof WorkflowRequestError).toBe(failure.safe)
      if (failure.safe && error instanceof WorkflowRequestError) expect(error.message).toBe(failure.body.message)
      if (!failure.safe && error instanceof Error) expect(error.message).not.toContain(failure.body.message)
    }),
  )
})
