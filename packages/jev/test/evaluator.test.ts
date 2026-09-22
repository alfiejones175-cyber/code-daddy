import { afterEach, describe, expect, test } from "bun:test"
import { rankEvidence, triageFailure } from "../src/evaluator.js"

const servers: Array<ReturnType<typeof Bun.serve>> = []

afterEach(() => {
  servers.splice(0).forEach((server) => server.stop(true))
})

function server(handler: (request: Request) => Response | Promise<Response>) {
  const instance = Bun.serve({ port: 0, fetch: handler })
  servers.push(instance)
  return `http://localhost:${instance.port}`
}

function triageResponse(overrides: Record<string, unknown> = {}) {
  return {
    model: "jev-1.13.0",
    usage: { input_tokens: 12, output_tokens: 2 },
    answers: {
      category: {
        type: "choice",
        choice: "timing",
        confidence: 0.8,
        probabilities: {
          application: 0.05,
          environment: 0.05,
          test_setup: 0.05,
          timing: 0.8,
          insufficient_evidence: 0.05,
        },
      },
    },
    ...overrides,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

describe("triageFailure", () => {
  test("validation diagnostics are opt-in categories and never include response contents", async () => {
    const baseURL = server(() => Response.json(triageResponse({ answers: { secret: "private response body" } })))
    const normal = await triageFailure({ evidence: "failure" }, { apiKey: "secret", baseURL })
    expect(normal).not.toHaveProperty("validation")
    const diagnostic = await triageFailure(
      { evidence: "failure" },
      { apiKey: "secret", baseURL, diagnostics: true },
    )
    expect(diagnostic).toMatchObject({ status: "unavailable", reason: "invalid_response", validation: "answer_ids" })
    expect(JSON.stringify(diagnostic)).not.toContain("secret")
    expect(JSON.stringify(diagnostic)).not.toContain("private response body")
  })

  test("reports answer validation without weakening probability checks", async () => {
    const baseURL = server(() => Response.json(triageResponse({ answers: {
      category: { type: "choice", choice: "timing", confidence: 0.8, probabilities: { timing: 1 } },
    } })))
    expect(await triageFailure({ evidence: "failure" }, { apiKey: "secret", baseURL, diagnostics: true }))
      .toMatchObject({ status: "unavailable", reason: "invalid_response", validation: "choice_answer" })
  })

  test("sends the pinned model and fixed question, then returns advisory triage", async () => {
    let request: Record<string, unknown> | undefined
    const baseURL = server(async (incoming) => {
      expect(incoming.method).toBe("POST")
      expect(incoming.headers.get("authorization")).toBe("Bearer secret")
      const body = await incoming.json()
      if (isRecord(body)) request = body
      return Response.json(triageResponse())
    })

    const result = await triageFailure({ evidence: "Timed out waiting for the button." }, { apiKey: "secret", baseURL })

    expect(result).toMatchObject({
      status: "ok",
      advisory: true,
      category: "timing",
      questionVersion: "jev-pilot-2026-09-22",
    })
    expect(request).toMatchObject({
      model: "jev-1.13.0",
      state: { evidence: "Timed out waiting for the button." },
      questions: { category: { type: "choice" } },
    })
  })

  test("does not call a server without an API key or for invalid input", async () => {
    let calls = 0
    const baseURL = server(() => {
      calls += 1
      return Response.json(triageResponse())
    })

    expect(await triageFailure({ evidence: "failure" }, { baseURL })).toMatchObject({
      status: "unavailable",
      reason: "missing_key",
    })
    expect(await triageFailure({ evidence: "" }, { apiKey: "secret", baseURL })).toMatchObject({
      status: "invalid_input",
      reason: "invalid_input",
    })
    expect(calls).toBe(0)
  })

  test("connection failures and invalid deadlines produce distinct sanitized results", async () => {
    const instance = Bun.serve({ port: 0, fetch: () => Response.json({}) })
    const baseURL = `http://127.0.0.1:${instance.port}`
    await instance.stop(true)
    expect(await triageFailure({ evidence: "failure" }, { apiKey: "secret", baseURL, timeoutMs: 2000 })).toMatchObject({
      status: "unavailable",
      reason: "network",
    })
    expect(await triageFailure({ evidence: "failure" }, { apiKey: "secret", timeoutMs: 1.5 })).toMatchObject({
      status: "unavailable",
      reason: "configuration",
    })
    expect(await triageFailure({ evidence: "failure" }, { apiKey: "secret", timeoutMs: 30_001 })).toMatchObject({
      status: "unavailable",
      reason: "configuration",
    })
  })

  test("returns sanitized timeout, cancellation, HTTP, and malformed-response failures", async () => {
    const timeoutURL = server(async () => {
      await Bun.sleep(50)
      return Response.json(triageResponse())
    })
    expect(
      await triageFailure({ evidence: "failure" }, { apiKey: "secret", baseURL: timeoutURL, timeoutMs: 1 }),
    ).toMatchObject({
      status: "unavailable",
      reason: "timeout",
    })

    const controller = new AbortController()
    controller.abort()
    expect(
      await triageFailure(
        { evidence: "failure" },
        { apiKey: "secret", baseURL: timeoutURL, signal: controller.signal },
      ),
    ).toMatchObject({
      status: "unavailable",
      reason: "cancelled",
    })

    const httpURL = server(() => new Response("secret failure body", { status: 418 }))
    const http = await triageFailure({ evidence: "failure" }, { apiKey: "secret", baseURL: httpURL })
    expect(http).toMatchObject({ status: "unavailable", reason: "http" })
    if (http.status === "ok") throw new Error("expected an unavailable result")
    expect(http.message).not.toContain("secret failure body")

    const malformedURL = server(() =>
      Response.json(triageResponse({ answers: { category: { type: "choice", choice: "other" } } })),
    )
    expect(await triageFailure({ evidence: "failure" }, { apiKey: "secret", baseURL: malformedURL })).toMatchObject({
      status: "unavailable",
      reason: "invalid_response",
    })

    const missingQuestionURL = server(() => Response.json(triageResponse({ answers: {} })))
    expect(
      await triageFailure({ evidence: "failure" }, { apiKey: "secret", baseURL: missingQuestionURL }),
    ).toMatchObject({
      status: "unavailable",
      reason: "invalid_response",
    })
  })
})

describe("rankEvidence", () => {
  test("keeps original IDs and URLs, validates support choices, and preserves stable score ties", async () => {
    let request: Record<string, unknown> | undefined
    const baseURL = server(async (incoming) => {
      const body = await incoming.json()
      if (isRecord(body)) request = body
      return Response.json({
        model: "jev-1.13.0",
        usage: { input_tokens: 20, output_tokens: 8 },
        answers: {
          "relevance:first": {
            type: "score",
            score: 2,
            confidence: 0.8,
            probabilities: { 0: 0, 1: 0, 2: 0.8, 3: 0.2 },
          },
          "support:first": {
            type: "choice",
            choice: "contradicts",
            confidence: 0.7,
            probabilities: { supports: 0.1, contradicts: 0.7, insufficient_evidence: 0.2 },
          },
          "relevance:second": {
            type: "score",
            score: 2,
            confidence: 0.8,
            probabilities: { 0: 0, 1: 0, 2: 0.8, 3: 0.2 },
          },
          "support:second": {
            type: "choice",
            choice: "supports",
            confidence: 0.8,
            probabilities: { supports: 0.8, contradicts: 0.1, insufficient_evidence: 0.1 },
          },
        },
      })
    })

    const result = await rankEvidence(
      {
        query: "What changed?",
        claim: "The feature was added.",
        passages: [
          { id: "first", text: "The feature was removed.", url: "https://example.com/first" },
          { id: "second", text: "The feature was added." },
        ],
      },
      { apiKey: "secret", baseURL },
    )

    expect(result).toMatchObject({
      status: "ok",
      ranking: [
        { id: "first", url: "https://example.com/first", support: "contradicts" },
        { id: "second", support: "supports" },
      ],
    })
    expect(request).toMatchObject({
      questions: {
        "relevance:first": { instructions: expect.stringContaining("passages[0]") },
        "support:second": { instructions: expect.stringContaining("passages[1]") },
      },
    })
  })

  test("keeps support at insufficient evidence when no claim is supplied", async () => {
    const baseURL = server(() =>
      Response.json({
        model: "jev-1.13.0",
        usage: { input_tokens: 10, output_tokens: 2 },
        answers: {
          "relevance:one": { type: "score", score: 3, confidence: 1, probabilities: { 0: 0, 1: 0, 2: 0, 3: 1 } },
        },
      }),
    )

    const result = await rankEvidence(
      { query: "What changed?", passages: [{ id: "one", text: "A change." }] },
      { apiKey: "secret", baseURL },
    )

    expect(result).toMatchObject({ status: "ok", ranking: [{ id: "one", support: "insufficient_evidence" }] })
  })

  test("rejects oversized and duplicate rank inputs without an HTTP call", async () => {
    let calls = 0
    const baseURL = server(() => {
      calls += 1
      return Response.json({})
    })
    expect(
      await rankEvidence({ query: "query", passages: [{ id: "", text: "evidence" }] }, { apiKey: "secret", baseURL }),
    ).toMatchObject({ status: "invalid_input" })
    expect(
      await rankEvidence({ query: "query", passages: [{ id: "source", text: "" }] }, { apiKey: "secret", baseURL }),
    ).toMatchObject({ status: "invalid_input" })
    expect(
      await rankEvidence(
        {
          query: "query",
          passages: [
            { id: "same", text: "one" },
            { id: "same", text: "two" },
          ],
        },
        { apiKey: "secret", baseURL },
      ),
    ).toMatchObject({ status: "invalid_input" })
    expect(
      await rankEvidence(
        { query: "query", passages: [{ id: "one", text: "x".repeat(6_001) }] },
        { apiKey: "secret", baseURL },
      ),
    ).toMatchObject({ status: "invalid_input" })
    expect(
      await rankEvidence(
        {
          query: "query",
          passages: Array.from({ length: 20 }, (_, index) => ({ id: String(index), text: "x".repeat(1_500) })),
        },
        { apiKey: "secret", baseURL },
      ),
    ).toMatchObject({ status: "invalid_input" })
    expect(calls).toBe(0)
  })
})
