# Browser and Xcode workspace validation

Date: 24 September 2026. Source checkout: `dev` at `1201566d710b0ea1c2a19cdf9ebb5ccceada8625` with uncommitted changes.

## Completed checks

- `bun typecheck` passed from `packages/app` and `packages/desktop`.
- Focused desktop tests passed: Browser preview, Xcode probes, and V1 project MCP config (13 tests).
- Workspace evidence and URL tests passed from `packages/app` (2 tests).
- Desktop `bun run build` passed with a local `models.dev` snapshot from 24 September 2026, 17:12 local time.
- The macOS dev ZIP was packaged, verified, staged through the local updater, and installed at `/Users/alfredo/Applications/Code Daddy.app`. The packaged and installed `app.asar` SHA-256 hashes both equal `07e004cb2933f552906392d8f5b425539dbb769d29221276ea7ffaa9d21cc0b7`. The updater's installed archive hash matches its staged marker.
- Xcode is present: version 26.4 (build 17E192).
- A read-only `xcrun simctl list devices available -j` probe succeeded. Eleven iOS 26.4 simulators are available; all are shut down, so no simulator screenshot could be captured without booting one.

## Open checks

- A Browser MCP navigation and an Xcode MCP tool call have not yet been run in the packaged desktop app.
- Native preview positioning, diagnostics, and simulator capture have not yet been visually smoke-tested in the installed app.
- The production navigation benchmark did not produce a valid comparison. All three cases in `home-tab-navigation-benchmark.spec.ts` failed against the current checkout: the first timed out waiting for navigation samples; the second did not find the review body; the third failed while closing a tab. The test report and screenshots are under `packages/app/e2e/test-results/performance/`. No performance conclusion is drawn from this run.
- Startup smoke remains open. The installed app was closed for the updater and was not restarted during this task, per `packages/app/AGENTS.md`.
