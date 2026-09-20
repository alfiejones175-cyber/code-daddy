# Desktop workspace and agent chats

Status: Implemented for the in-window desktop scope; see [delivery notes](003-implementation.md). Baseline: `16d94e42dc`. Date: 2026-09-20.

## Intended result

Extend the existing desktop app into a polished project workspace: a retractable project sidebar, chats nested under projects, agent-created subchats nested under their parent, and clear connections to OpenRouter and ChatGPT/Codex. Preserve the existing Electron, SolidJS and shared UI foundation.

Planning assumption: “retractable project tab” means an in-window sidebar that collapses into a useful rail. A panel that retracts to the physical edge of the desktop is a separate optional phase. “Like the new Claude update” is interpreted as visible delegated conversations; the exact release/feature was not specified, so full Claude feature parity is not a requirement.

## Product and frontend thinking gate

| Question | Direction |
| --- | --- |
| Project stage / surface | Existing application with a V2 migration; desktop developer workspace |
| Core user and objects | Person managing projects, chats, delegated agents and provider connections |
| Primary task | Open a project, start a chat, delegate work, inspect and continue the result |
| Entry / first decision | Restore the last workspace; choose project and chat, with connection setup when needed |
| Information priority | Project → current chat → agent status → transcript → composer |
| Success | Delegation is visible, resumable through explicit controls, correctly scoped and easy to inspect |
| Recovery | Reconnect account/server, resolve permission request, retry failed operation without duplicate child creation |
| Compact-window action | Read and send messages; navigation becomes an overlay drawer |
| Temperament | Calm, precise, tactile; restrained depth and clear active states |
| Foundation | SolidJS, existing v2 tokens, @opencode-ai/ui, Kobalte, CSS; existing spring primitive if justified |
| References | Codex project/chat navigation; Claude-style delegated conversations; React Bits microinteractions |
| UI vocabulary | Project, Chat, Subchat, Working, Needs your input, Complete, Retry, Connection |
| Keep secondary | Session IDs, provider transport names, execution/coordinator details, raw auth errors |
| Risks | Wrong project/server, invisible child work, two conflicting navigation/state systems, transcript reflow |
| Verification | Behavioral tests plus real desktop/browser visual, keyboard, reduced-motion and performance checks |

Visual thesis: let the transcript remain the stable center of the app. Navigation uses compact typography, soft selected-row surfaces, subtle branch lines and status icons with readable text. Keep existing theme colors and spacing, with a small consistent radius scale. Motion explains panels opening and work changing state.

## Proposed layout and interaction

```text
┌ Projects / collapse ───┬ Current chat · model / connection ─────────┐
│ + New chat            │                                           │
│ ▾ Project A           │ Transcript                                │
│   ▾ Build settings    │                                           │
│     • Research        │ [Agent: Research · Working · Open subchat] │
│     ✓ Review          │                                           │
│   Fix navigation      │                                           │
│ ▸ Project B           │                                           │
│                       │                                           │
│ Connections  Settings │ Composer · attach · send / stop            │
└───────────────────────┴───────────────────────────────────────────┘
```

This is a conceptual layout, not a rendered or tested mockup.

- Expanded sidebar begins with the existing 256px width; collapsed rail remains 48px. Keep width resizable through the existing layout state if it can be supported without conflicting shell behavior.
- The rail keeps expand, new chat, project selection and connection/settings access. Every icon has an accessible name and a tooltip.
- Selecting a project expands its group. Selecting a chat opens the existing canonical session route and restores its draft and scroll position. Keep existing top tabs as secondary navigation initially.
- New chat always targets the visibly selected server/project. When none is selected, open the project chooser; never silently use the first project.
- Use nested disclosure lists for project/chat hierarchy unless a complete keyboard tree pattern is implemented. Parent chats remain navigable when their children are collapsed.
- Each child displays title, agent and meaningful state. A delegated-work item inside the parent transcript opens that child. Child headers provide a clear return-to-parent action.
- Opening a child during execution allows inspection and deliberate steering. Navigating away, collapsing the sidebar or closing a child tab does not cancel work.
- Narrow windows use a dismissible navigation drawer with Escape, focus restoration and an inert background. The composer remains usable.

## What already exists and what is missing

All entries below are source-confirmed at the baseline, with runtime behavior unverified.

| Capability | Existing implementation | Required addition |
| --- | --- | --- |
| Desktop shell | `packages/desktop/src/main/windows.ts`; Electron window state and native controls | Refine titlebar/sidebar integration; verify traffic-light clearance and drag regions |
| macOS residency | `packages/desktop/src/main/index.ts:411`; app survives last-window close, Dock activation restores windows | Optional menu-bar/tray and show/hide shortcut; define explicit Quit behavior |
| V2 sidebar | `packages/app/src/pages/layout-new.tsx:36`, `pages/layout/project-sidebar.tsx` | Repair route/project scope, unify state, improve rail and hierarchy |
| Sidebar persistence | Local flag `sidebar.project.open`; established `context/layout.tsx` sidebar state also exists | Migrate to one authoritative state with precedence documented |
| Chat navigation | `utils/session-route.ts`, `context/tabs.tsx`, `components/titlebar.tsx` | Use canonical server routes and existing draft creation |
| Legacy child agents | `packages/opencode/src/tool/task.ts`; parent-linked child sessions | Implement delegation in Core V2; task is still TODO in `core/src/tool/builtins.ts` |
| Child lineage | Schema `parentID`, session lineage/navigation helpers, legacy sidebar status | V2 creation contract and browsable, server-scoped child hierarchy |
| OpenRouter | Legacy provider plus `packages/core/src/plugin/provider/openrouter.ts` | V2 `session/runner/model.ts` does not support the standard OpenRouter SDK package; add native route mapping, then verify streaming/tools |
| ChatGPT authentication | `packages/core/src/plugin/provider/openai.ts` registers browser/device OAuth | Native `session/runner/model.ts` treats OAuth as generic bearer auth; complete subscription-specific routing and refresh behavior |
| Codex transport reference | `packages/opencode/src/plugin/openai/codex.ts` handles subscription request adaptation | Port necessary behavior through V2 provider boundaries; OAuth registration alone is insufficient |
| Existing microinteraction | `packages/app/src/pages/layout/branched-menu.css` is a Solid CSS port inspired by React Bits | Extend coherent motion and reduced-motion behavior without a React dependency |

### Confirmed navigation mismatch

`project-sidebar.tsx` reads `params.dir` and constructs directory-based legacy links. V2 sessions use `/server/:serverKey/session/:id`; the V2 route no longer supplies that directory parameter. Its new-chat fallback also chooses `projects()[0]`. Resolve scope from the selected session/draft and explicit server identity before changing the appearance. Legacy redirects are not a substitute for correct active-project state.

## Milestone 1 — Reliable sidebar and desktop composition

Milestone numbers group the work. Execute 1 first, develop 2 and 4 as independent backend slices, then finish 3 and 5 after the real execution paths pass.

Primary files:

- `packages/app/src/pages/layout/project-sidebar.tsx`
- `packages/app/src/pages/layout-new.tsx`
- `packages/app/src/context/layout.tsx`
- `packages/app/src/context/tabs.tsx`
- `packages/app/src/components/titlebar.tsx`
- `packages/app/src/utils/session-route.ts`

Steps:

1. Derive `{server, directory, sessionID}` from the current route/session or draft. Reuse `layout.route()` where appropriate; preserve explicit server identity in lookups.
2. Use `sessionHref(server, sessionID)` for V2 chats and the existing `tabs.newDraft(...)` behavior for new chats. Preserve legacy protocol behavior behind its existing boundary.
3. Unify sidebar open/width persistence. Migrate the old flag once; existing established layout preferences take precedence when both are present. Use `createStore` for new compound state.
4. Auto-expand the active project when navigation changes; preserve user expansion state for other projects and list scroll position.
5. Add useful collapsed-rail actions, a working empty-project flow, keyboard toggle, visible focus, accessible expanded/control relationships and long-title truncation.
6. Check native macOS traffic-light placement before moving titlebar elements. Sidebar content currently begins at top-left while native controls occupy that corner. Verify the actual window rather than assuming the titlebar's main-column spacer protects it.

Acceptance: new chat never targets the wrong project; two servers with identical filesystem paths stay distinct; direct canonical links, drafts, reload and parent/child navigation all show the correct selection; empty-state actions work; keyboard navigation is complete.

## Milestone 2 — One complete V2 agent-created subchat flow

Primary files/boundaries:

- `packages/schema/src/session.ts` already carries `parentID`.
- `packages/core/src/session.ts`, `session/store.ts`, `session/input.ts`, `session/execution.ts`, `session/execution/local.ts`, `session/run-coordinator.ts`.
- `packages/core/src/tool/builtins.ts`; add a Location-scoped task tool alongside existing tools.
- `packages/protocol/src/groups/session.ts`, `packages/server/src/handlers/session.ts` if public creation/listing contracts need extension.
- `packages/opencode/src/tool/task.ts` is behavioral reference, not the V2 runner.

Implement:

1. Define durable parent/child creation semantics. A child must reference an existing parent, inherit its Location by default, respect permissions, and reject cross-scope or cyclic lineage. Extend V2 creation to persist the already-modeled parent identity. Preserve exact-retry semantics and reject conflicting identity reuse.
2. Add an agent-callable delegation tool accepting a bounded task, selected agent and permitted model choice. Record child identity against the durable parent tool call so an exact retry adopts the same child instead of creating another.
3. Admit the child's prompt through `SessionV2.prompt(...)`; use the existing process-global execution service and Session-ID-based coordinator. Keep the child runner Location-scoped. Preserve one explicit `llm.stream(request)` per provider turn.
4. Start with structured delegation: the parent tool awaits child completion while sibling child sessions can run concurrently. Show the child immediately in the UI. Independent background team messaging is a later feature with an explicit durable completion-delivery design.
5. Bound concurrent children and nesting in the tool/agent configuration. Reuse existing task permissions; delegated agents cannot silently gain capabilities or credentials beyond the authorized scope.
6. Return a concise result plus child reference to the parent. Record lifecycle and failure so completion, cancellation and errors survive UI reload. Do not invent automatic post-crash provider retries.
7. Specify controls precisely: Stop subchat interrupts that child's active ownership chain. Existing parent Stop semantics remain consistent; if a parent interruption cancels owned descendants, explain that in the UI. Idle interruption stays a no-op. Retry/resume is explicit and uses durable admission.

Acceptance: a parent creates two child sessions; both appear and can be inspected; completion returns to the correct parent; reconnect rehydrates without duplicate spawning; exact tool/input retry is idempotent; permissions, child failure, cancellation, unavailable model and cross-server scope all behave correctly.

Do not bridge V2 orchestration through legacy `SessionPrompt.loop(...)`. Keep Schema → Core/Protocol → Server dependency direction. Client runtime may import Schema and Protocol, never Core or Server. Regenerate public clients with `bun run generate` from `packages/client` after public Protocol/HttpApi changes; do not edit generated directories. Regenerate the legacy JS SDK only if its public surface changes, using `./packages/sdk/js/script/build.ts`.

## Milestone 3 — Browsable subchats and deliberate chat UI

Primary files:

- `packages/app/src/pages/layout/project-sidebar.tsx`, `pages/layout/helpers.ts`
- `packages/app/src/pages/layout/sidebar-items.tsx` as a reference for status derivation
- `packages/app/src/pages/session/session-lineage.ts`, `pages/session.tsx`
- `packages/app/src/context/server-session.ts`, `context/server-session-v2-reducer.ts`
- `packages/app/src/components/session/session-header.tsx`, `components/titlebar.tsx`
- `packages/session-ui` for any shared delegated-work transcript presentation; read its AGENTS before editing

Keep root-session filtering intact. Build a separate child index keyed by server and parent, backed by complete/paginated data rather than assuming all children exist in the current root-chat page. Lazy-load expanded branches, maintain stable IDs, handle missing/archived parents and avoid unbounded recursive rendering. Reuse event-driven status; do not create a polling loop for every row.

Separate transient execution state from persisted outcomes. A completed task remains inspectable; lack of a live runner must not be displayed as proof of successful completion after a crash. Permission requests surface on the owning child and its parent summary. Opening a child must not duplicate a tab or steal the current transcript scroll position.

Visual changes: consistent row heights and spacing, clear branch indentation, a quiet active background, compact unread indicator, status icon plus accessible text, readable code/transcript typography, and a persistent composer. Keep file changes/context in existing secondary panels. Preserve existing light/dark tokens and localize all new copy.

Acceptance: independent child navigation; several concurrent status changes without list jumping; reload and archived/missing-child recovery; long names; empty/error/loading states; no transcript remount on sidebar toggle; keyboard access to every row and action.

## Milestone 4 — OpenRouter and ChatGPT connections

Use the existing connection system; expose both connections together with per-chat model/provider selection. Suggested labels: “OpenRouter” and “ChatGPT / Codex”; retain a distinct “OpenAI API key” option when available. These are proposed localized labels, not literal strings to hardcode.

Primary files: `packages/app/src/components/dialog-connect-provider.tsx`, `components/settings-providers.tsx`, the existing model picker, `packages/core/src/session/runner/model.ts`, `packages/core/src/plugin/provider/openrouter.ts`, `plugin/provider/openai.ts`, and the credential/integration services those plugins already use. Native SessionRunner execution does not become supported simply by registering an AI SDK plugin.

1. Add a deliberate mapping from `@openrouter/ai-sdk-provider` catalog models to the native LLM protocol in `SessionRunnerModel.fromCatalogModel` and `supported`. Preserve provider endpoint, headers and model IDs. Verify key connection through an actual V2 runner request, streamed output and a tool call; distinguish invalid credentials, unavailable models and rate/credit errors.
2. Complete auth-aware ChatGPT/Codex routing in the native V2 resolver after comparing the legacy adapter to current supported authentication behavior. Verify endpoint selection, bearer token refresh, required account metadata/headers, permitted models and streaming/tool results. Do not mark this done merely because browser login succeeds or plugin-level SDK tests pass.
3. Keep tokens in the backend credential service; UI sees only connection state and safe account metadata. Signing out one connection must not disconnect the other. OpenRouter plus one OpenAI identity fits current integration separation; simultaneous multiple OpenAI identities is separate scope.
4. Surface connecting, connected, reconnect-required and unavailable states. On expiry, guide reconnection without losing the chat draft.
5. Each chat/agent uses an explicit provider/model choice. Inherit the parent's choice by default where compatible; do not silently switch to a paid provider on an error.

ChatGPT subscription sign-in applies to the Codex access path; it does not provide general OpenAI API credit. The exact supported models, entitlement and third-party integration behavior require end-to-end validation. Source: [OpenAI Codex authentication](https://learn.chatgpt.com/docs/auth). Provider setup reference: [OpenRouter authentication](https://openrouter.ai/docs/api_reference/authentication). If the current adapter cannot establish a supported integration, evaluate the documented [Codex App Server](https://learn.chatgpt.com/docs/app-server) as a separate architecture choice; it introduces another execution engine and is not a drop-in token source.

Acceptance: both connections coexist; provider/model selection is visible and persists; sign-in cancellation, refresh, disconnect, quota errors and invalid credentials recover cleanly. Subscription transport never falls through to API-key billing without explicit selection.

## Milestone 5 — Motion and desktop availability

Execute [002 — Sidebar motion](002-sidebar-motion.md) after the scope/state repairs. Review a small set of actual [React Bits microinteraction demos](https://reactbits.dev/c/micro) visually during implementation, then adapt only useful behavior to Solid. The [official repository](https://github.com/DavidHDev/react-bits) confirms React components; no framework migration is needed for inspiration.

Keep macOS Dock activation and restored windows. If background access is desired, add an opt-in menu-bar/tray entry and configurable global show/hide shortcut. Implement native behavior in `packages/desktop/src/main`, register IPC in `main/ipc.ts`, and expose typed operations via `src/preload`. Renderer code calls only `window.api` through that bridge. Distinguish hide, close and Quit; never change existing close behavior silently.

Optional physical desktop-edge mode comes later: separate compact window mode, pin/unpin, display-aware bounds, recovery after monitor removal, fullscreen/Spaces behavior, keyboard focus, escape route and drag handle. First prove a normal-window sidebar; OS-edge behavior needs real native testing.

## Development and verification contract

Apply the user's [ui-ux skill](/Users/alfredo/.codex/skills/ui-ux/SKILL.md), [frontend-skill](/Users/alfredo/.codex/skills/frontend-skill/SKILL.md), and [animation planning skill](/Users/alfredo/.codex/skills/improve-animations/SKILL.md). Keep the UI cognition and verification gates attached to each substantive implementation slice. Do not rewrite AGENTS.md for this feature.

- Read each affected package's AGENTS. All visible and native copy uses typed i18n. Prefer existing components and tokens; use createStore for compound Solid state.
- Record the production benchmark baseline before changing session/timeline code and compare after. Existing `packages/app/e2e/performance` covers timeline/tab behavior. Never restart the user's app/server.
- Run `bun typecheck` from every changed package directory. Run focused real-implementation tests from package directories, never the repository root. App scripts include `bun run test:unit`, `bun run test:browser` and `bun run test:e2e -- <selected spec>`; select tests matching the changed behavior.
- Test lineage/creation idempotency, parallel execution, cancellation, retry, credential transport and route scope. Favor local deterministic test servers/recordings over global mocks. Live account smoke tests require an available authenticated account; report unavailable checks honestly.
- Extend `packages/app/e2e/regression/subagent-child-navigation.spec.ts` for sidebar siblings, unloaded children and request aggregation. Exercise providers through the native SessionRunner, not only plugin SDK registration tests.
- Use browser/native acceptance at 1280×800, 1024×768 and a compact viewport; both supported themes; keyboard and reduced motion; multiple projects/servers; no projects; disconnected server; long titles; several child chats.
- Verify focus, contrast, clipping, text selection, tooltips, titlebar drag zones and native controls. A passing build is not visual acceptance.

Delivery checkpoints: (1) reliable project sidebar; (2) one complete V2 parent/child demonstration; (3) both provider paths demonstrated; (4) polished sidebar/subchat journey; (5) desktop packaging smoke check. Keep each checkpoint reviewable before expanding scope.

## Evidence limits

This plan is based on code inspection by the main agent and two subagents. No app launch, native screenshot, live provider login, performance run or automated test was performed for this planning task. React Bits' linked category yielded no extractable demo content; no specific animation demo is claimed as visually reviewed. Existing capabilities are distinguished from proposed additions above. [Claude's subagent documentation](https://code.claude.com/docs/en/sub-agents) supports the separate-context delegation model used as inspiration; it does not identify which recent update the user meant.
