# UI consistency fixes

Completed 22 September 2026. This closes the six actionable findings in the
[original UI review](jev-ui-review.md). Three implementation subagents handled
Settings, Jev disclosure, and composer controls; a separate reviewer found no
blocking issues. The existing provider/reset confirmation question was a design
question, not one of these defects.

## Changes and verification

| Finding | Implemented behavior | Verification |
| --- | --- | --- |
| Unnamed General switches | Hidden labels use the same typed English titles as their rows, including the legacy settings screen. | Browser found 11 named switches at desktop width; compact E2E checks 12 including the mobile-only option; installed app exposes 13 named General switches. |
| Unnamed Settings dialog | Added a visually hidden Settings title. | Browser announces “dialog Settings”; installed accessibility tree exposes Settings and its heading. Keyboard tab navigation still works. |
| Misleading disabled updater | Local builds explain that updating requires rebuilding and installing. Release updater actions retain their existing behavior. | Focused updater tests pass; the explanation is visible beside disabled Check now in the installed app. |
| Indistinguishable Jev operations | Collapsed titles distinguish failure triage and evidence ranking; ranking retains a bounded query cue without requiring a claim. | Component tests and timeline browser regression pass, including advisory/unavailable/invalid-input states and keyboard disclosure. |
| Stop disappears while drafting | A separate Stop stays available alongside Send during a working turn, in both composer implementations. | Shared V2 control tested in five states. Stop and Send increment separate callbacks; keyboard Stop works when Send is disabled; empty working input has one Stop. Legacy wiring independently source-reviewed. |
| Cramped compact Settings | Reduced content padding while keeping the 144px navigation column. | At 390×844, measured description width increased from about 94px to 150px. E2E checks copy width, complete tab labels, horizontal overflow and keyboard navigation. |

English copy remains behind typed dictionaries. No non-English translations,
provider settings, session storage, or permission policies were changed.

## Checks

- `packages/app`: `bun typecheck`, `bun run typecheck:e2e`, and
  `bun run test:browser` passed (42 browser tests). Focused updater tests passed.
- `packages/session-ui`: `bun typecheck`, six `basic-tool.test.ts` tests, and
  17 existing prompt-input tests passed.
- Two targeted Chromium regressions passed separately: the Settings case in
  `remote-session-settings.spec.ts` and `session-timeline-generic-tool.spec.ts`.
  The Settings test uses mocked remote responses; it does not modify the owner's
  live server configuration.
- Interactive browser checks exercised the real rendered components, including
  Stop/Send callbacks and Enter on Stop with Send disabled.
- Independent review found no blocking regressions. `git diff --check` passed.
- All 12 Jev source entries across 10 unique files still match their recorded
  hashes. Redacted secret scanning found no matches in the changed text/source
  files; that scan did not inspect Git history or screenshot pixels.
- A broad app-suite attempt still encountered inherited Solid browser-runner
  errors and non-English parity failures. The full app suite is not green.
  The other case in the remote-settings spec was not established as passing;
  its test-server lifecycle issue remains outside these targeted results.
- No live provider turn was started. These checks do not establish end-to-end
  cancellation against a running model, restored-session continuity, or complete
  app accessibility. Native Models displayed its catalog, but the computer-use
  accessibility snapshot omitted its descendants; no native Models label claim
  is made from that snapshot.

## Jev review and interaction measurements

Jev reviewed exact source excerpts and sanitized browser observations for all
six changes. All six returned `ok` with `supports`, without retries. Model:
`jev-1.13.0`; reported usage: 8,862 input and 422 output tokens. Its assessments
are advisory; it did not inspect screenshots or operate the app. Exact inputs,
outputs, timestamps and full-source hashes are retained in
[the result file](validation/jev-ui-fixes-review.json). Run
`bun plans/validation/jev-ui-fixes-review.ts` from the repository root to repeat
the review; unchanged successful checks are reused.

An identical production GenericTool fixture was measured before and after:
ten click-plus-accessibility-state round trips each. All disclosures toggled
correctly. Median was 268.5ms before and 269.5ms after. The first after-sample was
3,309ms, versus 264–275ms for the other nine; this outlier is retained. These
measurements include browser automation overhead and cannot establish isolated
render performance or a performance improvement. See
[before](validation/jev-ui-fixes-baseline.json) and
[after](validation/jev-ui-fixes-after.json).

## Installed build

The desktop build and package commands in
[the required update workflow](../documentation/desktop-updates.md) passed on
the `dev` channel. The idle installed app was quit normally, its previous bundle
retained, and the new bundle installed on 22 September 2026 at 16:16 local time.

- Source base: `dc16b78ec0d7e7bf38da9b90fc1e536e2b4083fb`, plus the current
  uncommitted UI fixes. The base commit alone does not identify this build.
- Installed: `/Users/alfredo/Applications/Code Daddy.app`.
- Backup: `/Users/alfredo/Applications/Code Daddy.previous-20260922-161631.app`.
- Packaged and installed `app.asar` SHA-256 both equal
  `7f0da4701902eff13f8685da9339b77d39e5ebd484d7529c958517f5bc2d9f28`.
- Local unsigned version remains `1.18.31`; use the artifact hash to identify
  this rebuild. Existing settings, saved project, draft tabs and selected model
  reappeared. Application data and the private Jev credential file were not
  replaced or deleted.
- The installed app opened, Home showed the saved project and recent-session
  controls, and General Settings passed the native checks above.
  The local project initialized and its model selector appeared. No model
  request was submitted.
- The four test-owned preview servers were stopped, review browser tabs closed,
  and viewport overrides reset. The installed app was left on Home.

## Evidence

- [Installed Settings](validation/jev-ui-installed-fixed-settings.png)
- [Compact Settings](validation/jev-ui-settings-fixed-390.png)
- [Stop and Send fixture](validation/jev-ui-stop-send-fixed.png)
- [Jev review runner](validation/jev-ui-fixes-review.ts)
- [Build provenance](validation/jev-ui-fixes-build.json)

The rebuild/package/install requirement is now recorded in `AGENTS.md` and
linked from the documentation map and desktop README. These changes are local
and have not yet been committed or pushed.
