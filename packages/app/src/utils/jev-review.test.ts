import { describe, expect, test } from "bun:test"
import { requestJevReview } from "./jev-review"

describe("requestJevReview", () => {
  test("sends the selected session and review bundle through the authenticated legacy route", async () => {
    let seen: { url: URL; method: string; headers: Headers; body: unknown } | undefined
    const fetch = (async (input, init) => {
      seen = {
        url: new URL(String(input)),
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      }
      return Response.json({ status: "not_reviewed", responseDigest: "digest", review: null })
    }) as typeof globalThis.fetch
    const state = await requestJevReview({
      server: { url: "http://localhost:4096", username: "opencode", password: "secret" },
      directory: "/workspace with spaces",
      sessionID: "ses_1",
      messageID: "msg_1",
      payload: { requirements: ["Fix login"], evidence: [{ id: "test", text: "1 passed" }] },
      fetch,
    })
    expect(state.status).toBe("not_reviewed")
    expect(seen?.url.pathname).toBe("/session/ses_1/jev-review/msg_1")
    expect(seen?.method).toBe("POST")
    expect(seen?.headers.get("x-opencode-directory")).toBe("%2Fworkspace%20with%20spaces")
    expect(seen?.headers.get("authorization")).toBe(`Basic ${btoa("opencode:secret")}`)
    expect(seen?.body).toEqual({ requirements: ["Fix login"], evidence: [{ id: "test", text: "1 passed" }] })
  })
})
