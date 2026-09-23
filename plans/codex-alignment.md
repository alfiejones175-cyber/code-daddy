# Codex workflow alignment

Status: implementation in progress on 2026-09-23. This plan describes a private, local-first coding workflow for the owner and a few friends. The implementation record below distinguishes source changes from a packaged or installed desktop app.

The installed Code Daddy app currently connects to its default V1 local server. Durable goals, the V2 queue API, MCP manager, and routines require a V2 connection. The V1 composer still supports an in-memory follow-up queue while the app stays open. The optional `OPENCODE_SIDECAR_V2=1` path now packages the CLI built from this checkout, but the newly added V2 flows have not been smoke-tested through that desktop mode.

Build, test, package, and installed-app observations are recorded in [the implementation evidence](validation/codex-alignment.md).

## Implementation record

| Slice | Source status | Evidence and current limit |
| --- | --- | --- |
| Work gates | `/verify`, `/review`, and `/goal` project commands added; `/rmslop` tightened | Commands are prompts, so each run must still report actual checks. |
| Goal | Durable per-session V2 goal storage, model tool, HTTP lifecycle, progress and blockers | Core goal/tool/migration tests and server route test pass. Budget is advisory. No dedicated goal panel or automatic continuation after a completed turn yet. |
| Prompt queue | Explicit Queue action, durable V2 admission/list/cancel, retry with the same message ID; legacy V1 retains its local queue | Focused prompt tests and capability browser regression pass. Queued items appear in the dock until promotion, then in session history. Post-crash execution replay is outside V2's current safety boundary. |
| MCP manager | Project-scoped add/list/test/reconnect/disconnect/remove, OpenAI Docs and read-only GitHub presets | Core MCP tests pass. GitHub needs Docker and account sign-in; live GitHub connection has not been validated on this Mac. V2 remote OAuth remains unsupported. |
| Sentry | Existing SDK hook stays disabled without `VITE_SENTRY_DSN` | No Sentry account, telemetry, or Sentry MCP was enabled by this work. |
| Routines | Durable interval scheduler and V2 management API; Settings → Server → Routines can create, list, pause, resume, delete, and inspect runs | Core scheduler, server route, and App typechecks pass. Run history records queue admission, not agent completion. An already claimed run can still be admitted after pause/delete; editing requires replacing the routine. Installed app showed the V2-only notice under its default V1 server; an end-to-end V2 desktop run remains open. |

## Intended outcome

Make common Codex-style work repeatable in this workspace: explicit verification and review, durable long-running goals, predictable prompt queueing, manageable MCP connections, useful OpenAI documentation and GitHub context, and optional background routines. Do not imply that a V2 feature is usable on the default V1 desktop connection until its actual app check passes.

## Sequence

### 1. Establish the work gates

Use `/verify`, `/review`, and `/rmslop` as the final quality gates when available in the active environment. Verify that each command exists and understand its scope before relying on it. A pass must refer to completed output from that run, with failures and skipped checks reported plainly. `/verify` checks the relevant build/tests/typechecks or observable behavior; `/review` inspects the resulting diff for correctness and regressions; `/rmslop` removes unsupported claims, filler, placeholders, and unnecessary complexity without weakening behavior or evidence. If a gate is unavailable, record the equivalent concrete check instead of claiming the slash command passed.

Acceptance:

- A task summary names the checks that ran, their results, and relevant artifacts or limitations.
- Review is against the actual changed files and user request, not an earlier or imagined diff.
- No claim of a clean suite, install, or deployment exceeds the evidence collected.

### 2. Add durable `/goal` tracking

Provide a persistent goal record for work that spans turns or sessions. It should capture one concrete objective, current status, progress, blockers, and completion evidence; ordinary requests should not silently become goals. Resuming a paused or blocked goal should continue from its saved context, and completion should require evidence that the stated objective is achieved. Keep goal state separate from a prompt queue and from background jobs.

Acceptance:

- Create, inspect, update, resume, complete, and pause a goal through a clear user-facing flow.
- A restarted app can recover the goal and its latest status without replaying completed work.
- A goal is not marked complete because work stopped, time ran out, or a check was skipped.

### 3. Define prompt queue behavior

Make queued work visible and deliberate. A normal prompt steers the current task and becomes eligible at a safe turn boundary; an explicitly queued prompt waits until the current task would otherwise become idle. Promote queued prompts one at a time, show pending/running/completed/failed state, and provide cancellation and retry behavior. Preserve identity across an exact retry, and do not create duplicate work when the same delivery is repeated. In-session prompts and durable goals remain distinct concepts.

Acceptance:

- The user can tell whether a prompt is steering, queued, running, or finished.
- Current work is not interrupted by an ordinary queued prompt; explicit stop/cancel remains available.
- Queued items run in the displayed order, one at a time, and survive the persistence boundary promised by the implementation.
- Restart, retry, cancellation, and duplicate-delivery cases do not lose or duplicate admitted prompts.

### 4. Manage MCP connections and add focused integrations

Expose configured MCP servers in one management surface: connection state, tools/capabilities, reconnect/disconnect, and clear errors. Make permissions and remote/local execution boundaries visible before enabling a server. Start with OpenAI Developer Docs MCP (read-only documentation search) and read-only GitHub context for repository work. Use the [OpenAI Docs MCP guide](https://developers.openai.com/learn/docs-mcp) and [GitHub MCP server documentation](https://github.com/github/github-mcp-server) as implementation references; confirm current permissions and supported operations at implementation time.

Acceptance:

- A user can add, inspect, disable, reconnect, and remove a server without losing unrelated settings or credentials.
- Tool names and descriptions are inspectable after connection; the app's ordinary tool permission check applies to execution. Authentication and repository scope still depend on the connected MCP server's own account configuration.
- OpenAI Docs retrieval is read-only and returns source links. The GitHub preset sets `GITHUB_READ_ONLY=1`; writes require a separately reviewed configuration.
- Failure of an optional MCP server does not prevent local editing or use of other providers.

### 5. Consider optional Sentry diagnostics

Sentry is a service that collects application errors and performance events so a developer can see where failures happened and investigate them. It is a possible opt-in diagnostics source, not a requirement for this private app. The Sentry MCP can let an agent search existing Sentry issues; that is separate from enabling telemetry in this application. The web and desktop renderers already contain Sentry SDK initialization guarded by `VITE_SENTRY_DSN`; local builds should omit that variable until the owner chooses otherwise. See the [Sentry MCP project](https://github.com/getsentry/sentry-mcp).

Privacy choice for this plan: **telemetry stays off by default**. First evaluate read-only access to an existing Sentry project only if the owner chooses to connect it. Before enabling the existing SDK, decide explicitly what data leaves the machine, provide an obvious opt-in and disable control, scrub tokens, prompt contents, local paths, and personal data, and document retention/account scope. Do not enable Sentry merely to make the feature roadmap look complete.

If the Sentry MCP is considered later, review its own diagnostics setting too: [the current server documentation](https://github.com/getsentry/sentry-mcp/blob/main/packages/mcp-core/README.md) says its stdio server reports traces/errors upstream by default and provides `--sentry-dsn=` to disable that reporting. Restrict it to the `inspect` skill and read-only account scopes for a first connection.

Acceptance:

- No events are sent before explicit opt-in; disabling it prevents later sends.
- A review identifies exactly which fields are transmitted, and a test or inspection confirms sensitive values are scrubbed.
- Sentry MCP access is read-only initially and uses the narrowest practical account/project scope.

### 6. Add background routines

Only after goals, queueing, and MCP permissions are dependable, consider user-scheduled routines such as checking a task or summarizing a selected repository. A routine must have a clear owner, scope, schedule, model/tool permissions, and visible run history. It should be pausable, cancellable, and safe after restart. Routine prompts must not quietly gain access to broader files, providers, or remote tools than the user configured. The first implementation uses the target session's existing model and tool permissions and records prompt admission; it does not yet link a run to the final agent outcome.

Acceptance:

- The user can inspect, pause, resume, edit, and delete each routine and inspect every run result.
- Runs are deduplicated across restarts and have bounded time, retries, and resource use.
- External writes or messages require explicit per-run authorization unless a narrowly scoped standing permission was separately configured.

Current acceptance gaps: the first implementation has no edit action or final agent-result tracking, and a claimed run may enter the queue after pause/delete. The user must replace a routine to change it, and the history screen labels admission states rather than completion states.

## Known boundary: V2 ChatGPT/Codex OAuth

The V2 OpenAI plugin currently registers ChatGPT browser and device OAuth in [openai.ts](../packages/core/src/plugin/provider/openai.ts) and uses the OpenAI Responses SDK path, but that alone does not establish subscription/Codex request compatibility. The [V2 session model path](../packages/core/src/session/runner/model.ts) still resolves credentials through generic bearer authentication; it needs the subscription-specific endpoint adaptation, account metadata/headers, refresh behavior, supported model checks, and streaming/tool-result validation described in the [desktop workspace plan](001-desktop-workspace.md). Treat this as an explicit compatibility limitation until verified end to end. Do not claim OAuth login means Codex subscription access works, and do not fall through to paid API-key billing after a subscription rejection.

V2 remote MCP OAuth is a separate limitation: [the MCP service](../packages/core/src/mcp.ts) currently rejects remote configurations with OAuth enabled. OpenAI Docs works without authentication, but GitHub and Sentry remote OAuth require an explicit implementation and verification before their account-backed presets can be offered.

## Rollout and evidence

Implement one slice at a time, with focused package checks and a source/diff review. For UI or desktop behavior, follow [desktop update workflow](../documentation/desktop-updates.md) before calling the installed development app current. Record real results in an implementation/evidence document and update this plan's status; a proposal is not proof of implementation, installation, or deployment.
