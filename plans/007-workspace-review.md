**Code Daddy workspace review — 22 September 2026**

**Scope update, 22 September 2026:** the user clarified this is an English-only app for personal use and a few friends. The [current roadmap](README.md) supersedes the multilingual repair, independent public-release identity, market-validation, and broad distribution recommendations below. Keep OpenCode provider access, Jev output review, English correctness, and session/data reliability. The [language policy](../documentation/localization.md) makes non-English completeness optional. Findings and test counts below remain the historical review snapshot; a translation-parity failure is no longer an English-product defect.

Code Daddy has a strong technical foundation for a dependable coding workbench. Its best opportunity is to make a complete development task understandable, verifiable, and recoverable: open a project, give the agent work, inspect the change and its checks, and continue safely after interruptions. More features alone will not establish that advantage. Consistently successful work will.

My recommendation is to keep the Solid/Electron architecture, restore a trustworthy development gate, establish an independent release identity, and then build the product around evidence of completed work. This is a product hypothesis grounded in the implementation, not a market-validation claim or a guarantee of commercial success.

**Scope and evidence.**

Reviewed the workspace structure and 37 package manifests; repository instructions; CI and build configuration; current diffs; V2 admission, execution, recovery, delegation, and provider paths; the client compatibility boundary; desktop packaging; skill discovery; existing plans; and selected UI components and tests. Deeper validation focused on App, Desktop, Core, Schema, Protocol, Server, Client, Jev, Session UI, UI, and TUI. Console, enterprise, infrastructure, integrations, and other packages received inventory-level review, not exhaustive implementation or production-control audits.

The starting commit was `fe1e39f7c03567a0931849d524e1bc5fb5b45f03` on `dev`, with substantial uncommitted work. Other work changed the checkout during the review, including directory selection, settings, and localization. Results below describe the snapshots actually tested. They do not certify every subsequent edit. No application source was edited by this review. The user's app/server was not restarted. An isolated Vite test process ran on port 4477 and exited with the browser suite.

Evidence labels used here: **source-confirmed**, **test-observed**, **saved-screenshot observation**, **proposal**, and **unverified**. Existing acceptance notes were read so already-delivered capabilities are not presented as missing features. Live provider entitlement/billing, signed installation and updates, native window behavior, every theme's accessibility, and the full backend/provider suite remain unverified in this pass.

**Confirmed findings, in priority order.**

| Priority | Finding and consequence | Evidence | Acceptance criterion |
| --- | --- | --- | --- |
| P1 | The normal Turbo test run omits substantial existing test coverage. Failures can survive the main CI unit-test gate. | [Turbo configuration](../turbo.json#L5), [CI invocation](../.github/workflows/test.yml#L66), and an actual `turbo run test --dry=json`. Only six runnable test tasks were planned. | Every intended test-bearing package appears in the dry-run graph and executes in CI. Explicitly document exclusions. Check the graph automatically when adding a package. |
| P1 | Schema and Client tests already fail when run directly. Contract changes and their expectations are out of sync. | [Schema manifest test](../packages/schema/test/event-manifest.test.ts#L12): expected 55 server events, observed 58; a positional identity assertion also fails. [Client public surface test](../packages/client/test/promise.test.ts#L7): additional `server.project` and `server.mcp` groups. | Review the intended public contract, then update implementation or expectations accordingly. All contract/identity/import-boundary tests pass through CI. Do not blindly update counts to make the tests green. |
| P1 before distribution | Code Daddy is currently the development-channel identity; beta/prod retain upstream OpenCode identity and release destinations. | [Packaging](../packages/desktop/electron-builder.config.ts#L39), [release channels](../packages/desktop/electron-builder.config.ts#L146), [app identity and data directory](../packages/desktop/src/main/index.ts#L125). | Distinct app IDs, data directories, protocol handling, signing configuration, release destinations, and documented migration. Test installation alongside OpenCode, update, rollback, and uninstall without affecting the other application. |
| P2 | The app's localization gate is red. Newly added workflows are not consistently translated. | [Parity test](../packages/app/src/i18n/parity.test.ts#L112). Latest run: 767 pass, 1 fail, first reported locale `ar`, including workspace/capability/team strings. | Restore dictionary and placeholder parity across supported locales using the repository's required translation sources. Add long-label and RTL acceptance for newly added controls. |
| P2 | CI's intended Node 24.15 pin for browser installation is overwritten by the subsequent shared setup action. | [E2E pin](../.github/workflows/test.yml#L104) followed by [shared Node 24 setup](../.github/actions/setup-bun/action.yml#L13). | Parameterize the shared action or preserve the selected Node version; print and assert the actual version immediately before Playwright installation. This is a configuration defect; no hosted CI hang was reproduced here. |
| P2 | The app and Session UI use a vendored 1.17.13 client while the workspace packages are 1.18.31. New endpoints need handwritten compatibility code. | [App dependency](../packages/app/package.json), [Session UI dependency](../packages/session-ui/package.json), [appearance transport](../packages/app/src/utils/server.ts#L70), [protocol adapter](../packages/app/src/utils/server-compat.ts). | Define a supported client/server matrix and a migration owner. Integrate the current generated client in a bounded change, retain tested V1 adapters where required, and remove redundant endpoint shims only after equivalent tests pass. |
| P2 | Canonical-looking runtime documentation contradicts implemented behavior. Future developers and agents can follow the wrong plan. | [Session spec](../specs/v2/session.md#L153) says watchdog policy is deferred; [runner](../packages/core/src/session/runner/llm.ts#L269) configures first-event/inactivity deadlines. The spec also says applying the agent system prompt remains work, while the runner includes it at line 243. | Reconcile the capability/parity table with code and current tests. Give each remaining gap an owner and evidence. Update the same document when implementation changes. |
| P2, small UX repair | The primary Open project label truncates in both inspected desktop and compact captures. A first-run action loses clarity. | Saved [1280×800 desktop](validation/spectrum-sidebar-desktop-dark.png) and [390×844 compact](validation/spectrum-sidebar-compact.png); [equal-width action grid and ellipsis](../packages/app/src/pages/layout/project-sidebar.css#L131). | Show the complete primary action label at those widths and in longer translations, without reducing text size. Verify the accessible name and keyboard path. These captures are existing synthetic fixtures, not fresh native screenshots. |

The six runnable Turbo tasks were App, Core, Function, Session UI, UI, and legacy OpenCode. Fifteen top-level packages with discovered test files were absent: CLI, Client, Codemode, Desktop, Effect Drizzle SQLite, Enterprise, HTTP Recorder, HTTP API Codegen, Jev, LLM, Protocol, Schema, SDK Next, Server, and TUI. Some have a `test` script but no matching Turbo task; others need both. The separate generated-client and HTTP API exerciser CI steps are useful, but do not execute all these package tests.

The release finding is conditional on distributing beta/prod builds: the current dev channel disables auto-update. This review does not claim the running Code Daddy app is downloading upstream updates. Its present configuration is nevertheless unsuitable as an independent public release without changes.

At the start of the review, an untracked and unignored root `jev.env` contained a nonempty, non-placeholder API-key setting. The value was never printed or sent to a provider. At the final existence check, that root file was gone, apparently through concurrent work; its removal was not performed by this review. Do not treat it as a current open file defect. Maintain the documented external settings location and an ignore/secret-scanning policy. No claim is made about the key's validity or any historical exposure.

**What is worth protecting.**

| Area | Existing strength | Development implication |
| --- | --- | --- |
| Session execution | Durable prompt admission; exact-retry checks; serialized same-session execution; concurrent independent sessions. | Preserve these invariants through new automation and delegation features. Do not replace the runner with an opaque in-memory agent loop. |
| Recovery and permissions | Explicit recovery, scoped permissions, child-task ownership, interruption propagation, and bounded provider turns. | Build clear recovery UI over these foundations. A stopped or idle process is not proof that work succeeded. |
| Contracts | Schema/Protocol/Server separation; generated clients; actual bundle import-boundary and identity tests. | Repair and run these tests consistently. Their existence is a real advantage even though the current gate misses some of them. |
| UI architecture | Existing Solid components, theme tokens, accessible primitives, draft persistence, delegated-task navigation, and timeline instrumentation. | Keep the framework and components. Make local, measured refinements instead of a broad rewrite. |
| Diagnostics | Core tracing infrastructure, desktop logging, browser traces, and timeline benchmarks. | Connect technical diagnostics to task outcomes, failures, and recovery. Additional telemetry should have a stated decision it supports. |
| Jev | Advisory triage/ranking, bounded requests, local fixtures, explicit unavailable states, and separation from test pass/fail. | Keep it advisory. Evaluate it on real, held-out failures before allowing its classifications to drive automation. |

Architecture assessment: the difficulty is maintaining several generations of APIs and UI behavior simultaneously. Source size makes this costly: the sampled tree includes approximately 2,500-line session/layout modules and a 2,700-line TUI session module. These are change-coordination risks, not defects simply because they are large. Extract cohesive boundaries when a real change requires it; avoid splitting files solely to meet a line-count target.

Provider SDK patches and the pinned Effect beta create additional compatibility work. Preserve exact versions and recorded provider fixtures. A version upgrade should establish tool calls, streaming, cancellation, reasoning/context continuation, and usage behavior before shipping. This review did not audit every dependency for vulnerabilities or assert that any pinned version must be upgraded.

**Product and UX judgment.**

The product is an existing developer workbench in active expansion. Its core objects are projects, chats, child tasks, providers, changes, and verification evidence. The first decision is which project to work in; success is an inspectable result in the correct project. The main recovery paths are retry, reconnect, stop, resume after review, and returning to a preserved draft. On compact screens, opening the correct chat and reaching its composer matter most. Keep the precise, terminal-inspired temperament, with existing Solid/Kobalte/UI components as the foundation. Implementation commentary and raw diagnostics belong in secondary details.

The inspected saved screenshots establish a distinctive green/black identity and a clear project/chat hierarchy. Preserve that. More ornament is unlikely to improve the daily workflow as much as clearer primary labels, visible waiting/failed states, readable task results, and less space spent on secondary counters. Prioritize task names and actionable state; keep exact token totals available as details. This is a design recommendation, not a measured usability result. Existing screenshots contain synthetic projects and, in some cases, development instrumentation; they do not demonstrate release appearance or live provider execution.

The build generated a 2,800.74 kB main JavaScript chunk, 833.40 kB gzipped, and a large-chunk warning. This is an investigation lead, not proof of slow navigation. Measure cold startup and first useful interaction on a representative lower-end machine; inspect the module graph and lazily load expensive features where appropriate. Continue using the existing timeline benchmark rather than treating smaller bundle size as a substitute for observed responsiveness.

The main Playwright configuration excludes `performance/**`, and the inspected CI workflow does not call the separate stability/benchmark scripts. Add a stable production-build scenario to scheduled or release validation, with controlled hardware and explicit failure thresholds derived from measurements. Do not turn noisy millisecond differences into a flaky merge gate.

**Skills that would materially help.**

| Skill | When to use it here | Expected output |
| --- | --- | --- |
| [Project Effect skill](../.opencode/skills/effect/SKILL.md) | Core, Protocol, Server, context, or runner changes. | APIs checked against source and local examples; explicit layer ownership; cancellation and durable-state acceptance. Its reference source should match the pinned Effect dependency/patches, rather than an unrelated moving revision. |
| [UI/UX](/Users/alfredo/.codex/skills/ui-ux/SKILL.md) | Changes to setup, navigation, composer, review, settings, or error recovery. Applied in this review. | A concise task-flow brief, truthful state handling, keyboard/compact/theme acceptance, and source-versus-browser evidence. |
| [Frontend skill](/Users/alfredo/.codex/skills/frontend-skill/SKILL.md) | A specific interface needs visual refinement after the task flow is sound. | A coherent implementation using current Solid components and tokens, with actual screenshots. |
| [Playwright](/Users/alfredo/.codex/skills/playwright/SKILL.md) | Browser regressions, journey verification, traces, or new observable behavior. | Deterministic end-to-end evidence. Follow the repository's browser and E2E instructions; `agent-browser` was not installed on PATH during this review. |
| [Improve animations](/Users/alfredo/.codex/skills/improve-animations/SKILL.md) | A focused motion audit after reliability issues are addressed. | A read-only, prioritized motion plan with reduced-motion and performance acceptance. Existing sidebar motion already exists; do not restart it from scratch. |
| [RTL-aware development](../.opencode/skills/rtl-aware-development/SKILL.md) | Fixing localization and testing compact navigation or long translated controls. | Logical layout direction, correct labels, and RTL interaction acceptance alongside corpus-verified translations. |
| [Security threat model](/Users/alfredo/.codex/skills/security-threat-model/SKILL.md) and [security best practices](/Users/alfredo/.codex/skills/security-best-practices/SKILL.md) | A separately scoped security review before broader distribution of shell/filesystem/MCP capabilities. | Trust boundaries and actionable findings tied to actual code. These specialist audits were not performed in this general review. |

The native macOS design skill targets Swift/SwiftUI applications; it is not the implementation default for this Electron product. Net-new frontend builders and landing-page skills are also unnecessary for routine workbench improvements. Broad skill installation would add competing instructions. Use the smallest set that fits the change.

Skills available to the assistant in this Codex session are not automatically installed inside Code Daddy. The V2 [skill configuration](../packages/core/src/config.ts#L94) accepts additional paths/URLs, and the [skill plugin](../packages/core/src/config/plugin/skill.ts#L23) discovers skill directories. Put portable, repository-owned guidance in `.opencode/skills`, or explicitly configure supported paths. Do not copy Codex-specific tool instructions into Code Daddy and assume their tools will exist there.

Two custom skills would provide more value than a large marketplace collection:

1. **Session reliability review.** Trigger on admission, queue, runner, tool, model-switch, or recovery changes. Require evidence for exact retries, conflicting IDs, steer/queue ordering, interrupted side effects, permission inheritance, and correct terminal status. Point to actual package tests and keep the current execution architecture explicit.
2. **Code Daddy release acceptance.** Trigger before packaging/distribution. Verify fork identity, client/server compatibility, intended test coverage, frozen-source validation, upgrade/data preservation, provider setup, and native startup. Report failures and evidence without claiming that a web build proves an installer works.

These are proposed skill specifications, not installed skills. Optional GitHub integration could later simplify review/CI access, but nothing in this review requires installing another plugin.

**A development sequence that compounds in value.**

| Order | Deliverable | Why it matters | Definition of done |
| --- | --- | --- | --- |
| 1 | Restore the development gate. | A passing check must describe the real product. | Fix the four currently observed failing tests, include intended package tests in Turbo, repair the CI Node override, and validate an unchanged snapshot with the pinned Bun version. |
| 2 | Establish Code Daddy's own release path. | Users need a product that can safely coexist with and evolve independently from upstream. | Identity/update destinations separated, migration decision documented, native installation and update acceptance recorded. |
| 3 | Add a compact task-result view. | Make the result immediately assessable. | Show changed files/diff, checks actually run and their exit status, failed/skipped/unrun checks, artifacts, and unresolved issues. Invalidate relevant verification when the code changes. Model prose alone must not set a verified status. |
| 4 | Complete continuity across failures. | Returning to work should require little reconstruction. | Exercise app quit/start, backend loss, timeout, provider reconnect, canceled child task, and interrupted tool output. Show preserved work, known side effects, and the next explicit action. Extend existing recovery; never silently replay arbitrary actions. |
| 5 | Make delegation easy to supervise. | Multiple agents should reduce coordination burden. | Extend the existing task UI with clear ownership, waiting reasons, result summaries, and relevant verification. Keep bounded turns distinct from token/currency budgets. Treat user follow-ups and model changes according to existing identity/permission rules. |
| 6 | Publish qualified workflow skills. | Useful expertise should be repeatable and portable. | Ship a few repository-backed workflows with prerequisites, tool needs, example tasks, and held-out acceptance. Evaluate against the same tasks without the skill. |

Start with one audience hypothesis: developers who want to complete real repository changes through a desktop agent while retaining control of the result. Validate the task-result and recovery workflow with a small group using their own repositories before expanding the product surface.

Measure time to first verified change, tasks accepted without corrective rework, recovery success, escaped regressions, and cost/time per accepted task. Define an accepted task using user acceptance plus recorded checks; token consumption alone is not progress. Establish baselines before setting numeric targets. Any future currency budget must explicitly handle unknown provider pricing and concurrent work; the existing turn limit is not a spending guarantee.

**Validation performed.**

Local runtime: macOS, Bun `1.4.2`; the repository pins `1.3.14`. This version difference is a reproducibility limitation, not an established cause of the failures.

| Check | Observed result |
| --- | --- |
| App unit tests, latest rerun | 767 passed, 1 failed: localization parity. Earlier run had 764 passed before concurrent test additions. |
| App browser-condition unit tests | 42 passed. These use Happy DOM and are not Chromium E2E tests. |
| Selected Chromium E2E journeys | 13 passed in 21.4 seconds, fixture data, desktop viewport 1280×800. Included provider retry, project permission copy, project/draft routing, old selected chats, worktrees, usage availability, child task navigation/submission, provider options, and reduced-motion keyboard collapse. |
| Desktop source tests | 71 passed across 15 files. No packaged Electron/native acceptance. |
| Focused Core tests | 80 passed across 8 files: admission, coordination, provider timeout/transport, task delegation/location, Jev registration, permissions. |
| Schema tests | 13 passed, 2 failed in event-manifest expectations. |
| Protocol tests | 4 passed. |
| Server tests | 2 passed. |
| Client tests | 15 passed, 1 failed in the expected public API groups. |
| Jev tests | 22 passed, using local fixtures; no live TypeSafe evaluation. |
| Session UI tests | 84 passed. |
| UI tests | 28 passed. |
| TUI package command | 194 passed, 1 skipped, 0 failed; its command discovered 45 files. |
| Package-local typechecks | Passed for App, Desktop, Core, Schema, Protocol, Server, Client, Jev, Session UI, UI, and TUI. App/Desktop were checked again after concurrent edits. |
| App production build | Passed in 14.61 seconds with large-chunk warnings, on the earlier reviewed snapshot. |
| Saved visual evidence | Inspected desktop sidebar, compact sidebar, and desktop agent activity captures. Not a fresh signed-in/native visual acceptance. |

No application fixes, dependency upgrades, skill installations, commits, or releases were performed. The deliverables are this review and its [machine-readable evidence summary](validation/workspace-review-2026-09-22.json). Raw command logs are in `/tmp/code-daddy-review-zQLBIT`; they are temporary and should not be treated as permanent CI evidence.

For subsequent E2E changes, preserve user-visible assertions, isolated data, and readiness-based waiting, as specified in the official [Playwright best practices](https://playwright.dev/docs/best-practices), [auto-waiting](https://playwright.dev/docs/actionability), and [assertion guidance](https://playwright.dev/docs/test-assertions). The current passing fixture journeys are a useful base for that work.
