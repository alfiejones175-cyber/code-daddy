# Jev audit: Core V2 Session boundaries

Scope: read-only review of Core, Server, Protocol, Client, `sdk-next`, and their active callers. These are implementation priorities, not model-generated diagnoses.

## 1. V2 request assembly is not yet behaviorally equivalent to the active V1 path

**Status:** intentional migration gap; do not route the default product path to V2 yet.

The V2 runner constructs an LLM request from the selected agent's static system text, Context Epoch baseline, projected history, and materialized tools ([`llm.ts:233`](../../packages/core/src/session/runner/llm.ts#L233)-[`249`](../../packages/core/src/session/runner/llm.ts#L249)). The active V1 loop additionally resolves environment, instructions, MCP instructions, skills, structured-output policy, and applies a plugin message transform before processing ([`prompt.ts:1255`](../../packages/opencode/src/session/prompt.ts#L1255)-[`1286`](../../packages/opencode/src/session/prompt.ts#L1286)).

The V2 specification confirms the discrepancy: provider baselines, per-prompt overrides, reminders, plugin transforms, structured output, native mentions, and configured references are still marked `missing` or `partial` ([`session.md:129`](../../specs/v2/session.md#L129)-[`151`](../../specs/v2/session.md#L151)). The desktop/web compatibility adapter still sends prompts to the legacy async endpoint ([`server-compat.ts:200`](../../packages/app/src/utils/server-compat.ts#L200)-[`220`](../../packages/app/src/utils/server-compat.ts#L220)), while the legacy public API continues to expose V1 prompt and promptAsync ([`groups/session.ts:316`](../../packages/opencode/src/server/routes/instance/httpapi/groups/session.ts#L316)-[`341`](../../packages/opencode/src/server/routes/instance/httpapi/groups/session.ts#L341)).

**Next change:** choose one small end-to-end vertical slice—agent system prompt plus provider-family baseline and effective request policy—then add paired V1/V2 request-fixture tests. Keep the current compatibility route until the parity checklist records those entries as complete; do not make a broad caller migration first.

## 2. Generated V2 client methods advertise `compact` and `wait`, but both are deliberate 503 stubs

**Status:** incomplete public contract, not a hidden runtime bug.

Protocol publishes `POST /compact` and `POST /wait` with normal summaries ([`session.ts:262`](../../packages/protocol/src/groups/session.ts#L262)-[`289`](../../packages/protocol/src/groups/session.ts#L289)); generated Effect client methods therefore expose both ([`client.ts:148`](../../packages/client/src/generated-effect/client.ts#L148)-[`156`](../../packages/client/src/generated-effect/client.ts#L156)). Core always returns `OperationUnavailableError` for each ([`session.ts:465`](../../packages/core/src/session.ts#L465)-[`472`](../../packages/core/src/session.ts#L472)), and Server translates that to `ServiceUnavailableError` with “not available yet” ([`handlers/session.ts:253`](../../packages/server/src/handlers/session.ts#L253)-[`297`](../../packages/server/src/handlers/session.ts#L297)).

**Next change:** either implement manual compaction and an awaitable drain lifecycle together, or remove these endpoints from the experimental public group until then. If retaining them, document the 503 in the generated client API and add contract tests so SDK consumers do not mistake the methods for supported operations.

## 3. Session execution cannot safely scale beyond one process

**Status:** intentional local-only limitation; a deployment constraint before multi-process/server expansion.

`SessionExecutionLocal` keeps coordination in an in-memory `Map` and routes each drain through the local `LocationServiceMap` ([`execution/local.ts:14`](../../packages/core/src/session/execution/local.ts#L14)-[`35`](../../packages/core/src/session/execution/local.ts#L35)); `SessionRunCoordinator` also owns an in-memory active registry ([`run-coordinator.ts:28`](../../packages/core/src/session/run-coordinator.ts#L28)-[`103`](../../packages/core/src/session/run-coordinator.ts#L103)). Both Server routes and `sdk-next` embed this local execution layer: Server installs `SessionExecutionLocal.node` ([`routes.ts:51`](../../packages/server/src/routes.ts#L51)-[`62`](../../packages/server/src/routes.ts#L62)), and `sdk-next` calls those embedded routes ([`opencode.ts:20`](../../packages/sdk-next/src/opencode.ts#L20)-[`38`](../../packages/sdk-next/src/opencode.ts#L38)).

The specification explicitly leaves clustered ownership, stale-runtime fencing, distributed interruption, and placement orchestration open ([`session.md:101`](../../specs/v2/session.md#L101)-[`109`](../../specs/v2/session.md#L109), [`185`](../../specs/v2/session.md#L185)).

**Next change:** make server topology an explicit capability: either reject/disable V2 execution when more than one process can serve a workspace, or design a durable lease/fence record keyed by Session ID before adding horizontal execution. Test duplicate resume attempts from two independent runtimes against the same database.

## 4. One V2 provider turn can start unbounded local tool work

**Status:** known operational gap, not a correctness failure in the current single-user slice.

Every non-provider-executed tool call is immediately settled into a `FiberSet` ([`llm.ts:283`](../../packages/core/src/session/runner/llm.ts#L283)-[`312`](../../packages/core/src/session/runner/llm.ts#L312)), and all started fibers are awaited only after stream closure ([`llm.ts:340`](../../packages/core/src/session/runner/llm.ts#L340)-[`389`](../../packages/core/src/session/runner/llm.ts#L389)). The V2 spec identifies this as intentionally unbounded and calls for per-turn limits and operational backpressure before broad exposure ([`session.md:171`](../../specs/v2/session.md#L171)-[`173`](../../specs/v2/session.md#L173)).

Output retention is already bounded: `ToolOutputStore` caps the contextual preview at 2,000 lines and 50 KiB ([`tool-output-store.ts:13`](../../packages/core/src/tool-output-store.ts#L13)-[`15`](../../packages/core/src/tool-output-store.ts#L15)), writes oversized full text to managed storage, and supplies a bounded preview while retaining media ([`tool-output-store.ts:138`](../../packages/core/src/tool-output-store.ts#L138)-[`174`](../../packages/core/src/tool-output-store.ts#L174)). The remaining gap is in-flight invocation concurrency and backlog, not the absence of output truncation.

**Next change:** define an agent/request tool-call budget and bounded concurrency at materialization or settlement, then emit a durable typed tool failure for calls rejected by that budget. Add a fixture that emits many calls in one provider stream and asserts the concurrency cap, final transcript, and no stranded tool state.

## 5. Raw media URIs are preserved until provider lowering, where OpenAI and Bedrock require inline bytes

**Status:** concrete provider-compatibility gap; the runner comment describes the wrong boundary.

`ToolOutput.toResultValue` does **not** reject URI content: multi-part output is returned unchanged as a `content` result ([`messages.ts:104`](../../packages/llm/src/schema/messages.ts#L104)-[`109`](../../packages/llm/src/schema/messages.ts#L109)). The TODO in `to-llm-message.ts` that says otherwise is stale ([`to-llm-message.ts:39`](../../packages/core/src/session/runner/to-llm-message.ts#L39)-[`53`](../../packages/core/src/session/runner/to-llm-message.ts#L53)).

The later provider boundary is nevertheless concrete. OpenAI Chat passes each tool file URI into `lowerMedia` ([`openai-chat.ts:264`](../../packages/llm/src/protocols/openai-chat.ts#L264)-[`284`](../../packages/llm/src/protocols/openai-chat.ts#L284)), which validates media as a matching `data:` URL or canonical base64 before producing an image URL ([`openai-chat.ts:205`](../../packages/llm/src/protocols/openai-chat.ts#L205)-[`208`](../../packages/llm/src/protocols/openai-chat.ts#L208), [`shared.ts:174`](../../packages/llm/src/protocols/shared.ts#L174)-[`205`](../../packages/llm/src/protocols/shared.ts#L205)). Bedrock uses the same validation path before constructing image or document byte blocks ([`bedrock-converse.ts:268`](../../packages/llm/src/protocols/bedrock-converse.ts#L268)-[`289`](../../packages/llm/src/protocols/bedrock-converse.ts#L289), [`bedrock-media.ts:65`](../../packages/llm/src/protocols/utils/bedrock-media.ts#L65)-[`87`](../../packages/llm/src/protocols/utils/bedrock-media.ts#L87)). Therefore a remote or managed URI cannot be continued through either provider as-is, even though conversion to an LLM result succeeds. The runner uses this history on every later provider request ([`llm.ts:203`](../../packages/core/src/session/runner/llm.ts#L203)-[`249`](../../packages/core/src/session/runner/llm.ts#L249)). The public prompt shape accepts arbitrary string URIs for file attachments ([`prompt-input.ts:7`](../../packages/schema/src/prompt-input.ts#L7)-[`26`](../../packages/schema/src/prompt-input.ts#L26)), and the parity checklist still marks file/directory/media/MCP-resource materialization partial ([`session.md:146`](../../specs/v2/session.md#L146)-[`151`](../../specs/v2/session.md#L151)).

**Next change:** replace the stale TODO with an explicit provider-media contract. Either materialize managed and remote attachment/result URIs to bytes before these lowerers, or reject unsupported URI schemes at input/tool settlement with a typed durable failure. Add per-provider fixtures for a `data:` URI, a managed URI, and an HTTPS URI across both a continuation tool result and a prompt attachment.
