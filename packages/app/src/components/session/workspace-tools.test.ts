import { describe, expect, test } from "bun:test"
import { extractWorkspaceEvidence, isHttpUrl } from "./workspace-tools-model"

describe("workspace tools evidence", () => {
  test("accepts only HTTP and HTTPS URLs", () => {
    expect(isHttpUrl("https://example.com/path")).toBe(true)
    expect(isHttpUrl("http://localhost:3000")).toBe(true)
    expect(isHttpUrl("file:///tmp/page.html")).toBe(false)
    expect(isHttpUrl("javascript:alert(1)")).toBe(false)
    expect(isHttpUrl("https://user:pass@example.com")).toBe(false)
  })

  test("extracts completed browser screenshots and text", () => {
    const evidence = extractWorkspaceEvidence(
      [{ id: "message", sessionID: "session", time: { created: 1 } }],
      {
        message: [
          {
            type: "tool",
            tool: "playwright.browser_snapshot",
            state: {
              status: "completed",
              output: "body text",
              time: { start: 1, end: 2 },
              attachments: [
                { url: "data:image/png;base64,abc", mime: "image/png" },
                { url: "https://example.com/remote.png", mime: "image/png" },
              ],
            },
          },
        ],
      },
      "session",
    )
    expect(evidence).toHaveLength(1)
    expect(evidence[0]?.image?.url).toBe("data:image/png;base64,abc")
    expect(evidence[0]?.text).toBe("body text")
  })
})
