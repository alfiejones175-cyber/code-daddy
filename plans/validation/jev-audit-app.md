# Jev audit: app, desktop, and session UI

Read-only audit of Jev's reachable app surface. The Jev tools are repository-local backend tools, so the desktop and web clients currently reach them through the shared permission dock and generic tool timeline renderer. No application source was changed.

## 1. Generic plugin tools discard Jev's visible result

**Status:** current product issue.

The current-session adapter preserves completed tool text in `state.output` ([`packages/app/src/utils/session-message.ts:353`](../../packages/app/src/utils/session-message.ts#L353)-[`360`](../../packages/app/src/utils/session-message.ts#L360)), and the shared timeline passes that output to the selected renderer ([`packages/session-ui/src/components/message-part.tsx:1611`](../../packages/session-ui/src/components/message-part.tsx#L1611)-[`1627`](../../packages/session-ui/src/components/message-part.tsx#L1627)). Jev has no registered renderer, so it falls back to `GenericTool`. That component neither accepts `output` nor supplies expandable content ([`packages/session-ui/src/components/basic-tool.tsx:323`](../../packages/session-ui/src/components/basic-tool.tsx#L323)-[`342`](../../packages/session-ui/src/components/basic-tool.tsx#L342)).

The agent receives the result and can paraphrase it, but the user cannot inspect the actual category, confidence, probability distribution, ranking, source IDs, model, or usage recorded in the transcript. This weakens auditability precisely where Jev is described as advisory.

**Smallest coherent fix:** let `GenericTool` render bounded, escaped text output in a collapsed disclosure, optionally formatting valid JSON. A Jev-specific renderer is also viable, but it must match both legacy exact names and the checksum-suffixed V2 prefixes documented at [`packages/jev/README.md:52`](../../packages/jev/README.md#L52)-[`64`](../../packages/jev/README.md#L64).

**Validation:** render legacy and V2 names with `ok`, `unavailable`, and `invalid_input` JSON; verify keyboard disclosure, narrow layout, bounded large output, and unchanged agent transcript. Current focused tests pass—7 app normalization tests and 6 session UI text-helper tests—but there is no `GenericTool` Jev fixture or renderer test. The existing permission E2E only covers `bash` project-scope copy ([`packages/app/e2e/regression/capabilities.spec.ts:223`](../../packages/app/e2e/regression/capabilities.spec.ts#L223)-[`245`](../../packages/app/e2e/regression/capabilities.spec.ts#L245)).

## 2. Advisory unavailability looks like an ordinary completed call

**Status:** UX ambiguity; the evaluator's successful structured completion is intentional, not an execution defect.

`unavailable` and `invalid_input` are valid result variants ([`packages/jev/src/schema.ts:39`](../../packages/jev/src/schema.ts#L39)-[`57`](../../packages/jev/src/schema.ts#L57)), including a clear missing-key message ([`packages/jev/src/evaluator.ts:86`](../../packages/jev/src/evaluator.ts#L86)-[`110`](../../packages/jev/src/evaluator.ts#L110)). Legacy returns that result as JSON ([`packages/jev/src/legacy.ts:15`](../../packages/jev/src/legacy.ts#L15)-[`23`](../../packages/jev/src/legacy.ts#L23), [`43`](../../packages/jev/src/legacy.ts#L43)-[`51`](../../packages/jev/src/legacy.ts#L51)); V2 declares it in the normal output schema ([`packages/jev/src/plugin.ts:11`](../../packages/jev/src/plugin.ts#L11)-[`32`](../../packages/jev/src/plugin.ts#L32)). The timeline therefore correctly records a completed tool execution, but the generic renderer from finding 1 hides whether evaluation actually happened.

A missing key, timeout, cancellation, network failure, or invalid response consequently looks like the same finished generic row as a successful evaluation unless the agent explains it. The CLI does distinguish these outcomes with exit codes, so the graphical surface is less informative than the documented CLI.

**Smallest coherent fix:** keep these typed outputs nonfatal, but have the renderer show a neutral “Jev unavailable” or “Input needs attention” state and the returned message. For `missing_key`, point to the documented private configuration location without displaying or reading the key.

**Validation:** fixture every result reason and assert visible state and recovery copy without converting an advisory outage into a failed session tool call.

## 3. The permission prompt does not explain the external data transfer

**Status:** current product issue.

The dock derives its explanation from one exact translation key and suppresses the description when that key is absent ([`packages/app/src/pages/session/composer/session-permission-dock.tsx:21`](../../packages/app/src/pages/session/composer/session-permission-dock.tsx#L21)-[`26`](../../packages/app/src/pages/session/composer/session-permission-dock.tsx#L26)). No Jev permission translations exist. Legacy requests expose the TypeSafe host as a pattern ([`packages/jev/src/legacy.ts:16`](../../packages/jev/src/legacy.ts#L16)-[`21`](../../packages/jev/src/legacy.ts#L21), [`44`](../../packages/jev/src/legacy.ts#L44)-[`49`](../../packages/jev/src/legacy.ts#L49)), but they still do not explain that supplied evidence will leave the app.

V2 is harder to interpret: plugin loading adds a checksum-scoped tool name ([`packages/core/src/plugin.ts:25`](../../packages/core/src/plugin.ts#L25)-[`30`](../../packages/core/src/plugin.ts#L30), [`69`](../../packages/core/src/plugin.ts#L69)-[`75`](../../packages/core/src/plugin.ts#L75)), then the host derives permission action and resource strings from that internal name ([`packages/core/src/plugin/host.ts:235`](../../packages/core/src/plugin/host.ts#L235)-[`247`](../../packages/core/src/plugin/host.ts#L247)). The permission UI can therefore show raw `plugin.jev_triage_failure_<checksum>` and `plugin:jev_triage_failure_<checksum>` values rather than a destination and payload explanation.

**Smallest coherent fix:** include human-facing permission metadata when plugin tools are registered—display name, purpose, destination, and data category—and teach the dock to prefer it with a generic localized fallback. This avoids hardcoding checksum-bearing names in every locale.

**Validation:** E2E both protocols and assert that the prompt says a redacted excerpt or supplied passages will be sent to TypeSafe, while the allow-once and project-scope behavior remains unchanged.

## 4. A collapsed generic row keeps the complete failure excerpt in its accessible text

**Status:** current product issue.

The generic renderer converts every unrecognized scalar input into a `key=value` argument without a length cap ([`packages/session-ui/src/components/basic-tool.tsx:304`](../../packages/session-ui/src/components/basic-tool.tsx#L304)-[`320`](../../packages/session-ui/src/components/basic-tool.tsx#L320)). Jev's triage schema permits `evidence` up to 24,000 characters ([`packages/jev/src/legacy.ts:10`](../../packages/jev/src/legacy.ts#L10)-[`14`](../../packages/jev/src/legacy.ts#L14)). CSS applies only visual ellipsis ([`packages/session-ui/src/components/basic-tool.css:150`](../../packages/session-ui/src/components/basic-tool.css#L150)-[`164`](../../packages/session-ui/src/components/basic-tool.css#L164)); the full value remains in the trigger DOM and accessible name.

This can make screen-reader output unusable and retains a large failure excerpt in a visually collapsed row. It also makes generic tool rendering cost scale with arbitrarily long scalar arguments.

**Smallest coherent fix:** omit known payload-like fields from the trigger or cap scalar previews before constructing DOM text, displaying a short label such as “evidence · 12.4k characters.” Keep the full input in the durable transcript and in an intentional disclosure if the user opens it.

**Validation:** render the maximum-size evidence on desktop and narrow widths, inspect the computed accessible name, tab through the row, and confirm the DOM preview is bounded.

## Intentional boundary

The lack of a standalone Jev settings page is not itself a broken feature. The package explicitly documents a private env file and states that this is a repository backend integration rather than a globally installed assistant tool ([`packages/jev/README.md:5`](../../packages/jev/README.md#L5)-[`17`](../../packages/jev/README.md#L17), [`52`](../../packages/jev/README.md#L52)-[`64`](../../packages/jev/README.md#L64)). The broken UX begins after an exposed Jev tool is invoked: result visibility, recovery status, consent copy, and bounded generic input presentation are incomplete.
