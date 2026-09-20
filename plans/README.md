# Desktop workspace additions

Planning baseline: `16d94e42dc`, 2026-09-20. Prepared with two read-only subagents covering desktop/UI and agents/provider integration. Implementation is in the working tree. See [implementation and validation](003-implementation.md) for delivered behavior and remaining native/account checks.

| Plan | Status | Priority | Dependency |
| --- | --- | --- | --- |
| [001 — Desktop workspace and agent chats](001-desktop-workspace.md) | Implemented; acceptance notes below | High | Start here; follow milestone order |
| [002 — Sidebar motion](002-sidebar-motion.md) | Implemented; acceptance notes below | Medium | Plan 001 milestone 1: routing and sidebar state |

Recommended order: route/state repairs → complete one real V2 delegated-chat flow and provider transport checks → expose child chats and account controls → motion and desktop polish. Desktop-edge panel mode is an optional later milestone.

The original planning evidence was source inspection. Implementation verification is recorded separately. The React Bits category page returned no extractable demo content; its official repository establishes it as a React animation reference. Specific reference demos still need visual review during implementation.
