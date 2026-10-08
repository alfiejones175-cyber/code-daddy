import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Effect, Layer, LayerMap } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { makeGlobalNode } from "@opencode-ai/core/effect/app-node"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ConfigTeamSettings } from "@opencode-ai/core/config/team-settings"
import { Global } from "@opencode-ai/core/global"
import { Location } from "@opencode-ai/core/location"
import { LocationServiceMap } from "@opencode-ai/core/location-service-map"
import { Project } from "@opencode-ai/core/project"
import type { LocationError, LocationServices } from "@opencode-ai/core/location-services"
import { tmpdir } from "../fixture/tmpdir"

const mapNode = makeGlobalNode({
  service: LocationServiceMap.Service,
  layer: Layer.effect(
    LocationServiceMap.Service,
    LayerMap.make(
      (ref: Location.Ref) =>
        Layer.succeed(
          Location.Service,
          Location.Service.of({
            directory: ref.directory,
            workspaceID: ref.workspaceID,
            project: { id: Project.ID.global, directory: ref.directory },
          }),
        ) as unknown as Layer.Layer<LocationServices, LocationError>,
      { idleTimeToLive: "1 minute" },
    ) as Effect.Effect<LayerMap.LayerMap<Location.Ref, LocationServices, LocationError>>,
  ),
  deps: [],
})

function settingsLayer(directory: string) {
  return AppNodeBuilder.build(LayerNode.group([ConfigTeamSettings.node]), [
    [Global.node, Global.layerWith({ config: directory, state: directory })],
    [LocationServiceMap.node, mapNode],
  ])
}

describe("global team settings", () => {
  test("preserves comments and unrelated fields while replacing whole team entries and clearing defaults", async () => {
    await using tmp = await tmpdir()
    const filepath = path.join(tmp.path, "opencode.jsonc")
    const source = `{
  // Keep this setting and its comment.
  "theme": "dark",
  "teams": {
    // This role is removed by the replacement.
    "review": { "lead": "build", "roles": { "old": { "agent": "general" } } }
  },
  "default_team": "review"
}\n`
    await Bun.write(filepath, source)

    await Effect.runPromise(
      Effect.gen(function* () {
        const settings = yield* ConfigTeamSettings.Service
        const updated = yield* settings.update({
          teams: { review: { lead: "build", roles: { explorer: { agent: "explore" } } } },
          default_team: null,
        })
        expect(updated.data.teams?.review?.roles).toEqual({ explorer: { agent: "explore" } })
        expect(updated.data.default_team).toBeNull()
      }).pipe(Effect.scoped, Effect.provide(settingsLayer(tmp.path))),
    )

    const saved = await Bun.file(filepath).text()
    expect(saved).toContain("// Keep this setting and its comment.")
    expect(saved).toContain('"theme": "dark"')
    expect(saved).not.toContain('"old"')
    expect(saved).toContain('"default_team": null')
  })

  test("resolves global JSON then JSONC with later complete-team replacement", async () => {
    await using tmp = await tmpdir()
    await Bun.write(
      path.join(tmp.path, "opencode.json"),
      JSON.stringify({
        teams: {
          review: { lead: "build", roles: { old: { agent: "general" } } },
          research: { lead: "build", roles: { scout: { agent: "explore" } } },
        },
        default_team: "review",
      }),
    )
    await Bun.write(
      path.join(tmp.path, "opencode.jsonc"),
      '{ "teams": { "review": { "lead": "build", "roles": { "new": { "agent": "explore" } } } } }\n',
    )

    await Effect.runPromise(
      Effect.gen(function* () {
        const settings = yield* ConfigTeamSettings.Service
        const value = yield* settings.get()
        expect(Object.keys(value.data.teams ?? {})).toEqual(["review", "research"])
        expect(value.data.teams?.review?.roles).toEqual({ new: { agent: "explore" } })
        expect(value.data.teams?.research?.roles).toEqual({ scout: { agent: "explore" } })
        expect(value.data.default_team).toBe("review")
      }).pipe(Effect.scoped, Effect.provide(settingsLayer(tmp.path))),
    )
  })
})
