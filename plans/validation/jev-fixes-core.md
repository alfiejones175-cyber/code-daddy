# V2 Core and LLM bounded fixes

## Implemented

- V2 runner now admits at most `session.tool_call_limit` local calls per provider turn (default 16) and runs admitted calls through a per-turn semaphore capped by `session.tool_concurrency` (default 4). A call over the admission limit is persisted as a model-visible tool error, so it cannot remain pending or start a side effect. Existing interruption paths clear pending fibers and durably fail unsettled calls before the run exits.
- `POST /api/session/:sessionID/compact` and `/wait` remain present but their OpenAPI descriptions now state that they are experimental placeholders returning 503. No lifecycle behavior was implied or added.
- The V2 specification now records the single-process deployment boundary, current call/output bounds, and a V1/V2 parity release gate. It also retains V1 as the compatibility path while required parity entries are incomplete.
- Tool media retains canonical content until provider lowering. OpenAI Chat and Bedrock now reject URI schemes such as `https:` with an `LLM.Error.InvalidRequest` before transport, explaining that a matching data URL or canonical base64 is required. Data URLs and byte media retain their existing lowering behavior. The runner comment no longer incorrectly says `ToolOutput.toResultValue` rejects URI content.
- OpenAI Responses accepts an opt-in `providerOptions.openai.strictToolSchemas`. The default remains `strict: false`. When enabled, projected tool schemas must use explicit object properties, `additionalProperties: false`, and a `required` list containing every property exactly once; incompatible schemas fail before transport with the offending tool and schema path.

## Validation

- `bun test test/session-runner.test.ts` in `packages/core`: 92 passed.
- `bun test test/provider/openai-responses.test.ts test/provider/openai-chat.test.ts test/provider/bedrock-converse.test.ts` in `packages/llm`: 118 passed.
- `bun typecheck` in `packages/core`, `packages/llm`, `packages/protocol`, and `packages/client`: passed.
- `bun run generate` in `packages/client`: completed; generated client files needed no update.
- `git diff --check -- packages/core packages/llm packages/protocol packages/client specs/v2/session.md`: passed.

## Remaining boundaries

- V2 does not fetch or materialize remote/managed media URIs. Providers that require inline bytes reject those schemes at request preparation; a future Location-scoped resolver must define durable storage and authorization semantics before adding remote materialization.
- V2 manual compaction, awaitable drain lifecycle, full V1 request-context parity, and distributed execution ownership remain intentionally unimplemented. The protocol endpoints continue to return 503 for the first two.

## Independent review and hardening

A second source review reproduced strict-schema false accepts for duplicate
`required` entries and nested schemas. Those are now rejected before transport.
The validator traverses supported `anyOf`, object-valued `items`, definition maps,
and local JSON Pointer/root references with cycle protection. Unsupported
composition/conditional keywords and tuple-style array-valued `items` are
rejected explicitly. The default non-strict behavior is unchanged.

A new cancellation regression sets tool concurrency to one with three recorded
calls. Only the first starts; interruption durably fails all three and their
replayed projection stays settled. This covers waiting semaphore fibers as well
as running work. The reviewer found no remaining material blocker in these
reviewed boundaries.
