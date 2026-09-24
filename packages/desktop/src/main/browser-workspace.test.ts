import { describe, expect, test } from "bun:test"
import {
  appendBrowserWorkspaceDiagnostic,
  clearBrowserWorkspaceDiagnostics,
  MAX_BROWSER_WORKSPACE_DIAGNOSTICS,
  resolveBrowserWorkspaceURL,
} from "./browser-workspace"

describe("browser workspace", () => {
  test("accepts only credential-free HTTP and HTTPS URLs", () => {
    expect(resolveBrowserWorkspaceURL("https://example.com/path?q=1")).toBe("https://example.com/path?q=1")
    expect(resolveBrowserWorkspaceURL("http://localhost:3000/")).toBe("http://localhost:3000/")
    expect(resolveBrowserWorkspaceURL("file:///etc/passwd")).toBeUndefined()
    expect(resolveBrowserWorkspaceURL("javascript:alert(1)")).toBeUndefined()
    expect(resolveBrowserWorkspaceURL("https://user:pass@example.com/")).toBeUndefined()
    expect(resolveBrowserWorkspaceURL("not a URL")).toBeUndefined()
  })

  test("rejects unsafe redirect destinations", () => {
    expect(resolveBrowserWorkspaceURL("https://example.com/next")).toBe("https://example.com/next")
    expect(resolveBrowserWorkspaceURL("file:///tmp/redirect")).toBeUndefined()
    expect(resolveBrowserWorkspaceURL("https://user:pass@example.com/redirect")).toBeUndefined()
  })

  test("keeps only the newest bounded diagnostics", () => {
    const diagnostics = Array.from({ length: MAX_BROWSER_WORKSPACE_DIAGNOSTICS }, (_, index) => ({
      kind: "console" as const,
      level: 0,
      message: String(index),
      line: index,
      source: "test",
    }))

    appendBrowserWorkspaceDiagnostic(diagnostics, {
      kind: "request",
      code: -1,
      message: "offline",
      time: 10,
      url: "https://example.com/",
    })

    expect(diagnostics).toHaveLength(MAX_BROWSER_WORKSPACE_DIAGNOSTICS)
    expect(diagnostics[0].message).toBe("1")
    expect(diagnostics.at(-1)?.kind).toBe("request")
  })

  test("clears diagnostics at a navigation boundary", () => {
    const diagnostics = [{ kind: "console" as const, message: "old page", time: 1 }]

    clearBrowserWorkspaceDiagnostics(diagnostics)

    expect(diagnostics).toEqual([])
  })
})
