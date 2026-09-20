import { MCP } from "@opencode-ai/schema/mcp"
import { Location } from "@opencode-ai/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { LocationQuery, locationQueryOpenApi } from "./location"

export const MCPGroup = HttpApiGroup.make("server.mcp")
  .add(
    HttpApiEndpoint.get("mcp.list", "/api/mcp", {
      query: LocationQuery,
      success: Location.response(Schema.Array(MCP.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.mcp.list", summary: "List MCP capabilities" })),
  )
  .add(
    HttpApiEndpoint.post("mcp.connect", "/api/mcp/:serverID/connect", {
      params: { serverID: MCP.ID },
      query: LocationQuery,
      success: Location.response(MCP.Info),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.mcp.connect", summary: "Connect MCP server" })),
  )
  .add(
    HttpApiEndpoint.post("mcp.disconnect", "/api/mcp/:serverID/disconnect", {
      params: { serverID: MCP.ID },
      query: LocationQuery,
      success: Location.response(MCP.Info),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.mcp.disconnect", summary: "Disconnect MCP server" })),
  )
  .add(
    HttpApiEndpoint.post("mcp.reconnect", "/api/mcp/:serverID/reconnect", {
      params: { serverID: MCP.ID },
      query: LocationQuery,
      success: Location.response(MCP.Info),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.mcp.reconnect", summary: "Reconnect MCP server" })),
  )
  .add(
    HttpApiEndpoint.post("mcp.preset", "/api/mcp/preset/:presetID", {
      params: { presetID: Schema.Literals(["browser", "xcode"]) },
      query: LocationQuery,
      success: Location.response(MCP.Info),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.mcp.preset", summary: "Configure MCP preset" })),
  )
  .add(
    HttpApiEndpoint.post("mcp.test", "/api/mcp/:serverID/test", {
      params: { serverID: MCP.ID },
      query: LocationQuery,
      success: Location.response(MCP.Info),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(OpenApi.annotations({ identifier: "v2.mcp.test", summary: "Test MCP server" })),
  )
