export * as ProjectLogoTool from "./project-logo"

import { ToolFailure } from "@opencode-ai/llm"
import { Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { FSUtil } from "../fs-util"
import { Location } from "../location"
import { LocationMutation } from "../location-mutation"
import { PermissionV2 } from "../permission"
import { ProjectAppearance } from "../project/appearance"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "project_logo"
export const MAX_BYTES = 5 * 1024 * 1024

export const Input = Schema.Struct({
  path: Schema.optional(Schema.String.annotate({ description: "Local image file to use as the current project's logo" })),
  reset: Schema.optional(Schema.Boolean.annotate({ description: "Remove the current project's custom logo" })),
})

export const Output = Schema.Struct({
  projectID: Schema.String,
  hasLogo: Schema.Boolean,
})
export type Output = typeof Output.Type

const imageMime = (bytes: Uint8Array) => {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png"
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50]))
    return "image/webp"
}

const startsWith = (bytes: Uint8Array, prefix: number[]) => prefix.every((value, index) => bytes[index] === value)

const toModelOutput = (output: Output) =>
  output.hasLogo ? `Updated the current project logo (${output.projectID})` : `Removed the current project logo (${output.projectID})`

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const fs = yield* FSUtil.Service
    const mutation = yield* LocationMutation.Service
    const permission = yield* PermissionV2.Service
    const appearance = yield* ProjectAppearance.Service
    const location = yield* Location.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description:
            "Set or remove the current project's custom logo. A logo must be a local PNG, JPEG, GIF, or WebP file no larger than 5 MiB. This changes only the project associated with the current location.",
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: toModelOutput(output) }],
          execute: (input, context) =>
            Effect.gen(function* () {
              const source = {
                type: "tool" as const,
                messageID: context.assistantMessageID,
                callID: context.toolCallID,
              }
              if (input.reset) {
                if (input.path !== undefined) return yield* Effect.fail(new Error("Provide a path or set reset to true"))
                const current = yield* appearance.current()
                yield* permission.assert({
                  action: name,
                  resources: [location.project.id],
                  save: [location.project.id],
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source,
                })
                const project = yield* appearance.update({ icon: { ...current.icon, override: undefined } })
                return { projectID: project.id, hasLogo: project.icon?.override !== undefined }
              }
              if (input.path === undefined) return yield* Effect.fail(new Error("Provide a path or set reset to true"))
              const current = yield* appearance.current()
              const target = yield* mutation.resolve({ path: input.path, kind: "file" })
              const external = target.externalDirectory
              if (external)
                yield* permission.assert({
                  ...LocationMutation.externalDirectoryPermission(external),
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source,
                })
              yield* permission.assert({
                action: name,
                resources: [location.project.id],
                save: [location.project.id],
                sessionID: context.sessionID,
                agent: context.agent,
                source,
              })
              const info = yield* fs.stat(target.canonical)
              if (info.type !== "File") return yield* Effect.fail(new Error("Logo path must be a file"))
              if (Number(info.size) > MAX_BYTES) return yield* Effect.fail(new Error(`Logo exceeds ${MAX_BYTES} bytes`))
              const bytes = yield* fs.readFile(target.canonical)
              if (bytes.length > MAX_BYTES) return yield* Effect.fail(new Error(`Logo exceeds ${MAX_BYTES} bytes`))
              const mime = imageMime(bytes)
              if (!mime) return yield* Effect.fail(new Error("Logo must be a PNG, JPEG, GIF, or WebP image"))
              const project = yield* appearance.update({
                icon: { ...current.icon, override: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` },
              })
              return { projectID: project.id, hasLogo: project.icon?.override !== undefined }
            }).pipe(
              Effect.mapError((error) =>
                new ToolFailure({
                  message: error instanceof Error ? error.message : "Unable to update the current project logo",
                }),
              ),
            ),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/project-logo",
  layer,
  deps: [
    ToolRegistry.node,
    FSUtil.node,
    LocationMutation.node,
    PermissionV2.node,
    ProjectAppearance.node,
    Location.node,
  ],
})
