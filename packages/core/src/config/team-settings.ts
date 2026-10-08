export * as ConfigTeamSettings from "./team-settings"

import path from "node:path"
import { AgentTeam } from "@opencode-ai/schema/agent-team"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"
import { makeGlobalNode } from "../effect/app-node"
import { Global } from "../global"
import { FSUtil } from "../fs-util"
import { LocationServiceMap } from "../location-service-map"
import { Flock } from "../util/flock"
import { ConfigTeam } from "./team"

export type Settings = typeof AgentTeam.Settings.Type

export interface Interface {
  readonly get: () => Effect.Effect<{ readonly data: Settings; readonly directory: string }, FSUtil.Error>
  readonly update: (
    input: Settings,
  ) => Effect.Effect<{ readonly data: Settings; readonly directory: string }, FSUtil.Error | Error>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/ConfigTeamSettings") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    const locations = yield* LocationServiceMap.Service
    const decode = Schema.decodeUnknownOption(AgentTeam.Settings, {
      errors: "all",
      onExcessProperty: "ignore",
    })
    const files = ["opencode.json", "opencode.jsonc"].map((name) => path.join(global.config, name))
    const formattingOptions = { insertSpaces: true, tabSize: 2 } as const

    const readFiles = Effect.fn("ConfigTeamSettings.readFiles")(function* () {
      const documents = yield* Effect.forEach(files, (filepath) =>
        Effect.gen(function* () {
          const source = yield* fs.readFileStringSafe(filepath)
          if (source === undefined) return
          const errors: ParseError[] = []
          const value = parse(source, errors, { allowTrailingComma: true })
          if (errors.length > 0) return
          return Option.getOrUndefined(decode(value))
        }),
      )
      const resolved = ConfigTeam.resolve(documents.filter((value): value is Settings => value !== undefined))
      return {
        data: resolved,
        directory: global.config,
      }
    })

    const read = Effect.fn("ConfigTeamSettings.read")(function* () {
      return yield* Effect.scoped(
        Effect.gen(function* () {
          yield* Flock.effect(global.config, { dir: path.join(global.state, "locks") })
          return yield* readFiles()
        }),
      )
    })

    const update = Effect.fn("ConfigTeamSettings.update")(function* (input: Settings) {
      const result = yield* Effect.scoped(
        Effect.gen(function* () {
          yield* Flock.effect(global.config, { dir: path.join(global.state, "locks") })
          const filepath = (yield* fs.existsSafe(files[1]!))
            ? files[1]!
            : (yield* fs.existsSafe(files[0]!))
              ? files[0]!
              : files[1]!
          const source = (yield* fs.readFileStringSafe(filepath)) ?? "{}\n"
          const errors: ParseError[] = []
          const current: unknown = parse(source, errors, { allowTrailingComma: true })
          if (
            errors.length > 0 ||
            (current !== undefined && (current === null || typeof current !== "object" || Array.isArray(current))) ||
            (current === undefined && source.trim().length > 0)
          )
            return yield* Effect.fail(new Error(`${path.basename(filepath)} has invalid JSON`))

          let edited = current === undefined ? "{}\n" : source
          for (const [name, team] of Object.entries(input.teams ?? {})) {
            edited = applyEdits(
              edited,
              modify(edited, ["teams", name], Schema.encodeSync(AgentTeam.Info)(team), { formattingOptions }),
            )
          }
          if (input.default_team !== undefined) {
            edited = applyEdits(edited, modify(edited, ["default_team"], input.default_team, { formattingOptions }))
          }
          yield* fs.writeWithDirs(filepath, edited)
          yield* LocationServiceMap.Service.invalidateAll(locations)
          return yield* readFiles()
        }),
      )
      return result
    })

    return Service.of({ get: read, update })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [FSUtil.node, Global.node, LocationServiceMap.node],
})
