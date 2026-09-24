import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureSimulatorScreenshot, inspectProject } from "./xcode-workspace"

describe("Xcode workspace diagnostics", () => {
  test("rejects invalid project directories", async () => {
    await expect(inspectProject(" ")).rejects.toThrow("Select a project directory")

    const directory = await mkdtemp(join(tmpdir(), "xcode-project-file-"))
    const file = join(directory, "project.txt")
    await writeFile(file, "not a project directory")
    try {
      await expect(inspectProject(file)).rejects.toThrow("Selected project path is not a directory")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects malformed simulator identifiers before invoking Xcode", async () => {
    await expect(captureSimulatorScreenshot("not-a-device")).rejects.toThrow("Invalid simulator identifier")
  })
})
