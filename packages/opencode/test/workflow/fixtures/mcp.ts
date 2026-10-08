import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"

const server = new Server({ name: "workflow-test", version: "1" }, { capabilities: { tools: {} } })
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{ name: "mark", description: "Record a test invocation", inputSchema: { type: "object", properties: {} } }],
}))
server.setRequestHandler(CallToolRequestSchema, async () => {
  await Bun.write(process.argv[2], "called")
  return { content: [{ type: "text", text: "tool completed" }] }
})
await server.connect(new StdioServerTransport())
