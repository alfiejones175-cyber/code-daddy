export * as SessionAccess from "./access"

import { Context, Effect, Layer, Scope } from "effect"
import { makeGlobalNode } from "../effect/app-node"
import type { SessionV2 } from "../session"

/** Late binding breaks Session -> LocationMap -> task -> Session without creating another executor. */
export class Service extends Context.Service<
  Service,
  {
    readonly current: Effect.Effect<SessionV2.Interface | undefined>
    readonly bind: (session: SessionV2.Interface) => Effect.Effect<void, never, Scope.Scope>
  }
>()("@opencode/SessionAccess") {}

const layer = Layer.effect(
  Service,
  Effect.sync(() => {
    const bindings = new Map<object, SessionV2.Interface>()
    return Service.of({
      current: Effect.sync(() => Array.from(bindings.values()).at(-1)),
      bind: (session) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const token = {}
            bindings.set(token, session)
            return token
          }),
          (token) =>
            Effect.sync(() => {
              bindings.delete(token)
            }),
        ).pipe(Effect.asVoid),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [] })
