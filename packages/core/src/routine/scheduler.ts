export * as RoutineScheduler from "./scheduler"

import { Cause, Clock, Context, Effect, Exit, Layer, Schedule } from "effect"
import { makeGlobalNode } from "../effect/app-node"
import { SessionV2 } from "../session"
import { Routine } from "../routine"

const maxClaimsPerTick = 10

export interface Interface {
  /** Admits a bounded batch of claimed routine prompts using the session's ordinary permission model. */
  readonly tick: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/RoutineScheduler") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const routines = yield* Routine.Service
    const sessions = yield* SessionV2.Service

    const admit = Effect.fn("RoutineScheduler.admit")(function* (claim: Routine.Claim) {
      const current = yield* routines.getClaim(claim.run.id)
      if (!current) return
      const result = yield* Effect.exit(
        sessions.prompt({
          id: current.run.messageID,
          sessionID: current.routine.sessionID,
          prompt: { text: current.routine.prompt },
          delivery: "queue",
        }),
      )
      if (Exit.isFailure(result)) {
        yield* routines.fail({ runID: current.run.id, error: errorMessage(Cause.squash(result.cause)) })
        return
      }
      yield* routines.admit({ runID: current.run.id, admittedSeq: result.value.admittedSeq })
    })

    const tick = Effect.fn("RoutineScheduler.tick")(function* () {
      const now = yield* Clock.currentTimeMillis
      const pending = yield* routines.pending(maxClaimsPerTick)
      const due = yield* routines.claimDue({ now, limit: Math.max(0, maxClaimsPerTick - pending.length) })
      yield* Effect.forEach([...pending, ...due], admit, { discard: true })
    })

    yield* tick().pipe(
      Effect.catchCause((cause) => Effect.logWarning("Routine scheduler tick failed", { cause })),
      Effect.repeat(Schedule.spaced("1 minute")),
      Effect.forkScoped,
    )
    return Service.of({ tick })
  }),
)

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export const node = makeGlobalNode({ service: Service, layer, deps: [Routine.node, SessionV2.node] })
