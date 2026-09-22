# Jev UI fixes validation

Date: 22 September 2026

## Implemented behavior

- Generic tool rows now keep scalar previews to 240 characters before they enter the trigger DOM. Payload fields such as Jev `evidence` are represented by a character count there, while the bounded input disclosure retains the supplied value.
- Generic completed output is rendered as escaped text, with valid JSON formatted for inspection and disclosures limited to 48,000 characters.
- Jev legacy tools and checksum-scoped V2 tools show an explicit advisory result, unavailable state, or input-attention state. The durable tool completion remains nonfatal and unchanged.
- Permission prompts recognize only exact legacy Jev action names and the `plugin.jev_<operation>_<checksum>` V2 form. They explain the TypeSafe destination and supplied test-failure excerpt or passages without exposing the checksum-bearing action as primary copy. Other plugin actions use metadata when available, then a localized generic fallback. No permission responses, scope, patterns, or authorization behavior changed.

## Verification

- `packages/session-ui`: `bun test src --only-failures` — **89 pass, 0 fail**.
- `packages/session-ui`: `bun typecheck` — **pass**.
- `packages/app`: focused permission-description test — **3 pass, 0 fail**.
- `packages/app`: `bun typecheck` and `bun typecheck:e2e` — **pass**. The E2E typecheck includes the new permission and GenericTool fixtures.
- A test-owned Vite preview ran on unused port 4179 with the production app/UI/session styles, then Chromium verified the real compiled GenericTool at 390px. It rendered the recorded rank-success result from `jev-after-rank.json`, plus unavailable and invalid-input states. The trigger showed only the 24,000-character summary; click and Enter each toggled the native disclosure; the opened detail showed escaped JSON. With the success disclosure open, `document.documentElement.scrollWidth` equaled the 390px viewport. The narrow success screenshot is [jev-generic-tool-success-narrow.png](/Users/alfredo/Documents/code-daddy/plans/validation/jev-generic-tool-success-narrow.png). The preview and browser were shut down after the check.
- Added deterministic Playwright fixtures for legacy and V2 Jev permission copy and GenericTool success, unavailable, invalid-input, 24,000-character evidence, narrow layout, and keyboard disclosure. They were typechecked but were not run against the full app because no app/server process was listening and package instructions prohibit restarting one.
- Added Storybook render states for Jev success, unavailable, and maximum-size evidence.

## Performance baseline

The required production timeline benchmark was attempted before UI edits:

```sh
OPENCODE_PERFORMANCE_RUN_ID=jev-ui-baseline-2026-09-22 \
  bunx playwright test --config e2e/performance/playwright.config.ts \
  timeline/session-timeline-benchmark.spec.ts \
  --grep 'streams assistant text without remounting or oscillating'
```

The production Vite build did not start its server within the configured 120 seconds, so it emitted no benchmark metric. No after-result is comparable. The later isolated component preview was not a benchmark and did not start or restart the app/backend.

## Existing unrelated validation issue

The full app localization-parity test currently reports 108 missing non-English keys that predate this change in the dirty working tree. The new English-only keys are named in the parity test's explicit English fallback allowlist, matching the app's existing dictionary merge that retains English when a locale lacks a key.
