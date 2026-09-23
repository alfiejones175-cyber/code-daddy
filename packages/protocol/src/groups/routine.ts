import { Routine } from "@opencode-ai/schema/routine"
import { Session } from "@opencode-ai/schema/session"
import { PositiveInt } from "@opencode-ai/schema/schema"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { SessionNotFoundError } from "../errors"

export class RoutineNotFoundError extends Schema.TaggedErrorClass<RoutineNotFoundError>()(
  "RoutineNotFoundError",
  {
    routineID: Routine.ID,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

const RunsQuery = Schema.Struct({
  limit: Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt), Schema.optional),
})

export const RoutineGroup = HttpApiGroup.make("server.routine")
  .add(
    HttpApiEndpoint.get("routine.list", "/api/routine", {
      query: Schema.Struct({ sessionID: Session.ID.pipe(Schema.optional) }),
      success: Schema.Struct({ data: Schema.Array(Routine.Info) }),
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.routine.list", summary: "List scheduled routines" })),
  )
  .add(
    HttpApiEndpoint.post("routine.create", "/api/routine", {
      payload: Routine.Create,
      success: Schema.Struct({ data: Routine.Info }),
      error: SessionNotFoundError,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.routine.create", summary: "Create a scheduled routine" })),
  )
  .add(
    HttpApiEndpoint.post("routine.pause", "/api/routine/:routineID/pause", {
      params: { routineID: Routine.ID },
      success: Schema.Struct({ data: Routine.Info }),
      error: RoutineNotFoundError,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.routine.pause", summary: "Pause a scheduled routine" })),
  )
  .add(
    HttpApiEndpoint.post("routine.resume", "/api/routine/:routineID/resume", {
      params: { routineID: Routine.ID },
      success: Schema.Struct({ data: Routine.Info }),
      error: RoutineNotFoundError,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.routine.resume", summary: "Resume a scheduled routine" })),
  )
  .add(
    HttpApiEndpoint.delete("routine.remove", "/api/routine/:routineID", {
      params: { routineID: Routine.ID },
      success: HttpApiSchema.NoContent,
      error: RoutineNotFoundError,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.routine.remove", summary: "Delete a scheduled routine" })),
  )
  .add(
    HttpApiEndpoint.get("routine.runs", "/api/routine/:routineID/run", {
      params: { routineID: Routine.ID },
      query: RunsQuery,
      success: Schema.Struct({ data: Schema.Array(Routine.Run) }),
      error: RoutineNotFoundError,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.routine.runs", summary: "List routine run history" })),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "routine",
      description:
        "Durable interval routines admit queued prompts to their configured session. They use that session's existing model and permissions.",
    }),
  )
