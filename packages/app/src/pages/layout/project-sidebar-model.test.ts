import { describe, expect, test } from "bun:test"
import type { Session } from "@opencode-ai/sdk/v2/client"
import type { SessionMessageInfo } from "@opencode-ai/client/promise"
import { sidebarAncestors, sidebarOutcome, sidebarSessionUsage } from "./project-sidebar-model"

describe("project sidebar lineage and outcomes", () => {
  test("walks every ancestor and terminates malformed cycles", () => {
    const sessions = [
      { id: "root" },
      { id: "child", parentID: "root" },
      { id: "grandchild", parentID: "child" },
    ] as Session[]
    expect(sidebarAncestors("grandchild", sessions)).toEqual(["child", "root"])
    expect(sidebarAncestors("missing", sessions)).toEqual([])
    expect(
      sidebarAncestors("child", [
        { id: "child", parentID: "root" },
        { id: "root", parentID: "child" },
      ] as Session[]),
    ).toEqual(["root", "child"])
  })

  test("idle execution is not proof of a completed subchat", () => {
    const message = {
      type: "assistant",
      finish: "tool-calls",
      time: { created: 1, completed: 2 },
    } as SessionMessageInfo
    expect(sidebarOutcome(message)).toBe("idle")
    expect(sidebarOutcome(undefined)).toBe("idle")
    expect(sidebarOutcome({ ...message, finish: "stop" } as SessionMessageInfo)).toBe("complete")
    expect(sidebarOutcome({ ...message, error: { type: "unknown", message: "Failed" } } as SessionMessageInfo)).toBe(
      "failed",
    )
  })

  test("includes nested subagent usage once in the parent total", () => {
    const usage = sidebarSessionUsage(
      "root",
      [
        {
          id: "root",
          tokens: { input: 100, output: 50, reasoning: 10, cache: { read: 20, write: 5 } },
          cost: 0.1,
        },
        {
          id: "child",
          parentID: "root",
          tokens: { input: 40, output: 20, reasoning: 4, cache: { read: 8, write: 2 } },
          cost: 0.04,
        },
        {
          id: "grandchild",
          parentID: "child",
          tokens: { input: 10, output: 5, reasoning: 1, cache: { read: 2, write: 1 } },
          cost: 0.01,
        },
      ] as Session[],
    )

    expect(usage).toMatchObject({
      input: 150,
      output: 75,
      reasoning: 15,
      cacheRead: 30,
      cacheWrite: 8,
      tokenizedSessions: 3,
      costedSessions: 3,
    })
    expect(usage.cost).toBeCloseTo(0.15)
  })

  test("terminates malformed child cycles", () => {
    const usage = sidebarSessionUsage(
      "root",
      [
        { id: "root", parentID: "child", tokens: { input: 1, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } },
        { id: "child", parentID: "root", tokens: { input: 2, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } },
      ] as Session[],
    )
    expect(usage.input).toBe(3)
    expect(usage.tokenizedSessions).toBe(2)
  })
})
