# UI consistency review and installed app update

**Follow-up, 22 September 2026:** the six actionable findings below have been
fixed, checked with subagents and Jev, and installed in a new desktop build.
See [UI consistency fixes](jev-ui-fixes.md) for current status and evidence.
The remainder of this document preserves the original review and earlier build.

Reviewed 22 September 2026 against runtime source commit
`dc16b78ec0d7e7bf38da9b90fc1e536e2b4083fb`. English-only private desktop scope.
This task updated documentation and installed the existing runtime changes;
it did not implement the UI recommendations below.

## Installed app

The current desktop source was rebuilt, packaged on the `dev` channel, and
installed at `/Users/alfredo/Applications/Code Daddy.app`. The previous bundle
is retained at `/Users/alfredo/Applications/Code Daddy.previous-20260922-131841.app`.
Application Support, XDG data, provider credentials, and the private Jev key
file were not removed or replaced.

- Build: `OPENCODE_CHANNEL=dev CSC_IDENTITY_AUTO_DISCOVERY=false bun run build`
- Package: `OPENCODE_CHANNEL=dev CSC_IDENTITY_AUTO_DISCOVERY=false bun run package`
- Both commands ran from `packages/desktop` and completed successfully.
- Installed and packaged `app.asar` SHA-256 both equal
  `4e20fb5b0817732e7e954a731038adc281004468f133b7b09dce768da004e75a`.
- Installed and packaged bundled CLI SHA-256 both equal
  `b1bfca716dd71b766b8db5414e741c506b22aab5b2e17dd991cd1c02592d1b11`.
- The installed app opened. Home displayed the saved project and recent-session
  controls; Settings loaded. The initial restored tab displayed “This session
  cannot be found”; Home recovered without deleting data. This observation does
  not establish whether that older session still exists. Full restored-session
  continuity and live provider execution were not tested.
- The local package has no developer signing identity. Its version remains
  `1.18.31`; artifact hashes identify this rebuild. Source changes during this
  task were documentation/review artifacts only.

The mandatory rebuild, package, install, hash comparison, and startup workflow
is now linked from `AGENTS.md` and documented in
[desktop-updates.md](../documentation/desktop-updates.md). Git push and
development mode do not replace the installed app. The optional V2 background
CLI is still a pinned upstream binary; the default embedded server and desktop
renderer were rebuilt from local source.

## Findings

| Priority | Finding and consequence | Evidence | Jev assessment | Acceptance check |
| --- | --- | --- | --- | --- |
| P1 | General settings has visible labels but unnamed switches, making the controls indistinguishable to assistive technology. | Browser: 11 unnamed switches. Installed native app: 13. `SettingsRowV2` renders unrelated title elements; switches have no label children. | Supports | Every switch exposes its visible setting name; check General and Models. |
| P2 | Settings is an unnamed modal, while the server dialog has a title. | Browser accessibility tree and V2 dialog callers. | Supports | Opening Settings announces a dialog named Settings without changing the visible layout unnecessarily. |
| P2 | The dev build shows disabled “Check now” beside copy promising update checking, with no explanation of manual installation. | Installed app and updater state/source. | Supports | Explain that local builds require rebuild/install; retain normal release-channel update behavior. |
| P2 | Successful Jev triage and evidence-ranking rows use the same operation label. Ranking without a claim can also omit the query/passage cue. | Source-confirmed; full disclosure remains working. | Supports after one invalid response | Distinguish the operation in the collapsed label and retain a bounded input cue. |
| P2 improvement | Typing a draft during an active turn replaces the visible Stop action with Send, although keyboard stop remains available. | Source-confirmed only; steering support is intentional. | Supports the behavior claim | Keep Stop discoverable while allowing a steer/queued message; exercise both draft states before changing behavior. |
| P3, compact web view | At 390px, settings keeps a 144px navigation column and 40px panel padding. Descriptions have roughly 94px of usable width. | Browser-measured and screenshot-observed. Not a native-window-size claim. | **Contradicts**, including after the omitted navigation CSS was supplied | Recheck a compact layout with smaller padding or alternate navigation; measure overlap, focus and task usability, not only page overflow. |

The repaired Jev tool disclosure also passed a positive browser check: success,
unavailable, and invalid-input states have distinct labels; expanding unavailable
output reveals the result and input separately. Jev supported this claim. The
preview used real components with one recorded result and two synthetic error
records; it was not a fresh model-driven chat session.

Provider disconnect and reset-all currently act immediately, while session and
workspace deletion confirm. The source review records this as a design question,
not a verified bug or a requirement to add confirmation to every action. Those
operations have different consequences; decide whether undo or confirmation
would improve recovery before adding friction.

## Review method and limits

- Browser: current-source Vite app at `http://127.0.0.1:4198/`, General and
  Providers/Capabilities settings; 1280×720 and a settled 390×844 compact check.
  A temporary backend used isolated storage and no provider credentials.
- Native: installed `oc://renderer/index.html`, Home and General settings.
  The saved native screenshot is 1229×768 pixels; that is a screenshot size,
  not a measured CSS viewport. Existing Matrix theme and English preference
  were preserved. No provider calls, credential edits, or destructive controls
  were exercised.
- Jev received selected code excerpts and sanitized observations, **not images,
  session history, or credentials**. Its text-only support judgments do not
  replace browser/native verification and are not a visual accessibility score.
- Seven claims, nine recorded attempts: the latest results support six claims
  (five issue claims plus the positive disclosure check) and contradict one.
  One first attempt returned `invalid_response/ranking_answer`. Both that
  failure and the original compact-layout disagreement are retained. Correcting
  a missing CSS excerpt did not change the disagreement; no further retries
  were made to obtain agreement.
- Model `jev-1.13.0`; reported successful-call usage: 12,772 input tokens and
  584 output tokens. The invalid response does not expose token usage.
- All recorded source hashes still matched at completion. Build/package and
  `git diff --check` passed. No runtime source changed, so unit suites were not
  rerun solely for the documentation/review. This is not a complete UI audit.
- Temporary browser viewport overrides were reset and the two review servers
  were stopped. The installed app was left on Home.

## Evidence and reproduction

- [Detailed source review](validation/jev-ui-source-review.md)
- [Exact Jev inputs, outputs, timestamps and source hashes](validation/jev-ui-review.json)
- [Reproducible review runner](validation/jev-ui-review.ts): run
  `bun plans/validation/jev-ui-review.ts` from the repository root. It sends
  selected excerpts to TypeSafe, reuses unchanged successful checks, and
  appends results instead of discarding previous attempts. Optional
  `--only=check-id,check-id` narrows paid calls.
- [Compact settings screenshot](validation/jev-ui-settings-390.png)
- [Installed settings screenshot](validation/jev-ui-installed-settings.png)
