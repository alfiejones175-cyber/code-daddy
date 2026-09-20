import { describe, expect } from "bun:test"
import path from "node:path"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Config } from "@opencode-ai/core/config"
import { ConfigMCP } from "@opencode-ai/core/config/mcp"
import { Location } from "@opencode-ai/core/location"
import { MCP } from "@opencode-ai/core/mcp"
import { PermissionV2 } from "@opencode-ai/core/permission"
import { SessionV2 } from "@opencode-ai/core/session"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { ToolOutputStore } from "@opencode-ai/core/tool-output-store"
import { location } from "./fixture/location"
import { testEffect } from "./lib/effect"
import { executeTool, toolIdentity, toolDefinitions } from "./lib/tool"
import { AbsolutePath } from "@opencode-ai/core/schema"

const serverPath = path.join(import.meta.dir, "fixtures/mcp-adapter-stdio.ts")
const countFile = path.join("/tmp", `opencode-mcp-count-${process.pid}`)
type MCPServer = typeof ConfigMCP.Server.Type
const permission = Layer.succeed(
  PermissionV2.Service,
  PermissionV2.Service.of({
    assert: (input) => (input.sessionID === SessionV2.ID.make("ses_mcp_denied") ? Effect.fail(new PermissionV2.BlockedError({ rules: [] })) : Effect.void),
    ask: () => Effect.die("unused"),
    reply: () => Effect.die("unused"),
    get: () => Effect.die("unused"),
    forSession: () => Effect.die("unused"),
    list: () => Effect.die("unused"),
  }),
)
const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of(location({ directory: AbsolutePath.make(process.cwd()) })),
)
const makeLayer = (server: MCPServer) => {
  const config = Layer.succeed(
    Config.Service,
    Config.Service.of({
      entries: () =>
        Effect.succeed([
          new Config.Document({
            type: "document",
            info: new Config.Info({ mcp: new ConfigMCP.Info({ servers: { fixture: server } }) }),
          }),
        ]),
    }),
  )
  return AppNodeBuilder.build(LayerNode.group([MCP.node, ToolRegistry.node, ToolRegistry.toolsNode, ToolOutputStore.node]), [
    [Config.node, config],
    [Location.node, locationLayer],
    [PermissionV2.node, permission],
  ])
}
const layer = makeLayer(new ConfigMCP.Local({ type: "local", command: ["bun", serverPath], environment: { MCP_CALL_COUNT_FILE: countFile } }))
const it = testEffect(layer)
const sessionID = SessionV2.ID.make("ses_mcp_adapter_test")

describe("MCP adapter", () => {
  it.live("discovers schemas and executes text and image content over stdio", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => Bun.write(countFile, "0"))
      const mcp = yield* MCP.Service
      const registry = yield* ToolRegistry.Service
      const info = (yield* mcp.list())[0]
      expect(info?.state).toBe("available")
      expect(info?.tools.map((tool) => tool.source)).toEqual(["echo", "screenshot"])
      expect((yield* toolDefinitions(registry)).map((tool) => tool.name)).toEqual([
        expect.stringContaining("mcp_fixture_echo"),
        expect.stringContaining("mcp_fixture_screenshot"),
      ])
      const definitions = yield* toolDefinitions(registry)
      const echoDefinition = definitions.find((tool) => tool.name === info!.tools[0]!.name)
      expect(echoDefinition?.inputSchema).toMatchObject({
        type: "object",
        required: ["message"],
        properties: { message: { type: "string", minLength: 1, enum: ["hello", "world"] }, count: { minimum: 1, maximum: 3 } },
      })
      const echo = yield* executeTool(registry, {
        sessionID,
        ...toolIdentity,
        call: { type: "tool-call", id: "call-echo", name: info!.tools[0]!.name, input: { message: "hello" } },
      })
      expect(echo).toEqual({ type: "text", value: "hello" })
      expect(Number(yield* Effect.promise(() => Bun.file(countFile).text()))).toBe(1)
      const image = yield* executeTool(registry, {
        sessionID,
        ...toolIdentity,
        call: { type: "tool-call", id: "call-image", name: info!.tools[1]!.name, input: {} },
      })
      expect(image).toMatchObject({
        type: "content",
        value: [
          { type: "text", text: "screenshot complete" },
          { type: "file", mime: "image/png", uri: "data:image/png;base64,aGVsbG8=" },
        ],
      })
      expect(Number(yield* Effect.promise(() => Bun.file(countFile).text()))).toBe(2)
      const materialized = yield* registry.materialize()
      yield* mcp.disconnect(info!.id)
      expect((yield* mcp.list())[0]?.state).toBe("configured")
      expect((yield* toolDefinitions(registry)).map((tool) => tool.name)).toEqual([])
      expect((yield* materialized.settle({ sessionID, ...toolIdentity, call: { type: "tool-call", id: "call-stale", name: info!.tools[0]!.name, input: { message: "hello" } } }))).toMatchObject({ result: { type: "error" } })
    }),
  )

  it.live("rejects invalid input and permission denial before the server call", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => Bun.write(countFile, "0"))
      const mcp = yield* MCP.Service
      const registry = yield* ToolRegistry.Service
      const echo = (yield* mcp.list())[0]!.tools[0]!.name
      const invalid = yield* executeTool(registry, {
        sessionID,
        ...toolIdentity,
        call: { type: "tool-call", id: "call-invalid", name: echo, input: { message: "nope" } },
      })
      expect(invalid).toMatchObject({ type: "error", value: expect.stringContaining("Invalid MCP input") })
      const invalidRange = yield* executeTool(registry, {
        sessionID,
        ...toolIdentity,
        call: { type: "tool-call", id: "call-range", name: echo, input: { message: "hello", count: 4 } },
      })
      expect(invalidRange).toMatchObject({ type: "error", value: expect.stringContaining("Invalid MCP input") })
      const denied = yield* executeTool(registry, {
        sessionID: SessionV2.ID.make("ses_mcp_denied"),
        ...toolIdentity,
        call: { type: "tool-call", id: "call-denied", name: echo, input: { message: "hello" } },
      })
      expect(denied).toMatchObject({ type: "error", value: expect.stringContaining("Permission denied") })
      expect(Number(yield* Effect.promise(() => Bun.file(countFile).text().catch(() => "0")))).toBe(0)
    }),
  )

  it.live("bounds startup and closes a hung stdio process", () =>
    Effect.promise(async () => {
      const pidFile = path.join("/tmp", `opencode-mcp-pid-${process.pid}`)
      await Bun.write(pidFile, "")
      const startup = new ConfigMCP.Local({
        type: "local",
        command: ["bun", serverPath, "--hang"],
        environment: { MCP_PID_FILE: pidFile },
        timeout: new ConfigMCP.Timeout({ startup: 50, request: 50 }),
      })
      const infos = await Effect.runPromise(
        Effect.gen(function* () {
          const mcp = yield* MCP.Service
          return yield* mcp.list()
        }).pipe(Effect.scoped, Effect.provide(makeLayer(startup))),
      )
      expect(infos[0]?.state).toBe("failed")
      const pid = Number(await Bun.file(pidFile).text())
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(() => process.kill(pid, 0)).toThrow()
    }),
  )
})
