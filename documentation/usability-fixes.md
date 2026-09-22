# Usability Review — Fixes

> Historical source-review baseline. Several paths have since changed, including closed-draft restoration, provider-refresh error handling, and prompt interruption errors. Recheck each finding against current code/tests before treating it as open. Use the [current roadmap](/Users/alfredo/Documents/code-daddy/plans/README.md) for priorities and the [workspace review](/Users/alfredo/Documents/code-daddy/plans/007-workspace-review.md) for later evidence. This note does not mark the entire review resolved.

Date: 2026-09-20
Scope: opencode app front-end (`packages/app` + shared `packages/ui`, `packages/session-ui`)
Method: code-level review (no running instance). High-impact items were verified directly against source.

Findings are ordered by severity. Each item lists the location and the fix needed.

---

## Critical

### C1. Destructive actions have no confirmation or undo

- Closing a session tab discards it with no "session is running" guard.
  `packages/app/src/context/tabs.tsx:253-258`
- Closing a draft tab permanently deletes the persisted prompt.
  `packages/app/src/context/tabs.tsx:103-108,209-222`
- Closed drafts are not restorable via reopen-closed-tab.
  `packages/app/src/context/closed-tabs.ts:12-15`
- Deleting a server wipes all its tabs and drafts immediately.
  `packages/app/src/components/server/server-row-menu.tsx:88-90` → `packages/app/src/components/dialog-select-server.tsx:530-541`
- Provider Disconnect acts on one click with no undo.
  `packages/app/src/components/settings-v2/providers.tsx:132,226` (legacy: `packages/app/src/components/settings-providers.tsx:223`)
- Keybind "Reset to defaults" acts immediately with no confirmation/undo.
  `packages/app/src/components/settings-keybinds.tsx:566-573` (V2 reset: `:401-406`)

**Fix:** Add confirmation or undo (toast with Undo) to tab close, draft delete, server delete, provider disconnect, and keybind reset. Guard tab close when the session is actively running.

### C2. UI can silently diverge from reality

- Failed permission replies are swallowed; enabling auto-accept can fail silently.
  `packages/app/src/context/permission.tsx:246-258,364-409`
- Provider connect shows a "connected" toast even when the post-connect refresh failed.
  `packages/app/src/components/dialog-connect-provider.tsx:778-781`
- Worktree creation and session send errors surface only as transient auto-dismissed toasts after submit.
  `packages/app/src/components/prompt-input/submit.ts:362-384`

**Fix:** Surface permission/refresh/send failures inline with retry; never report success when a dependent step failed.

### C3. Failed stop/abort is silent and Stop is unreachable once you type

- Submit only becomes Stop when the draft is empty.
  `packages/app/src/components/prompt-input-v2.tsx:130`, `packages/app/src/components/prompt-input.tsx:286`
- Interrupt failures are swallowed with `.catch(() => {})`.
  `packages/app/src/components/prompt-input/submit.ts:275-277`, `packages/app/src/pages/session.tsx:1898-1903`, `packages/app/src/pages/session/use-session-commands.tsx:349-351`

**Fix:** Keep a Stop control reachable while a turn is running even if the composer is non-empty; surface interrupt failures.

### C4. Raw technical errors shown to users

- Error page renders full `error.stack` and internal class names.
  `packages/app/src/pages/error.tsx:156-202,289-297`
- API errors include "Retryable: true/false" and `Response body:` dumps.
  `packages/app/src/pages/error.tsx:70-87`
- `formatServerError` falls back to raw provider text for most toasts.
  `packages/app/src/utils/server-errors.ts:32`

**Fix:** Map errors to plain language with a clear next step; move stack/body dumps behind an explicit "Copy details" / expandable developer section.

---

## High

### H1. Live session activity is inaccessible to screen readers

- Assistant output is `aria-hidden` while the turn is working, so streaming is not announced.
  `packages/app/src/pages/session/timeline/message-timeline.tsx:1177`
- No `role="log"`/`aria-live` region for streamed tokens.
- Permission requests appear with no announcement or focus.
  `packages/app/src/pages/session/composer/session-permission-dock.tsx:28-94`, `packages/app/src/pages/session/composer/session-composer-region.tsx:47-60`
- Retries are not announced.
  `packages/session-ui/src/components/session-retry.tsx:53-72`

**Fix:** Remove the streaming `aria-hidden`; add a polite live region for assistant output, permission requests, and retry status.

### H2. Keyboard users cannot operate several core controls

- Message "show all"/"more" toggles are non-focusable `span`/`div onClick`s.
  `packages/app/src/pages/session/timeline/message-timeline.tsx:169,218`
- Session title rename and resize splitters are mouse-only.
  `packages/app/src/pages/session/timeline/message-timeline.tsx:1416`, `packages/ui/src/components/resize-handle.tsx:89-100`
- Attachment/comment remove buttons are `opacity-0` until hover with no `focus-visible` reveal.
  `packages/session-ui/src/v2/components/prompt-input/index.tsx:416-455`, `packages/app/src/components/prompt-input/image-attachments.tsx:34-37`
- Keybind capture traps Tab.
  `packages/app/src/components/settings-keybinds.tsx:212-264`

**Fix:** Make click targets real buttons (role/tabIndex/key handler, or use `<button>`); add focus-visible reveal; allow Tab to exit keybind capture.

### H3. Provider setup can mislead users

- Integration lookup failures are swallowed and fall back to "API key" only, which OAuth providers cannot satisfy.
  `packages/app/src/components/dialog-connect-provider.tsx:427-451`
- A single-method provider auto-selects, potentially launching OAuth just by opening Connect.
  `packages/app/src/components/dialog-connect-provider.tsx:766-774`
- Custom providers have no "Test connection".
  `packages/app/src/components/dialog-custom-provider.tsx:221-227`

**Fix:** Surface integration-load failures; require an explicit gesture before starting OAuth; add a connection test for custom providers.

### H4. Low-contrast text is widespread

- `text-text-faint` = grey-600, ~3.95:1 on light background, below WCAG AA for normal text; used ~41 times at 11-13px.
  `packages/ui/src/theme/v2/foreground.ts:52`, `packages/ui/src/v2/styles/theme.css:32`

**Fix:** Apply contrast floors to text tokens (as icons already do) or raise the faint color.

---

## Medium

### M1. Feedback gaps

- Tool runs cannot be expanded while pending and show no elapsed time or cancel.
  `packages/session-ui/src/components/basic-tool.tsx:93,180-183`
- Permission/question buttons disable without a "sending" label.
  `packages/app/src/pages/session/composer/session-permission-dock.tsx:43-58`, `packages/app/src/pages/session/composer/session-question-dock.tsx:508-516`
- History pagination has no loading/"load earlier" indicator; strings exist but are unused.
  `packages/app/src/i18n/en.ts:760-761`

### M2. Missing user affordances

- No retry for a failed turn; no inline edit/resend (only "Revert message"); fork is palette/slash-only.
  `packages/app/src/pages/session/use-session-commands.tsx:448-499`
- Most tool outputs lack copy buttons (only shell has one).
  `packages/session-ui/src/components/message-part.tsx:1790-1901,2125-2152`

### M3. v2 composer regressions vs v1

- Shell mode has no visible label or exit hint.
  `packages/session-ui/src/v2/components/prompt-input/index.tsx:200-207`
- Contextual placeholders discarded.
  `packages/app/src/components/prompt-input-v2.tsx:140-143`
- Direct "Connect provider" removed from model popover.
  `packages/app/src/components/prompt-input-v2.tsx:504-517`
- Selecting agent/model variant does not restore editor focus.
  `packages/app/src/components/prompt-input-v2.tsx:387-402`

### M4. Navigation inconsistencies

- New layout lacks keyboard project/server switching (only in legacy).
  `packages/app/src/pages/layout.tsx:909-941`
- `mod+k` means different things per surface (home palette vs file picker vs new-session palette).
- `tab.close` is registered by both titlebar and session, resolved first-registration-wins.
  `packages/app/src/context/command.tsx:289-308`

### M5. RTL not consistently handled

- ~198 physical direction classes vs ~14 logical; Arabic/Urdu/Persian will not mirror correctly.
  Examples: `packages/app/src/components/prompt-input.tsx:1537`, `packages/app/src/pages/session/timeline/message-timeline.tsx:920`, `packages/app/src/pages/layout/sidebar-items.tsx:223`
- New sidebar animates `translateX` while positioning with `inset-inline-start`.
  `packages/app/src/pages/layout/project-sidebar.css:36,86,99,105`

**Fix:** Convert to logical properties (`ms-/me-/ps-/pe-/start/end/text-start/text-end`); mirror slide animations for RTL.

### M6. Loading and first-paint perception

- Lazy components have no Suspense fallback and can blank sections.
  `packages/app/src/app.tsx:72`, `packages/app/src/pages/session.tsx:2413,2435`
- First paint is a blank background until locale loads.
  `packages/app/index.html:24-26`, `packages/app/src/entry.tsx:152-179`

---

## Working-tree regression (verify intent)

The working tree removes the titlebar tab strip, home button, and new-session button.
`packages/app/src/components/titlebar.tsx` (diff); `TitlebarTabStrip` is defined at `packages/app/src/components/titlebar-tab-strip.tsx:212` but never imported.

Impact: no visible tab bar, no visible way home, and tab cycling/reorder/close keybinds (`titlebar-tab-strip.tsx:231-248,400-416`) are unreachable.

**Fix:** Restore the titlebar controls or replace them with an equivalent visible navigation surface before shipping.

---

## Suggested fix order

1. Confirmations/undo for destructive actions (C1).
2. Stop swallowing failures: permission, auto-accept, interrupt, provider refresh (C2, C3).
3. Keep Stop reachable while working (C3).
4. Replace raw stack traces/internal class names with plain-language errors + Copy details (C4).
5. Fix streaming `aria-hidden` and add live regions for output/permission/retry (H1).
6. Resolve the working-tree navigation removal.

---

## Strengths (keep these)

- i18n coverage is excellent: ~2 hardcoded user-visible strings across 148 `.tsx` files, with a parity test.
- Shared UI primitives (Kobalte dialogs, focus-visible CSS, RTL-aware CSS) are solid.
- Theme is preloaded to avoid a flash of unstyled content.
