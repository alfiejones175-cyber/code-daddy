import { describe, expect } from "bun:test"
import { Effect, Schema } from "effect"
import { PluginV2 } from "@opencode-ai/core/plugin"
import { PluginHost } from "@opencode-ai/core/plugin/host"
import { PermissionV2 } from "@opencode-ai/core/permission"
import { SessionV2 } from "@opencode-ai/core/session"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { testEffect } from "../lib/effect"
import { executeTool, toolDefinitions, toolIdentity } from "../lib/tool"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

describe("Plugin v2 tools", () => {
  it.effect("registers a typed canonical tool and disposes its scoped registration", () =>
    Effect.gen(function* () {
      const plugin = yield* PluginV2.Service
      const host = yield* PluginHost.make(plugin)
      const registry = yield* ToolRegistry.Service
      const registration = yield* host.tool.register({
        echo: {
          description: "Echoes a message",
          input: Schema.Struct({ message: Schema.String }),
          output: Schema.Struct({ reply: Schema.String }),
          execute: (input) => Effect.succeed({ reply: input.message }),
        },
      })

      expect(yield* toolDefinitions(registry)).toMatchObject([
        {
          name: "plugin_echo",
          inputSchema: { type: "object", required: ["message"] },
        },
      ])
      yield* registration.dispose
      expect(yield* toolDefinitions(registry)).toEqual([])
    }),
  )

  it.effect("namespaces a scoped plugin ID without breaking tool registration", () =>
    Effect.gen(function* () {
      const plugin = yield* PluginV2.Service
      const registry = yield* ToolRegistry.Service
      const id = PluginV2.ID.make("@scope/a-plugin-with-a-long-identifier-that-needs-shortening")
      yield* plugin.add(id, (host) =>
        host.tool
          .register({
            echo: {
              description: "Echoes a message",
              input: Schema.Struct({ message: Schema.String }),
              output: Schema.Struct({ reply: Schema.String }),
              execute: (input) => Effect.succeed({ reply: input.message }),
            },
          })
          .pipe(Effect.asVoid),
      )
      expect((yield* toolDefinitions(registry)).map((tool) => tool.name)).toEqual([
        expect.stringMatching(/^plugin__scope_[a-z0-9_-]+_[a-z0-9]+$/),
      ])
      yield* plugin.remove(id)
      expect(yield* toolDefinitions(registry)).toEqual([])
    }),
  )

  it.effect("enforces permission before execution and materializes structured output", () =>
    Effect.gen(function* () {
      const plugin = yield* PluginV2.Service
      const registry = yield* ToolRegistry.Service
      let calls = 0
      const allowed = PermissionV2.Service.of({
        assert: () => Effect.void,
        ask: () => Effect.die("unused"),
        reply: () => Effect.die("unused"),
        get: () => Effect.die("unused"),
        forSession: () => Effect.die("unused"),
        list: () => Effect.die("unused"),
      })
      const host = yield* PluginHost.make(plugin).pipe(Effect.provideService(PermissionV2.Service, allowed))
      const registration = yield* host.tool.register({
        echo: {
          description: "Echoes a message",
          input: Schema.Struct({ message: Schema.String }),
          output: Schema.Struct({ reply: Schema.String }),
          execute: (input) =>
            Effect.sync(() => {
              calls += 1
              return { reply: input.message }
            }),
        },
      })
      const name = (yield* toolDefinitions(registry))[0]!.name
      expect(
        yield* executeTool(registry, {
          sessionID: SessionV2.ID.make("ses_plugin_tool"),
          ...toolIdentity,
          call: { type: "tool-call", id: "call-plugin-tool", name, input: { message: "hello" } },
        }),
      ).toMatchObject({ type: "text", value: '{"reply":"hello"}' })
      expect(calls).toBe(1)
      yield* registration.dispose

      const denied = PermissionV2.Service.of({
        ...allowed,
        assert: () => Effect.fail(new PermissionV2.BlockedError({ rules: [] })),
      })
      const deniedHost = yield* PluginHost.make(plugin).pipe(Effect.provideService(PermissionV2.Service, denied))
      const deniedRegistration = yield* deniedHost.tool.register({
        denied: {
          description: "Must not execute",
          input: Schema.Struct({ message: Schema.String }),
          output: Schema.Struct({ reply: Schema.String }),
          execute: () =>
            Effect.sync(() => {
              calls += 1
              return { reply: "unreachable" }
            }),
        },
      })
      const deniedName = (yield* toolDefinitions(registry))[0]!.name
      expect(
        yield* executeTool(registry, {
          sessionID: SessionV2.ID.make("ses_plugin_tool"),
          ...toolIdentity,
          call: { type: "tool-call", id: "call-plugin-denied", name: deniedName, input: { message: "hello" } },
        }),
      ).toMatchObject({ type: "error", value: expect.stringContaining("Permission denied") })
      expect(calls).toBe(1)
      yield* deniedRegistration.dispose
    }),
  )
})
