# Split to Subagent — Plan

## 1. Goal
From any session, split off part of the work into a subagent chat (Claude-style):
runs in parallel, parent stays usable, child renders as an indented lane under
the parent in the project sidebar, merge-back via summary paste.

## 2. UX flow
- Entry points:
  - Session header action (`packages/app/src/components/session/session-header.tsx`,
    `SessionHeaderV2Actions`) — "Split to subagent" button.
  - Sidebar context action on `SessionItem`
    (`packages/app/src/pages/layout/sidebar-items.tsx`) — per-session menu
    (currently only archive exists).
  - Optional: palette command next to `session.fork` in
    `packages/app/src/pages/session/use-session-commands.tsx:487`.
- Dialog (model on `DialogFork` in `packages/app/src/components/dialog-fork.tsx`):
  textarea for the delegated task + agent picker (reuses `local.agent.list()`,
  see `packages/app/src/pages/session/composer/session-composer-controls.ts:40`;
  source filter `packages/app/src/context/local.tsx:71`).
- Submit: create child, fire first prompt into it, navigate parent back to itself
  (or to child with back-link); parent composer never blocks — child runs as its
  own session ID with its own `session_status`.
- Merge-back: v1 = "Copy summary" button on child lane copies child summary to
  clipboard for pasting into parent; later: one-click "Send summary to parent".

## 3. API mapping
| Need | Call | Lives |
|---|---|---|
| Create child | `sdk().api.session.create({ parentID, agent, model, title })` | server `Session.create`, `packages/opencode/src/session/session.ts:667` |
| Send first task | `sdk().api.session.prompt({ sessionID: childID, ... })` | same shape as `packages/app/src/components/prompt-input/submit.ts:512+` |
| List agents | `sync().data.agent` filtered `mode !== "subagent"` | `packages/app/src/context/local.tsx:71` |
| List children | `api.session.children({ parentID })` / store filter `s.parentID === id` | server `Session.children` (`session.ts:596`); client precedent `packages/app/src/pages/layout.tsx:493` |
| Stop child | `sdk().api.session.interrupt({ sessionID: childID })` | precedent `submit.ts:276`, `pages/session.tsx:1823` |
| Rename/archive child | `api.session.rename` / `api.session.remove` | precedent `message-timeline.tsx:677,826` |

Do NOT use `api.session.fork` for this: `Session.fork` (`session.ts:691`)
copies message history but sets no `parentID` — the result is a root session,
not a child lane. Subagent split = `create` with `parentID`.

## 4. Data model
- Linkage: `Session.parentID` (server row `parent_id`, `session.ts:85,125,231`).
  Children get `childTitlePrefix` titles automatically (`session.ts:521`).
- Status display: reuse existing pipes — `session_working(childID)` spinner,
  `sessionPermissionRequest` dot, `messageAgentColor` tint
  (`sidebar-items.tsx:153-173`); child lane nesting already exists via
  `showChild` + `childSessionOnPath` (`sidebar-items.tsx:175-178,271-277`,
  `pages/layout/helpers.ts:36-47`).
- `ProjectSidebar` (`pages/layout/project-sidebar.tsx:40-43`) currently lists
  only root sessions via `sortedRootSessions` (`helpers.ts:18-24`, filters out
  `parentID`); Phase 2 adds child lanes there the same way `SessionItem` does.
- Isolation: same directory by default (concept: `sidebar-workspace.tsx`
  workspaces/sandboxes); explicit worktree/sandbox placement is a later option.

## 5. Phased build order
1. **Dialog + create + prompt**: `DialogSplit` (clone of `DialogFork`) with task
   textarea + agent picker; `create({ parentID })` + first `prompt`; verify child
   lane appears in workspace sidebar (`showChild` path already works).
2. **Entry points**: header button + sidebar item action + palette command;
   parent never navigates away or blocks.
3. **ProjectSidebar lanes**: render children under parents in
   `project-sidebar.tsx` via `childSessionOnPath`/store filter; add
   interrupt + rename actions on child rows.
4. **Merge-back**: child summary → copy button → one-click send-to-parent
   prompt; archive-child affordance (`session-archive.ts:23` navigates to parent).

## 6. Open questions
- Should split copy parent context (selected messages) into the child's first
  prompt, or start blank with only the task text?
- Same-directory execution vs fresh sandbox/worktree per child (conflict risk)?
- Which agents are eligible — all `mode !== "subagent"` or a curated subset?
- Permission/auto-accept inheritance: copy parent ruleset (`create` accepts
  `permission`) or start strict?
- Deep nesting (child of child): allow, flatten, or forbid?
- i18n keys for all new copy per `packages/app/AGENTS.md` (no hardcoded strings).
