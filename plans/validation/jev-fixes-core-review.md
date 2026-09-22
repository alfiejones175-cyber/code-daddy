# Core and LLM fixes: independent review

Reviewed the bounded V2 tool runner, OpenAI Responses strict-schema option, and shared media validation. The review preserved unrelated dirty work.

## Fixed during review

The first strict-schema validator only descended through direct `properties` and one object-valued `items`, and compared a deduplicated `required` list. Real `LLMClient.prepare` calls therefore accepted duplicate required entries and invalid objects nested under `anyOf` or `$defs` references.

The validator at [`packages/llm/src/protocols/openai-responses.ts:259`](../../packages/llm/src/protocols/openai-responses.ts#L259) now:

- rejects duplicate or incomplete `required` lists;
- checks objects under properties, `anyOf`, array items, `$defs`, and legacy `definitions`;
- resolves local JSON Pointer references, including `#` root recursion, while terminating recursive schemas safely;
- rejects dangling or external references, tuple-style array items, and unsupported composition before transport;
- leaves the default `strict: false` request unchanged.

Regression coverage starts at [`packages/llm/test/provider/openai-responses.test.ts:135`](../../packages/llm/test/provider/openai-responses.test.ts#L135). It covers the default-compatible strict object, duplicate required fields, nested union/array/reference failures, valid local and root recursion, and unsupported composition.

## Checked runner invariants

The per-turn counter and semaphore are created inside `runTurnAttempt` ([`packages/core/src/session/runner/llm.ts:177`](../../packages/core/src/session/runner/llm.ts#L177)-[`193`](../../packages/core/src/session/runner/llm.ts#L193)), so each provider continuation gets a fresh admission budget. Every local call is durably published before the admission decision; calls above the limit receive a model-visible tool error without starting settlement ([`packages/core/src/session/runner/llm.ts:287`](../../packages/core/src/session/runner/llm.ts#L287)-[`332`](../../packages/core/src/session/runner/llm.ts#L332)). Admitted settlements use one per-turn semaphore and are awaited before continuation.

The prior interruption tests only covered one running tool. A new regression at [`packages/core/test/session-runner.test.ts:3149`](../../packages/core/test/session-runner.test.ts#L3149) records three calls with concurrency one, interrupts while the first is blocked, and verifies that:

- only the first call enters tool execution;
- queued calls never begin side effects after interruption;
- all three calls become durable interrupted errors;
- replay preserves all three failures;
- no active execution remains.

No additional correctness blocker was found in bounded admission, continuation, or cancellation.

## Media validation

The URI-scheme branch in [`packages/llm/src/protocols/shared.ts:175`](../../packages/llm/src/protocols/shared.ts#L175)-[`210`](../../packages/llm/src/protocols/shared.ts#L210) preserves the prior fail-closed behavior for non-data URI strings: those values previously failed canonical base64 validation and now fail earlier with a precise unsupported-scheme error. Data URLs, canonical base64, and byte inputs retain their existing paths. OpenAI Chat and Bedrock exercise the shared validator before request transport.

## Validation

- Core session runner: 92 passed.
- LLM OpenAI Responses, OpenAI Chat, and Bedrock Converse: 118 passed.
- `bun typecheck` in `packages/core`: passed.
- `bun typecheck` in `packages/llm`: passed.
- `git diff --check` for reviewed files: passed.
