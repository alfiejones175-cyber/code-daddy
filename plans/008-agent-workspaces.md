# Agent workspaces: Browser and Xcode

Status: implemented, packaged, and installed locally; live feature verification pending, 24 September 2026.

Code Daddy already has project-scoped Browser (Playwright) and Xcode MCP presets plus a Workspace Tools dialog. This work gives that dialog direct observation surfaces while retaining the agent's existing tool permission checks. The native Browser preview is a human-visible web view; Playwright remains the agent's browser automation environment. They do not share cookies or page state by default.

## 1. Browser workspace

- Embed a project-scoped HTTP(S) preview in the desktop app with address, reload, close, screenshot, and bounded console/network diagnostics.
- Keep remote content in a sandboxed Electron `WebContentsView` with Node disabled and no preload. Validate URL schemes, deny unexpected navigation and window creation, and destroy the view when its host window closes.
- Preserve the existing Playwright connection and draft prompts for DOM interaction and agent evidence. Label the preview and Playwright as separate browser contexts.
- Show the latest browser tool outputs and screenshots from the active session, including the tool name and time. Do not imply an old screenshot is a live view.
- Work on web builds too: show the Playwright connection and evidence, and explain that native preview requires the desktop app.

Acceptance: navigate to a local development URL, see the live page, capture its screenshot, inspect one console or failed-request diagnostic, close the workspace without leaving a visible native view, and confirm unsupported schemes are rejected. Verify session evidence is still visible and correctly attributed.

## 2. Xcode and Simulator workspace

- Detect Xcode and scan the selected project for an `.xcworkspace`, `.xcodeproj`, or Swift package.
- Display available schemes/targets and simulators through bounded, read-only native probes. Show setup and errors in context.
- Keep Build and Test actions as editable agent drafts through the connected Xcode MCP bridge. The agent must report the actual command, result, and relevant errors.
- Permit a screenshot from a selected booted simulator when supported, and show it as explicitly captured evidence with time and device.
- Avoid acting on another project: every probe uses the selected project directory, validates paths, and has a timeout and output limit.

Acceptance: with Xcode installed and a project open, show its schemes and available simulators, produce a simulator screenshot where a simulator is booted, and verify the Build/Test drafts invoke the connected Xcode tools when submitted. Missing Xcode, missing project, and no booted simulator must be understandable states.

## Release gate

The desktop app uses the V1 sidecar by default. Workspace Tools now offers a V1 path that writes a project-scoped Browser or Xcode MCP preset to `opencode.jsonc` or `opencode.json`, then connects it through the V1 `/mcp` endpoint. V2 retains the Capabilities manager. The native preview and Xcode probes use a separate desktop bridge. Source typechecks and focused tests cover the bridge and config writer; a live Browser/Xcode agent tool call still needs to be verified in the packaged app. Follow `documentation/desktop-updates.md`: typecheck, build, package, install when the app is closed, compare hashes, then run a startup and feature smoke test. Do not restart the running app or server.
