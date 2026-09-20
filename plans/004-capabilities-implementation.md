# Capability and reliability implementation

Requested 2026-09-20 following the Luna/Sol/Terra application review. Work is layered over the existing uncommitted desktop, provider, sidebar, and delegated-session implementation; those changes are preserved.

## Scope and ownership

- Terra: canonical V2 MCP/plugin registration, scoped capabilities API, browser/Xcode presets, integration fixtures.
- Luna: typed OAuth attempt expiry and cancellation, delegated model selection and provider-turn budgets.
- Sol: production navigation baseline, safe interruption recovery, provider stream watchdogs, budget enforcement, independent review.
- Parent: capability setup and browser/Xcode workbench UI, provider and permission recovery, review feedback, delegated-task supervision, API generation, integrated verification.

## Design

The existing Solid/Electron workspace remains the UI foundation. Tools show actual server-side availability and permissions. Browser and Xcode actions use canonical V2 tool calls so transcript, approval, interruption, and output handling remain consistent. Browser work uses an isolated Playwright session. Xcode uses Apple's external-agent MCP bridge and reports missing prerequisites.

Recovery remains process-local and explicit. Restarted work is classified for review; provider work and side effects must never be silently replayed. Model and turn-budget controls preserve Location and ancestor permission boundaries.

All new visible copy uses typed i18n keys. Existing English source text is preserved; newly introduced English fallback strings require corpus-verified translations before claiming complete localization.

## Using the changes

On a V2 server, open a project and choose **Settings → Capabilities**, or **Workspace tools → Set up capability**. Browser setup configures an isolated Playwright MCP process on the server machine; Node.js/npm and a compatible installed browser are required. Its first setup can download the MCP package. Use **Test connection** or **Reconnect** to diagnose a connection.

Xcode setup uses `xcrun mcpbridge` on the server's Mac. Open Xcode and enable external-agent access in its Intelligence settings. Local Xcode detection is labeled separately from the server connection. This machine has Xcode 26.4 and the MCP bridge executable; this does not establish that a project has been built or that external access is enabled.

**Workspace tools** prepares editable browser navigation, screenshot, diagnostics, and Xcode inspection/build/test requests in the composer. Existing draft text and context are retained. Sending the request lets the agent call the registered tools through the usual permissions and transcript. Browser evidence is rendered from completed tool output attached to the current conversation.

**Agent tasks** shows delegated conversations and lets you open or stop them. Its delegation form prepares a task request with an agent, optional model, and maximum provider-turn allowance. This allowance is enforced by the runner and may be reduced by the agent's configured limit; it is not a token or monetary budget.

Unfinished saved work exposes **Resume after review**. It never resumes automatically on startup. Review the last response and tool results before resuming, since interrupted actions may already have produced side effects. Provider first-event and inactivity deadlines are configurable under `session.first_event_timeout_ms` and `session.inactivity_timeout_ms` (300,000 ms defaults).

The review panel's **Ask agent to address comments** button attaches the review comments to an editable draft. Persistent approval copy names the project scope and matching patterns. Provider load errors and expired OAuth attempts have explicit retry controls.

## Validation

The before-change production session-switch benchmark completed with no blank destinations, incorrect destinations, or review-host remounts. The final record will include package checks, native and browser fixture coverage, the after-change benchmark, and any environment-dependent acceptance limitations.

Current verification:

- App and regenerated Client package typechecks pass.
- The full app unit suite reports 736 passing and two failing tests. One failure is locale parity (new English fallback keys plus existing untranslated keys); the other is existing Punjabi locale detection. The focused MCP compatibility suite passes 13 tests; the workspace evidence suite passes two tests.
- Runner, watchdog, delegated-task, Location composition, and OAuth checks pass. A Location tool-list assertion was updated to include the concurrently added `project_logo` tool while retaining that feature.
- The real stdio MCP fixture passes three tests and 17 assertions: Draft 2020-12 schema preservation, enum/range rejection before execution, permission denial before execution, text/image results, stale tool calls, deregistration, and bounded startup/process cleanup.
- An isolated real Playwright MCP process exposed 25 tools, navigated a local fixture, clicked an observed button, and returned an inline PNG. Evidence: [result](validation/browser-mcp-smoke.json), [screenshot](validation/browser-mcp-smoke.png). This used headless mode for validation; the shipped preset is headed by default.
- Live Xcode project build/test execution has not been verified. Xcode and bridge executable detection passed; external-agent access and an open Xcode project are prerequisites.

Final acceptance:

- Production build and E2E typecheck passed. All five browser flows passed: capability setup/test and draft preservation, explicit recovery, delegated model/turn controls, provider retry, and project permission copy. [Full run record and screenshot paths](validation/capabilities-e2e.json).
- Core, Plugin, Server, Schema, Protocol, Client, and App package typechecks passed. Core MCP/plugin tests passed six tests and 25 assertions; Server recovery/OAuth HTTP tests passed two tests and 14 assertions.
- The final isolated production navigation benchmark passed both scenarios with zero wrong destinations, blank/unknown content, or missing/replaced review hosts. Run: `2026-09-20T17-55-56-533Z-42949`. Median cold/hot times were 44.4/14.9 ms for legacy, 46.2/13.4 ms for V2 with review closed, and 22.8/21.7 ms with review open. These are observations on this machine, not performance thresholds.
- Existing running apps and development servers were not restarted. Tests used isolated production preview processes.

Remote MCP OAuth is explicitly unsupported in this slice; header-authenticated Streamable HTTP and local stdio are supported. New strings remain English fallbacks until corpus-verified translation work is complete; the full app suite's two localization failures are unresolved and should not be represented as a clean full-suite run.
