# Sidebar polish, chat usage, and project logos

Requested 2026-09-20. Visual direction confirmed by the user: polished desktop tool, dark surfaces, crisp typography, restrained accents.

## Product and design decisions

This is an existing Solid/Electron coding workspace. The primary journey is selecting a project, opening a chat or its delegated child, and continuing work. The sidebar has one project tree; the collapsed rail contains utility actions. Project logos anchor the tree and open its editor. Token usage stays secondary to chat titles, with exact details behind a button. The existing theme, dialogs, avatar, and popover components remain the foundation. Light mode, compact layout, keyboard focus, and reduced motion remain supported.

The expanded sidebar is 288 pixels wide, with layered neutral surfaces, a restrained selection accent, larger project avatars, and consistent chat rows. Motion is limited to panel entry and control feedback. No continuous decorative animation is added.

## Behavior

- Every visible chat has a cumulative usage counter. Its popover shows exact input, visible output, reasoning, cache read/write, and cost values.
- Native counters are disjoint: the total sums those five buckets. It does not sum transcript pages or descendants. A child's usage remains its own. Missing historical values display an em dash; a recorded zero displays zero.
- A project's logo opens the editor. Users can select, replace, remove, or drop PNG, JPEG, GIF, or WebP images up to 5 MiB, then save. Failed requests leave the editor open and show an error.
- Native project edits persist through the location-scoped appearance endpoint, preserving authenticated desktop transport. The app uses a narrow transport adapter while its client dependency remains vendored.
- Native `project.updated` events update sidebar metadata and its icon cache, including agent edits and resets. Complete snapshots replace previous optional appearance fields, so removal cannot leave stale logos behind.
- The `project_logo` agent tool reads an image from a local path or removes the custom logo. It uses the normal permission flow, validates the file type and size, and returns a compact result rather than copying image data into the transcript.
- Non-Git folders retain local, per-directory manual appearance. The native tool rejects their shared global project identity so a change cannot affect unrelated folders.

## Validation

Focused app tests cover the appearance request's authentication, location, payload and failure; avatar override precedence; reset event snapshots; and existing sidebar behavior. Browser checks cover usage values and independent child counters, logo saving/removal/reload, navigation, provider setup, compact focus, and reduced motion. Final results and screenshot paths are recorded after the browser run. Browser records are synthetic test fixtures, not actual user conversations or measured account usage.


### Acceptance results

- App focused unit suite: **64 passed** across transport, avatar helpers, sidebar model, server event adaptation, and event reduction.
- Core project-logo suite: **3 passed**, including persistence, permission denial, invalid/oversize files, reset, shared identity rejection, and sparse appearance field updates.
- Sidebar browser suite: **13 passed** on isolated port 4478. Includes native live usage updates, parent/child independence, exact breakdown/cost, zero/missing data, logo save/reload/remove, compact nested-popover focus, existing navigation/provider flows, and reduced motion.
- App, E2E, Core, Protocol, Server, and Client typechecks passed. Public client generation completed; generated sources were not hand-edited.
- Production build and session-navigation benchmarks: **2 passed** on isolated port 4480. Both before/after have zero blank destinations, wrong destinations, or missing/replaced review hosts. V2 median first-correct navigation with the review pane closed changed from 45.0 to 33.3 ms cold and 3.4 to 2.8 ms hot; with it open, 8.8 to 8.3 ms cold and 4.6 to 5.1 ms hot. These small local samples include concurrent workspace changes and are not an isolated speedup claim. Detailed measurements: `validation/sidebar-usage-navigation.json`.
- Visual review completed for desktop light/dark and compact layouts. Screenshots: `validation/sidebar-usage-dark.png`, `validation/sidebar-logo.png`, `validation/sidebar-dark.png`, `validation/sidebar-light.png`, and `validation/sidebar-compact.png`.
- An initial browser run had one blank cold-load failure while shared source was changing; the full rerun passed. Its cause was not established. No user's running app or server was restarted.

### Follow-up: terminal typography and green on black

The requested follow-up uses the terminal's selected font throughout the Matrix theme (JetBrains Mono by default), with green foreground text and black workspace surfaces. Updated shared theme tokens cover the sidebar, composer, menus, dialogs, and terminal; warning/error semantics remain distinct. The preset is selected once for existing profiles, then subsequent appearance choices remain saved.

Validation: App/UI typechecks, 15 existing settings tests, and all 13 sidebar browser checks passed. Desktop and compact screenshots were inspected and saved as `validation/terminal-green-desktop.png` and `validation/terminal-green-compact.png`.
