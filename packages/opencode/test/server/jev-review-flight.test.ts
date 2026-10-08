import { expect, test } from "bun:test"
import { reviewOnce } from "../../src/server/routes/instance/httpapi/handlers/jev-review"

test("joins duplicate review requests and keeps the provider call alive for an active waiter", async () => {
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let calls = 0
  const choice = (value: string, keys: string[]) => ({
    type: "choice",
    choice: value,
    confidence: 1,
    probabilities: Object.fromEntries(keys.map((key) => [key, key === value ? 1 : 0])),
  })
  const server = Bun.serve({
    port: 0,
    async fetch() {
      calls += 1
      started.resolve()
      await release.promise
      return Response.json({
        model: "jev-1.13.0",
        usage: { input_tokens: 10, output_tokens: 2 },
        answers: Object.fromEntries(
          ["requirements", "checks", "completion", "errors"].map((criterion) => [
            criterion,
            choice("insufficient_evidence", ["supported", "concern", "insufficient_evidence"]),
          ]),
        ),
      })
    },
  })
  try {
    const input = {
      projectID: "project",
      sessionID: "session",
      messageID: "message",
      requirements: ["Fix login"],
      response: "Updated login.",
      evidence: [],
    }
    const first = new AbortController()
    const second = new AbortController()
    const options = { apiKey: "test", baseURL: `http://localhost:${server.port}` }
    const one = reviewOnce("duplicate-review", input, options, first.signal)
    const two = reviewOnce("duplicate-review", input, options, second.signal)
    await started.promise
    first.abort()
    release.resolve()
    expect((await one).status).toBe("ok")
    expect((await two).status).toBe("ok")
    expect(calls).toBe(1)
  } finally {
    release.resolve()
    server.stop(true)
  }
})
