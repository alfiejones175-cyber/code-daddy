import { expect, test } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { Integration } from "@opencode-ai/core/integration"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Project } from "@opencode-ai/core/project"
import { Authorization } from "@opencode-ai/protocol/middleware/authorization"
import { currentIntegrationFetch } from "../../app/src/utils/integration-fetch"
import { IntegrationGroup } from "@opencode-ai/protocol/groups/integration"
import { IntegrationHandler } from "../src/handlers/integration"
import { LocationMiddleware, type LocationServices } from "../src/location"
import { schemaErrorLayer } from "../src/middleware/schema-error"

test("bundled OAuth paths reach the current native integration handlers", async () => {
  const calls: unknown[] = []
  const attempt = new Integration.Attempt({
    attemptID: Integration.AttemptID.make("con_test"),
    mode: "code",
    url: "https://example.com/authorize",
    instructions: "Enter code",
    time: { created: 1, expires: 100 },
  })
  const location = Location.Service.of({
    directory: AbsolutePath.make("/test"),
    project: { id: Project.ID.global, directory: AbsolutePath.make("/test") },
  })
  const services = Layer.mergeAll(
    Layer.succeed(Location.Service, location),
    Layer.mock(Integration.Service)({
      connection: {
        active: () => Effect.die("unused"),
        resolve: () => Effect.die("unused"),
        key: () => Effect.die("unused"),
        update: () => Effect.die("unused"),
        remove: () => Effect.die("unused"),
        oauth: (input) =>
          Effect.sync(() => {
            calls.push(input)
            return attempt
          }),
      },
      attempt: {
        status: (id) =>
          Effect.sync(() => {
            calls.push(id)
            return { status: "pending", time: attempt.time }
          }),
        complete: (input) =>
          Effect.sync(() => {
            calls.push(input)
          }),
        cancel: (id) =>
          Effect.sync(() => {
            calls.push(id)
          }),
      },
    }),
  )
  const middleware = Layer.effect(
    LocationMiddleware,
    Effect.gen(function* () {
      const context = yield* Layer.build(services)
      // This group uses only Integration and Location from the location-wide service map.
      return LocationMiddleware.of((effect) => Effect.provide(effect, context as Context.Context<LocationServices>))
    }),
  )
  const web = HttpRouter.toWebHandler(
    HttpApiBuilder.layer(HttpApi.make("server").add(IntegrationGroup)).pipe(
      Layer.provide(IntegrationHandler),
      Layer.provide([middleware, schemaErrorLayer, Layer.succeed(Authorization, (effect) => effect)]),
      Layer.provide(HttpServer.layerServices),
    ),
    { disableLogger: true },
  )
  const fetcher = currentIntegrationFetch((input, init) => web.handler(new Request(input, init)))
  try {
    const start = await fetcher(
      "http://localhost/api/integration/openai/connect/oauth?location%5Bdirectory%5D=%2Ftest",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ methodID: "chatgpt-browser", inputs: {} }),
      },
    )
    expect(start.status).toBe(200)
    expect(await start.json()).toEqual({ location, data: attempt })
    const status = await fetcher("http://localhost/api/integration/openai/connect/oauth/con_test")
    expect(status.status).toBe(200)
    expect(await status.json()).toEqual({ location, data: { status: "pending", time: attempt.time } })
    const complete = await fetcher(
      new Request("http://localhost/api/integration/openai/connect/oauth/con_test/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "test-code" }),
      }),
    )
    expect(complete.status).toBe(204)
    const cancel = await fetcher("http://localhost/api/integration/openai/connect/oauth/con_test", { method: "DELETE" })
    expect(cancel.status).toBe(204)
    expect(calls).toEqual([
      { integrationID: "openai", methodID: "chatgpt-browser", inputs: {}, label: undefined },
      "con_test",
      { attemptID: "con_test", code: "test-code" },
      "con_test",
    ])
  } finally {
    await web.dispose()
  }
})
