import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse } from "jsonc-parser"
import { persistLegacyMcpPreset } from "./legacy-mcp"

describe("legacy MCP project presets", () => {
  test("creates opencode.json with the V1 browser config", async () => {
    const directory = await tempDirectory()
    try {
      const result = await persistLegacyMcpPreset(directory, "browser")
      expect(result.filepath).toBe(join(directory, "opencode.json"))
      expect(result.config).toEqual({ type: "local", command: ["npx", "-y", "@playwright/mcp", "--isolated"] })
      expect(parse(await readFile(result.filepath, "utf8"))).toEqual({
        mcp: { browser: result.config },
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("prefers JSONC and preserves comments and other settings", async () => {
    const directory = await tempDirectory()
    const filepath = join(directory, "opencode.jsonc")
    const source = '{\n  // keep this note\n  "model": "local/model",\n}\n'
    await writeFile(filepath, source)
    try {
      const result = await persistLegacyMcpPreset(directory, "browser")
      const updated = await readFile(result.filepath, "utf8")
      expect(result.filepath).toBe(filepath)
      expect(updated).toContain("// keep this note")
      expect(parse(updated)).toEqual({ model: "local/model", mcp: { browser: result.config } })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("is idempotent for an identical entry and rejects a conflicting entry", async () => {
    const directory = await tempDirectory()
    const filepath = join(directory, "opencode.json")
    const config = { type: "local", command: ["npx", "-y", "@playwright/mcp", "--isolated"] }
    await writeFile(filepath, JSON.stringify({ model: "local/model", mcp: { browser: config } }))
    try {
      const before = await readFile(filepath, "utf8")
      await persistLegacyMcpPreset(directory, "browser")
      expect(await readFile(filepath, "utf8")).toBe(before)

      await writeFile(filepath, JSON.stringify({ mcp: { browser: { type: "local", command: ["other"] } } }))
      const conflict = await readFile(filepath, "utf8")
      await expect(persistLegacyMcpPreset(directory, "browser")).rejects.toThrow("different browser MCP entry")
      expect(await readFile(filepath, "utf8")).toBe(conflict)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("preserves valid optional settings from a matching existing entry", async () => {
    const directory = await tempDirectory()
    const filepath = join(directory, "opencode.json")
    const configured = {
      type: "local",
      command: ["npx", "-y", "@playwright/mcp", "--isolated"],
      cwd: ".opencode/browser",
      environment: { BROWSER: "chromium" },
      enabled: true,
      timeout: 12000,
    }
    await writeFile(filepath, JSON.stringify({ mcp: { browser: configured } }))
    try {
      const result = await persistLegacyMcpPreset(directory, "browser")
      expect(result.config).toEqual(configured)
      expect(parse(await readFile(filepath, "utf8"))).toEqual({ mcp: { browser: configured } })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects disabled and malformed optional settings without rewriting config", async () => {
    const directory = await tempDirectory()
    const filepath = join(directory, "opencode.json")
    const command = ["npx", "-y", "@playwright/mcp", "--isolated"]
    try {
      for (const entry of [
        { type: "local", command, enabled: false },
        { type: "local", command, timeout: 0 },
        { type: "local", command, environment: { BROWSER: 1 } },
        { type: "local", command, custom: true },
      ]) {
        const source = JSON.stringify({ mcp: { browser: entry } })
        await writeFile(filepath, source)
        const error = entry.enabled === false ? "disabled" : entry.custom === true ? "unsupported" : "invalid"
        await expect(persistLegacyMcpPreset(directory, "browser")).rejects.toThrow(error)
        expect(await readFile(filepath, "utf8")).toBe(source)
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects malformed JSONC and symlink config files", async () => {
    const directory = await tempDirectory()
    try {
      const configPath = join(directory, "opencode.jsonc")
      await writeFile(configPath, "{ broken: ")
      await expect(persistLegacyMcpPreset(directory, "browser")).rejects.toThrow("malformed JSONC")
      await rm(configPath)

      const target = join(directory, "target.json")
      await writeFile(target, "{}")
      await symlink(target, configPath)
      await expect(persistLegacyMcpPreset(directory, "browser")).rejects.toThrow("symbolic link")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects invalid directories and restricts Xcode to macOS", async () => {
    await expect(persistLegacyMcpPreset(" ", "browser")).rejects.toThrow("Select a project directory")
    const directory = await tempDirectory()
    const file = join(directory, "project.txt")
    await writeFile(file, "not a directory")
    try {
      await expect(persistLegacyMcpPreset(file, "browser")).rejects.toThrow("not a directory")
      if (process.platform === "darwin") {
        const result = await persistLegacyMcpPreset(directory, "xcode")
        expect(result.config).toEqual({ type: "local", command: ["xcrun", "mcpbridge"] })
      } else {
        await expect(persistLegacyMcpPreset(directory, "xcode")).rejects.toThrow("only on macOS")
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

async function tempDirectory() {
  return realpath(await mkdtemp(join(tmpdir(), "legacy-mcp-test-")))
}
