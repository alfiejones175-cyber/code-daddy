import { MCP } from "@opencode-ai/core/mcp"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const MCPHandler = HttpApiBuilder.group(Api, "server.mcp", (handlers) =>
  handlers
    .handle("mcp.list", () => response(MCP.Service.use((mcp) => mcp.list())))
    .handle("mcp.connect", (ctx) => response(MCP.Service.use((mcp) => mcp.connect(ctx.params.serverID))))
    .handle("mcp.disconnect", (ctx) => response(MCP.Service.use((mcp) => mcp.disconnect(ctx.params.serverID))))
    .handle("mcp.reconnect", (ctx) => response(MCP.Service.use((mcp) => mcp.reconnect(ctx.params.serverID))))
    .handle("mcp.test", (ctx) => response(MCP.Service.use((mcp) => mcp.test(ctx.params.serverID))))
    .handle("mcp.preset", (ctx) => response(MCP.Service.use((mcp) => mcp.preset(ctx.params.presetID)))),
)
