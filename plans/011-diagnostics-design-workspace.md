# To do: logs, containers, and design context

Status: draft, 24 September 2026. These are optional project capabilities, not prerequisites for local coding.

## Logs and services

1. Show the selected project's local process health, ports, recent bounded logs, and test artifacts. Reuse existing terminal and server ownership; do not automatically restart an app or service.
2. Where a project uses Docker Compose, expose service state and filtered logs without granting broad container mutations by default. [Docker Compose reference](https://docs.docker.com/compose).
3. If an owner connects Sentry, begin with read-only issue/trace search. Keep telemetry off by default as recorded in `plans/codex-alignment.md`; inspect payload redaction before enabling an SDK.
4. Correlate a user-visible failure with its process, request, log timestamp, and source revision. Store only bounded evidence needed for the task.

Acceptance: an agent can diagnose one failing local request and point to the exact process/log evidence without restarting services or exposing secrets.

## Design context

1. Offer Figma as an optional project connector when a project actually uses it. Start with read-only frame context, screenshot, assets, tokens, and component mappings. [Figma MCP tools](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/).
2. Map Figma components to Code Daddy's real UI components rather than pasting generated markup. Show a visual comparison between source frame and local implementation at desktop and narrow widths.
3. Treat write-to-canvas as a distinct action with target file and edit preview.

Acceptance: an agent can implement one linked Figma frame using existing components and show a live comparison; no Figma file is modified during a read-only implementation task.
