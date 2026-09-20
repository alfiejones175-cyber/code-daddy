# 002 — Make the project sidebar retract smoothly

- Status: Implemented for the sidebar, rail and compact drawer; see [delivery notes](003-implementation.md).
- Commit: `16d94e42dc`
- Severity: MEDIUM
- Category: Performance, interruptibility, accessibility and cohesion
- Estimated scope: 3–5 UI files plus focused interaction coverage
- Dependency: Fix canonical routing and consolidate sidebar state in plan 001 first

## Problem

The V2 sidebar uses an animated width and immediately unmounts its contents when collapsed. This is a source-confirmed implementation risk: it can reflow the transcript during motion and remove the focused control. Actual frame drops or visual defects have not been measured.

Current `packages/app/src/pages/layout/project-sidebar.tsx`:

```tsx
class="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-v2-border-border-muted bg-v2-background-bg-deep transition-[width] duration-200"
classList={{ "w-64": open(), "w-12": !open() }}
```

The same component gates its project content with `<Show when={open()}>`. It has no local reduced-motion override for the width or chevron transition. `pages/layout/branched-menu.css` demonstrates an existing reduced-motion convention but only covers that menu.

## Target

Use explicit motion tokens, scoped to the V2 shell initially:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

Reconcile names with existing v2 tokens before adding them. Reuse exact-equivalent tokens when present; do not overwrite a global token used by unrelated components.

| Interaction | Exact initial specification |
| --- | --- |
| Pointer-triggered sidebar drawer | transform 200ms using `--ease-drawer`; opacity 160ms using `--ease-out` |
| Small popover | opacity and scale 0.97→1, 160ms using `--ease-out`; origin at trigger |
| Press feedback on suitable icon buttons | scale 0.97, 160ms using `--ease-out` |
| Agent-child row first insertion | translateY(5px)→0 and opacity 0→1, 160ms using `--ease-out`; no group stagger |
| High-frequency chat/keyboard navigation | Immediate selection and navigation; no transcript entrance animation |
| Reduced motion | No translation, scale or geometry animation; immediate selection; optional opacity transition at 125ms |

Use CSS transitions for reversible reveals so repeated toggles retarget from the current position. Reserve keyframes for finite first-insertion effects, keyed once per child ID. Never replay row entry on status updates or streaming tokens. Controls stay interactive throughout motion.

## Repo conventions to follow

- The renderer is SolidJS; do not add React or a React motion library.
- Existing source `packages/app/src/pages/layout/branched-menu.css` uses a CSS-only Solid port and `prefers-reduced-motion`.
- Reuse v2 theme variables from `packages/ui/src/v2/styles/theme.css`. Start with scoped app CSS imported by `layout-new.tsx`; promote only genuinely shared tokens.
- `packages/ui/src/components/motion-spring.tsx` is available if a later gesture requires a spring. Plain sidebar toggling does not require it.
- All new accessible labels and visible copy use existing typed i18n.

## Steps

1. Record the existing production timeline/tab benchmark before changing shell geometry. Capture the normal and collapsed sidebar on a long streaming session, including current scroll anchor.
2. In `project-sidebar.tsx`, use the consolidated layout state from milestone 1. Keep a stable collapse/expand control mounted. Before hiding a panel containing focus, return focus to that control; mark hidden content inert and aria-hidden.
3. Add scoped sidebar CSS with the tokens/timings above. Retain 48px rail and the established expanded width. For compact overlay mode, translate the fixed-width panel and fade the scrim; do not animate its width.
4. For pinned desktop mode, prototype a transform-based reveal with a single layout commit and a measured before/after position adjustment of the main region. Never scale transcript text or animate layout on every frame. Cancel/retarget an in-flight animation cleanly on reversal; clear transient styles on finish/cancel. If this produces a visible wrap jump, keep the main-region geometry change immediate and animate only the drawer surface. Choose based on the actual benchmark and visual check; do not claim transform alone can resize readable text without reflow.
5. Preserve transcript component identity, draft state and scroll anchor across every toggle. Do not screenshot or clone the transcript as an animation layer.
6. Add first-insertion motion only to newly created child rows after milestone 3 provides stable child IDs. Keep existing rows and status changes immediate. Reduced motion skips translation entirely.
7. Remove obsolete width-transition classes and conflicting timing rules from the touched sidebar. Do not broaden this into changes to legacy layout or unrelated shared controls.

## Boundaries

- No runtime dependency additions, agent execution edits, provider edits or transcript animation redesign in this slice.
- No continuous decorative motion, delayed stagger on long chat lists or `transition: all`.
- No builds/changes are part of this planning task. Implementing this plan is a separate task.
- Re-read the baseline excerpts before implementation. If code has materially changed, update the plan against the current source before editing.

## Verification

Mechanical checks, from `packages/app`:

```sh
bun typecheck
bun run test:browser
```

Run focused sidebar interaction coverage through the app's existing test harness. If shared UI code changes, also run `bun typecheck` from `packages/ui`. Compare the relevant production benchmark with the captured baseline; do not repeatedly run unrelated suites.

Feel checks in the existing local app/browser session (never restart the app/server):

- Toggle rapidly mid-transition in both directions; the panel follows the new target without snapping to its starting frame.
- Toggle by keyboard; selection/focus changes immediately and focus remains visible.
- At 10% animation playback, confirm panel direction, trigger origin and no double-rendered text.
- Enable reduced motion; content remains visible and available with no slide, scale or resize animation.
- While a long transcript streams, toggle repeatedly and inspect for scroll jumps, remount flashes and dropped input.
- Verify expanded/collapsed states in light/dark, narrow windows, long project names, RTL layout if supported, and native macOS traffic-light/drag areas.
- Add a child, update its status repeatedly, and confirm its entry effect occurs only once.

Done when interaction, focus and scroll are stable, reduced motion works, changed states pass visual inspection, and benchmark results show no material regression under the repository's established thresholds. Report measurements and unverified states rather than inventing performance guarantees.
