import { expect, test } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { SessionV2 } from "@opencode-ai/core/session"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Project } from "@opencode-ai/core/project"
import { Authorization } from "@opencode-ai/protocol/middleware/authorization"
import { makeSessionGroup } from "@opencode-ai/protocol/groups/session"
import { SessionHandler } from "../src/handlers/session"
import { SessionLocationMiddleware } from "../src/middleware/session-location"
import type { LocationServices } from "../src/location"
import { schemaErrorLayer } from "../src/middleware/schema-error"

test("session recovery HTTP boundary preserves typed status, 204 resume, and 404s", async () => {
  const known = SessionV2.ID.make("ses_recovery_boundary")
  const missing = SessionV2.ID.make("ses_missing_boundary")
  const resumes: string[] = []
  const location = Location.Service.of({
    directory: AbsolutePath.make("/test"),
    project: { id: Project.ID.global, directory: AbsolutePath.make("/test") },
  })
  const session = Layer.mock(SessionV2.Service)({
    recovery: (id) =>
      id === known
        ? Effect.succeed({ type: "needs_recovery" as const, reason: "incomplete_tool" as const })
        : Effect.fail(new SessionV2.NotFoundError({ sessionID: id })),
    resume: (id) =>
      Effect.sync(() => resumes.push(id)).pipe(
        Effect.andThen(id === known ? Effect.void : Effect.fail(new SessionV2.NotFoundError({ sessionID: id }))),
      ),
    revert: {
      stage: () => Effect.die("unused"),
      clear: () => Effect.die("unused"),
      commit: () => Effect.die("unused"),
    },
  })
  const services = Layer.mergeAll(Layer.succeed(Location.Service, location), session)
  const middleware = Layer.effect(
    SessionLocationMiddleware,
    Effect.gen(function* () {
      const context = yield* Layer.build(services)
      return SessionLocationMiddleware.of((effect) => Effect.provide(effect, context as Context.Context<LocationServices>))
    }),
  )
  const web = HttpRouter.toWebHandler(
    HttpApiBuilder.layer(HttpApi.make("server").add(makeSessionGroup(SessionLocationMiddleware))).pipe(
      Layer.provide(SessionHandler),
      Layer.provide([middleware, session, schemaErrorLayer, Layer.succeed(Authorization, (effect) => effect)]),
      Layer.provide(HttpServer.layerServices),
    ),
    { disableLogger: true },
  )
  const fetcher = (input: string, init?: RequestInit) => web.handler(new Request(`http://localhost${input}`, init), Context.empty() as Context.Context<unknown>)
  try {
    const recovery = await fetcher(`/api/session/${known}/recovery`)
    expect(recovery.status).toBe(200)
    expect(await recovery.json()).toEqual({ data: { type: "needs_recovery", reason: "incomplete_tool" } })

    const resume = await fetcher(`/api/session/${known}/resume`, { method: "POST" })
    expect(resume.status).toBe(204)
    expect(resumes).toEqual([known])

    const missingRecovery = await fetcher(`/api/session/${missing}/recovery`)
    expect(missingRecovery.status).toBe(404)
    const missingResume = await fetcher(`/api/session/${missing}/resume`, { method: "POST" })
    expect(missingResume.status).toBe(404)
    expect(resumes).toEqual([known, missing])
  } finally {
    await web.dispose()
  }
})
