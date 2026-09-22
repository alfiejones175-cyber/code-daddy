# Jev audit recommendations: changes and verification

22 September 2026. The audit recommendations have been addressed through code fixes, bounded refactors, regression coverage, and explicit documentation/gating of unsupported capabilities. Application changes are local; no deployment, commit, or app/backend restart was performed. Existing unrelated worktree changes were preserved.

## What “hidden results” meant

The API returned Jev results correctly, and the original audit read them. The app's fallback tool renderer discarded the output prop, so a user could not expand a Jev tool row to inspect its JSON. This display problem did not prevent the agent from receiving results.

The fallback now displays bounded, escaped text/JSON and recognizable advisory-success, unavailable, and invalid-input states. A production-styled Chromium fixture displayed the **recorded live ranking response**, with click/Enter disclosure. At a 390px viewport, document width also measured 390px. See the [narrow screenshot](/Users/alfredo/Documents/code-daddy/plans/validation/jev-generic-tool-success-narrow.png).

## Recommendation closure

| Recommendation | Result |
| --- | --- |
| Show Jev/generic tool results | Implemented output/input disclosure, readable Jev states, legacy and V2 name matching, and controlled expansion/defer props. Transcript and nonfatal advisory completion remain intact. |
| Bound previews | Scalar values and keys are capped before DOM insertion. Large evidence uses a localized character-count preview. Disclosures cap display at 48,000 characters. |
| Explain plugin consent | Known Jev actions explain the TypeSafe destination and supplied evidence/passages. Unknown plugin actions use metadata or a generic localized fallback. Actual permission decisions and scopes are unchanged. No automatic redaction is claimed. |
| Simplify session ownership | Removed approximately 250 lines of dormant content handling from the directory reducer and both obsolete `sessionContent` arguments. Dedicated V1/V2 session reducers retain content ownership. Cache cleanup remains covered. |
| Unfinished workspace flow | Removed fabricated workspace choices and missing destination links. The unfinished route redirects to the existing localized Black plan page. Enrollment is hidden, not newly implemented. |
| Exposed V2 placeholders | Public `compact`/`wait` descriptions now explicitly identify experimental 503 placeholders. Client generation and generated-file check passed. These lifecycle operations remain unimplemented. |
| Provider complexity | Extracted substantial reasoning-variant resolution and related model-family rules into a typed policy module, reducing the main transform file by roughly 650 lines. Made source-assignment policy explicit without changing merge ordering or authentication/config precedence. |
| V2 tool bounds | Defaults now admit at most 16 local calls per provider turn and execute at most 4 concurrently, configurable through session settings. Overflow yields durable model-visible errors. Cancellation covers waiting and active calls. |
| Media URI contract | Unsupported URI schemes fail before transport with a typed, specific explanation. Bytes, canonical base64, and matching data URLs remain supported. Remote/managed URI fetching was not introduced. |
| Strict Responses schemas | Added an opt-in, default-off strict option. Validation checks object requirements, duplicates, supported nested schemas/definitions/local references; unsupported constructs fail explicitly before transport. |
| Skipped TUI regression | Enabled and repaired the sorted-tree rendering test. It waits for a settled frame and retains final-child rows that its old border filter incorrectly removed. |
| HTML embedded highlighting | Enabled pinned HTML injection queries and added a small pinned OpenTUI patch for `injection.language`. Real-worker offline regression covers both JavaScript and CSS bodies. |
| SQLite streaming | Explicitly documented the unsupported row-streaming contract in the Node adapter and Core database directory. Callers are directed to bounded queries/pagination. Streaming remains unsupported. |
| Jev invalid-response diagnosis | Added opt-in sanitized validation categories. Default output and fail-closed checks are unchanged; no raw response, request, key, or exception is exposed. |

The V2 specification also records the single-process deployment boundary and request-parity release gate. Distributed execution and full V1/V2 feature parity remain separate future work; this change does not claim to implement them. CodeMode's deliberate unsupported-operation handling was retained.

## Tests and review

Focused suites passed **1,111 tests**, with no failures or skips in those final selected suites:

| Suite | Passed |
| --- | ---: |
| App directory/session/normalization | 101 |
| App permission descriptions | 3 |
| Legacy provider policies/integration | 666 |
| CLI session-data | 13 |
| Core session runner | 92 |
| LLM Responses/Chat/Bedrock | 118 |
| Session UI | 89 |
| TUI parser and file tree | 5 |
| Jev evaluator/settings/CLI/plugin | 24 |

Package-local typechecks passed for app, session-ui, UI, opencode, Core, LLM, Protocol, Client, console app, TUI, and Jev; app E2E fixtures also typechecked. Generated-client checks and `git diff --check` passed.

Independent review caught and fixed the initial strict-validator's acceptance of duplicate required entries and invalid nested alternatives/references. It also added cancellation coverage with one running and two queued tools: only the first begins execution, all three settle durably as interrupted, and replay preserves those outcomes.

The direct production-reducer microbenchmark changed from median 64.47 ms to 58.55 ms for 2,000 created-session events over 20 samples. This is a local directional measurement, not an end-to-end performance claim. A separate full production timeline benchmark timed out while starting its preview, so no comparable timeline performance result is available.

The full application/browser integration suite was not run. The isolated styled component was exercised in Chromium; new full-app regression fixtures were typechecked. The existing dirty worktree also has 108 unrelated missing non-English localization keys in the global parity check. New UI strings use the established explicit English fallback until translations are supplied.

## Actual Jev review after changes

Fresh live smoke and research ranking returned `status: ok` from `jev-1.13.0`: [smoke response](/Users/alfredo/Documents/code-daddy/plans/validation/jev-after-smoke.json), [ranking response](/Users/alfredo/Documents/code-daddy/plans/validation/jev-after-rank.json).

Jev reviewed **12 narrow change claims** against selected current source excerpts. Final responses supported 8 claims and returned insufficient evidence for 4: generic output behavior, directory-reducer ownership, the sorted-tree regression, and complete strict-schema validation. Those inconclusive results were retained. Browser checks, deterministic tests, and source review provide the evidence for those changes; no Jev response is treated as a certification.

There were 21 successful review requests across initial and combined-context passes, reporting 36,159 input tokens and 1,919 output tokens. The final reviewed source hashes matched the working files at verification. Live smoke/rank token usage is recorded separately in their response files.

The [review record](/Users/alfredo/Documents/code-daddy/plans/validation/jev-fixes-review.json) includes exact claims, supplied excerpts, probabilities, source hashes, timestamps, and model metadata. The [review driver](/Users/alfredo/Documents/code-daddy/plans/validation/jev-fixes-review.ts) reuses unchanged successful checks and re-evaluates changed source. From the repository root: `bun plans/validation/jev-fixes-review.ts`. This sends bounded code excerpts to the configured Jev service.

Detailed records: [UI](/Users/alfredo/Documents/code-daddy/plans/validation/jev-fixes-ui.md), [session/provider simplification](/Users/alfredo/Documents/code-daddy/plans/validation/jev-fixes-simplify.md), [Core/LLM](/Users/alfredo/Documents/code-daddy/plans/validation/jev-fixes-core.md), [independent Core review](/Users/alfredo/Documents/code-daddy/plans/validation/jev-fixes-core-review.md), [peripheral fixes and diagnostics](/Users/alfredo/Documents/code-daddy/plans/validation/jev-fixes-platform.md).
