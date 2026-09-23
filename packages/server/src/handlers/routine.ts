import { Routine } from "@opencode-ai/core/routine"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"
import { RoutineNotFoundError } from "@opencode-ai/protocol/groups/routine"
import { SessionNotFoundError } from "@opencode-ai/protocol/errors"

export const RoutineHandler = HttpApiBuilder.group(Api, "server.routine", (handlers) =>
  Effect.succeed(
    handlers
      .handle("routine.list", (ctx) =>
        Routine.Service.use((routines) => routines.list({ sessionID: ctx.query.sessionID })).pipe(
          Effect.map((data) => ({ data })),
        ),
      )
      .handle("routine.create", (ctx) =>
        Routine.Service.use((routines) => routines.create(ctx.payload)).pipe(
          Effect.map((data) => ({ data })),
          Effect.mapError(
            (error) =>
              new SessionNotFoundError({
                sessionID: error.sessionID,
                message: `Session not found: ${error.sessionID}`,
              }),
          ),
        ),
      )
      .handle("routine.pause", (ctx) =>
        Routine.Service.use((routines) => routines.pause(ctx.params.routineID)).pipe(
          Effect.map((data) => ({ data })),
          Effect.mapError(notFound),
        ),
      )
      .handle("routine.resume", (ctx) =>
        Routine.Service.use((routines) => routines.resume(ctx.params.routineID)).pipe(
          Effect.map((data) => ({ data })),
          Effect.mapError(notFound),
        ),
      )
      .handle("routine.remove", (ctx) =>
        Routine.Service.use((routines) => routines.remove(ctx.params.routineID)).pipe(
          Effect.as(HttpApiSchema.NoContent.make()),
          Effect.mapError(notFound),
        ),
      )
      .handle("routine.runs", (ctx) =>
        Routine.Service.use((routines) =>
          routines.runs({ routineID: ctx.params.routineID, limit: ctx.query.limit ?? 50 }),
        ).pipe(
          Effect.map((data) => ({ data })),
          Effect.mapError(notFound),
        ),
      ),
  ),
)

function notFound(error: Routine.NotFoundError) {
  return new RoutineNotFoundError({ routineID: error.routineID, message: `Routine not found: ${error.routineID}` })
}
