# Code Daddy development review — 25 September 2026

Code Daddy has substantial coding-agent infrastructure, but this review does not establish parity with Claude Code, Codex, or Cursor. The highest-value work is consistent model-cost enforcement, reliable access to supported workflows in the installed app, and a complete change → check → review → recovery journey. A broad visual rewrite is not warranted by the evidence.

## Scope and evidence

- Sol reviewed runtime reliability, pricing boundaries, recovery, permissions, and test coverage. Luna reviewed developer workflows. A second Luna directed and assessed the desktop walkthrough; the parent operated the UI because the desktop tool rejected delegated control with a root-only elicitation error.
- Source snapshot: `dev`, HEAD `75e4623`, with pre-existing changes in 14 tracked files and two new free-model files. Those changes were preserved. Source findings include that dirty tree; they are not all observations of the installed binary.
- The worktree continued changing externally during the review: final status also included model-tooltip and OpenRouter pricing files. No claim is made that this review covers those later edits.
- Installed app: Code Daddy, Settings reports OpenCode Desktop `1.18.31`, Matrix dark theme. Native screenshots are 2560×1600 capture pixels; CSS viewport dimensions were not measured. No window resize was performed; opening the review pane exercised a narrow conversation column.
- Installed and packaged `app.asar` SHA-256 both equal `07e004cb2933f552906392d8f5b425539dbb769d29221276ea7ffaa9d21cc0b7`. Both artifacts are dated 24 September. This proves installed/package equality, not equivalence to today's dirty source.
- No app model prompts, paid-model calls, Jev evaluation requests, credential changes, source fixes, rebuilds, installs, or app/server restarts were performed. Review-form opening only exposed inputs; Run review was not pressed. The initial empty draft and closed review pane were restored.
- Competitors were compared against current official documentation, not live benchmark runs. Free-model quality, streaming performance, crash/restart recovery, actual Git rollback, remote CI, and full accessibility remain unverified.

## Priority findings

**1. P1 — “Free” selection does not enforce free-only execution across the whole task. Source-confirmed.**

The new UI classifier correctly checks input, output, cache, context-tier, and extended-context prices: [free-model.ts](../../packages/app/src/components/free-model.ts:9). But public/no-key filtering in [V1](../../packages/opencode/src/provider/provider.ts:197) and [V2](../../packages/core/src/plugin/provider/opencode.ts:181) checks input price alone. A [V2 test](../../packages/core/test/plugin/provider-opencode.test.ts:312) explicitly retains a model with zero input price and positive output price. This is an eligibility inconsistency, not proof that the gateway actually bills a public request.

Separately, a V1 first prompt starts title generation. [Title model selection](../../packages/opencode/src/session/prompt.ts:193) can use a title-agent override or [small-model selection](../../packages/opencode/src/provider/provider.ts:1946), including a global override pointing at another provider. [Compaction](../../packages/opencode/src/session/compaction.ts:358) can also use an agent-model override. The visible free model alone therefore cannot certify a free-only request. No live prompt was submitted for that reason. V2 [default/fallback selection](../../packages/core/src/session/runner/model.ts:215) lacks an explicit free-only constraint; explicit unavailable selections correctly error instead of silently falling back.

**Improvement:** introduce one execution-level free-only policy shared by the main model, title, compaction, delegates, reviews, routines, and fallback. Verify every applicable price field, reject unknown pricing, and fail visibly rather than switching to paid inference. Show actual model/provider attribution for auxiliary calls as well as the main answer.

**Acceptance:** with synthetic output-only, cache-only, tier-priced, unknown-price, and paid auxiliary models, a free-only task must produce zero requests to those models. Test both V1/V2 and connected/public states. A verified all-zero model must remain usable.

**2. P1 — Default desktop and newer workflows are not aligned. Native-observed and source-confirmed.**

The desktop [selects V2 through an environment opt-in](../../packages/desktop/src/main/index.ts:64); the default remains V1. In the installed app, Settings → Capabilities ends with “Connect to a V2 server to use this workspace”; Settings → Routines ends with “Routines require a V2 server.” Neither blocked state supplies an action. See [capability fallback](../../packages/app/src/components/settings-capabilities.tsx:90), [routine fallback](../../packages/app/src/components/settings-v2/routines.tsx:109), and screenshots `04`/`06`.

Goals, durable queueing, the newer capability manager, and routines must not be described as default-installed parity based on source existence. V1 does have an in-memory follow-up queue and legacy tool configuration; these are not absent entirely.

**Improvement:** provide one supported installed workflow, with visible backend/build capability status and actionable connection/setup guidance. Finish bounded V2 compatibility and acceptance before considering a default switch; do not broadly flip backends while migration gaps remain.

**Acceptance:** package/install the chosen supported path in a subsequent implementation task; verify queued-input durability, permissions, explicit recovery, goals, routines, and capabilities against that exact binary. Unsupported screens must explain availability and offer a usable next step.

**3. P2 — Composer controls collide in split review. Native-observed.**

With sidebar, conversation, and review pane visible, the selected “Muse Spark 1.3 Free” model consumes substantial width. The Default variant and Send control visibly overlap in [capture 10](../../artifacts/review-2026-09-25/10-jev-form.png). This is a normal desktop review arrangement, not a phone-only edge case. The blank composer meant Send was disabled; accidental submission was not tested.

**Improvement:** reserve Send/Stop space; let model text truncate with an accessible full name; adapt the footer to conversation-container width with wrapping or an overflow menu. Preserve keyboard access to every option.

**Acceptance:** no overlap at 360/440/600px conversation widths, long model names, and Send/Stop/Queue states. Include screenshots and keyboard checks at the current user font/zoom as well as defaults.

**4. P1 — Task verification evidence is fragmented. Source-confirmed product gap.**

The app already has diffs, line comments, delegated tasks, and review preparation. However, `/verify` and `/review` are project prompt workflows, not a durable ledger of checks. The [current roadmap](../README.md) explicitly proposes the consolidated task wrap-up. The Jev form requires manually pasted evidence; its [submission payload](../../packages/app/src/pages/session/timeline/jev-response-review.tsx:83) does not automatically include actual test output or the displayed changed-file list.

**Improvement:** one task result with changed files, commands and exit status, test artifacts, delegated outcomes, CI links, and advisory review findings. Offer specific recorded excerpts to Jev with provenance and explicit selection. Invalidate evidence when relevant files change. Keep “tests passed” distinct from “the model says they passed.”

**Acceptance:** a task containing a pass, failure, skipped check, delegated task, and advisory result must render each accurately with links. Editing a reviewed file must mark relevant evidence stale.

**5. P1 — Root CI does not exercise several existing package suites. Source/tool-confirmed.**

`bun turbo test --dry=json` enumerates only app, core, function, session-ui, ui, and opencode. [Turbo configuration](../../turbo.json:11) omits Client, Schema, and LLM test tasks; Schema also lacks a package test script. Root CI success is consequently narrower than an all-package signal.

**Improvement/acceptance:** wire the relevant package suites into the graph, verify the dry-run contains them, and run tests from package directories. Retain the English-only localization scope rather than treating inherited translation parity as a private-app release requirement.

**6. P2 — Recovery warns honestly but cannot reconstruct completed side effects. Source-confirmed limitation.**

The current dirty English UI correctly warns that interrupted work may already have changed files or external state. Do not reopen the old missing-warning finding. [Recovery inspection](../../packages/core/src/session/recovery.ts:19) nevertheless reports coarse reasons, while [unfinished tools](../../packages/core/src/session/runner/llm.ts:125) are marked interrupted. A durable inventory of what definitely finished versus what may have happened is missing.

**Improvement:** record command/tool attempts and settlement, relevant file snapshots, and uncertain external effects; show these before explicit resume. Preserve the existing no-silent-provider-replay rule.

**Acceptance:** disposable crash fixtures before execution, after a file side effect, and before settlement, including a stale Resume action from a second client. Never promise automatic rollback of arbitrary external effects.

**7. P2 — Settings and developer-tool discovery need context-aware guidance. Native-observed.**

General settings displays a disabled Auto-accept permissions switch from the new-session view with a generic description but no visible reason. [Source](../../packages/app/src/components/settings-general.tsx:327) disables it when no directory context is resolved. File tree, command palette, and server-status visibility are also off in this user's settings; that observation does not prove the defaults are wrong. Routines leads with implementation-heavy scheduling details before saying it is unavailable.

**Improvement:** explain why controls are unavailable and link to the right context. Put availability and the next action first; move scheduling caveats into secondary help. Make code navigation, task state, and review easy to find without forcing this user's preferences to change.

**8. P2 — GitHub/CI context is planned, not an accepted end-to-end workflow. Source/document-confirmed.**

The [GitHub/CI workspace plan](../010-github-ci-workspace.md) is TODO; a read-only capability preset is not yet a verified issue → failed run → patch → check → review workflow.

**Improvement/acceptance:** start with read-only issue/PR/run context, bounded logs, exact source/run identifiers, and stale-state handling. Distinguish a local passing test from a remote CI result. Then connect review and publishing actions with appropriate user intent.

**Permission boundary to preserve in the design:** [V2 bash](../../packages/core/src/tool/bash.ts:109) intentionally executes with host-user filesystem/process/network authority after approval; external command arguments are advisory. Its [test](../../packages/core/test/tool-bash.test.ts:315) verifies execution despite an external-directory denial. This is not an OS sandbox. Approval language should make the actual authority clear; stronger isolation requires a process boundary, not merely more path heuristics.

## Competitor comparison

These are documentation-based reference workflows, not measured rankings. Rollout and client differences matter.

| Product | Relevant documented capability | Code Daddy improvement target |
| --- | --- | --- |
| Claude Code | Custom subagents with separate context and tool/permission controls; checkpoint rewind. Checkpoints have explicit exclusions, including Bash changes and most subagent edits. [Subagents](https://code.claude.com/docs/en/sub-agents), [checkpointing](https://code.claude.com/docs/en/checkpointing). | Make delegation and recovery predictable, inspectable, and tested. Show exactly what can be restored and what cannot. Existing delegation/undo infrastructure should be refined, not declared missing. |
| Codex | Parallel worktrees with local/worktree handoff; review scopes, line feedback, staging/reverting/committing. [Worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees), [code review](https://learn.chatgpt.com/docs/code-review). | Complete an installed task → isolated changes → checks → review workflow, with unambiguous task/worktree identity and reliable restart behavior. |
| Cursor | Integrated code search, browser tooling, queued/steered work, checkpoints, and dedicated Agent Review. Current search docs describe a local exact-match index, so do not assume an embeddings architecture from older descriptions. [Search](https://cursor.com/docs/agent/tools/search), [Agent](https://cursor.com/docs/agent/overview), [Agent Review](https://cursor.com/docs/agent/agent-review). | Reduce context-gathering and review friction: discoverable files/symbols/diagnostics, stable side-by-side layout, and evidence linked to actual edits and tests. |

The plausible opportunity to outperform these tools for this owner's workflow is a model-flexible, genuinely free-only workbench with clearer evidence and recovery. That is a proposed differentiator, not an achieved superiority claim. Model capability remains separate from application UX; no same-task quality benchmark was run.

## Recommended sequence and measurement

1. Enforce execution-wide free-only policy and align backend/UI pricing rules. Repair split-pane composer and blocked-state guidance. Add omitted CI suites.
2. Validate the supported installed runtime across task creation, queueing, delegation, review, and explicit recovery. Record exact build identity and acceptance evidence.
3. Deliver the consolidated task result and provenance-aware Jev evidence selection. Connect read-only CI context.
4. Measure free models on disposable fixtures: fix a failing test, make a multi-file change, diagnose a UI bug, resume interrupted work, and review a planted defect. Track correct completion, regressions, human interventions, check provenance, recovery accuracy, latency, and any nonzero/unknown-cost call. Separate model quality from UI success. Competitor live trials need separately available no-charge access; none were performed here.

## Validation performed

- App free-model tests: 2 passed, 0 failed, 7 assertions. Command from `packages/app`: `bun test --conditions=solid --preload ./happydom.ts ./src/components/free-model.test.ts`.
- Sol's focused Core suite: 128 passed and 1 failed because its HTTP fixture could not bind port 0 (`EADDRINUSE`). No product assertion failed in that run, but the command was not fully green. Command from `packages/core`: `bun test test/plugin/provider-opencode.test.ts test/session-runner-model.test.ts test/tool-bash.test.ts test/session-runner.test.ts --timeout 30000`.
- Native walkthrough: initial loading settled; four Zen Free rows displayed and selected model was clear; settings/provider navigation worked; Escape returned from settings; existing completed session loaded; review supplied an actionable no-Git state; workspace tools exposed setup; Jev form showed disclosure and optional evidence. No setup/mutation or provider inference was triggered.
- Screenshots are in [artifacts/review-2026-09-25](../../artifacts/review-2026-09-25). Luna's [walkthrough assessment](review-2026-09-25-luna.md) records visual findings and limits.

Public distribution, new translations, broad branding changes, and rebuilding an IDE from scratch are outside the recommended scope.
