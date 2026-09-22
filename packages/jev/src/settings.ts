import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { parseEnv } from "node:util"
import { join } from "node:path"

const DEFAULT_MODEL = "jev-1.13.0"
const DEFAULT_TIMEOUT_MS = 10_000
const SETTINGS_ERROR = "Invalid JEV settings"

type SettingsEnv = NodeJS.ProcessEnv

export function settingsPath(env: SettingsEnv = process.env): string {
  return env.JEV_ENV_FILE ?? join(homedir(), ".config", "code-daddy", "jev.env")
}

export async function loadSettings(
  input: {
    env?: SettingsEnv
    path?: string
  } = {},
): Promise<{ apiKey?: string; model?: string; timeoutMs?: number }> {
  const env = input.env ?? process.env
  const path = input.path ?? settingsPath(env)
  const fileEnv = await readSettingsFile(path)

  const apiKey = pickEnvValue(env, fileEnv, "TYPESAFE_API_KEY")?.trim()
  const modelValue = pickEnvValue(env, fileEnv, "TYPESAFE_MODEL")?.trim()
  const timeoutValue = pickEnvValue(env, fileEnv, "JEV_TIMEOUT_MS")

  if (apiKey !== undefined && /[\s\0"']/.test(apiKey)) throw settingsError()

  const model = modelValue || DEFAULT_MODEL
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw settingsError()
  const timeoutMs = timeoutValue === undefined ? DEFAULT_TIMEOUT_MS : parseTimeout(timeoutValue)
  return {
    ...(apiKey ? { apiKey } : {}),
    model,
    timeoutMs,
  }
}

async function readSettingsFile(path: string): Promise<SettingsEnv> {
  let contents: string
  try {
    contents = await readFile(path, "utf8")
  } catch (error) {
    if (isMissingFile(error)) return {}
    throw settingsError()
  }

  try {
    return parseEnv(contents)
  } catch {
    throw settingsError()
  }
}

function pickEnvValue(env: SettingsEnv, fileEnv: SettingsEnv, key: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(env, key)) return env[key]
  return fileEnv[key]
}

function parseTimeout(value: string): number {
  if (!/^\d+$/.test(value)) throw settingsError()
  const timeoutMs = Number(value)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw settingsError()
  return timeoutMs
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function settingsError(): Error {
  return new Error(SETTINGS_ERROR)
}
