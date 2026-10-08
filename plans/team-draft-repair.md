# Teams repair architecture and acceptance

Updated 8 October 2026. The first installed repair improved model discovery and
removed the confirmed strict-schema rejection, but the live draft still failed.
Build success and a synthetic provider response did not establish live acceptance.

## Boundaries

The default desktop server is V1. Settings uses `generateTeamDraft` to select
`/team/draft` for V1 or `/api/team/draft` for V2. Both requests must retain the
explicit model and global configuration directory. The provider services own
model resolution, authentication and subscription transport; the Teams feature
must not replace credentials or silently substitute another model.

Generation uses a private provider-compatible shape. Shared Core code converts
that shape into the public Schema team configuration and validates source agent
modes, skill permissions, role names, standards and the independent reviewer.
Generating must not save configuration. The Members step is the review boundary;
only Save writes global settings, preserving unrelated configuration.

The user clarified the required design: select one or all connected providers,
then let AI choose a model and required installed skills per member. Every member
must remain editable after drafting. Source profiles continue to define permission
boundaries; optional persisted model overrides on the lead and each role define
execution models in both V1 and V2. Existing teams without overrides retain their
inherited models. Explicit overrides clear inherited model variants to avoid
applying another model's variant. The draft-design model remains a separate
explicit selection.

## Confirmed architectural weaknesses

- Using the public configuration schema directly as a provider response schema
  exposed unsupported constraints. The separate generation shape fixes that
  boundary without weakening persisted configuration validation.
- Errors are discarded at generation, validation, HTTP and renderer boundaries.
  A provider problem and an invalid generated draft become the same misleading
  connection suggestion. Diagnose the new live failure before choosing a fix;
  preserve safe, actionable error categories through the existing API envelope.
- The streaming fixture returns a valid complete object and therefore cannot
  prove behavior for truncated output, incompatible profiles or live subscription
  transport. Add regression coverage for the confirmed second failure.
- Model availability in a provider catalog does not alone prove structured
  output compatibility. Keep the selected model explicit and surface unsupported
  generation rather than choosing a different provider automatically.

## Execution and acceptance

1. Reproduce the second failure with stage-specific local diagnostics. Do not
   print credentials, request headers, skill bodies or raw provider responses.
2. Repair the demonstrated cause in the appropriate layer, keeping V1/V2
   generation and shared conversion consistent. Make recovery errors useful.
3. Add optional model overrides to Schema and both projections. Constrain member
   generation to the server-resolved catalog within the requested provider scope.
   Use schema enums for eligible primary and subagent profile IDs, so a model
   cannot invent source profiles. Use integer references into the supplied model
   catalog to avoid large response-schema enum limits, resolving and validating
   them before returning public model IDs. Add provider scope and editable model
   controls, retaining required skill and permission validation. Regenerate the
   native client and legacy SDK from their changed contracts.
4. Test real implementation boundaries with a local HTTP fixture, including the
   reproduced failure and selected-model preservation. Run affected package
   typechecks. Generation and failed retries must leave configuration unchanged.
5. Rebuild, package and install only after source checks pass. Respect the app's
   no-restart instruction: the user quits/reopens the app normally.
6. Verify installed artifact hashes, Home, Settings, model search/selection,
   original-purpose live generation, Members review and model visibility. Leave
   the proposed team unsaved for the user's review. A failed live draft means
   this repair is incomplete even if all synthetic tests pass.

Evidence and the user's recoverable form text are in
[the dated validation record](validation/team-draft-repair-2026-10-08.md).

## Reproduced second failure

A source diagnostic through the existing OpenAI subscription produced a complete
object, but invented `invoice-agent-builder` as its lead profile. Shared validation
correctly rejected it as unavailable. Prompt instructions alone did not constrain
profile IDs; the revised generation schema enumerates eligible IDs by mode.
