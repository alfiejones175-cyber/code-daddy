import { expect, test } from "bun:test"
import { Context, DateTime, Effect, Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { Routine } from "@opencode-ai/core/routine"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { RoutineGroup } from "@opencode-ai/protocol/groups/routine"
import { Authorization } from "@opencode-ai/protocol/middleware/authorization"
import { RoutineHandler } from "../src/handlers/routine"
import { schemaErrorLayer } from "../src/middleware/schema-error"

test("routine HTTP boundary manages lifecycle and exposes durable run history", async () => {
  const sessionID = SessionV2.ID.make("ses_routine_boundary")
  const routineID = Routine.ID.make("rtn_routine_boundary")
  const runID = Routine.RunID.make("rtr_routine_boundary")
  let routine = Routine.Info.make({
    id: routineID,
    sessionID,
    name: "Repository check",
    prompt: "Check the repository",
    intervalMs: 60_000,
    status: "active",
    nextRunAt: DateTime.makeUnsafe(60_000),
    time: { created: DateTime.makeUnsafe(0), updated: DateTime.makeUnsafe(0) },
  })
  const run = Routine.Run.make({
    id: runID,
    routineID,
    sessionID,
    messageID: SessionMessage.ID.make("msg_routine_boundary"),
    scheduledAt: DateTime.makeUnsafe(0),
    status: "admitted",
    admittedSeq: 4,
    time: { claimed: DateTime.makeUnsafe(0), updated: DateTime.makeUnsafe(1) },
  })
  const routines = Layer.mock(Routine.Service)({
    list: () => Effect.succeed([routine]),
    create: (input) =>
      Effect.sync(() => {
        routine = Routine.Info.make({
          ...routine,
          name: input.name,
          prompt: input.prompt,
          intervalMs: input.intervalMs,
          sessionID: input.sessionID,
        })
        return routine
      }),
    pause: (id) =>
      id === routineID
        ? Effect.sync(() => {
            routine = Routine.Info.make({ ...routine, status: "paused" })
            return routine
          })
        : Effect.fail(new Routine.NotFoundError({ routineID: id })),
    resume: (id) =>
      id === routineID
        ? Effect.sync(() => {
            routine = Routine.Info.make({ ...routine, status: "active" })
            return routine
          })
        : Effect.fail(new Routine.NotFoundError({ routineID: id })),
    remove: (id) => (id === routineID ? Effect.void : Effect.fail(new Routine.NotFoundError({ routineID: id }))),
    runs: (input) =>
      input.routineID === routineID
        ? Effect.succeed([run])
        : Effect.fail(new Routine.NotFoundError({ routineID: input.routineID })),
  })
  const web = HttpRouter.toWebHandler(
    HttpApiBuilder.layer(HttpApi.make("server").add(RoutineGroup)).pipe(
      Layer.provide(RoutineHandler),
      Layer.provide([routines, schemaErrorLayer, Layer.succeed(Authorization, (effect) => effect)]),
      Layer.provide(HttpServer.layerServices),
    ),
    { disableLogger: true },
  )
  const fetcher = (input: string, init?: RequestInit) =>
    web.handler(new Request(`http://localhost${input}`, init), Context.empty() as Context.Context<unknown>)
  try {
    expect(await (await fetcher("/api/routine")).json()).toMatchObject({
      data: [{ id: routineID, nextRunAt: 60_000, status: "active" }],
    })
    expect(
      await (
        await fetcher("/api/routine", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionID, name: "Updated check", prompt: "Inspect the diff", intervalMs: 60_000 }),
        })
      ).json(),
    ).toMatchObject({ data: { id: routineID, name: "Updated check", prompt: "Inspect the diff" } })
    expect(await (await fetcher(`/api/routine/${routineID}/pause`, { method: "POST" })).json()).toMatchObject({
      data: { status: "paused" },
    })
    expect(await (await fetcher(`/api/routine/${routineID}/resume`, { method: "POST" })).json()).toMatchObject({
      data: { status: "active" },
    })
    expect(await (await fetcher(`/api/routine/${routineID}/run`)).json()).toMatchObject({
      data: [{ id: runID, messageID: run.messageID, status: "admitted" }],
    })
    expect((await fetcher(`/api/routine/${routineID}`, { method: "DELETE" })).status).toBe(204)
    const missing = await fetcher("/api/routine/rtn_missing/pause", { method: "POST" })
    expect(missing.status).toBe(404)
  } finally {
    await web.dispose()
  }
})
