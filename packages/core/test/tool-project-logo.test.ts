import fs from "fs/promises"
import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { Location } from "@opencode-ai/core/location"
import { PermissionV2 } from "@opencode-ai/core/permission"
import { Project } from "@opencode-ai/core/project"
import { ProjectAppearance } from "@opencode-ai/core/project/appearance"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { ProjectLogoTool } from "@opencode-ai/core/tool/project-logo"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { ToolOutputStore } from "@opencode-ai/core/tool-output-store"
import { eq } from "drizzle-orm"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"
import { executeTool, toolIdentity } from "./lib/tool"

const projectID = Project.ID.make("project-logo-tool-test")
const appearanceProjectID = Project.ID.make("project-appearance-service-test")
const sessionID = SessionV2.ID.make("ses_project_logo_tool_test")
const assertions: PermissionV2.AssertInput[] = []
let deny = false

const permission = Layer.succeed(
  PermissionV2.Service,
  PermissionV2.Service.of({
    assert: (input) =>
      Effect.sync(() => assertions.push(input)).pipe(
        Effect.andThen(deny ? Effect.fail(new PermissionV2.BlockedError({ rules: [] })) : Effect.void),
      ),
    ask: () => Effect.die("unused"),
    reply: () => Effect.die("unused"),
    get: () => Effect.die("unused"),
    forSession: () => Effect.die("unused"),
    list: () => Effect.die("unused"),
  }),
)

const layer = (input: { directory: string; projectID: Project.ID }) =>
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      EventV2.node,
      ToolRegistry.node,
      ToolRegistry.toolsNode,
      ProjectAppearance.node,
      ProjectLogoTool.node,
    ]),
    [
      [
        Location.node,
        Layer.succeed(
          Location.Service,
          Location.Service.of({
            directory: AbsolutePath.make(input.directory),
            project: { id: input.projectID, directory: AbsolutePath.make(input.directory) },
          }),
        ),
      ],
      [PermissionV2.node, permission],
      [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
    ],
  )

const call = (input: { path?: string; reset?: boolean }, id = "call-project-logo") => ({
  sessionID,
  ...toolIdentity,
  call: { type: "tool-call" as const, id, name: ProjectLogoTool.name, input },
})

describe("ProjectLogoTool", () => {
  it.live("persists a bounded local logo, publishes the project event, and resets the same current project", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) => {
        const directory = tmp.path
        return Effect.gen(function* () {
          deny = false
          assertions.length = 0
          yield* Effect.promise(() =>
            Promise.all([
              fs.writeFile(path.join(directory, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
              fs.writeFile(path.join(directory, "not-an-image.txt"), "not an image"),
              fs.writeFile(path.join(directory, "too-large.png"), new Uint8Array(ProjectLogoTool.MAX_BYTES + 1)),
            ]),
          )
          const { db } = yield* Database.Service
          yield* db
            .insert(ProjectTable)
            .values({ id: projectID, worktree: AbsolutePath.make(directory), sandboxes: [] })
            .run()
            .pipe(Effect.orDie)
          yield* db
            .insert(SessionTable)
            .values({
              id: sessionID,
              project_id: projectID,
              slug: "project-logo",
              directory,
              title: "project-logo",
              version: "test",
            })
            .run()
            .pipe(Effect.orDie)
          yield* (yield* ProjectAppearance.Service).update({ icon: { color: "mint" } })
          const events = yield* EventV2.Service
          const updated: Array<{ type: string; data: unknown; location?: unknown }> = []
          const unsubscribe = yield* events.listen((event) =>
            Effect.sync(() => updated.push({ type: event.type, data: event.data, location: event.location })),
          )
          const registry = yield* ToolRegistry.Service

          expect(yield* executeTool(registry, call({ path: "logo.png" }))).toMatchObject({ type: "text" })
          const stored = yield* db
            .select()
            .from(ProjectTable)
            .where(eq(ProjectTable.id, projectID))
            .get()
            .pipe(Effect.orDie)
          expect(stored?.icon_url_override).toBe("data:image/png;base64,iVBORw0KGgo=")
          expect(stored?.icon_color).toBe("mint")
          expect(updated.at(-1)).toMatchObject({
            type: "project.updated",
            data: { id: projectID, icon: { override: "data:image/png;base64,iVBORw0KGgo=" } },
            location: { directory, project: { id: projectID } },
          })
          expect(assertions).toMatchObject([{ action: ProjectLogoTool.name, resources: [projectID] }])

          expect(yield* executeTool(registry, call({ path: "not-an-image.txt" }, "call-invalid"))).toEqual({
            type: "error",
            value: "Logo must be a PNG, JPEG, GIF, or WebP image",
          })
          expect(yield* executeTool(registry, call({ path: "too-large.png" }, "call-large"))).toEqual({
            type: "error",
            value: `Logo exceeds ${ProjectLogoTool.MAX_BYTES} bytes`,
          })
          expect(
            (
              yield* db
                .select()
                .from(ProjectTable)
                .where(eq(ProjectTable.id, projectID))
                .get()
                .pipe(Effect.orDie)
            )?.icon_url_override,
          ).toBe("data:image/png;base64,iVBORw0KGgo=")

          deny = true
          expect(yield* executeTool(registry, call({ reset: true }, "call-denied"))).toMatchObject({ type: "error" })
          expect(
            (
              yield* db
                .select()
                .from(ProjectTable)
                .where(eq(ProjectTable.id, projectID))
                .get()
                .pipe(Effect.orDie)
            )?.icon_url_override,
          ).toBe("data:image/png;base64,iVBORw0KGgo=")

          deny = false
          expect(yield* executeTool(registry, call({ reset: true }, "call-reset"))).toMatchObject({ type: "text" })
          expect(
            (
              yield* db
                .select()
                .from(ProjectTable)
                .where(eq(ProjectTable.id, projectID))
                .get()
                .pipe(Effect.orDie)
          )?.icon_url_override,
          ).toBeNull()
          expect(
            (
              yield* db
                .select()
                .from(ProjectTable)
                .where(eq(ProjectTable.id, projectID))
                .get()
                .pipe(Effect.orDie)
            )?.icon_color,
          ).toBe("mint")
          yield* unsubscribe
        }).pipe(Effect.provide(layer({ directory, projectID })))
      }),
    ),
  )

  it.effect("rejects the shared global project identity", () =>
    Effect.gen(function* () {
      const appearance = yield* ProjectAppearance.Service
      const failure = yield* appearance.update({ icon: {} }).pipe(Effect.flip)
      expect(failure).toBeInstanceOf(ProjectAppearance.SharedProjectError)
    }).pipe(Effect.provide(layer({ directory: process.cwd(), projectID: Project.ID.global }))),
  )

  it.live("persists sparse manual appearance updates and rejects an empty update", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) => {
        const directory = tmp.path
        return Effect.gen(function* () {
          const { db } = yield* Database.Service
          yield* db
            .insert(ProjectTable)
            .values({
              id: appearanceProjectID,
              worktree: AbsolutePath.make(directory),
              name: "Before",
              icon_url: "data:image/png;base64,discovered",
              icon_url_override: "data:image/png;base64,custom",
              icon_color: "mint",
              commands: { start: "bun dev" },
              sandboxes: [],
            })
            .run()
            .pipe(Effect.orDie)
          const appearance = yield* ProjectAppearance.Service

          expect(yield* appearance.update({ name: "After" })).toMatchObject({
            name: "After",
            icon: { url: "data:image/png;base64,discovered", override: "data:image/png;base64,custom", color: "mint" },
            commands: { start: "bun dev" },
          })
          expect(yield* appearance.update({ commands: {} })).toMatchObject({
            name: "After",
            commands: undefined,
          })
          expect(yield* appearance.update({ icon: {} })).toMatchObject({ name: "After", icon: undefined })
          expect(yield* appearance.current()).toMatchObject({ name: "After", icon: undefined, commands: undefined })
          const failure = yield* appearance.update({}).pipe(Effect.flip)
          expect(failure).toBeInstanceOf(ProjectAppearance.InvalidInputError)
        }).pipe(Effect.provide(layer({ directory, projectID: appearanceProjectID })))
      }),
    ),
  )
})
