import { describe, expect, test } from "bun:test"

import { correctProviderEnv, isNushell, mergeShellEnv, parseShellEnv, resolveUserShell } from "./shell-env"

describe("shell env", () => {
  test("parseShellEnv supports null-delimited pairs", () => {
    const env = parseShellEnv(Buffer.from("PATH=/usr/bin:/bin\0FOO=bar=baz\0\0"))

    expect(env.PATH).toBe("/usr/bin:/bin")
    expect(env.FOO).toBe("bar=baz")
  })

  test("parseShellEnv ignores invalid entries", () => {
    const env = parseShellEnv(Buffer.from("INVALID\0=empty\0OK=1\0"))

    expect(Object.keys(env).length).toBe(1)
    expect(env.OK).toBe("1")
  })

  test("mergeShellEnv keeps explicit overrides", () => {
    const env = mergeShellEnv(
      {
        PATH: "/shell/path",
        HOME: "/tmp/home",
      },
      {
        PATH: "/desktop/path",
        OPENCODE_CLIENT: "desktop",
      },
    )

    expect(env.PATH).toBe("/desktop/path")
    expect(env.HOME).toBe("/tmp/home")
    expect(env.OPENCODE_CLIENT).toBe("desktop")
  })

  test("moves an OpenRouter key out of the OpenAI variable", () => {
    const env = { OPENAI_API_KEY: "sk-or-v1-router", OTHER: "value" }

    correctProviderEnv(env)

    expect(env).toEqual({ OPENROUTER_API_KEY: "sk-or-v1-router", OTHER: "value" })
  })

  test("preserves an explicit OpenRouter key while removing the crossed key", () => {
    const env = {
      OPENAI_API_KEY: "sk-or-v1-crossed",
      OPENROUTER_API_KEY: "sk-or-v1-explicit",
    }

    correctProviderEnv(env)

    expect(env).toEqual({ OPENROUTER_API_KEY: "sk-or-v1-explicit" })
  })

  test("does not alter a real OpenAI key", () => {
    const env = { OPENAI_API_KEY: "sk-proj-openai" }

    correctProviderEnv(env)

    expect(env).toEqual({ OPENAI_API_KEY: "sk-proj-openai" })
  })

  test("resolveUserShell falls back to the login shell before /bin/sh", () => {
    expect(resolveUserShell("/custom/env-shell", "/bin/zsh")).toBe("/custom/env-shell")
    expect(resolveUserShell(undefined, "/bin/zsh")).toBe("/bin/zsh")
    expect(resolveUserShell(undefined, "unknown")).toBe("/bin/sh")
    expect(resolveUserShell(undefined, undefined)).toBe("/bin/sh")
  })

  test("isNushell handles path and binary name", () => {
    expect(isNushell("nu")).toBe(true)
    expect(isNushell("/opt/homebrew/bin/nu")).toBe(true)
    expect(isNushell("C:\\Program Files\\nu.exe")).toBe(true)
    expect(isNushell("/bin/zsh")).toBe(false)
  })
})
