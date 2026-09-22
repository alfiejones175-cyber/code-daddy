import { expect, test } from "bun:test"
import { server } from "../src/legacy"

test("legacy adapters register both operations and enforce permission before reading settings", async () => {
  const hooks = await server()
  expect(Object.keys(hooks.tool)).toEqual(["jev_triage_failure", "jev_rank_evidence"])
  const requested: string[] = []
  const context = {
    sessionID: "session-test",
    messageID: "message-test",
    agent: "build",
    directory: "/tmp",
    worktree: "/tmp",
    abort: new AbortController().signal,
    metadata() {},
    async ask(request: { permission: string }) {
      requested.push(request.permission)
      throw new Error("Permission denied")
    },
  }
  await expect(hooks.tool.jev_triage_failure.execute({ evidence: "failed assertion" }, context)).rejects.toThrow(
    "Permission denied",
  )
  await expect(
    hooks.tool.jev_rank_evidence.execute(
      { query: "question", passages: [{ id: "source", text: "evidence" }] },
      context,
    ),
  ).rejects.toThrow("Permission denied")
  expect(requested).toEqual(["jev_triage_failure", "jev_rank_evidence"])
})
