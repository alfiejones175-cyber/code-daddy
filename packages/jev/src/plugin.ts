import { define } from "@opencode-ai/plugin/v2/effect"
import { Effect } from "effect"
import { rankEvidence, triageFailure } from "./evaluator"
import { RankInput, RankResult, TriageInput, TriageResult } from "./schema"
import { loadSettings } from "./settings"

export default define({
  id: "jev",
  effect: (host) =>
    Effect.gen(function* () {
      yield* host.tool.register({
        triage_failure: {
          description:
            "Send a small, redacted test failure excerpt to TypeSafe Jev for advisory classification. " +
            "Use after an actual failure. Returns a hypothesis or insufficient evidence, never a test pass/fail decision. " +
            "Do not send secrets or entire repositories.",
          input: TriageInput,
          output: TriageResult,
          execute: (input) =>
            Effect.tryPromise(async (signal) => triageFailure(input, { ...(await loadSettings()), signal })),
        },
      })
      yield* host.tool.register({
        rank_evidence: {
          description:
            "Send supplied research passages and a question to TypeSafe Jev for advisory relevance ranking. " +
            "Preserves source IDs and contradictory passages; does not search the web or establish truth. " +
            "Use for a shortlist of redacted excerpts, not secrets or full documents.",
          input: RankInput,
          output: RankResult,
          execute: (input) =>
            Effect.tryPromise(async (signal) => rankEvidence(input, { ...(await loadSettings()), signal })),
        },
      })
    }),
})
