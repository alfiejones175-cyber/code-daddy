import { describe, expect, test } from "bun:test"
import { WorkflowClef } from "../src/workflow-clef"

const input = {
  model: "clef" as const,
  question: "Did the check pass?",
  threshold: 0.8,
  input: "Check the result",
  outputs: { check: "Tests passed" },
  signal: new AbortController().signal,
}

function response(probability: number, model = "clef") {
  return Response.json({ success: true, result: { model, answers: { route: { type: "noul", noul: probability } } } })
}

describe("workflow Clef decisions", () => {
  test("uses the documented endpoint, selected model and typed question", async () => {
    const result = await WorkflowClef.evaluate(input, {
      accountID: "account",
      token: "test-only",
      fetch: async (url, request) => {
        expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/account/ai/run/@cf/cloudflare/clef")
        expect(request?.redirect).toBe("error")
        expect(new Headers(request?.headers).get("Authorization")).toBe("Bearer test-only")
        expect(JSON.parse(String(request?.body))).toMatchObject({
          model: "clef",
          state: { input: input.input, outputs: input.outputs },
          questions: { route: { type: "noul" } },
        })
        return response(0.92)
      },
    })
    expect(result.outcome).toBe("yes")
    expect(JSON.parse(result.output).probability).toBe(0.92)
  })

  test("selects no with confident negative evidence", async () => {
    expect(
      (await WorkflowClef.evaluate(input, { accountID: "account", token: "test", fetch: async () => response(0.08) }))
        .outcome,
    ).toBe("no")
  })

  test.each([0.49, 0.5, 0.65])("stops on uncertainty instead of executing a branch (%s)", async (value) => {
    await expect(
      WorkflowClef.evaluate(input, { accountID: "account", token: "test", fetch: async () => response(value) }),
    ).rejects.toThrow("confidence")
  })

  test.each([-0.1, 1.1, NaN])("rejects invalid probabilities (%s)", async (value) => {
    await expect(
      WorkflowClef.evaluate(input, { accountID: "account", token: "test", fetch: async () => response(value) }),
    ).rejects.toThrow()
  })

  test("does not silently accept another model or disclose provider response bodies", async () => {
    await expect(
      WorkflowClef.evaluate(input, {
        accountID: "account",
        token: "test",
        fetch: async () => response(0.9, "different"),
      }),
    ).rejects.toThrow("different decision model")
    await expect(
      WorkflowClef.evaluate(input, {
        accountID: "account",
        token: "test",
        fetch: async () => new Response("sensitive upstream detail", { status: 401 }),
      }),
    ).rejects.toThrow("HTTP 401")
  })

  test("honors cancellation before requesting the provider", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      WorkflowClef.evaluate(
        { ...input, signal: controller.signal },
        {
          accountID: "account",
          token: "test",
          fetch: async () => {
            throw new Error("Should not request")
          },
        },
      ),
    ).rejects.toMatchObject({ name: "AbortError" })
  })
})
