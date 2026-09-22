# Jev audit response diagnostic

Diagnosed the saved fifth audit batch only. No audit input, result, evaluator, or application source was changed.

## Saved failure

The saved result is `unavailable` with `reason: invalid_response`. Its input has four passages and a counted size of 13,621 characters (query + IDs + passage text + URLs), so it is below the evaluator's 30,000-character limit and each passage is below its per-field limit. It has no claim, so the request contains only four relevance-score questions.

`invalid_response` can arise only after transport succeeds. For this operation, the evaluator rejects a response if:

- the outer model/usage/answers shape fails its Effect schema;
- answer IDs differ from the four expected relevance IDs;
- a relevance answer is not a finite score in `[0, 3]` with finite confidence in `[0, 1]`;
- score probability keys are not exactly `0`, `1`, `2`, and `3`, or their values are not finite probabilities summing to within `1e-6` of one.

## Reproduction

Two permitted live calls were made using `loadSettings()` and the saved input, with no credentials, source excerpts, or raw error bodies printed.

1. A direct SDK call using the evaluator's four relevance questions returned the expected four IDs. All answers had type `score`, the expected probability keys, finite values, and probability sums of `1` (one displayed as ordinary floating-point `1.0000000000000002`).
2. A call through `rankEvidence` returned `status: ok`; all four rankings had finite scores/confidences, the same expected score-probability keys, and support `insufficient_evidence`, as designed when no claim is present.

The second call's scores differed slightly from the first direct call while retaining the same valid shape, which is normal model variability. The saved rejected payload is not retained, so the exact failed field cannot be recovered from the sanitized result alone.

## Conclusion

The input is valid and the failure is not reproducible in two current calls. The evidence supports a transient response-shape/probability validation rejection, rather than an input-size, ID, or no-claim support issue. Keep the cached successful ranking and report the batch as unavailable; do not infer a ranking from the failed saved result.

If this recurs, add an opt-in diagnostic mode that records only a redacted validation category (for example `answer_ids`, `score_shape`, or `probability_distribution`) and never serializes prompt/passages, response bodies, or credentials. That would identify the rejected invariant without weakening the evaluator's fail-closed behavior.
