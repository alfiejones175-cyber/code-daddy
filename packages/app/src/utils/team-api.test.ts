import { expect, test } from "bun:test"
import { createTeamApi } from "./team-api"

test("team transport scopes reads, authenticates and retains explicit default clears", async () => {
  const calls: { url: URL; init?: RequestInit }[] = []
  const api = createTeamApi({
    server: { url: "http://localhost:4096", password: "test-password" },
    fetch: async (input, init) => {
      calls.push({ url: new URL(String(input)), init })
      return Response.json({ data: { teams: {} }, directory: "/global" })
    },
  })
  await api.get({ location: { directory: "/project with spaces" } })
  expect(calls[0].url.searchParams.get("location[directory]")).toBe("/project with spaces")
  expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe(`Basic ${btoa("opencode:test-password")}`)
  expect(await api.configGet()).toMatchObject({ data: { teams: {} }, directory: "/global" })
  await api.configUpdate({ teams: {}, default_team: undefined })
  expect(calls[2].init?.body).toBe('{"teams":{}}')
  await api.configUpdate({ default_team: null })
  expect(calls[3].init?.body).toBe('{"default_team":null}')
  expect(calls[3].init?.method).toBe("PATCH")
})
