export * as ProjectAppearance from "./appearance"

import { Database } from "../database/database"
import { makeLocationNode } from "../effect/app-node"
import { EventV2 } from "../event"
import { Location } from "../location"
import { Context, Effect, Layer, Schema } from "effect"
import { eq } from "drizzle-orm"
import { Project } from "@opencode-ai/schema/project"
import { ProjectSchema } from "./schema"
import { ProjectTable } from "./sql"

export const UpdateInput = Project.Appearance
export type UpdateInput = typeof UpdateInput.Type

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("ProjectAppearance.NotFoundError", {
  projectID: ProjectSchema.ID,
}) {}

export class SharedProjectError extends Schema.TaggedErrorClass<SharedProjectError>()("ProjectAppearance.SharedProjectError", {}) {
  override get message() {
    return "Project appearance is unavailable for directories without their own project identity"
  }
}

export class InvalidInputError extends Schema.TaggedErrorClass<InvalidInputError>()("ProjectAppearance.InvalidInputError", {}) {
  override get message() {
    return "Provide at least one project appearance field"
  }
}

export interface Interface {
  readonly current: () => Effect.Effect<Project.Info, NotFoundError | SharedProjectError>
  readonly update: (input: UpdateInput) => Effect.Effect<Project.Info, NotFoundError | SharedProjectError | InvalidInputError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ProjectAppearance") {}

const fromRow = (row: typeof ProjectTable.$inferSelect): Project.Info => ({
  id: row.id,
  worktree: row.worktree,
  vcs: row.vcs ? Schema.decodeUnknownSync(Project.Vcs)(row.vcs) : undefined,
  name: row.name ?? undefined,
  icon:
    row.icon_url || row.icon_url_override || row.icon_color
      ? {
          url: row.icon_url ?? undefined,
          override: row.icon_url_override ?? undefined,
          color: row.icon_color ?? undefined,
        }
      : undefined,
  commands: row.commands ?? undefined,
  time: {
    created: row.time_created,
    updated: row.time_updated,
    initialized: row.time_initialized ?? undefined,
  },
  sandboxes: row.sandboxes,
})

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const events = yield* EventV2.Service
    const location = yield* Location.Service

    const projectID = () => {
      if (location.project.id === ProjectSchema.ID.global) return new SharedProjectError()
      return location.project.id
    }

    const read = Effect.fn("ProjectAppearance.current")(function* () {
      const id = projectID()
      if (id instanceof SharedProjectError) return yield* id
      const row = yield* db
        .select()
        .from(ProjectTable)
        .where(eq(ProjectTable.id, id))
        .get()
        .pipe(Effect.orDie)
      if (!row) return yield* new NotFoundError({ projectID: id })
      return fromRow(row)
    })

    const update = Effect.fn("ProjectAppearance.update")(function* (input: UpdateInput) {
      if (input.name === undefined && input.icon === undefined && input.commands === undefined)
        return yield* new InvalidInputError()
      const id = projectID()
      if (id instanceof SharedProjectError) return yield* id
      const row = yield* db
        .update(ProjectTable)
        .set({
          ...(input.name === undefined ? {} : { name: input.name || null }),
          ...(input.icon === undefined
            ? {}
            : {
                icon_url: input.icon.url || null,
                icon_url_override: input.icon.override || null,
                icon_color: input.icon.color || null,
              }),
          ...(input.commands === undefined ? {} : { commands: input.commands.start ? input.commands : null }),
          time_updated: Date.now(),
        })
        .where(eq(ProjectTable.id, id))
        .returning()
        .get()
        .pipe(Effect.orDie)
      if (!row) return yield* new NotFoundError({ projectID: id })
      const project = fromRow(row)
      yield* events.publish(Project.Event.Updated, project, {
        location: new Location.Info({
          directory: location.directory,
          workspaceID: location.workspaceID,
          project: location.project,
        }),
      })
      return project
    })

    return Service.of({ current: read, update })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Database.node, EventV2.node, Location.node],
})
