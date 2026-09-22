import { Option, Schema } from "effect"
import { rankEvidence, triageFailure } from "./evaluator"
import { TriageCategory, TriageInput } from "./schema"
import { loadSettings, settingsPath } from "./settings"

const Dataset = Schema.Array(
  Schema.Struct({
    id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    evidence: TriageInput.fields.evidence,
    expected: TriageCategory,
  }),
).check(Schema.isMinLength(1), Schema.isMaxLength(100))

export async function run(args: string[]) {
  if (!args.length || args[0] === "--help" || args[0] === "help") {
    console.log(`Jev advisory tools

  bun run jev check                 Check local configuration without an API call
  bun run jev smoke                 Make one API call using synthetic evidence
  bun run jev triage <file>         Classify a supplied text/JSON failure report
  bun run jev rank <file.json>      Rank {query, claim?, passages:[{id,text,url?}]}
  bun run jev evaluate <file.json>  Evaluate labeled triage examples (live API calls)

Set TYPESAFE_API_KEY in ${settingsPath()} or your process environment.
JEV_ENV_FILE overrides the private file path. Inputs are sent to TypeSafe.
Output is advisory JSON. Exit codes: 0 completed, 1 invalid input, 2 unavailable.
No command changes test outcomes or executes recommended actions.`)
    return 0
  }

  const command = args[0]
  if (
    !["check", "smoke", "triage", "rank", "evaluate"].includes(command!) ||
    args.length !== (["check", "smoke"].includes(command!) ? 1 : 2)
  ) {
    console.error("Use --help for supported commands and arguments.")
    return 1
  }

  const settings = await loadSettings().catch(() => undefined)
  if (!settings) {
    console.log(
      JSON.stringify({
        status: "unavailable",
        reason: "configuration",
        message: "Check the private Jev settings file and environment values.",
      }),
    )
    return 2
  }
  if (command === "check") {
    console.log(
      JSON.stringify(
        {
          configured: Boolean(settings.apiKey),
          file: settingsPath(),
          model: settings.model,
          timeoutMs: settings.timeoutMs,
        },
        null,
        2,
      ),
    )
    return settings.apiKey ? 0 : 2
  }
  if (command === "smoke") {
    const result = await triageFailure(
      {
        evidence:
          "Test setup failed before the application launched: required TEST_DATABASE_URL environment variable is missing.",
      },
      settings,
    )
    console.log(JSON.stringify(result, null, 2))
    return result.status === "ok" ? 0 : 2
  }

  const file = Bun.file(args[1]!)
  const contents = await (async () => {
    if (!(await file.exists()) || file.size > 128_000) return undefined
    return file.text()
  })().catch(() => undefined)
  if (contents === undefined) {
    console.error("Input must be a readable file of at most 128,000 bytes.")
    return 1
  }
  if (command === "triage") {
    const result = await triageFailure({ evidence: contents }, settings)
    console.log(JSON.stringify(result, null, 2))
    return result.status === "ok" ? 0 : result.status === "invalid_input" ? 1 : 2
  }

  const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(contents)
  if (Option.isNone(parsed)) {
    console.error("Input must contain valid JSON.")
    return 1
  }
  if (command === "rank") {
    const result = await rankEvidence(parsed.value, settings)
    console.log(JSON.stringify(result, null, 2))
    return result.status === "ok" ? 0 : result.status === "invalid_input" ? 1 : 2
  }

  const dataset = Schema.decodeUnknownOption(Dataset)(parsed.value)
  if (Option.isNone(dataset) || new Set(dataset.value.map((item) => item.id)).size !== dataset.value.length) {
    console.error("Dataset must contain 1–100 uniquely identified examples with evidence and an expected category.")
    return 1
  }
  // Keep API usage bounded: only explicitly supplied cases, evaluated sequentially.
  const results = []
  for (const item of dataset.value) {
    const result = await triageFailure({ evidence: item.evidence }, settings)
    results.push({
      id: item.id,
      expected: item.expected,
      correct: result.status === "ok" && result.category === item.expected,
      result,
    })
    if (result.status === "unavailable") break
  }
  const answered = results.filter((item) => item.result.status === "ok")
  const correct = answered.filter((item) => item.correct).length
  console.log(
    JSON.stringify(
      {
        advisory: true,
        examples: dataset.value.length,
        attempted: results.length,
        answered: answered.length,
        correct,
        accuracyAmongAnswered: answered.length ? correct / answered.length : null,
        coverage: answered.length / dataset.value.length,
        results,
      },
      null,
      2,
    ),
  )
  return answered.length === dataset.value.length ? 0 : 2
}

if (import.meta.main) {
  process.exitCode = await run(process.argv.slice(2)).catch(() => {
    console.error("Jev evaluation could not complete. Check configuration and input format.")
    return 2
  })
}
