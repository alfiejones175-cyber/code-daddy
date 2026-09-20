import { describe, expect, test } from "bun:test"
import { authFromToken, authTokenFromCredentials, createApiForServer, updateProjectAppearance } from "./server"
import { currentIntegrationFetch } from "./integration-fetch"

describe("authFromToken", () => {
  test("decodes basic auth credentials from auth_token", () => {
    expect(authFromToken(btoa("kit:secret"))).toEqual({ username: "kit", password: "secret" })
  })

  test("defaults blank username to opencode", () => {
    expect(authFromToken(btoa(":secret"))).toEqual({ username: "opencode", password: "secret" })
  })

  test("ignores malformed tokens", () => {
    expect(authFromToken("not base64")).toBeUndefined()
    expect(authFromToken(btoa("missing-separator"))).toBeUndefined()
  })
})

describe("authTokenFromCredentials", () => {
  test("encodes credentials with the default username", () => {
    expect(authTokenFromCredentials({ password: "secret" })).toBe(btoa("opencode:secret"))
  })
})

test("the bundled client preserves auth, location and payload across native OAuth routes", async () => {
  const requests: Request[] = []
  const api = createApiForServer({
    server: { url: "http://localhost:4096", username: "test", password: "password" },
    fetch: Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        requests.push(request)
        if (request.method === "DELETE" || request.url.includes("/complete")) return new Response(null, { status: 204 })
        return Response.json({ location: {}, data: { attemptID: "con_test", status: "pending" } })
      },
      { preconnect: () => {} },
    ),
  })
  const input = { integrationID: "openai", location: { directory: "/test directory" } }
  await api.integration.oauth.connect({ ...input, methodID: "chatgpt-browser", inputs: {} })
  await api.integration.oauth.status({ ...input, attemptID: "con_test" })
  await api.integration.oauth.complete({ ...input, attemptID: "con_test", code: "example-code" })
  await api.integration.oauth.cancel({ ...input, attemptID: "con_test" })
  expect(requests.map((request) => [request.method, new URL(request.url).pathname])).toEqual([
    ["POST", "/api/integration/openai/connect/oauth"],
    ["GET", "/api/integration/attempt/con_test"],
    ["POST", "/api/integration/attempt/con_test/complete"],
    ["DELETE", "/api/integration/attempt/con_test"],
  ])
  for (const request of requests) {
    expect(request.headers.get("authorization")).toBe(`Basic ${btoa("test:password")}`)
    expect(new URL(request.url).searchParams.get("location[directory]")).toBe("/test directory")
  }
  expect(await requests[0].json()).toEqual({ methodID: "chatgpt-browser", inputs: {} })
  expect(await requests[2].json()).toEqual({ code: "example-code" })
})

test("native attempt URLs and unrelated requests pass through unchanged", async () => {
  const requests: (RequestInfo | URL)[] = []
  const fetcher = currentIntegrationFetch(async (input) => {
    requests.push(input)
    return new Response(null, { status: 204 })
  })
  const request = new Request("http://localhost/api/integration/attempt/con_test", { method: "DELETE" })
  await fetcher(request)
  await fetcher("http://localhost/api/credential/cre_test", { method: "DELETE" })
  expect(requests).toEqual([request, "http://localhost/api/credential/cre_test"])
})

test("project appearance writes are authenticated and scoped to their directory", async () => {
  const requests: Request[] = []
  const input = {
    server: { url: "http://localhost:4096/", username: "local", password: "secret" },
    directory: "/workspace/logo test",
    body: { name: "Logo test", icon: { color: "blue", override: "" }, commands: { start: "" } },
    fetch: Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init))
        if (requests.length > 1) return new Response(null, { status: 403, statusText: "Forbidden" })
        return Response.json({
          location: { directory: "/workspace/logo test" },
          data: { id: "project_test", worktree: "/workspace/logo test" },
        })
      },
      { preconnect() {} },
    ),
  }
  expect((await updateProjectAppearance(input)).id).toBe("project_test")
  expect(requests[0].method).toBe("PATCH")
  expect(new URL(requests[0].url).pathname).toBe("/api/project/current/appearance")
  expect(requests[0].headers.get("authorization")).toBe(`Basic ${btoa("local:secret")}`)
  expect(decodeURIComponent(requests[0].headers.get("x-opencode-directory")!)).toBe(input.directory)
  expect(await requests[0].json()).toEqual(input.body)
  await expect(updateProjectAppearance(input)).rejects.toThrow("403 Forbidden")
})
