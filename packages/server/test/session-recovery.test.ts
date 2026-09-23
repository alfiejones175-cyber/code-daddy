import { expect, test } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionGoal } from "@opencode-ai/core/session/goal"
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
    goal: {
      get: () => Effect.die("unused"),
      set: () => Effect.die("unused"),
      pause: () => Effect.die("unused"),
      resume: () => Effect.die("unused"),
      block: () => Effect.die("unused"),
      complete: () => Effect.die("unused"),
      clear: () => Effect.die("unused"),
    },
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
      return SessionLocationMiddleware.of((effect) =>
        Effect.provide(effect, context as Context.Context<LocationServices>),
      )
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
  const fetcher = (input: string, init?: RequestInit) =>
    web.handler(new Request(`http://localhost${input}`, init), Context.empty() as Context.Context<unknown>)
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

test("session goal HTTP boundary persists lifecycle changes and requires completion evidence", async () => {
  const known = SessionV2.ID.make("ses_goal_boundary")
  let goal: SessionGoal.Info | undefined
  const location = Location.Service.of({
    directory: AbsolutePath.make("/test"),
    project: { id: Project.ID.global, directory: AbsolutePath.make("/test") },
  })
  const transition = (
    sessionID: SessionV2.ID,
    status: SessionGoal.Status,
    changes: Partial<Pick<SessionGoal.Info, "evidence" | "progress" | "blockers">> = {},
  ) => {
    if (sessionID !== known) return Effect.fail(new SessionV2.NotFoundError({ sessionID }))
    const current = goal
    if (!current) return Effect.fail(new SessionGoal.NotFoundError({ sessionID }))
    return Effect.sync(() => {
      const next = { ...current, status, ...changes }
      goal = next
      return next
    })
  }
  const session = Layer.mock(SessionV2.Service)({
    goal: {
      get: (sessionID) =>
        sessionID === known ? Effect.succeed(goal) : Effect.fail(new SessionV2.NotFoundError({ sessionID })),
      set: (input) =>
        input.sessionID === known
          ? Effect.sync(() => {
              goal = {
                objective: input.objective,
                acceptanceCriteria: input.acceptanceCriteria ?? [],
                budget: input.budget,
                status: "active",
                progress: input.progress,
                blockers: input.blockers ?? [],
                evidence: input.evidence,
              }
              return goal
            })
          : Effect.fail(new SessionV2.NotFoundError({ sessionID: input.sessionID })),
      pause: (sessionID) => transition(sessionID, "paused"),
      resume: (sessionID) => transition(sessionID, "active"),
      block: (input) =>
        transition(input.sessionID, "blocked", {
          blockers: input.blockers,
          ...(input.progress === undefined ? {} : { progress: input.progress }),
        }),
      complete: (input) => transition(input.sessionID, "completed", { evidence: input.evidence, blockers: [] }),
      clear: (sessionID) =>
        sessionID === known
          ? Effect.sync(() => {
              goal = undefined
            })
          : Effect.fail(new SessionV2.NotFoundError({ sessionID })),
    },
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
      return SessionLocationMiddleware.of((effect) =>
        Effect.provide(effect, context as Context.Context<LocationServices>),
      )
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
  const fetcher = (input: string, init?: RequestInit) =>
    web.handler(new Request(`http://localhost${input}`, init), Context.empty() as Context.Context<unknown>)
  const goalPath = `/api/session/${known}/goal`
  const json = { "content-type": "application/json" }
  try {
    expect(await (await fetcher(goalPath)).json()).toEqual({ data: null })
    expect(
      await (
        await fetcher(goalPath, {
          method: "POST",
          headers: json,
          body: JSON.stringify({ objective: "Ship goal support", acceptanceCriteria: ["Route works"], budget: 64 }),
        })
      ).json(),
    ).toMatchObject({
      data: {
        objective: "Ship goal support",
        acceptanceCriteria: ["Route works"],
        budget: 64,
        status: "active",
      },
    })
    expect(await (await fetcher(`${goalPath}/pause`, { method: "POST" })).json()).toMatchObject({
      data: { status: "paused" },
    })
    expect(
      await (
        await fetcher(`${goalPath}/block`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({ blockers: ["Awaiting review"], progress: "Core is ready" }),
        })
      ).json(),
    ).toMatchObject({ data: { status: "blocked", progress: "Core is ready", blockers: ["Awaiting review"] } })
    expect(await (await fetcher(`${goalPath}/resume`, { method: "POST" })).json()).toMatchObject({
      data: { status: "active", progress: "Core is ready", blockers: ["Awaiting review"] },
    })
    expect((await fetcher(`${goalPath}/complete`, { method: "POST", headers: json, body: "{}" })).status).toBe(400)
    expect(
      await (
        await fetcher(`${goalPath}/complete`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({ evidence: "server test passed" }),
        })
      ).json(),
    ).toMatchObject({ data: { status: "completed", evidence: "server test passed" } })
    expect(await (await fetcher(`${goalPath}/clear`, { method: "POST" })).json()).toEqual({ data: null })
    expect(await (await fetcher(goalPath)).json()).toEqual({ data: null })
  } finally {
    await web.dispose()
  }
})
