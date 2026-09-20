# Spectrum-inspired workspace polish

Reviewed 2026-09-20 after the user's request to inspect https://spectrumhq.in and identify UI features for this desktop app. This is a grounded integration proposal; no application behavior was changed during the review.

## Direction

Keep the user's JetBrains Mono/terminal font, green foreground, black canvas, project logos, and single project tree. The opportunity is stronger surface depth and interaction feedback. The current shell, chat, and popovers use nearly identical black surfaces; distinguish interactive areas with charcoal-green layers and restrained edge highlights. Preserve hierarchy with brighter green for the selected action and softer green for secondary text.

The product remains a coding workspace: project → chat → delegated child or composer. The design must support frequent switching, readable long conversations, and keyboard operation. The first useful pass is surface depth, project navigation, and composer styling. Avoid introducing a second project list or changing the user's typography again.

## Reviewed references and application mapping

| Priority | Spectrum reference | Application integration | Existing implementation boundary |
| --- | --- | --- | --- |
| 1 | [Tree Nav](https://spectrumhq.in/docs/tree-nav) | A shared selection marker travels between chat rows; retain a persistent selected state separate from hover. Keep child rails and project logos. | `packages/app/src/pages/layout/project-sidebar.tsx` and `.css` |
| 1 | [Metal Prompt Bar](https://spectrumhq.in/docs/metal-prompt-bar) | A raised, rounded composer with attachment/agent/model controls grouped as compact pills. Give the send button a brief green rim highlight on focus or interaction. Preserve attachments, command menus, IME, keyboard submission, and draft state. | `packages/session-ui/src/v2/components/prompt-input/index.tsx`; app composer controller remains the source of behavior |
| 1 | [Animated Drawer](https://spectrumhq.in/docs/animateddrawer) | Refine sidebar entry/exit and compact navigation with coordinated panel/scrim timing. Retain Escape, focus restoration, and the single tree. | Existing `ProjectSidebar` panel and compact focus handling |
| 2 | [Recent Activity](https://spectrumhq.in/docs/recent-activity) | Present actual delegated runs with agent identity, task description, status, and timestamps; selecting an entry opens its child chat. Show duration only where actual start/end data supports it. | `packages/app/src/components/session/session-team.tsx` and existing session events |
| 2 | [Number Ticker](https://spectrumhq.in/docs/number-ticker) | Animate token changes briefly when a cumulative usage event arrives. Keep exact accessible values and the usage popover authoritative. Avoid continuous rolling during streaming or interpolating billing values as if they were actual measurements. | `SidebarUsage` in `project-sidebar.tsx` |

## Integration method

The public docs identify these components as React/TypeScript; the drawer/tree/ticker also use Motion. Our components are Solid, with an existing Motion dependency in the UI package. Directly installing React registry components will not make them compatible with the current app. Recreate the visual and interaction patterns inside the existing Solid components, using CSS or the framework-independent animation layer where appropriate. Keep the existing accessible dialog, popover, and menu primitives.

The site's previews and documentation are public, while installation commands are behind sign-in. No private source was accessed or copied, no account was created, and no MCP integration or new dependency was installed. A source-copy approach would require checking the actual component license and adapting its framework-specific behavior first.

## Proposed surface and motion treatment

- Black outer canvas, near-black green panels, and a slightly brighter composer surface, using shared theme tokens rather than isolated page overrides.
- Terminal typography retained throughout. Clear contrast for message text, muted green for metadata, and distinct warning/error semantics.
- A subtle inner highlight and shadow distinguish the composer and menus. Project images retain their own colors.
- Animate navigation markers with transforms. Keep row positions and scroll anchors stable.
- Use roughly 140–180 ms for control feedback and 200–240 ms for panel transitions as initial tuning targets; verify the result in the actual app.
- Disable movement under reduced-motion preferences. Keep selection, loading, and completion legible without animation.
- Use glints only on interaction; avoid perpetual shimmer, cursor trails, decorative background motion, or continuously animated token counters.

## Acceptance

1. Record the required production navigation baseline before touching composer/session rendering, and compare after implementation.
2. Verify project switching, child navigation, provider selection, attachments, submission, and preservation of drafts with the existing browser fixtures.
3. Confirm token display still uses cumulative per-chat values with no parent/child double counting.
4. Test pointer and keyboard selection separately so hover never masquerades as the current chat.
5. Check desktop and compact screenshots, focus visibility, popup clipping, meaningful empty/loading/error states, and reduced motion.
6. Compare first-load and navigation behavior before adding any animation dependency or GPU effect.

## Evidence scope

Browser-observed: Spectrum homepage, its Metal Prompt Bar preview, and opening the Animated Drawer demo. Public documentation inspected: Tree Nav behavior/technology, Number Ticker behavior/technology, Recent Activity preview, and drawer/composer integration details. Application source inspected: theme tokens, sidebar components, composer implementation boundary, session-team component, and available UI dependencies. Proposed timing and palette adjustments above are design recommendations, not measurements of Spectrum.


## Implementation review — 2026-09-20

Project cognition: an existing desktop coding workbench for developers moving from a project to a chat, composing a request, and inspecting delegated child work. Project, chat, child task, provider, and token usage remain the primary objects. The first decision is which project/chat to work in; success means sending work without losing the draft, then seeing truthful progress and opening the result. Retry, Stop, provider setup, and collapsed-navigation recovery remain available. On compact screens, opening a chat and returning to the composer take priority. The visual direction is a precise terminal workspace with green text, monospace type, a black canvas, and restrained raised surfaces. No design commentary or invented progress belongs in the product UI.

Implementation scope: polish the existing Solid components, preserving accessible primitives and backend behavior. The reference patterns are Spectrum Tree Nav, Metal Prompt Bar, Animated Drawer, Recent Activity, and Number Ticker. Key risks are confusing hover with selection, popover/drawer focus conflicts, animation-induced navigation churn, and falsely interpolated token totals. Verification covers existing browser flows plus focused new behavior checks and production navigation comparison.

The initial production navigation baseline passed both tests in 30.8 seconds. See `/tmp/opencode-spectrum-before.log`; final acceptance and screenshots follow below after integration.

### Implemented surfaces

- `project-sidebar.tsx` / `.css`: shared active-row marker, distinct hover state, scroll/resize/removal tracking, refined drawer and compact scrim, semantic raised panel/usage surfaces. Token feedback runs only on cumulative-value changes; the accessible name contains the exact total and the existing popover retains exact disjoint token buckets and cost. Reduced motion disables visual movement.
- Session UI `prompt-input/index.tsx` / `spectrum.css`: raised composer, rounded tool/agent/model controls, finite focus/press feedback, semantic theme colors, and instant reduced-motion states. Existing controller/IME/draft/attachment/send behavior stays in place.
- `session-team.tsx` / `.css`: activity rows separate task, agent/model identity, status, actual update timestamp, and Stop action. Child navigation and task-preparation form retain their behavior. No estimated run duration is displayed.
- Matrix theme: black canvas, more distinct charcoal-green layers, terminal type retained. Primary/muted/faint green text measure 9.54:1 / 5.74:1 / 4.72:1 against the brightest new layer (`#1e3024`). This is a source-token calculation, not a complete accessibility audit; composited UI is checked in the browser separately. References: [W3C text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [W3C interaction animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).

### Verification completed

- Package typechecks passed for app, session-ui, and ui.
- Prompt machine/store: 16 tests passed. Sidebar model: 2 tests passed.
- Production navigation comparison: two tests passed before (30.8s) and on the final source/styles (27.0s). Both runs observed zero wrong, blank, or unknown destinations and zero missing/replaced review file hosts. V2 first-correct medians before → after were 33.5 → 30.2 ms cold/closed, 2.9 → 3.1 ms hot/closed, 7.1 → 6.9 ms cold/open, 4.9 → 5.0 ms hot/open. Stable-frame medians varied by a few milliseconds; these single local runs establish regression evidence, not a speed-improvement claim. Compact summaries are in `plans/validation/spectrum-navigation-benchmark.json`; raw local logs are `/tmp/opencode-spectrum-before.log` and `/tmp/opencode-spectrum-after.log`.
- Browser acceptance completed: the initial 25-test Chromium run passed 23 and exposed the missing Stop label plus a new-test locator/timing error. After fixes, the three focused sidebar/activity checks and final composer check passed. Existing provider, logo, child navigation/submission, token, draft, and terminal-focus checks passed in the initial run. Final E2E typecheck and whitespace checks also pass. Logs: `/tmp/opencode-spectrum-e2e.log`, `/tmp/opencode-spectrum-e2e-final.log`, `/tmp/opencode-spectrum-composer-final.log`.


### Issues caught during browser review

- The pre-existing activity Stop button used a missing translation key and rendered unnamed. It now uses the existing translated `prompt.action.stop` key; populated running/waiting/completed fixtures verify the label and conditional visibility.
- The first composer control styles targeted direct children, but TooltipV2 adds wrappers. Scoped descendant selectors now reach the actual controls; portal menus remain outside the scope.
- One new selection-marker test captured position before asynchronous project rows loaded. The assertion now waits for the loaded row state rather than assuming an unchanged pre-load position. This was test timing, not hover changing the selected chat.

The app and E2E TypeScript checks passed again after the Stop label fix. Desktop (1280×800) and compact (390×844) activity screenshots were visually inspected: task/identity/status/timestamp hierarchy is readable, active Stop controls are named and do not overlap, and the delegation form remains reachable by scrolling inside the dialog. These are local browser fixtures with synthetic projects/tasks, not live provider executions.


### Final visual acceptance

Reviewed actual Chromium captures from the local test harness with synthetic records. Desktop sidebar/activity were 1280×800, composer desktop 1280×720, and compact views 390×844. Dark Matrix retains the terminal font and green-on-black canvas; raised panels, composer rim, pill controls, selection marker, and activity hierarchy render as intended. Light mode was explicitly selected and verified before its captures. Compact activity rows wrap without overlapping Stop; composer/shell surfaces fit the viewport. Computed-style assertions verify control pill/background/shadow, focus/hover feedback, and zero transition duration under reduced motion. Marker geometry matches the selected row after navigation and remains tied to selection during hover; exact token labels update without interpolating values.

Screenshots: `plans/validation/spectrum-sidebar-desktop-dark.png`, `spectrum-sidebar-desktop-light.png`, `spectrum-sidebar-compact.png`, `spectrum-sidebar-usage-dark.png`, `spectrum-team-activity-desktop.png`, `spectrum-team-activity-compact.png`, `spectrum-composer-desktop-dark.png`, `spectrum-composer-compact-shell.png`, and `spectrum-composer-compact-light.png`.

No remaining actionable defects were found in the assigned UI scope. Limitations: screenshots are static; timing is covered by source/computed-style and interaction checks, not a perceptual motion study. This pass did not execute real provider billing or a live delegated model run and does not constitute a full accessibility audit of every theme. The user’s running app/server were not restarted.
