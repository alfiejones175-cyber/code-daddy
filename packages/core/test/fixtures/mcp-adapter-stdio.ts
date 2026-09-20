import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"

const server = new Server({ name: "opencode-mcp-test", version: "1.0.0" }, { capabilities: { tools: {} } })
const countFile = process.env.MCP_CALL_COUNT_FILE
const pidFile = process.env.MCP_PID_FILE
if (pidFile) await Bun.write(pidFile, String(process.pid))
if (process.argv.includes("--hang")) await new Promise(() => {})

async function count() {
  if (!countFile) return
  const current = Number(await Bun.file(countFile).text().catch(() => "0")) || 0
  await Bun.write(countFile, String(current + 1))
}

server.setRequestHandler(ListToolsRequestSchema, () =>
  Promise.resolve({
    tools: [
      {
        name: "echo",
        description: "Echo a message",
        inputSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: { message: { type: "string", minLength: 1, enum: ["hello", "world"] }, count: { type: "integer", minimum: 1, maximum: 3 } },
          required: ["message"],
          additionalProperties: false,
        },
      },
      {
        name: "screenshot",
        description: "Return text and an image",
        inputSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: {}, additionalProperties: false },
      },
    ],
  }),
)

server.setRequestHandler(CallToolRequestSchema, ({ params }) => {
  return count().then(() => {
    if (params.name === "echo") return { content: [{ type: "text", text: String(params.arguments?.message ?? "") }] }
    return {
      content: [
        { type: "text" as const, text: "screenshot complete" },
        { type: "image" as const, data: "aGVsbG8=", mimeType: "image/png" },
      ],
    }
  })
})

await server.connect(new StdioServerTransport())
