import { tool } from "@opencode-ai/plugin/tool"
import { rankEvidence, triageFailure } from "./evaluator"
import { loadSettings } from "./settings"

// The desktop currently exposes legacy sessions as well as V2 sessions.
// These schemas describe the legacy tool boundary; the evaluator validates both paths.
export async function server() {
  return {
    tool: {
      jev_triage_failure: tool({
        description:
          "Send a small redacted test failure excerpt to TypeSafe Jev for advisory classification. " +
          "Use after an actual failure; the result is a hypothesis, never a test pass/fail decision. Do not send secrets.",
        args: { evidence: tool.schema.string().min(1).max(24_000) },
        async execute(input, context) {
          await context.ask({
            permission: "jev_triage_failure",
            patterns: ["api.typesafe.ai"],
            always: ["api.typesafe.ai"],
            metadata: {},
          })
          return JSON.stringify(await triageFailure(input, { ...(await loadSettings()), signal: context.abort }))
        },
      }),
      jev_rank_evidence: tool({
        description:
          "Send supplied passages to TypeSafe Jev for advisory research ranking. Preserves contradictory sources. " +
          "Provide an optional factual claim for support/contradiction checks. Does not search the web. Do not send secrets.",
        args: {
          query: tool.schema.string().min(1).max(2_000),
          claim: tool.schema.string().min(1).max(2_000).optional(),
          passages: tool.schema
            .array(
              tool.schema.object({
                id: tool.schema.string().min(1).max(100),
                text: tool.schema.string().min(1).max(6_000),
                url: tool.schema.string().max(2_000).optional(),
              }),
            )
            .min(1)
            .max(20),
        },
        async execute(input, context) {
          await context.ask({
            permission: "jev_rank_evidence",
            patterns: ["api.typesafe.ai"],
            always: ["api.typesafe.ai"],
            metadata: {},
          })
          return JSON.stringify(await rankEvidence(input, { ...(await loadSettings()), signal: context.abort }))
        },
      }),
    },
  }
}
