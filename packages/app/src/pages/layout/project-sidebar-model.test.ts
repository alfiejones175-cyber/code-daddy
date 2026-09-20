import { describe, expect, test } from "bun:test"
import type { Session } from "@opencode-ai/sdk/v2/client"
import type { SessionMessageInfo } from "@opencode-ai/client/promise"
import { sidebarAncestors, sidebarOutcome } from "./project-sidebar-model"

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
})
