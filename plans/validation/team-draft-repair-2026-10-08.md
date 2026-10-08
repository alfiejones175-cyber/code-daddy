# Team draft repair — 8 October 2026

## Confirmed failure

The installed V1 desktop sidecar rejected the user's AI team draft at 15:40 BST.
The provider returned HTTP 400 with `invalid_json_schema`: `allOf` is not
permitted in the response schema. This occurred before generation; it was not
evidence of a disconnected model. The public team configuration schema also
contains optional properties and dynamic role keys, which do not fit the
provider's strict output format.

The installed model dropdown opens and exposes connected models. Its unsorted
list contained hundreds of choices. The form also labelled zero-cost OpenAI
subscription entries as Free.

## Repair

- Generate against a private strict schema with required fields and a named
  role array. Convert that result into the existing public team configuration,
  rejecting duplicate names and retaining source-agent, skill, standards and
  reviewer validation. Both V1 and V2 use the same generation schema.
- Add model search, provider groups, alphabetical sorting and a no-results
  state. Preserve the selected model when filtering.
- Reuse the main picker's verified-free model rule. OpenAI subscription entries
  now use Provider pricing instead of Free.
- Prevent purpose-step controls from shrinking out of view in a short dialog.
- Exclude numbered duplicate icon copies from packaging. A process sample and
  open-file inspection showed the first packaging attempt waiting to read
  `resources/icons/android/mipmap-mdpi/ic_launcher_round 8.png`. Canonical icon
  assets remain included; source copies were not deleted.

No public API/configuration shape changed, and no client regeneration was
required. Existing unrelated working-tree changes were preserved.

## Checks

- Core typecheck passed; six draft tests passed (74 assertions), including
  strict-schema requirements, conversion, duplicate names, source agents,
  permitted skills, standards and independent review.
- Opencode typecheck passed. A local HTTP streaming fixture exercises the real
  V1 `TeamDraft.generate` OAuth branch: one selected-model request, no unsupported
  schema keywords, validated role conversion, and unchanged configuration
  bytes. One test passed (nine assertions). Dummy credentials and a disposable
  configuration were used; no real provider request was sent.
- App typecheck passed. Three existing free-model and team-transport tests
  passed (13 assertions).
- Desktop typecheck and formatting checks passed.
- Desktop dev build passed, including CLI version smoke test and embedded V1
  server. Renderer build completed at 15:52 BST. Compiled bundles contain both
  the generation conversion and the model search controls.
- Native inspection of the installed, older app confirmed the failed team
  form and working dropdown. The first installed repair passed model search/selection and Home/Settings
  startup checks after reopening. Live drafting still failed, so it was not
  accepted as fixed. Chrome preview access was unavailable in this session.

## Build and installation

Source commit: `e4afec5344a5484fcfe7e1d995feec86fe62b8f2`, with the existing dirty
working tree plus this repair. Cached model catalog:
`/Users/alfredo/.cache/opencode/models.json`, modified 8 October 2026 at
15:37:15 BST (about seven minutes old when the rebuild started).

`package:local` completed successfully on 8 October 2026 at approximately
16:00 BST and staged the verified archive for the local updater. The packaged
app is `packages/desktop/dist/mac-arm64/Code Daddy.app`; its `app.asar` SHA-256 is:

```text
b3df9c3fd048af1cc7e4994d0b43665d274681c5a61a559c3f0c8706a7e40596
```

Inspection of the packaged archive confirms that model search and draft
conversion are present and the numbered duplicate Android icon is excluded.

After the user quit normally, the local updater installed the staged package
at `/Users/alfredo/Applications/Code Daddy.app` on 8 October 2026 at 16:02 BST.
Packaged and installed `app.asar` hashes both match the value above. The previous
bundle is retained at
`/Users/alfredo/Applications/Code Daddy.previous-auto-20261008-160205-49302.app`.

`packages/app/AGENTS.md` explicitly forbids the agent from restarting the app or
its server. No force quit or restart was attempted. The user was asked to reopen
the updated app; startup and model-search checks passed after reopening. The live draft failed
again; the subsequent repair below is not yet installed.

Settings, history, provider credentials and local databases have not been
modified by this repair. Disposable preview servers were stopped after browser
preview access proved unavailable. No current user app/server was stopped.

## Unsaved team form recovery

The installed app currently holds this unsaved form in memory. Keep this text
available before closing it to install the update.

Description: **Bookbot team**

Purpose:

> I want a team that can design and test a specific agent to carry out invoice reading and matching to supplier amount + currency & VAT rate & description

Selected draft model: OpenAI / GPT-6 Astra.

## Architecture correction and second repair

The user clarified the target: AI selects each member's model and required skills
from one selected provider or all connected providers; every member is editable
before saving. The previous source-profile-only editor did not meet this scope.
The revised [architecture plan](../team-draft-repair.md) records all boundaries
and acceptance gates.

A source diagnostic through the existing OpenAI subscription reproduced the
second failure: the model invented `invoice-agent-builder` as a lead profile.
The shared configuration validator rejected it. The provider produced a complete
object; this was not a connection failure. Generation now enumerates valid lead
and member source IDs by mode in its private strict schema.

The second repair adds optional persisted lead/member model overrides, source
permission preservation in V1/V2, cleared inherited variants for explicit model
overrides, server-resolved connected-provider scope, validated integer model
catalog references, editable member model search, AI selection reasons, required
skill summaries and benchmark links. Old teams without overrides retain model
inheritance. Safe failure categories distinguish invalid drafts, unavailable
choices and timeouts from provider-generation failures.

Native client and legacy SDK were regenerated. Existing numbered SDK sync copies
were backed up before generation and restored byte-for-byte afterward.

At approximately 16:20 BST, a live **source** check of the revised V1 operation
succeeded for the original Bookbot purpose using OpenAI / GPT-6 Astra as designer
and all connected providers as the member pool. It returned a valid lead using
`openrouter/openai/gpt-5.1`, an artisan builder using
`openrouter/qwen/qwen3-coder` and a critic reviewer using
`openrouter/anthropic/claude-sonnet-4.6`, with permitted installed skills.
This establishes generation/validation through the real subscription; it does
not establish benchmark superiority or installed-editor acceptance. No team was
saved. The temporary diagnostic script was removed.

Second build/package/install and installed-editor acceptance remain pending.


Second-repair source checks passed:

- Schema, Core, App, Opencode, native Client, Server and Desktop typechecks.
- Core: 25 tests across team schema/migration, drafts, JSONC settings and V2
  projection; includes explicit model overrides, cleared inherited variants and
  unchanged source permissions.
- V1 agent projection suite: 45 tests passed. Team generation streaming fixtures:
  six tests passed, including one/all provider scope, unavailable scope, invented
  source rejection, out-of-catalog model rejection and unchanged config bytes.
- App: six transport/free-model tests passed, including V1/V2 provider scope,
  authentication, member-model/skill round-trip and safe error categories.
- Formatting and `git diff --check` passed.

The second desktop build completed successfully at approximately 16:26 BST,
including the CLI smoke test and embedded V1 server. It used the model catalog
snapshot refreshed at 16:19:28 BST. Packaged `app.asar` SHA-256:

```text
f2a2978d4910d34546c70e6cb40677b2b10ab238bd4ab1d4703a598a6dd59468
```

This hash identifies the new packaged build; installation/startup/live-editor
acceptance is still pending. No benchmark API credentials are required for the
comparison links. No team purpose or configuration is embedded in those URLs.


The revised package installed at `/Users/alfredo/Applications/Code Daddy.app`
on 8 October 2026 at 16:27:32 BST after the user quit normally. Installed and
packaged `app.asar` hashes both match `f2a2978d4910d34546c70e6cb40677b2b10ab238bd4ab1d4703a598a6dd59468`.
The previous bundle is retained at
`/Users/alfredo/Applications/Code Daddy.previous-auto-20261008-162732-77613.app`.
SDK typechecking also passed. Waiting for the user's normal reopen to complete
installed-editor acceptance.


The user chose “I’ll reopen it later” after installation. The revised installed
app was not launched by the agent. Home/Settings startup, provider scope controls,
live Bookbot drafting and member editing in this second installed build remain
explicitly pending the user's later reopen. The successful live source check and
82 focused test passes do not replace that installed UI acceptance. No Bookbot
team has been saved to configuration.

## Teams layout repair after the 16:33 screenshot

The user later reopened the second installed build. Native inspection confirmed
Settings and the Teams Members step load, but exposed two UI defects: the Add role
label wraps beyond its fixed-height button, and the inherited member model is
blank. The original Bookbot draft/save flow remains unverified in the installed
app.

The Add role button was allowed to shrink beside the description. Teams action
buttons now retain their label width, while the heading wraps its action below
the copy when needed. Longer overview card actions can wrap with automatic height.
Role fields use available container width to stack rather than relying on the
window's media query. Model selectors fill their field, role titles truncate
without squeezing the remove action, and recommendation text wraps long tokens.
Benchmark help is a collapsed native disclosure after the member heading.

The blank Inherit value was separate from layout: Kobalte treats an empty option
key as no selection. The editor now uses its existing non-empty selection
sentinel for that row and maps it back to the empty persisted model value.

Source checks: App typecheck passed; four existing Teams API/design tests passed
with 28 assertions. Focused independent review confirmed the sentinel mapping and
identified the longer card-action overflow case, which was corrected. No shared
UI component or user font preference was changed. The desktop build uses the
cached model catalog last modified at 16:31:52 BST on 8 October 2026.

The full desktop build completed, then the renderer/main/preload were rebuilt
after the final reviewed CSS specificity correction. Packaging and local updater
staging succeeded at approximately 16:44 BST. The emitted CSS was checked for the
specific selector overriding the shared fixed-height button rule. Packaged
`app.asar` SHA-256 is
`25c98345cd32b23401065f0554cbd51f5868a6cba6a505674715f10f0cc08aea`.
Installation and final visual checks for this layout repair are pending the
user's normal quit/reopen. Source HEAD remains
`e4afec5344a5484fcfe7e1d995feec86fe62b8f2` with the existing dirty working tree;
this repair changed only Teams TSX/CSS and this validation note.
Read-back from the packaged ASAR confirms the final card-button sizing selector,
wrapping heading copy and benchmark disclosure styles are included. The installed
bundle still has a different hash
(`e8c04a35c19bcb8a1437b5922768aea3faf9fcc810839370837ddc04e56ac0d0`)
at the pre-install check, so the new layout is not yet claimed as installed.
The running app and its server have not been restarted by the agent. A transient
CSS preview was blocked by the DevTools paste guard, so no preview code was run;
DevTools was closed and the existing form left intact. Visual validation must
use the rebuilt installed screen.
