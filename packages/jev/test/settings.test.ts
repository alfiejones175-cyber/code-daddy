import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import { loadSettings, settingsPath } from "../src/settings"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function settingsFile(contents: string) {
  const directory = await mkdtemp(join(tmpdir(), "jev-settings-"))
  temporaryDirectories.push(directory)
  const path = join(directory, "jev.env")
  await writeFile(path, contents)
  return path
}

describe("settingsPath", () => {
  test("uses JEV_ENV_FILE or the per-user default", () => {
    expect(settingsPath({ JEV_ENV_FILE: "/tmp/custom-jev.env" })).toBe("/tmp/custom-jev.env")
    expect(settingsPath({})).toMatch(/\.config\/code-daddy\/jev\.env$/)
  })
})

describe("loadSettings", () => {
  test("loads dotenv values and applies defaults", async () => {
    const path = await settingsFile('TYPESAFE_API_KEY="file-key"\nTYPESAFE_MODEL=file-model\nJEV_TIMEOUT_MS=2500\n')
    await expect(loadSettings({ env: {}, path })).resolves.toEqual({
      apiKey: "file-key",
      model: "file-model",
      timeoutMs: 2500,
    })
  })

  test("returns defaults when the file is missing", async () => {
    await expect(loadSettings({ env: {}, path: "/tmp/jev-settings-does-not-exist" })).resolves.toEqual({
      model: "jev-1.13.0",
      timeoutMs: 10000,
    })
  })

  test("gives the process API key precedence over the file", async () => {
    const path = await settingsFile("TYPESAFE_API_KEY=file-key\n")
    await expect(loadSettings({ env: { TYPESAFE_API_KEY: "process-key" }, path })).resolves.toMatchObject({
      apiKey: "process-key",
    })
  })

  test("blank keys stay unconfigured and values are trimmed without mutating the environment", async () => {
    const path = await settingsFile("TYPESAFE_API_KEY=file-key\n")
    const env = { TYPESAFE_API_KEY: "  ", TYPESAFE_MODEL: " jev-1.13.0 " }
    await expect(loadSettings({ env, path })).resolves.toEqual({ model: "jev-1.13.0", timeoutMs: 10000 })
    expect(env.TYPESAFE_API_KEY).toBe("  ")
    await expect(loadSettings({ env: { TYPESAFE_API_KEY: " key " }, path })).resolves.toMatchObject({ apiKey: "key" })
  })

  test("rejects malformed files, unsafe keys, and invalid timeout values without exposing contents", async () => {
    const malformed = await settingsFile('TYPESAFE_API_KEY="unterminated\n')
    const malformedError = await loadSettings({ env: {}, path: malformed }).catch((error) => error)
    expect(malformedError).toEqual(new Error("Invalid JEV settings"))
    expect(String(malformedError)).not.toContain("unterminated")

    const valid = await settingsFile("TYPESAFE_API_KEY=\n")
    await expect(loadSettings({ env: { TYPESAFE_API_KEY: "bad\nkey" }, path: valid })).rejects.toEqual(
      new Error("Invalid JEV settings"),
    )
    await expect(loadSettings({ env: { JEV_TIMEOUT_MS: "30001" }, path: valid })).rejects.toEqual(
      new Error("Invalid JEV settings"),
    )
    await expect(loadSettings({ env: { JEV_TIMEOUT_MS: "0" }, path: valid })).rejects.toEqual(
      new Error("Invalid JEV settings"),
    )
    await expect(loadSettings({ env: { JEV_TIMEOUT_MS: "1.5" }, path: valid })).rejects.toEqual(
      new Error("Invalid JEV settings"),
    )
    await expect(loadSettings({ env: { TYPESAFE_MODEL: "bad\nmodel" }, path: valid })).rejects.toEqual(
      new Error("Invalid JEV settings"),
    )
    await expect(loadSettings({ env: {}, path: temporaryDirectories[0] })).rejects.toEqual(
      new Error("Invalid JEV settings"),
    )
  })
})
