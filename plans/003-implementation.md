# Desktop workspace implementation

Implemented in the working tree on 2026-09-20 against planning baseline `16d94e42dc`.

## Delivered behavior

- The existing Electron app has a retractable project sidebar with a 48px collapsed utility rail, a single expanded project tree, new-chat actions, nested sessions and provider settings. Session/draft routes preserve server and project identity, including worktrees and older selected sessions outside the first page.
- The drawer uses 200ms transform and 160ms opacity transitions, subtle press feedback, keyboard focus restoration, reduced-motion handling and an accessible compact overlay. Desktop transcript geometry changes once rather than throughout the animation. The existing titlebar spans the shell above the sidebar to preserve native control clearance.
- V2 agents can call `task` to create durable child chats, await results and explicitly continue a child through `task_id`. Children inherit the project, selected model and ancestor permission ceiling. Delegation permits four concurrent tool-owned tasks per Location and two nesting levels. Independent background team messaging and cross-provider model overrides are outside this slice.
- Child chats appear under their parent, support direct navigation and user follow-up messages, expose permission/question activity, and retain their links during streaming, errors and reload. Execution-idle alone is not presented as proof of successful completion.
- Parent interruption cancels its owned delegated child. Stopping an individual child reports cancellation to the waiting parent. Exact retries reuse durable identities; abandoned provider work is not silently restarted after a crash.
- OpenRouter routes through its native transport. ChatGPT OAuth routes exclusively through the subscription/Codex transport with account/residency headers and subscription-compatible request fields. A subscription rejection does not fall through to paid API-key billing.
- Provider settings discover unconnected integrations, display their authentication method, remove native credentials on disconnect, and cancel abandoned OAuth attempts. The app's vendored SDK is retained with a narrow, tested adapter for current OAuth attempt URLs. Safe credential metadata and session parent filters are regenerated into the workspace clients.

The UI reuses existing localized copy and design tokens without adding an animation library or changing frameworks. React Bits inspired the motion direction; no specific demo is claimed as visually reproduced.

## Validation

- Package-local typechecks pass for app, desktop, schema, core, protocol, server and client.
- The backend delegation validation passed 92 focused Core tests and four Protocol tests. A production-composition test uses the real Location service map, Session execution coordinator, native runner and local HTTP streaming fixture: one parent delegates to two children and continues after their results.
- Independent review fixes pass 37 final delegation/location/session-creation tests and the Core typecheck. Success requires a completed `stop` response; partial responses retain their text and failure reason. Results are bounded to the original delegated prompt, so later user replies cannot replace a retried task's answer. Follow-ups reject children without an explicit matching model before admitting a prompt. The durable task fingerprint remains internal database metadata.
- Provider validation passed 18 focused Core tests, six app SDK-boundary tests and an actual native IntegrationHandler test for OAuth start/status/complete/cancel.
- Nineteen focused app tests pass, covering native task transcript hydration, streaming metadata, failure links, lineage, outcome classification and SDK request compatibility.
- Production build and both session-switching benchmark tests pass. No blank destinations, incorrect destinations or review-host remounts were observed. Median stable V2 navigation (milliseconds): review closed cold 59.7 → 43.4, hot 14.5 → 13.8; review open cold 26.3 → 23.7, hot 17.1 → 19.9. These are single local runs, not a statistically established speedup. [Full summaries](validation/session-switch-benchmark.json).
- All ten focused sidebar/provider browser tests pass: canonical project selection and drafts, persisted draft scope, old selected sessions, worktree scope, lazy child navigation, native structured task-card hydration, child follow-up POST destination and text, unconnected OpenAI → ChatGPT and OpenRouter → API-key screens, reduced-motion keyboard collapse and compact focus trapping. The existing child-navigation/deleted-session suite also passes both tests.
- Screenshots were inspected at 1280×800 in light/dark and 390×844 compact. [Light desktop](validation/sidebar-light.png), [dark desktop](validation/sidebar-dark.png), [compact drawer](validation/sidebar-compact.png). These use seeded test projects and a controlled model fixture.

## Limits and existing failures

No real provider credentials were used. Live sign-in, account entitlement, quota behavior and actual subscription access remain account-dependent checks. The transport and authentication lifecycle are tested with controlled local responses.

The existing desktop shell was typechecked; no signed installer was produced and the user's app/server was not restarted. Native macOS traffic-light hit regions, dragging, Spaces and installed-app activation still need hands-on native acceptance. An OS-edge retractable window, background tray mode and global shortcut remain the optional later phase described in the plan.

The broader app suite exposes two pre-existing localization failures: dictionary parity is missing 13 existing `xcode`, `transcribe` and `sidebar` keys in non-English dictionaries; desktop locale detection returns `en` for `pa-PK` in this Bun environment. This implementation leaves the English dictionary unchanged and adds no missing translation keys.

## Follow-up UI review: duplicate project navigation

Reviewed using the personal UI/UX and frontend composition skills. This is a working developer workspace: select a project, open a chat, then inspect or continue a subchat. Existing Solid components and theme tokens remain the foundation.

**Finding (source-confirmed and browser-observed, P2):** the first version rendered every project twice, as an initial-letter rail shortcut and as an expanded tree heading. The shortcut navigated while the heading expanded, giving visually related controls different jobs. The expanded utility strip also reduced the width available for chat names.

**Correction:** removed the project shortcuts. The expanded sidebar uses its full 256px width for one project → chat → subchat hierarchy. Its header contains Open project, its footer contains Providers and Settings, and the collapsed 48px rail retains essential actions. The stable collapse control preserves keyboard focus.

**Acceptance:** ten browser tests and the app typecheck pass after the change, including assertions that each project appears once and only the collapse control remains visible in the expanded rail. Light/dark 1280×800 and compact 390×844 screenshots were inspected using the seeded `ses_sidebar_bravo` session route. Screenshots above reflect the corrected version. Native installed-app acceptance remains unverified.
