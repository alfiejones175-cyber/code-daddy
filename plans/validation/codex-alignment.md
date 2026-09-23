# Codex alignment implementation evidence

Date: 2026-09-23 (Europe/Ljubljana). Source checkout: `dc16b78ec0d7e7bf38da9b90fc1e536e2b4083fb` plus uncommitted workspace changes. This records the feature slice in [the plan](../codex-alignment.md); other concurrent workspace edits are not attributed to this slice.

## Checks

- `bun typecheck` passed from `packages/schema`, `core`, `protocol`, `server`, `client`, `opencode`, `app`, and `session-ui`.
- Focused Core tests: 54 passed across MCP, prompt admission, goals, routines, and migration files. Focused Server tests: 3 passed. App prompt submission tests: 14 passed. Client API tests: 7 passed.
- `packages/core`: `bun run migration --check` passed. Prettier on changed MCP, routine UI, English copy, mock-server, and API bridge files passed. `git diff --check` passed.
- `packages/app`: `bunx playwright test e2e/regression/capabilities.spec.ts --reporter=line` passed 7 browser tests. The V2 queue endpoint was added to the shared browser mock to match the new UI request.

## Desktop build and install

- `packages/desktop`: `OPENCODE_CHANNEL=dev CSC_IDENTITY_AUTO_DISCOVERY=false bun run build` passed with `CLANG_MODULE_CACHE_PATH` and `SWIFT_MODULECACHE_PATH` under `/private/tmp` and `MODELS_DEV_API_JSON=/Users/alfredo/.cache/opencode/models.json`. That local catalog snapshot was 4,890,225 bytes and dated 2026-09-23 18:47:20 local time. The build's embedded CLI `--version` smoke test passed (`1.18.31`). `VITE_SENTRY_DSN` was unset.
- `bun run package:local` produced `dist/mac-arm64/Code Daddy.app` and `dist/opencode-desktop-mac-arm64.zip`, then failed while electron-builder tried to fetch a GitHub-hosted packaging dependency for the DMG (`ENOTFOUND github.com`). The ZIP passed `unzip -tq`. The `app.asar` inside the ZIP and the packaged app both hashed to `928a6ff52c76d9f0fa5e722010e2c444707756b52dd2b81c2be89470bb241715`.
- `scripts/local-update.sh mark` staged that verified ZIP in the enabled local updater. The updater installed it at `/Users/alfredo/Applications/Code Daddy.app`. The installed `app.asar` hash matched `928a6ff52c76d9f0fa5e722010e2c444707756b52dd2b81c2be89470bb241715`. Its current process started at 19:10:44 local time after the updater's 19:10:41 install log entry.
- Computer-use smoke check of the installed app: Home and Settings loaded; Settings exposed the Routines tab. The tab displayed “Routines require a V2 server” because this installation uses its default V1 local server. The V2 goal, queue, MCP, and routine flows were validated by package tests and browser mocks, not end-to-end against the installed V2 desktop sidecar.

## Remaining limits

- The default desktop server is V1. Its local prompt queue works only while the app remains open. Durable queue, goal, MCP management, and routines require a V2 connection; switching the installed app to the optional V2 sidecar and smoke-testing those flows is still needed.
- GitHub MCP could not be connected live because this environment had no Docker daemon access and external GitHub DNS was unavailable. The preset is read-only and requires Docker and account sign-in.
- Sentry telemetry and Sentry MCP were not enabled. The existing SDK remains gated by `VITE_SENTRY_DSN`.
- Routine history tracks prompt admission into a session, not final agent outcome. Editing requires replacement. A claimed prompt may still arrive after pause/delete.

## Worktree review before push

- All 12 affected packages passed package-local `bun typecheck`. Focused Core, Server, Client, Jev, and App tests passed, including 22 HTTP API tests, 25 prompt admission tests, and 20 App tests with the required Solid/Happydom harness. The Core migration check and `git diff --check` passed.
- Browser regressions for Jev response review, remote session settings, and generic tool timeline passed after replacing an obsolete tab-strip selector in the remote-session test.
- Independent review found that cancellation deleted the only queued-prompt admission record. An exact retry could re-admit the cancelled prompt. Admission now checks the durable cancellation event for that session and message ID; the new regression verifies the retry fails without creating another inbox row.
- Independent review also found that `package:local` cleared its previous update marker and could fail on DMG packaging after producing a valid ZIP. The local package command now builds the ZIP alone and marks it only after the packaged app and archive match. The prior failed DMG attempt remains historical evidence above.
- The final `dev` desktop build passed, including its embedded CLI version smoke check. The revised ZIP-only `package:local` passed with network access for Electron's packaging dependency, and `unzip -tq` found no archive errors. The staged app's `app.asar` SHA-256 is `58d6f78a8d246083b5e8059de153164e3e14794dc3b7c92378f415d19afc0c8d`. The installed app still has the earlier `928a6ff52c76d9f0fa5e722010e2c444707756b52dd2b81c2be89470bb241715` hash because it was running during the updater check. The staged update is pending until the app quits; this final build has not had an installed-app smoke check.
