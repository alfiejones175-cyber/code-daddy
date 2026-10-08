import { Schema } from "effect"
import { Workflow } from "@opencode-ai/schema/workflow"

// Standalone localhost-only synthetic upstream for browser acceptance, never a paid model.
// bun run test/workflow/fixtures/harness-provider.ts 4109
const requestSchema = Schema.Struct({
  model: Schema.String,
  stream: Schema.optional(Schema.Boolean),
  messages: Schema.Array(Schema.Struct({ role: Schema.String, content: Schema.Unknown })),
})
const designContext = Schema.Struct({ executionModel: Workflow.Model })
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.argv[2] ?? "4109"),
  async fetch(request) {
    if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/chat/completions"))
      return new Response("Synthetic workflow model", { status: 200 })
    const body = Schema.decodeUnknownSync(requestSchema)(await request.json())
    const prompt = body.messages
      .map((message) => (typeof message.content === "string" ? message.content : ""))
      .join("\n")
    const designer = prompt.includes("Design a narrow, low-cost AI execution harness")
    const model = designer
      ? Schema.decodeUnknownSync(designContext)(
          Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(prompt.slice(prompt.indexOf('{"goal":'))),
        ).executionModel
      : { providerID: "workflow-test", modelID: body.model }
    const spec: Workflow.HarnessSpec = {
      model,
      instructions:
        "Extract the customer name. Reply with one JSON object containing the name field; no prose or tools.",
      modelReason: "Synthetic fixture: text-only extraction requires no tools.",
      allowedTools: [],
      timeoutSeconds: 10,
      maxOutputChars: 200,
      outputFormat: "json",
      requiredJsonKeys: ["name"],
      checklist: ["The name matches the supplied customer."],
    }
    const text = designer ? JSON.stringify(spec) : '{"name":"Jane"}'
    if (!body.stream)
      return Response.json({
        id: "synthetic",
        object: "chat.completion",
        created: 1,
        model: body.model,
        choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })
    return new Response(
      [
        {
          id: "synthetic",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }],
        },
        {
          id: "synthetic",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      ]
        .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
        .join("") + "data: [DONE]\n\n",
      { headers: { "content-type": "text/event-stream" } },
    )
  },
})
console.log(`Synthetic harness provider: ${server.url}`)
