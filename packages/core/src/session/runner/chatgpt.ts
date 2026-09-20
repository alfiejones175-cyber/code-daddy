export * as ChatGPT from "./chatgpt"

import { LLM } from "@opencode-ai/llm"
import { OpenAIResponses } from "@opencode-ai/llm/protocols/openai-responses"
import { Auth, Route } from "@opencode-ai/llm/route"
import { Effect, Option, Schema } from "effect"
import { Credential } from "../../credential"
import { ModelV2 } from "../../model"

export const credential = (value: Credential.OAuth) =>
  value.methodID === "chatgpt-browser" || value.methodID === "chatgpt-headless"

// Match the existing subscription adapter's model policy. Actual entitlement
// remains server-authoritative; rejected models never fall back to paid API use.
export const supported = (model: ModelV2.Info) => {
  if (model.request.body.reasoningMode === "pro") return false
  if (["gpt-5.5", "gpt-5.3-codex-spark", "gpt-5.4", "gpt-5.4-mini"].includes(model.api.id)) return true
  if (["gpt-5.5-pro", "gpt-5.6"].includes(model.api.id)) return false
  const match = model.api.id.match(/^gpt-(\d+)(?:\.(\d+))?/)
  return !!match && (Number(match[1]) > 5 || (Number(match[1]) === 5 && Number(match[2] ?? 0) > 4))
}

const claims = Schema.Struct({
  chatgpt_account_id: Schema.optional(Schema.String),
  chatgpt_compute_residency: Schema.optional(Schema.String),
  "https://api.openai.com/auth": Schema.optional(
    Schema.Struct({
      chatgpt_account_id: Schema.optional(Schema.String),
      chatgpt_compute_residency: Schema.optional(Schema.String),
    }),
  ),
})
const decodeClaims = Schema.decodeUnknownOption(Schema.fromJsonString(claims))
const ownedFields = new Set(["apiKey", "store", "instructions", "include", "max_output_tokens", "temperature", "top_p"])

export const route = (value: Credential.OAuth) => {
  const token = value.access.split(".")
  const decoded = token.length === 3 ? decodeClaims(Buffer.from(token[1], "base64url").toString()) : Option.none()
  const claim = Option.getOrUndefined(decoded)
  const account =
    typeof value.metadata?.accountID === "string"
      ? value.metadata.accountID
      : (claim?.["https://api.openai.com/auth"]?.chatgpt_account_id ?? claim?.chatgpt_account_id)
  const residency =
    claim?.["https://api.openai.com/auth"]?.chatgpt_compute_residency ?? claim?.chatgpt_compute_residency
  const bearer = Auth.bearer(value.access)
  const auth = account ? bearer.andThen(Auth.header("ChatGPT-Account-Id", account)) : bearer
  return Route.make({
    id: "chatgpt-codex",
    provider: "openai",
    endpoint: { baseURL: "https://chatgpt.com/backend-api/codex", path: "/responses" },
    auth:
      residency && residency !== "no_constraint"
        ? auth.andThen(Auth.header("x-openai-internal-codex-residency", residency))
        : auth,
    defaults: { providerOptions: { openai: { store: false } } },
    protocol: {
      ...OpenAIResponses.protocol,
      body: {
        ...OpenAIResponses.protocol.body,
        from: (request) =>
          OpenAIResponses.protocol.body
            .from(
              LLM.updateRequest(request, {
                system: [],
                generation: {},
                providerOptions: {
                  ...request.providerOptions,
                  openai: { ...request.providerOptions?.openai, store: false },
                },
              }),
            )
            .pipe(
              Effect.map((body) => ({
                ...body,
                instructions: request.system.map((part) => part.text).join("\n"),
                store: false,
                include: [...new Set([...(body.include ?? []), "reasoning.encrypted_content" as const])],
              })),
            ),
      },
      stream: {
        ...OpenAIResponses.protocol.stream,
        initial: (request) => ({ ...OpenAIResponses.protocol.stream.initial(request), store: false }),
      },
    },
    transport: {
      ...OpenAIResponses.httpTransport,
      // Subscription requirements also apply to catalog/variant HTTP overlays.
      prepare: (input) =>
        OpenAIResponses.httpTransport.prepare({
          ...input,
          request: LLM.updateRequest(input.request, {
            http: {
              ...input.request.http,
              body: Object.fromEntries(
                Object.entries(input.request.http?.body ?? {}).filter(([key]) => !ownedFields.has(key)),
              ),
            },
          }),
        }),
    },
  })
}
