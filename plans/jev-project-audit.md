# Jev-assisted project audit

Date: 22 September 2026. Scope: the current working tree, including existing uncommitted work. This audit changes no application behavior.

The highest-value work is to finish the generic tool UI, remove dormant session-state handling, make unfinished V2 capabilities explicit, and finish or hide the Black workspace flow. Provider configuration is a worthwhile gradual refactor. Large files alone are not evidence of defects.

## What was actually examined

- Local TypeScript AST inventory: **2,061 JavaScript/TypeScript files, 339,619 lines**, across 51 source-directory groups. This includes application, backend, UI, SDK, CLI/TUI, console, stats, tooling, extensions, and build code. Groups are not equivalent to workspace packages.
- Excluded generated directories, dependencies, distributions, tests, fixtures, declaration files, stories, and translations from complexity counts. Tests and specifications were separately inspected where relevant. Rust, CSS, SQL, infrastructure configuration, and deployed services were not exhaustively audited.
- Sent **64 bounded source excerpts from 61 files across 48 groups** to the configured Jev API. Accepted rankings cover 60 excerpts; four remain unranked after a rejected response. Jev saw excerpts, not the entire 340k-line codebase.
- Ran **8 additional narrow claim checks**, including a deliberately unsupported claim about URI rejection. Three reviewers inspected core architecture, app/session UI, and peripheral packages; findings were checked against callers and implementation.
- Ran focused existing tests: **685 passed, 1 skipped, 0 failed**. No full integration, browser, production, or cross-platform test run was performed.

The inventory records HEAD, timestamps, and per-file SHA-256 hashes. Scores below measure relevance to an audit question on a 0–3 scale, **not severity or probability of a bug**.

## Recommended work, in order

### 1. Show generic tool results, starting with Jev

**Current product issue.** The timeline chooses `GenericTool` when no renderer is registered ([selection](/Users/alfredo/Documents/code-daddy/packages/session-ui/src/components/message-part.tsx:1566)), passes it output ([caller](/Users/alfredo/Documents/code-daddy/packages/session-ui/src/components/message-part.tsx:1611)), but [GenericTool](/Users/alfredo/Documents/code-daddy/packages/session-ui/src/components/basic-tool.tsx:323) has no output property or disclosure content. Jev therefore runs for the agent while its actual category, confidence, evidence IDs, and rankings remain invisible in the tool row.

An `unavailable` result is intentionally a successful advisory tool completion. Hiding the result makes a timeout or missing key look like a completed evaluation. Preserve the typed result contract; fix the presentation.

**Smallest change:** add a bounded, escaped text/JSON disclosure for generic tool output; provide clear Jev unavailable/input-invalid states. Support both legacy names and checksum-suffixed V2 names. Add renderer fixtures for success, failure reasons, long output, keyboard navigation, and narrow layouts.

**Jev check:** inconclusive on the supplied excerpt. The finding is established by tracing renderer selection and props, not by treating Jev's answer as authoritative.

### 2. Bound generic argument previews and explain plugin permissions

**Current UI shortcomings.** [Generic argument formatting](/Users/alfredo/Documents/code-daddy/packages/session-ui/src/components/basic-tool.tsx:304) includes whole scalar strings; `.slice(0, 3)` limits argument count, not length. Jev accepts 24,000-character failure evidence. Visual ellipsis leaves that full text in the collapsed trigger DOM; the screen-reader impact still needs rendered verification.

The [permission dock](/Users/alfredo/Documents/code-daddy/packages/app/src/pages/session/composer/session-permission-dock.tsx:21) suppresses descriptions for unknown translation keys. Jev's legacy request at least names the TypeSafe host; V2 exposes internal checksum-bearing plugin identifiers. Neither supplies a clear localized explanation of what evidence is being sent.

**Smallest changes:** cap previews before constructing DOM text, with full evidence available through intentional disclosure; give plugin permissions stable display metadata for purpose, destination, and supplied data. Preserve the existing permission decisions. Validate both protocols and the maximum-length input.

**Jev check:** supports the unbounded-string claim. Detailed UI evidence is in the [app audit](/Users/alfredo/Documents/code-daddy/plans/validation/jev-audit-app.md).

### 3. Remove dormant session-content handling from the directory reducer

**Concrete simplification opportunity, not a demonstrated state bug.** [applyDirectoryEvent](/Users/alfredo/Documents/code-daddy/packages/app/src/context/global-sync/event-reducer.ts:111) spans 371 lines with 65 syntactic decision nodes. Both production call sites pass `sessionContent: false` ([first](/Users/alfredo/Documents/code-daddy/packages/app/src/context/server-sync.tsx:539), [second](/Users/alfredo/Documents/code-daddy/packages/app/src/context/server-sync.tsx:634)); its early guard consequently skips the legacy message/part/permission/question/status content branches. Session content is also handled by [server-session.apply](/Users/alfredo/Documents/code-daddy/packages/app/src/context/server-session.ts:986), with a separate [V2 reducer](/Users/alfredo/Documents/code-daddy/packages/app/src/context/server-session-v2-reducer.ts:18).

**Smallest change:** establish directory inventory versus session-content ownership, retire unreachable content branches and obsolete state/tests where the caller inventory permits, and keep the V1/V2 adapters explicit. Do not merge their distinct event semantics indiscriminately. Preserve ordering, optimistic updates, deletion, replay, and cache cleanup.

**Validation baseline:** 95 existing reducer/session tests pass. Repository instructions require a production benchmark baseline before changing session/timeline behavior. Jev relevance: **2.65/3** for the directory reducer, **2.45/3** for server-session.

### 4. Finish or hide the Black workspace flow

**Confirmed source-level incomplete route.** [BlackWorkspace](/Users/alfredo/Documents/code-daddy/packages/console/app/src/routes/black/workspace.tsx:26) creates eight fabricated workspace IDs and [navigates to paths made from them](/Users/alfredo/Documents/code-daddy/packages/console/app/src/routes/black/workspace.tsx:189). No corresponding `/black/workspace/[id]` route exists in the inspected source tree.

The production pause in `black/index.tsx` belongs to the index page. It does not guard the sibling workspace route; the actual `black.tsx` parent renders its children. This is a source finding, not a claim that a deployed endpoint was exercised.

**Smallest change:** use the existing authorized workspace query and a real destination, or gate this unfinished route in the shared parent. Test direct navigation as well as the normal entry flow. Jev supports the fabricated-ID/navigation claim. See the [platform audit](/Users/alfredo/Documents/code-daddy/plans/validation/jev-audit-platform.md).

### 5. Make unsupported V2 operations explicit before expanding adoption

**Intentional but exposed incompleteness.** Protocol and generated clients advertise `compact` and `wait`; [Core always returns OperationUnavailableError](/Users/alfredo/Documents/code-daddy/packages/core/src/session.ts:465) for existing sessions and [Server maps it to service unavailable](/Users/alfredo/Documents/code-daddy/packages/server/src/handlers/session.ts:253).

**Smallest change:** clearly mark these as unsupported capabilities in API documentation/UI, or complete one operation with its lifecycle contract and tests. Avoid removing public methods casually. Any Protocol/HttpApi change requires regenerating the client from `packages/client`, not editing generated output.

The larger migration also lacks full request-policy parity with the active legacy path; desktop prompt compatibility still uses V1. Treat the [V2 parity checklist](/Users/alfredo/Documents/code-daddy/specs/v2/session.md:129) as a release gate. Jev supports the stub claim. Full caller evidence: [core audit](/Users/alfredo/Documents/code-daddy/plans/validation/jev-audit-core.md).

### 6. Simplify provider policy without losing compatibility

**Maintenance opportunity.** The [provider assembly callback](/Users/alfredo/Documents/code-daddy/packages/opencode/src/provider/provider.ts:1401) spans 329 lines with 144 decision nodes, mixing catalog merging, plugin hooks, authentication, configuration precedence, discovery, and filtering. [variants](/Users/alfredo/Documents/code-daddy/packages/opencode/src/provider/transform.ts:777) spans 429 lines with 76 decision nodes and provider/model-specific branches.

**Smallest change:** extract one independently testable policy boundary at a time—first typed reasoning-variant resolution, then explicit provider-source precedence. Preserve plugin ordering, custom providers, model aliases, and transport differences. Do not replace compatibility logic with a generic table unless its exceptions remain expressible.

**Validation baseline:** provider-transform and CLI session-data suites passed 574 tests combined. Jev relevance for variants: **2.70/3**. No new provider correctness defect was demonstrated.

## Additional incomplete areas and bounded follow-ups

| Area | Evidence and practical next step |
| --- | --- |
| V2 tool concurrency | [Runner](/Users/alfredo/Documents/code-daddy/packages/core/src/session/runner/llm.ts:283) launches settlement fibers without a per-turn concurrency cap. Publication's semaphore does not cap tool work. Add bounded execution/backlog and cancellation tests before broad exposure. **Output truncation already exists** at 2,000 lines/50 KiB; do not reimplement it. |
| Media URI contract | [toResultValue](/Users/alfredo/Documents/code-daddy/packages/llm/src/schema/messages.ts:104) preserves content, contrary to a stale runner comment. Later OpenAI Chat/Bedrock media validation requires bytes or valid base64/data URLs ([validation](/Users/alfredo/Documents/code-daddy/packages/llm/src/protocols/shared.ts:174)). Define URI materialization or typed rejection at the boundary; add per-provider managed/HTTPS/data-URI fixtures. No live provider failure was reproduced. |
| Strict tool schemas | [OpenAI Responses preparation](/Users/alfredo/Documents/code-daddy/packages/llm/src/protocols/openai-responses.ts:259) hardcodes `strict: false`, with tests asserting that choice. Consider a supported opt-in with deterministic schema validation; do not flip the default without compatibility evidence. Jev's support confidence was low, so it adds little evidence here. |
| TUI test coverage | [Sorted hierarchy rendering test](/Users/alfredo/Documents/code-daddy/packages/tui/test/cli/tui/diff-viewer-file-tree.test.tsx:30) is skipped. The actual file ran **3 pass / 1 skip**. Reproduce and repair the test, then enable it; a skip alone does not establish a rendering bug. |
| SQLite streaming | [Node adapter](/Users/alfredo/Documents/code-daddy/packages/effect-sqlite-node/src/index.ts:118) and Core SQLite adapters implement streaming as `Stream.die("executeStream not implemented")`. Highest incomplete-marker Jev relevance, **2.89/3**, but no affected production caller was established. Document unsupported streaming or implement it when a real consumer requires it. |
| TUI highlighting | [HTML injection configuration](/Users/alfredo/Documents/code-daddy/packages/tui/src/parsers-config.ts:145) disables embedded JavaScript/CSS highlighting. Verify parser compatibility and add an HTML fixture before enabling it. |

## Things not to classify as bugs

- Process-global, single-process V2 execution is an explicit design constraint. Document deployment limits; distributed leasing/fencing is a separate design task, not a cleanup refactor.
- CodeMode reports unsupported OpenAPI operations as explicit skips. Preserve that boundary.
- Credential/cassette-dependent test skips differ from the unexplained TUI regression skip.
- The theme resolver has the highest syntactic count, but many decisions select declarative light/dark token values. This is lower priority than duplicated ownership or missing behavior.
- A stale TODO is not proof: the claim that `toResultValue` itself rejects URIs was retracted after implementation inspection. Jev did not endorse the negative-control claim.

## Jev use, reliability, and reproducibility

The saved sweep contains **18 evaluator attempts: 16 accepted, 2 rejected as invalid_response**. One rejected batch was retried successfully; a different four-excerpt batch remains unranked. Eight claim checks all returned structurally valid responses: six supported their narrow claims, two were inconclusive. Two separate diagnostic calls against the first rejected input succeeded, but the original rejected response was not retained, so its exact failed invariant is unknown. No validation was weakened.

Accepted sweep/check responses report **94,697 input tokens and 1,895 output tokens**, with 8,993 ms summed request duration. These totals exclude rejected responses and the two diagnostic calls; they are not a complete billing total. Calls used `jev-1.13.0` through the configured private settings loader. No credential was printed or stored in these artifacts.

Evidence and reusable commands:

- [Inventory and file hashes](/Users/alfredo/Documents/code-daddy/plans/validation/jev-audit-inventory.json), [selected excerpts](/Users/alfredo/Documents/code-daddy/plans/validation/jev-audit-excerpts.json), [sweep results](/Users/alfredo/Documents/code-daddy/plans/validation/jev-audit-results.json), [claim results](/Users/alfredo/Documents/code-daddy/plans/validation/jev-audit-claims.json).
- [Inventory/sweep driver](/Users/alfredo/Documents/code-daddy/plans/validation/jev-audit-run.ts): from the repository root, `bun plans/validation/jev-audit-run.ts` is local only; append `--evaluate` to send selected excerpts to Jev. `--evaluate --resume` reuses saved excerpts and successful batches, and can retry failed batches; use a fresh sweep for a new code snapshot.
- [Claim-check driver](/Users/alfredo/Documents/code-daddy/plans/validation/jev-audit-checks.ts): `bun plans/validation/jev-audit-checks.ts` sends the eight stored range selections again. Line ranges must be reviewed after source changes.
- [Response diagnostic](/Users/alfredo/Documents/code-daddy/plans/validation/jev-audit-response-diagnostic.md). A future improvement is a sanitized validation-category diagnostic, without raw payloads or credentials.

Focused test commands were run from their packages: app's three reducer/session suites plus session-message normalization; opencode's provider-transform and CLI session-data suites; TUI's diff-tree rendering file; session-ui's message-part helper suite. The TUI fixture emitted missing temporary KV-file warnings while its enabled assertions passed. These checks provide a refactoring baseline, not certification of the entire project.

For future development, use Jev on changed-code excerpts and failed-test evidence, retain source IDs and model metadata, and verify candidate findings against callers and deterministic tests. Keep its conclusions advisory. No recurring automation or automatic code modification was enabled by this audit.
