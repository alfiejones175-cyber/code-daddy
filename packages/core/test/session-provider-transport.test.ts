import { describe, expect } from "bun:test"
import { LLM, LLMEvent, Message } from "@opencode-ai/llm"
import { LLMClient, RequestExecutor } from "@opencode-ai/llm/route"
import { Credential } from "@opencode-ai/core/credential"
import { Integration } from "@opencode-ai/core/integration"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionRunnerModel } from "@opencode-ai/core/session/runner/model"
import { Effect, Layer, Schema, Stream } from "effect"
import { Headers, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { it } from "./lib/effect"

const catalog = (provider: "openai" | "openrouter", body: Record<string, unknown> = {}) =>
  ModelV2.Info.make({
    ...ModelV2.Info.empty(ProviderV2.ID.make(provider), ModelV2.ID.make("visible-model")),
    api: {
      id: ModelV2.ID.make(provider === "openai" ? "gpt-5.4" : "anthropic/claude-sonnet-4"),
      type: "aisdk",
      package: provider === "openai" ? "@ai-sdk/openai" : "@openrouter/ai-sdk-provider",
    },
    request: { headers: { "HTTP-Referer": "https://opencode.ai/" }, body },
  })

const oauth = () =>
  Credential.OAuth.make({
    type: "oauth",
    methodID: Integration.MethodID.make("chatgpt-browser"),
    access: "test-access",
    refresh: "test-refresh",
    expires: Date.now() + 60_000,
    metadata: { accountID: "account-test" },
  })

const sse = (...events: unknown[]) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")

describe("Session provider transport", () => {
  it.effect("retains account and compute residency after OAuth token rotation", () =>
    Effect.gen(function* () {
      const value = Credential.OAuth.make({
        ...oauth(),
        metadata: undefined,
        access: `header.${Buffer.from(
          JSON.stringify({
            "https://api.openai.com/auth": { chatgpt_account_id: "rotated-account", chatgpt_compute_residency: "eu" },
          }),
        ).toString("base64url")}.signature`,
      })
      const model = yield* SessionRunnerModel.fromCatalogModel(catalog("openai"), value)
      const headers = yield* model.route.auth.apply({
        request: LLM.request({ model, prompt: "Hello" }),
        method: "POST",
        url: "https://chatgpt.com/backend-api/codex/responses",
        body: "{}",
        headers: Headers.fromInput({ authorization: "Bearer old", "ChatGPT-Account-Id": "old-account" }),
      })
      expect(headers.authorization).toBe(`Bearer ${value.access}`)
      expect(headers["chatgpt-account-id"]).toBe("rotated-account")
      expect(headers["x-openai-internal-codex-residency"]).toBe("eu")
    }),
  )
  for (const provider of ["openai", "openrouter"] as const) {
    it.effect(`${provider} streams text and tools through the native catalog route`, () =>
      Effect.gen(function* () {
        const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = []
        const response =
          provider === "openai"
            ? sse(
                { type: "response.output_text.delta", item_id: "text-1", delta: "Checking" },
                {
                  type: "response.output_item.added",
                  item: { type: "function_call", id: "item-1", call_id: "call-1", name: "lookup", arguments: "" },
                },
                { type: "response.function_call_arguments.delta", item_id: "item-1", delta: '{"query":"test"}' },
                {
                  type: "response.output_item.done",
                  item: {
                    type: "function_call",
                    id: "item-1",
                    call_id: "call-1",
                    name: "lookup",
                    arguments: '{"query":"test"}',
                  },
                },
                { type: "response.completed", response: { usage: { input_tokens: 5, output_tokens: 2 } } },
              )
            : sse(
                { choices: [{ index: 0, delta: { content: "Checking" } }] },
                {
                  choices: [
                    {
                      index: 0,
                      delta: {
                        tool_calls: [
                          {
                            index: 0,
                            id: "call-1",
                            type: "function",
                            function: { name: "lookup", arguments: '{"query":"test"}' },
                          },
                        ],
                      },
                    },
                  ],
                },
                {
                  choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
                  usage: { prompt_tokens: 5, completion_tokens: 2 },
                },
              ) + "data: [DONE]\n\n"
        const client = LLMClient.layer.pipe(
          Layer.provide(RequestExecutor.layer),
          Layer.provide(
            Layer.succeed(
              HttpClient.HttpClient,
              HttpClient.make((request) =>
                Effect.gen(function* () {
                  const web = yield* HttpClientRequest.toWeb(request).pipe(Effect.orDie)
                  calls.push({
                    url: request.url,
                    headers: request.headers,
                    body: Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(
                      yield* Effect.promise(() => web.json()),
                    ),
                  })
                  return HttpClientResponse.fromWeb(
                    request,
                    new Response(response, { headers: { "content-type": "text/event-stream" } }),
                  )
                }),
              ),
            ),
          ),
        )
        const model = yield* SessionRunnerModel.fromCatalogModel(
          catalog(
            provider,
            provider === "openai"
              ? { store: true, instructions: "override", max_output_tokens: 8 }
              : { reasoning: { effort: "high" } },
          ),
          provider === "openai" ? oauth() : Credential.Key.make({ type: "key", key: "test-router-key" }),
        )
        const events = yield* LLM.stream(
          LLM.request({
            model,
            system: "Follow project instructions.",
            messages: [Message.user("Look it up")],
            tools: [
              {
                name: "lookup",
                description: "Look up a value",
                inputSchema: { type: "object", properties: { query: { type: "string" } } },
              },
            ],
            generation: { maxTokens: 100, temperature: 0.5 },
          }),
        ).pipe(Stream.runCollect, Effect.provide(client))
        expect(calls).toHaveLength(1)
        expect(events.filter(LLMEvent.is.textDelta)).toMatchObject([{ text: "Checking" }])
        expect(events.filter(LLMEvent.is.toolCall)).toMatchObject([
          { id: "call-1", name: "lookup", input: { query: "test" } },
        ])
        expect(events.filter(LLMEvent.is.finish)).toHaveLength(1)
        expect(calls[0].headers["http-referer"]).toBe("https://opencode.ai/")
        expect(JSON.stringify(calls[0].body)).not.toContain("test-access")
        if (provider === "openai") {
          expect(calls[0].url).toBe("https://chatgpt.com/backend-api/codex/responses")
          expect(calls[0].headers.authorization).toBe("Bearer test-access")
          expect(calls[0].headers["chatgpt-account-id"]).toBe("account-test")
          expect(calls[0].body).toMatchObject({
            instructions: "Follow project instructions.",
            store: false,
            include: ["reasoning.encrypted_content"],
            input: [{ role: "user" }],
          })
          expect(calls[0].body).not.toHaveProperty("max_output_tokens")
          expect(calls[0].body).not.toHaveProperty("temperature")
          return
        }
        expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions")
        expect(calls[0].headers.authorization).toBe("Bearer test-router-key")
        expect(calls[0].body).toMatchObject({ model: "anthropic/claude-sonnet-4", reasoning: { effort: "high" } })
      }),
    )
  }

  it.effect("keeps API keys on the configured API endpoint", () =>
    Effect.gen(function* () {
      const model = yield* SessionRunnerModel.fromCatalogModel(
        catalog("openai"),
        Credential.Key.make({ type: "key", key: "api-key" }),
      )
      expect(model.route.id).toBe("openai-responses")
      expect(model.route.endpoint.baseURL).toBe("https://api.openai.com/v1")
    }),
  )

  it.effect("rejects subscription credentials for another provider or unsupported model", () =>
    Effect.gen(function* () {
      const wrongProvider = yield* SessionRunnerModel.fromCatalogModel(catalog("openrouter"), oauth()).pipe(Effect.flip)
      expect(wrongProvider.api).toBe("chatgpt-codex")
      const unsupported = catalog("openai")
      const failure = yield* SessionRunnerModel.fromCatalogModel(
        { ...unsupported, api: { ...unsupported.api, id: ModelV2.ID.make("gpt-4o") } },
        oauth(),
      ).pipe(Effect.flip)
      expect(failure.api).toBe("chatgpt-codex")
    }),
  )

  it.effect("supports OpenRouter custom endpoints and pins subscription requests to Codex", () =>
    Effect.gen(function* () {
      const router = catalog("openrouter")
      expect(SessionRunnerModel.supported(router)).toBe(true)
      const custom = yield* SessionRunnerModel.fromCatalogModel({
        ...router,
        api: { ...router.api, url: "https://router.example/v1" },
      })
      expect(custom.route.endpoint.baseURL).toBe("https://router.example/v1")
      const openai = catalog("openai")
      const subscription = yield* SessionRunnerModel.fromCatalogModel(
        { ...openai, api: { ...openai.api, url: "https://api.openai.com/v1" } },
        oauth(),
      )
      expect(subscription.route.endpoint.baseURL).toBe("https://chatgpt.com/backend-api/codex")
    }),
  )
})
