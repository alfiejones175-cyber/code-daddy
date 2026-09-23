# Jev UI source consistency review

Date: 22 September 2026

Source baseline: `dc16b78ec0d7e7bf38da9b90fc1e536e2b4083fb`

Scope: current English UI only; read-only review of settings, provider/permission paths, Jev tool rows, composer controls, and desktop recovery/branding.

This review checked `AGENTS.md`, `documentation/localization.md`, `plans/README.md`, `plans/jev-fixes.md`, `plans/validation/jev-fixes-ui.md`, and the historical usability review before inspecting current source. It does **not** reopen the repaired generic-tool output disclosure, provider refresh error handling, OAuth auto-start, or keybind Tab-capture issues. No source code was changed.

See the [completed review](../jev-ui-review.md) for the live Jev assessments,
installation verification, compact-layout disagreement, and final prioritization.

## Findings

### P1 — Settings switches have visible row titles but no accessible names

**Evidence: browser-observed, installed-app-observed, and source-confirmed.** The current browser fixture exposed 11 unnamed General-settings switches; native accessibility inspection of the installed app exposed 13 unnamed switches, including Release notes and Pinch to zoom (`aria-label` and `aria-labelledby` were absent). The screenshot fixture is [jev-ui-settings-390.png](./jev-ui-settings-390.png). The active settings path is the V2 dialog because it includes the Capabilities tab ([dialog-settings-v2.tsx](../../packages/app/src/components/settings-v2/dialog-settings-v2.tsx#L87-L90)). In source, `SettingsRowV2` renders its title as an unrelated `div` and passes only `children` into a separate control container ([row.tsx](../../packages/app/src/components/settings-v2/parts/row.tsx#L10-L18)). General settings then render empty `<Switch />` children, for example Reasoning summaries and tool expansion ([general.tsx](../../packages/app/src/components/settings-v2/general.tsx#L383-L417)) and notification switches ([general.tsx](../../packages/app/src/components/settings-v2/general.tsx#L497-L531)). The shared switch only creates a Kobalte label when it receives children ([switch.tsx](../../packages/ui/src/components/switch.tsx#L10-L22)). By contrast, model visibility switches pass the model name as a hidden label ([models.tsx](../../packages/app/src/components/settings-v2/models.tsx#L160-L170)).

**Consequence:** a screen-reader user encounters a sequence of unnamed on/off controls and cannot tell which setting each switch changes.

**Narrow Jev claim:** the active V2 General settings surface renders visible titles beside switches but does not programmatically name those switches; the Models tab already demonstrates the labelled pattern.

**Acceptance check:** every settings switch exposes the visible row title as its accessible name, preferably through a shared `SettingsRowV2` label contract; verify the General and Models tabs with an accessibility-tree assertion that no switch name is empty.

### P2 — The Settings modal is an unnamed dialog

**Evidence: browser-observed and source-confirmed.** The live accessibility snapshot exposed `role="dialog"` with no name. `DialogSettings` mounts a V2 `Dialog` followed directly by vertical tabs, without `DialogTitle`, `DialogTitleGroup`, `aria-label`, or `aria-labelledby` ([dialog-settings-v2.tsx](../../packages/app/src/components/settings-v2/dialog-settings-v2.tsx#L45-L60)). The V2 dialog wrapper renders only `Kobalte.Content` and depends on callers to supply a Kobalte title ([dialog-v2.tsx](../../packages/ui/src/v2/components/dialog-v2.tsx#L84-L111)); the server dialog demonstrates the intended named pattern with `DialogHeader` and `DialogTitle` ([dialog-server-v2.tsx](../../packages/app/src/components/settings-v2/dialog-server-v2.tsx#L56-L61)).

**Consequence:** assistive technology announces an anonymous modal before moving focus into a dense tab set, so the user loses the context that this is Settings.

**Narrow Jev claim:** the active V2 Settings modal supplies no Kobalte dialog title or equivalent accessible name, while the V2 server dialog does.

**Acceptance check:** opening Settings yields one dialog named “Settings”; its tablist retains the existing section and tab names, and the visible layout does not need an added large header if a visually hidden title is used.

### P2 improvement — The visible Stop action turns into Send as soon as the user types during an active turn

**Evidence: source-confirmed.** Both composers define `stopping` as `working() && blank()` ([prompt-input-v2.tsx](../../packages/app/src/components/prompt-input-v2.tsx#L114-L130), [prompt-input.tsx](../../packages/app/src/components/prompt-input.tsx#L254-L286)). The V2 submit control chooses stop versus send label, icon, and click action solely from that value ([prompt-input/index.tsx](../../packages/session-ui/src/v2/components/prompt-input/index.tsx#L731-L759)). Keyboard Escape/Ctrl-G can still stop an active turn even with text present ([interaction.ts](../../packages/session-ui/src/v2/components/prompt-input/interaction.ts#L216-L223)), so the underlying capability remains available while its visible control disappears.

**Consequence:** preparing a steer or queued follow-up removes the discoverable Stop control at exactly the point when the user may need it; the same button location changes from terminating current work to submitting more work.

**Narrow Jev claim:** both composers expose Stop only when a turn is working and the draft is blank, although keyboard stop remains available with a non-empty draft.

**Acceptance check:** while `working()` is true, a labelled Stop action remains visible and operable regardless of draft content; Send may also remain available for steer/queue behavior. Verify blank and non-empty drafts in both composer layouts plus Escape/Ctrl-G.

### P2 — Completed Jev triage and ranking rows collapse to the same label

**Evidence: source-confirmed.** Jev exposes two different operations with different inputs and purposes: failure triage takes `evidence`, while evidence ranking takes `query`, optional `claim`, and `passages` ([legacy.ts](../../packages/jev/src/legacy.ts#L10-L50)). `GenericTool` recognizes both actions but replaces either successful row’s subtitle with the same “Jev advisory result” string and gives both the title “Jev” ([basic-tool.tsx](../../packages/session-ui/src/components/basic-tool.tsx#L366-L389), [basic-tool.tsx](../../packages/session-ui/src/components/basic-tool.tsx#L407-L435); copy in [en.ts](../../packages/ui/src/i18n/en.ts#L176-L179)). Because the generic argument preview skips `query`, and arrays such as `passages` produce no preview, a ranking without a claim can collapse to only “Jev — Jev advisory result” ([basic-tool.tsx](../../packages/session-ui/src/components/basic-tool.tsx#L304-L326)). The full bounded JSON remains correctly available after expansion; that prior fix is intact.

**Consequence:** a timeline with multiple Jev calls does not reveal which row classified a failure and which ranked research evidence, forcing users to expand raw JSON to locate the right advisory result.

**Narrow Jev claim:** successful Jev triage and ranking operations collapse to the same title and status text, and a ranking without an optional claim can lose its query and passage identity from the collapsed preview.

**Acceptance check:** collapsed rows distinguish “Jev failure triage” from “Jev evidence ranking” and retain a safe short cue (evidence character count or query); success, unavailable, and invalid-input states remain explicit, and full input/output disclosure stays bounded.

### Design question — Provider disconnect and shortcut reset act immediately

**Evidence: source-confirmed.** The connected-provider button calls `disconnect(...)` immediately ([providers.tsx](../../packages/app/src/components/settings-v2/providers.tsx#L218-L228)); the handler removes credentials or disables the provider and only reports the result afterward ([providers.tsx](../../packages/app/src/components/settings-v2/providers.tsx#L132-L173)). “Reset to defaults” likewise calls `resetAll()` immediately and then shows a completion toast ([settings-keybinds.tsx](../../packages/app/src/components/settings-keybinds.tsx#L409-L418), [settings-keybinds.tsx](../../packages/app/src/components/settings-keybinds.tsx#L460-L467)). By contrast, session deletion opens a named dialog with Cancel and a distinct destructive action ([message-timeline.tsx](../../packages/app/src/pages/session/timeline/message-timeline.tsx#L893-L919)), and workspace deletion also confirms before acting ([layout.tsx](../../packages/app/src/pages/layout.tsx#L1555-L1570)).

**Consequence:** one ordinary click can remove working provider access or all custom shortcuts, while other consequential actions establish an expectation of review and cancellation. Reconnecting may require credentials the user does not have immediately.

**Narrow Jev claim:** provider disconnect and reset-all execute immediately from ordinary buttons, whereas session and workspace deletion use explicit cancelable confirmation dialogs.

**Possible follow-up:** assess whether confirmation or undo improves recovery for these particular actions. Their consequences differ from session deletion, so differing confirmation behavior alone does not establish a defect. Preserve clear success/failure feedback; avoid blanket confirmation requirements.

## Verification boundaries

- Source inspection used the exact commit above; findings are limited to current English behavior.
- The 390×844 Settings view and unnamed accessibility roles were observed by the parent browser-validation pass against the current source fixture; the unnamed-switch result was also reproduced through native accessibility inspection of the installed app. Other findings are source-confirmed and still require interaction checks after a fix.
- The screenshot used a synthetic empty-backend state; no provider credentials, API keys, or live Jev requests were used.
- Non-English dictionary drift and planned full Jev app integration are outside this review.
