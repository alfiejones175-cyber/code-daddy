import { Schema } from "effect"

const NonEmptyText = (maximum: number) => Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(maximum))

export const TriageInput = Schema.Struct({
  evidence: NonEmptyText(24_000),
}).annotate({ identifier: "Jev.TriageInput" })
export type TriageInput = typeof TriageInput.Type

export const Passage = Schema.Struct({
  id: NonEmptyText(100),
  text: NonEmptyText(6_000),
  url: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2_000))),
})
export type Passage = typeof Passage.Type

const Passages = Schema.Array(Passage)
  .check(Schema.isLengthBetween(1, 20))
  .check(
    Schema.makeFilter((passages) =>
      new Set(passages.map((passage) => passage.id)).size === passages.length
        ? undefined
        : "passage IDs must be unique",
    ),
  )

export const RankInput = Schema.Struct({
  query: NonEmptyText(2_000),
  claim: Schema.optionalKey(NonEmptyText(2_000)),
  passages: Passages,
}).annotate({ identifier: "Jev.RankInput" })
export type RankInput = typeof RankInput.Type

const Probability = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))

const Usage = Schema.Struct({
  input_tokens: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  output_tokens: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})

const InvalidInput = Schema.Struct({
  status: Schema.Literal("invalid_input"),
  reason: Schema.Literal("invalid_input"),
  message: Schema.Literal("Input did not match the expected schema."),
})

export const InvalidResponseValidation = Schema.Literals([
  "response_schema",
  "answer_ids",
  "choice_answer",
  "ranking_answer",
])
export type InvalidResponseValidation = typeof InvalidResponseValidation.Type

const Unavailable = Schema.Struct({
  status: Schema.Literal("unavailable"),
  reason: Schema.Literals([
    "missing_key",
    "configuration",
    "timeout",
    "cancelled",
    "network",
    "http",
    "invalid_response",
  ]),
  message: Schema.String,
  validation: Schema.optionalKey(InvalidResponseValidation),
})

const SuccessFields = {
  status: Schema.Literal("ok"),
  advisory: Schema.Literal(true),
  model: NonEmptyText(200),
  questionVersion: NonEmptyText(200),
  usage: Usage,
  durationMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
}

export const TriageCategory = Schema.Literals([
  "application",
  "environment",
  "test_setup",
  "timing",
  "insufficient_evidence",
])
export type TriageCategory = typeof TriageCategory.Type

const TriageSuccess = Schema.Struct({
  ...SuccessFields,
  category: TriageCategory,
  confidence: Probability,
  probabilities: Schema.Record(Schema.String, Probability),
})

export const TriageResult = Schema.Union([TriageSuccess, Unavailable, InvalidInput]).annotate({
  identifier: "Jev.TriageResult",
})
export type TriageResult = typeof TriageResult.Type

export const Support = Schema.Literals(["supports", "contradicts", "insufficient_evidence"])
export type Support = typeof Support.Type

const Ranking = Schema.Struct({
  id: Schema.String,
  url: Schema.optionalKey(Schema.String),
  score: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
  confidence: Probability,
  probabilities: Schema.Record(Schema.String, Probability),
  support: Support,
  supportConfidence: Schema.optionalKey(Probability),
  supportProbabilities: Schema.optionalKey(Schema.Record(Schema.String, Probability)),
})

const RankSuccess = Schema.Struct({ ...SuccessFields, ranking: Schema.Array(Ranking) })

export const RankResult = Schema.Union([RankSuccess, Unavailable, InvalidInput]).annotate({
  identifier: "Jev.RankResult",
})
export type RankResult = typeof RankResult.Type
