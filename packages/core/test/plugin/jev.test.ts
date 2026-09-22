import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Schema } from "effect"
import { Config } from "@opencode-ai/core/config"
import { ConfigExternalPlugin } from "@opencode-ai/core/config/plugin/external"
import { PluginV2 } from "@opencode-ai/core/plugin"
import { PluginHost } from "@opencode-ai/core/plugin/host"
import { PermissionV2 } from "@opencode-ai/core/permission"
import { SessionV2 } from "@opencode-ai/core/session"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import jev from "../../../../.opencode/plugins/jev"
import { testEffect } from "../lib/effect"
import { executeTool, toolDefinitions, toolIdentity } from "../lib/tool"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

describe("Jev V2 integration", () => {
  it.live("loads the repository entry through the external plugin loader and disposes its tools", () =>
    Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const registry = yield* ToolRegistry.Service
      const host = yield* PluginHost.make(plugins)
      yield* ConfigExternalPlugin.Plugin.effect(host).pipe(
        Effect.provideService(
          Config.Service,
          Config.Service.of({
            entries: () =>
              Effect.succeed([
                new Config.Document({
                  type: "document",
                  info: Schema.decodeUnknownSync(Config.Info)({
                    plugins: [path.resolve(import.meta.dir, "../../../../.opencode/plugins/jev.ts")],
                  }),
                }),
              ]),
          }),
        ),
      )
      yield* plugins.wait(PluginV2.ID.make("jev")).pipe(Effect.timeout("5 seconds"))
      const definitions = yield* toolDefinitions(registry)
      expect(definitions.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^plugin_jev_triage_failure_/),
          expect.stringMatching(/^plugin_jev_rank_evidence_/),
        ]),
      )
      const triage = definitions.find((tool) => tool.name.startsWith("plugin_jev_triage_failure_"))!
      expect(triage.inputSchema).toMatchObject({
        $defs: { "Jev.TriageInput": { type: "object", required: ["evidence"] } },
      })
      yield* plugins.remove(PluginV2.ID.make("jev"))
      expect((yield* toolDefinitions(registry)).some((tool) => tool.name.startsWith("plugin_jev_"))).toBe(false)
      expect(Object.keys((yield* Effect.promise(() => jev.server())).tool)).toEqual([
        "jev_triage_failure",
        "jev_rank_evidence",
      ])
    }),
  )

  it.effect("blocks Jev execution before settings or network access when plugin permission is denied", () =>
    Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const registry = yield* ToolRegistry.Service
      const permission = yield* PermissionV2.Service
      const host = yield* PluginHost.make(plugins).pipe(
        Effect.provideService(PermissionV2.Service, {
          ...permission,
          assert: () => Effect.fail(new PermissionV2.BlockedError({ rules: [] })),
        }),
      )
      yield* jev.effect(host)
      const tool = (yield* toolDefinitions(registry)).find((tool) => tool.name === "plugin_triage_failure")!
      expect(
        yield* executeTool(registry, {
          sessionID: SessionV2.ID.make("ses_jev_permission"),
          ...toolIdentity,
          call: { type: "tool-call", id: "call-jev-denied", name: tool.name, input: { evidence: "synthetic failure" } },
        }),
      ).toMatchObject({ type: "error", value: expect.stringContaining("Permission denied") })
    }),
  )
})
