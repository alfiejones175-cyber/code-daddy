import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const directories: string[] = []
const cli = path.resolve(import.meta.dir, "../src/cli.ts")

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function invoke(args: string[], settings = "TYPESAFE_API_KEY=\n", input?: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "jev-cli-"))
  directories.push(directory)
  await writeFile(path.join(directory, "jev.env"), settings)
  if (input !== undefined) await writeFile(path.join(directory, "input.json"), input)
  const child = Bun.spawn([process.execPath, cli, ...args], {
    cwd: directory,
    env: { JEV_ENV_FILE: path.join(directory, "jev.env") },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return { code, stdout, stderr }
}

test("check reports configuration without exposing the API key", async () => {
  const result = await invoke(["check"], "TYPESAFE_API_KEY=secret-sentinel\n")
  expect(result.code).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ configured: true, model: "jev-1.13.0", timeoutMs: 10000 })
  expect(result.stdout + result.stderr).not.toContain("secret-sentinel")
})

test("smoke reports missing configuration without attempting a live request", async () => {
  const result = await invoke(["smoke"])
  expect(result.code).toBe(2)
  expect(JSON.parse(result.stdout)).toMatchObject({ status: "unavailable", reason: "missing_key" })
})

test("triage accepts a file and keeps unavailable evaluation separate from test outcomes", async () => {
  const result = await invoke(["triage", "input.json"], undefined, "Expected a saved title; observed an empty title.")
  expect(result.code).toBe(2)
  expect(JSON.parse(result.stdout)).toMatchObject({ status: "unavailable", reason: "missing_key" })
})

test("rank rejects malformed JSON and duplicate source identifiers", async () => {
  const malformed = await invoke(["rank", "input.json"], undefined, "{broken")
  expect(malformed.code).toBe(1)
  expect(malformed.stderr).toContain("valid JSON")
  const duplicate = await invoke(
    ["rank", "input.json"],
    undefined,
    JSON.stringify({
      query: "test",
      passages: [
        { id: "a", text: "one" },
        { id: "a", text: "two" },
      ],
    }),
  )
  expect(duplicate.code).toBe(1)
  expect(JSON.parse(duplicate.stdout)).toMatchObject({ status: "invalid_input" })
})

test("evaluate stops on unavailable service and reports unanswered coverage", async () => {
  const result = await invoke(
    ["evaluate", "input.json"],
    undefined,
    JSON.stringify([
      { id: "first", evidence: "No evidence", expected: "insufficient_evidence" },
      { id: "second", evidence: "Missing browser installation", expected: "environment" },
    ]),
  )
  expect(result.code).toBe(2)
  expect(JSON.parse(result.stdout)).toMatchObject({
    examples: 2,
    attempted: 1,
    answered: 0,
    coverage: 0,
    accuracyAmongAnswered: null,
  })
})

test("configuration errors do not echo malformed secrets", async () => {
  const result = await invoke(["check"], 'TYPESAFE_API_KEY="secret-unterminated\n')
  expect(result.code).toBe(2)
  expect(JSON.parse(result.stdout)).toMatchObject({ status: "unavailable", reason: "configuration" })
  expect(result.stdout + result.stderr).not.toContain("secret-unterminated")
})

test("evaluate rejects invalid evidence before making any requests", async () => {
  const result = await invoke(
    ["evaluate", "input.json"],
    undefined,
    JSON.stringify([{ id: "empty", evidence: "", expected: "insufficient_evidence" }]),
  )
  expect(result.code).toBe(1)
  expect(result.stderr).toContain("Dataset must contain")
})

test("unknown commands and missing files fail locally", async () => {
  expect((await invoke(["unknown"])).code).toBe(1)
  const missing = await invoke(["triage", "missing.txt"])
  expect(missing.code).toBe(1)
  expect(missing.stderr).toContain("readable file")
})
