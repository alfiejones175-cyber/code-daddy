# Sidebar chat navigation

Removed the V2 chat tab strip, Home/new-tab toolbar buttons, DEV badge, and tab onboarding popup. Native window controls, drag region, session utilities, and keyboard commands remain. Unsent drafts appear under their project, use their prompt text as a label, and reuse persisted prompt state.

Validation: app and E2E typechecks passed. All 14 sidebar browser cases passed (13 in the full suite; the new draft case passed separately after fixing test readiness). The new case checks two independent drafts, navigation, reload persistence, absent tab strip, and retained review control. Screenshot: sidebar-without-top-tabs.png.

Both production navigation benchmarks passed. The baseline clicked top tabs; the updated benchmark opens the sidebar and clicks the project chat, so results include the change in navigation surface and removal of tab-driven background prefetching. V2 median first correct content: review closed, cold 30.1 → 73.6 ms and hot 4.0 → 23.4 ms; review open, cold 7.9 → 53.7 ms and hot 5.1 → 25.5 ms. Navigation is slower by tens of milliseconds in this fixture; this is not a claim of unchanged performance. Full samples are in sidebar-no-tabs-benchmarks.json.
