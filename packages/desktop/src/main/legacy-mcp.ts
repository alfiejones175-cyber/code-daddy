import { constants } from "node:fs"
import { randomUUID } from "node:crypto"
import { link, lstat, open, readFile, realpath, rename, stat, unlink } from "node:fs/promises"
import { dirname, join } from "node:path"
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"

export type LegacyMcpPreset = "browser" | "xcode"
export type LegacyMcpLocalConfig = {
  type: "local"
  command: string[]
  cwd?: string
  environment?: Record<string, string>
  enabled?: true
  timeout?: number
}

const commands: Record<LegacyMcpPreset, string[]> = {
  browser: ["npx", "-y", "@playwright/mcp", "--isolated"],
  xcode: ["xcrun", "mcpbridge"],
}

/** Persist a V1 MCP preset in the selected project's opencode config file. */
export async function persistLegacyMcpPreset(
  directory: string,
  preset: LegacyMcpPreset,
): Promise<{ filepath: string; config: LegacyMcpLocalConfig }> {
  if (preset !== "browser" && preset !== "xcode") throw new Error("Unsupported MCP preset")
  if (preset === "xcode" && process.platform !== "darwin") throw new Error("Xcode MCP is available only on macOS")
  if (typeof directory !== "string" || directory.trim().length === 0) throw new Error("Select a project directory")

  const root = await realpath(directory)
  if (!(await stat(root)).isDirectory()) throw new Error("Selected project path is not a directory")
  const jsonc = join(root, "opencode.jsonc")
  const json = join(root, "opencode.json")
  const filepath = (await fileExists(jsonc)) ? jsonc : json
  const fileInfo = await lstat(filepath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (fileInfo?.isSymbolicLink()) throw new Error("Project config file cannot be a symbolic link")
  if (fileInfo && !fileInfo.isFile()) throw new Error("Project config path is not a regular file")

  const expected: LegacyMcpLocalConfig = { type: "local", command: commands[preset] }
  const source = fileInfo ? await readFile(filepath, "utf8") : "{}\n"
  const errors: ParseError[] = []
  const current: unknown = parse(source, errors, { allowTrailingComma: true })
  if (errors.length > 0 || !isRecord(current)) throw new Error("Project config contains malformed JSONC")
  if (current.mcp !== undefined && !isRecord(current.mcp)) throw new Error("Project MCP config must be an object")
  const existing = isRecord(current.mcp) ? current.mcp[preset] : undefined
  const config = existing === undefined ? expected : preserveExistingConfig(existing, expected, preset)

  if (existing === undefined) {
    const updated = applyEdits(
      source,
      modify(source, ["mcp", preset], config, {
        formattingOptions: { insertSpaces: true, tabSize: 2 },
      }),
    )
    await writeWithoutFollowingSymlink(filepath, updated, fileInfo, source)
  }

  return { filepath, config }
}

async function fileExists(filepath: string) {
  return lstat(filepath)
    .then(() => true)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false
      throw error
    })
}

async function writeWithoutFollowingSymlink(
  filepath: string,
  content: string,
  previous: Awaited<ReturnType<typeof lstat>> | undefined,
  expectedContent: string,
) {
  const temporary = join(dirname(filepath), `.${randomUUID()}.mcp-config.tmp`)
  const mode = previous ? Number(previous.mode) : 0o666
  const file = await open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    mode,
  )
  try {
    try {
      if (previous) await file.chmod(mode & 0o777)
      await file.writeFile(content, "utf8")
      await file.sync()
    } finally {
      await file.close()
    }
    if (previous) {
      const current = await lstat(filepath)
      if (
        current.isSymbolicLink() ||
        !current.isFile() ||
        current.dev !== previous.dev ||
        current.ino !== previous.ino
      ) {
        throw new Error("Project config file changed while it was being updated")
      }
      if ((await readFile(filepath, "utf8")) !== expectedContent) {
        throw new Error("Project config file changed while it was being updated")
      }
      await rename(temporary, filepath)
      return
    }
    await link(temporary, filepath)
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error
    })
  }
}

function preserveExistingConfig(
  value: unknown,
  expected: LegacyMcpLocalConfig,
  preset: LegacyMcpPreset,
): LegacyMcpLocalConfig {
  if (!isRecord(value) || value.type !== expected.type || !Array.isArray(value.command)) {
    throw new Error(`Project config already contains a different ${preset} MCP entry`)
  }
  if (
    value.command.length !== expected.command.length ||
    !value.command.every((part, index) => part === expected.command[index])
  ) {
    throw new Error(`Project config already contains a different ${preset} MCP entry`)
  }
  if (value.enabled === false) throw new Error(`Project ${preset} MCP entry is disabled`)
  if (value.cwd !== undefined && typeof value.cwd !== "string")
    throw new Error(`Project ${preset} MCP entry has invalid cwd`)
  if (value.enabled !== undefined && value.enabled !== true)
    throw new Error(`Project ${preset} MCP entry has invalid enabled setting`)
  if (
    value.timeout !== undefined &&
    (typeof value.timeout !== "number" || !Number.isInteger(value.timeout) || value.timeout < 1)
  ) {
    throw new Error(`Project ${preset} MCP entry has invalid timeout`)
  }
  if (
    value.environment !== undefined &&
    (!isRecord(value.environment) || !Object.values(value.environment).every((entry) => typeof entry === "string"))
  ) {
    throw new Error(`Project ${preset} MCP entry has invalid environment`)
  }
  if (
    Object.keys(value).some((key) => !["type", "command", "cwd", "environment", "enabled", "timeout"].includes(key))
  ) {
    throw new Error(`Project ${preset} MCP entry contains unsupported settings`)
  }
  return {
    type: "local",
    command: [...expected.command],
    cwd: value.cwd as string | undefined,
    environment: value.environment ? { ...(value.environment as Record<string, string>) } : undefined,
    enabled: value.enabled as true | undefined,
    timeout: value.timeout as number | undefined,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
