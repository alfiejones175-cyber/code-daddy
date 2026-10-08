# Project workflows acceptance — 2026-10-08

## Delivered scope

Project-scoped, manually started visual DAG workflows on the default local V1 server: task/model/skill selection, custom MCP connections and direct tool calls, computer tasks through a compatible MCP, Clef decisions, approvals, cancellation, durable history, definition import/export, and screenshot demonstration → editable project skill.

The [guide](../../documentation/workflows.md) records user instructions and limitations. V2, schedules, webhook triggers, automatic retries, loops, model fine-tuning, and direct Clef screenshot evaluation are not implemented.

## Source and automated checks

- Base commit: `e4afec5344a5484fcfe7e1d995feec86fe62b8f2`, dirty shared checkout. Existing agent-team, Jev, session, and other changes were preserved; the desktop package includes the working tree, not just this feature. No commit was created.
- Workflow source fingerprints: [manifest](workflows-2026-10-08-source.json). This identifies the feature files and selected integration files; it is not a complete repository snapshot.
- Implementation subagents used GPT-6.1 Sol following the user's clarified preference; focused review used GPT-6 Sol.
- Core engine and Clef adapter: **23 tests, 93 assertions**. Includes graph validation, both branch outcomes/merge, project isolation, durable approvals, exact approval identity, cancellation, execution bounds, crash interruption, and provider response validation.
- Backend: **13 tests, 54 assertions**. Includes actual HTTP routes, actual local stdio MCP execution and permission gates, argument references, safe skill persistence, typed validation errors, and canonical-path aliases.
- App transport/capture: **8 tests, 44 assertions**. Includes authentication/scope, approval payload, bounded typed errors, and capture cleanup races.
- Browser Solid store regression: **1 test, 6 assertions**. Selects a cloned draft from a real reactive store and verifies nested edits preserve the saved definition.
- Total targeted checks: **45 tests, 197 assertions**, all passing. Typechecks passed in schema, core, opencode, app, and desktop package directories. Earlier errors in concurrently edited agent-team tests cleared in the final checks.
- Legacy SDK regenerated with its prescribed script. Pre-existing duplicate generated copies with spaces in their names were restored after the generator's cleanup. The public client generator was also run; public V2 routes are unchanged.
- Independent review findings addressed: inherited `ask` permissions, stale executor placement, stale approval retries, OAuth failure reporting. Final focused review reported no high/medium findings. `git diff --check` passed.

## Browser acceptance

Used a separate server on port 4098 and preview on port 4448 with test data/config/state under `/tmp/code-daddy-workflow-smoke`. No production session data or provider credentials were used.

Verified Settings → Workflows, empty project state, project selection, new workflow editing, adding/removing and connecting steps, saved-definition selection, save, run, visible approval pause, approval to completion, a second run cancelled successfully, history, and the skill-teaching form's missing-model state. The canvas was inspected visually in the existing Matrix theme at a compact browser width.

The browser check found and fixed two defects: `/tmp` and `/private/tmp` aliases failed the save scope check; selecting a saved Solid store proxy failed `structuredClone`. Both received regression tests. The running preview used the canonical test path to validate save/run/approval without restarting its server; the alias fix was verified by the backend HTTP test and included in the final rebuild.

No live paid-provider, Cloudflare, OAuth-provider, or OS screen-capture trial was performed. The real installed app was not restarted. Concurrent unrelated source edits triggered Vite HMR resets after the successful run acceptance; these were not treated as installed-app acceptance.

## Desktop package and install

Final build completed successfully with `OPENCODE_CHANNEL=dev`, `CSC_IDENTITY_AUTO_DISCOVERY=false`, and cached model catalog `/tmp/code-daddy-workflow-models-final.json`. The source cache timestamp was **2026-10-08 16:31:52 BST** (same-day, minutes before the build). Catalog SHA-256: `aaafd157ccc81daeebc91f9d51fb3c3f6c9e67b9ad94d43d81d105b09cc89e8e`.

`bun run package:local` completed successfully and verified/staged the macOS ARM64 ZIP at **2026-10-08 16:45 BST**. The existing LaunchAgent is loaded, checks every 300 seconds, and last exited successfully. Artifacts:

- `packages/desktop/dist/mac-arm64/Code Daddy.app`
- `packages/desktop/dist/opencode-desktop-mac-arm64.zip`
- Packaged `app.asar` SHA-256: `62155a9deb998d65cc1290e7bf2ce052425b17f78c39e45a1cd49a95596dde51`.
- ZIP and cached updater ZIP SHA-256 both: `51b94922be283aa8ac4784f3b713498a073bfabbb1bdc8e977e1d5119a0955c2`. The updater marker matches both hashes.
- Installed `/Users/alfredo/Applications/Code Daddy.app/Contents/Resources/app.asar` SHA-256 after updating: `62155a9deb998d65cc1290e7bf2ce052425b17f78c39e45a1cd49a95596dde51`, matching the package.

**Installed at 2026-10-08 16:45 BST:** the user quit Code Daddy normally after the package was staged. The first installed smoke check exposed dialog width/scroll constraints; those were fixed, rebuilt, and repackaged. The idle app opened for smoke testing was quit normally through its native menu before refreshing the package. The updater installed successfully and retained `/Users/alfredo/Applications/Code Daddy.previous-auto-20261008-164543-1856.app` for rollback; the original pre-feature bundle also remains at `/Users/alfredo/Applications/Code Daddy.previous-auto-20261008-164124-93783.app`. Installed hashes match the final staged build. No application data, settings, credentials, or session history was removed.

Native acceptance: Home and Settings loaded, the sidebar Workflows action opened, and the actual default server loaded the project workflow catalog and custom MCP form. The final full-width layout was visually verified. The user began interacting with the installed app, so further desktop actions stopped. Live provider execution, OAuth, and the OS screen picker remain unverified; isolated browser run/approval/cancellation and automated coverage are recorded above.
