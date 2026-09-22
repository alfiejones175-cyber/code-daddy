# Current development roadmap

Updated 22 September 2026. Start with the [documentation map](/Users/alfredo/Documents/code-daddy/documentation/README.md) for setup, architecture, and evidence.

## Product direction

**Audience and language:** this app is for the owner and a few friends. English is the only required language. Translation expansion, multilingual acceptance, public-launch preparation, and broad market validation are outside the current scope. This clarification supersedes the earlier 61-locale repair plan and public-distribution recommendations.

Keep the **OpenCode** direction and preserve access to its available free models. The current local development app is named Code Daddy. A forced product rename is not a prerequisite for this roadmap; existing package names, provider configuration, and release channels remain unchanged in this documentation pass.

Model access and release naming are separate. Both the [legacy provider](/Users/alfredo/Documents/code-daddy/packages/opencode/src/provider/provider.ts:184) and [V2 provider](/Users/alfredo/Documents/code-daddy/packages/core/src/plugin/provider/opencode.ts:174) have a public/no-key model path driven by provider/catalog data, not the desktop display name. Actual access still depends on the gateway's current model rules.

The official Zen documentation currently lists **Muse Spark 1.3 Contributor Free** (`opencode/muse-spark-1.3-contributor-free`) and says Zen can be used with other coding agents. Its free offers are time-limited. Preserve provider integration and current catalog discovery rather than tying access to branding. [OpenCode Zen](https://opencode.ai/docs/zen/)

For private use, focus on a working local build and a straightforward way to share it with friends. Preserve local data and make it clear whether an upstream update would replace the custom build. A public release pipeline, separate public identity, and a full cross-platform distribution matrix are not prerequisites.

## Next work, in order

| Order | Work | Current state | Completion evidence |
| --- | --- | --- | --- |
| 1 | Keep English correct and restore useful test coverage | Translation backlog is out of scope. Inherited tests still assert non-English parity; earlier review also found omitted package tests and Schema/Client assertion failures. | Follow the [English-only scope](/Users/alfredo/Documents/code-daddy/documentation/localization.md): check English copy/placeholders and scope mandatory language gates accordingly. Include relevant package suites in the Turbo graph, review contract expectations, and check one unchanged snapshot. |
| 2 | Protect OpenCode free-model access | Provider support exists; account/live model acceptance remains separate. | Preserve the `opencode` provider and catalog refresh; verify currently available free models remain selectable in public and connected states, paid models are distinguished, and an unavailable free model does not silently switch to a paid one. Exercise an actual selected model separately from deterministic CI. |
| 3 | Review current Jev findings | User testing is in progress. Existing CLI, triage/ranking tools, and local tests are implemented. | Triage the [Core](/Users/alfredo/Documents/code-daddy/plans/validation/jev-audit-core.md), [platform](/Users/alfredo/Documents/code-daddy/plans/validation/jev-audit-platform.md), and [response-diagnostic](/Users/alfredo/Documents/code-daddy/plans/validation/jev-audit-response-diagnostic.md) evidence. Separate confirmed defects, migration gaps, and uncertain advice; reproduce before implementing fixes. |
| 4 | Integrate Jev output review into the app | Planned. This is the next Jev product feature, ahead of skill/action selection. | Complete the staged [app integration plan](/Users/alfredo/Documents/code-daddy/plans/jev-integration.md): review a selected completed response against its requirements/evidence, preserve typed findings and provenance, show unavailable/stale states, and prepare an editable follow-up for the main agent. |
| 5 | Unify task results and recovery | Diff/review, delegated chats, and explicit recovery exist. A consolidated evidence view is proposed. | Show actual changed files/checks/artifacts alongside Jev advice; never equate an advisory score with test success. Verify interruption/reconnect/reopen continuity and invalidate outdated review evidence. |
| 6 | Make the private build dependable on the actual machines used | Local development and a few friends' installations are the target. | Verify startup, provider connection, sessions, dictation if used, and installation/update behavior on those machines. Preserve settings/history; document how friends get the custom build. No public release pipeline is required. |

The current V1/V2 compatibility path remains in place while request/context parity is incomplete. Resolve bounded migration gaps with fixtures; do not broadly switch callers to V2 merely to integrate Jev.

## Jev milestones

1. **Now:** finish the ongoing tests and label real examples; add precise, sanitized validation diagnostics if malformed responses recur.
2. **Next:** add a shared output-review operation with versioned narrow rubrics and deterministic fixtures.
3. **Then:** expose an explicit app review action, evidence/results UI, and an editable “address findings” draft using existing tool/permission paths.
4. **After evaluation:** offer opt-in review on task completion, with deduplication, cancellation, and bounded cost/latency. Keep live evaluation separate from required CI.
5. **Later:** evaluate Zen transport, skill suggestions, or action selection independently. None is needed to ship the first useful output-review flow.

Detailed contracts, evaluation criteria, and transport choices live in the [Jev integration plan](/Users/alfredo/Documents/code-daddy/plans/jev-integration.md).

## Existing plans and evidence

| Document | How to use it |
| --- | --- |
| [001 — Desktop workspace](/Users/alfredo/Documents/code-daddy/plans/001-desktop-workspace.md) | Original plan; delivered behavior is recorded in 003. Optional native-edge features remain separate. |
| [002 — Sidebar motion](/Users/alfredo/Documents/code-daddy/plans/002-sidebar-motion.md) | Original motion plan; consult 003 and 006 for later implementation/acceptance. |
| [003 — Desktop implementation](/Users/alfredo/Documents/code-daddy/plans/003-implementation.md) | Implemented sidebar, delegated chats, and provider behavior; dated verification limits. |
| [004 — Capabilities and reliability](/Users/alfredo/Documents/code-daddy/plans/004-capabilities-implementation.md) | Implemented capabilities/recovery/delegation work and remaining native/live-provider checks. |
| [005 — Sidebar usage and logos](/Users/alfredo/Documents/code-daddy/plans/005-sidebar-usage-logos.md) | Implementation and validation record. |
| [006 — Spectrum UI integration](/Users/alfredo/Documents/code-daddy/plans/006-spectrum-ui-integration.md) | Visual/motion decisions and dated browser/benchmark evidence. |
| [007 — Workspace review](/Users/alfredo/Documents/code-daddy/plans/007-workspace-review.md) | Broad review; release-direction recommendations are superseded by the explicit user decision above. Findings need rechecking as code changes. |
| [Jev integration](/Users/alfredo/Documents/code-daddy/plans/jev-integration.md) | Current evaluator status and staged app-output-review roadmap. |
| [Transcription repair](/Users/alfredo/Documents/code-daddy/plans/transcription-fix.md) | Dictation implementation and acceptance boundaries. |
| [Historical usability review](/Users/alfredo/Documents/code-daddy/documentation/usability-fixes.md) | Investigation baseline, not a current list of unresolved issues. |

Record newly completed work in the appropriate implementation document and change its roadmap status. Keep dated validation artifacts as evidence rather than treating old test counts as current release status.
