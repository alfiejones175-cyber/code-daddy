# Jev completed-response review validation

Checked September 23, 2026 against the local `dev` working tree at commit `dc16b78ec0d7e7bf38da9b90fc1e536e2b4083fb` plus uncommitted changes. This records the explicit review feature, not a measured accuracy claim.

## Behavior checked

- Jev receives the selected completed response, edited requirement, and optional supplied excerpt only after the user chooses **Run review**.
- The evaluator returns four typed, versioned advisory assessments with message and evidence digests. Unknown or duplicate evidence references are rejected. A check claim cannot be marked supported without a cited supplied excerpt.
- The authenticated legacy session endpoint persists the bounded review record and marks it stale when the response text changes. The original response is not duplicated in the saved record.
- The app shows findings, supplied evidence, changed files from the task summary, unavailable and stale states, and an editable **Address findings** draft.

## Checks run

| Check | Result |
| --- | --- |
| `packages/jev`: `bun typecheck`; `bun test test/evaluator.test.ts` | Passed, 12 tests |
| `packages/opencode`: `bun typecheck`; `bun test test/server/httpapi-session.test.ts` with local test environment | Passed, including review persistence and staleness |
| `packages/app`: `bun typecheck`; focused request and permission-description tests | Passed |
| `packages/app`: `bunx playwright test e2e/regression/jev-response-review.spec.ts --project=chromium` | Passed, 1 isolated browser test covering submit, saved result, reload, and stale state |
| `packages/session-ui`, `packages/client`, `packages/sdk/js`, `packages/desktop`: `bun typecheck` | Passed |
| Live Jev request | One synthetic completed-response review succeeded with `jev-1.13.0` and returned four typed findings; no user session text was sent |
| Disposable localhost server | Started with temporary XDG directories and returned a healthy `/global/health` response |
| Desktop `dev` build and ZIP package | Passed with a cached `models.dev` snapshot dated September 23, 2026. The DMG builder failed with `hdiutil: Operation not supported by device`; the local updater uses the successful ZIP. |
| Installed app startup | Home loaded after the runtime `SessionExecution` binding fix |
| Installed bundle verification | Packaged and installed `app.asar` SHA-256: `928a6ff52c76d9f0fa5e722010e2c444707756b52dd2b81c2be89470bb241715`; bundled CLI SHA-256: `57e2adb2efc46f4b09d53ae88adbec230e76adaa3eb3cef0d572f5430d1d6844` |

The app's broad localization parity test still reports 113 inherited missing keys in Arabic. This feature's English keys are covered by the existing English-only scope; no non-English dictionaries were expanded.

## Remaining validation

No native review of a completed session was made during this check. The deterministic HTTP fixture, browser test, and single synthetic live call verify wiring and failure behavior, but real review quality still needs labeled task examples. The browser fixture displays an Opus model label from static mock data and made no Opus provider call. Automatic review remains out of scope until quality is measured.
