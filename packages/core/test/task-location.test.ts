import { describe, expect } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { route } from "@opencode-ai/llm/protocols/openai-chat"
import { Auth } from "@opencode-ai/llm/route"
import { AgentV2 } from "../src/agent"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { LocationServiceMap } from "../src/location-service-map"
import { Location } from "../src/location"
import { AbsolutePath } from "../src/schema"
import { SessionV2 } from "../src/session"
import { SessionAccess } from "../src/session/access"
import { SessionExecution } from "../src/session/execution"
import { SessionExecutionLocal } from "../src/session/execution/local"
import { SessionRunnerModel } from "../src/session/runner/model"
import { Snapshot } from "../src/snapshot"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)

describe("production task composition", () => {
  it.live(
    "runs two child chats through the Location map, native runner and one shared coordinator",
    () =>
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(Effect.promise(tmpdir), (dir) =>
          Effect.promise(() => dir[Symbol.asyncDispose]()),
        )
        const requests: { messages: { role: string; content?: string }[] }[] = []
        const server = yield* Effect.acquireRelease(
          Effect.sync(() =>
            Bun.serve({
              port: 0,
              async fetch(request) {
                const body = (await request.json()) as { messages: { role: string; content?: string }[] }
                requests.push(body)
                const child = body.messages.findLast(
                  (message) =>
                    message.role === "user" &&
                    (message.content === "delegate" || message.content?.startsWith("child ")),
                )?.content
                const delegating = child === "delegate" && !body.messages.some((message) => message.role === "tool")
                const delta = delegating
                  ? {
                      tool_calls: ["A", "B"].map((label, index) => ({
                        index,
                        id: `call-${label}`,
                        type: "function",
                        function: {
                          name: "task",
                          arguments: JSON.stringify({
                            description: `Research ${label}`,
                            prompt: `child ${label}`,
                            subagent_type: "research",
                          }),
                        },
                      })),
                    }
                  : { content: child === "delegate" ? "Both children finished." : `Result for ${child}` }
                const chunks = [
                  { choices: [{ index: 0, delta, finish_reason: null }] },
                  {
                    choices: [{ index: 0, delta: {}, finish_reason: delegating ? "tool_calls" : "stop" }],
                    usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
                  },
                ]
                return new Response(
                  chunks
                    .map(
                      (chunk) =>
                        `data: ${JSON.stringify({ id: "chat_fixture", object: "chat.completion.chunk", created: 1, model: "fixture", ...chunk })}\n\n`,
                    )
                    .join("") + "data: [DONE]\n\n",
                  { headers: { "content-type": "text/event-stream" } },
                )
              },
            }),
          ),
          (server) => Effect.promise(() => server.stop(true)),
        )
        const model = route
          .with({ endpoint: { baseURL: `http://127.0.0.1:${server.port}/v1` }, auth: Auth.bearer("fixture") })
          .model({ id: "fixture" })
        const app = AppNodeBuilder.build(
          LayerNode.group([SessionV2.node, LocationServiceMap.node, SessionAccess.node]),
          [
            [SessionExecution.node, SessionExecutionLocal.node],
            [SessionRunnerModel.node, SessionRunnerModel.layerWith(() => Effect.succeed(model))],
            [Snapshot.node, Snapshot.noopLayer],
          ],
        )
        const access = yield* Effect.gen(function* () {
          const sessions = yield* SessionV2.Service
          const locations = yield* LocationServiceMap.Service
          const location = Location.Ref.make({ directory: AbsolutePath.make(directory.path), workspaceID: undefined })
          const agents = Context.get(yield* locations.contextEffect(location), AgentV2.Service)
          yield* agents.transform((draft) => {
            for (const id of ["build", "research"])
              draft.update(AgentV2.ID.make(id), (agent) => {
                agent.mode = "all"
                agent.permissions = [{ action: "*", resource: "*", effect: "allow" }]
              })
          })

          const parent = yield* sessions.create({ location, agent: AgentV2.ID.make("build") })
          expect(Context.get(yield* locations.contextEffect(parent.location), AgentV2.Service)).toBe(agents)
          yield* sessions.prompt({ sessionID: parent.id, prompt: { text: "delegate" }, resume: false })
          yield* sessions.resume(parent.id)
          const children = yield* sessions.list({ parentID: parent.id })
          expect(children).toHaveLength(2)
          expect(children.map((child) => child.title).sort()).toEqual(["Research A", "Research B"])
          expect(requests).toHaveLength(4)
          expect((yield* sessions.active).size).toBe(0)
          const messages = yield* sessions.messages({ sessionID: parent.id, order: "asc" })
          const calls = messages.flatMap((message) =>
            message.type === "assistant" ? message.content.filter((part) => part.type === "tool") : [],
          )
          expect(calls).toHaveLength(2)
          expect(calls.map((call) => call.state.status)).toEqual(["completed", "completed"])
          expect(calls.map((call) => call.state.status === "completed" && call.state.structured.status)).toEqual([
            "completed",
            "completed",
          ])
          const access = yield* SessionAccess.Service
          expect(yield* access.current).toBe(sessions)
          return access
        }).pipe(Effect.provide(app))
        expect(yield* access.current).toBeUndefined()
      }),
    20000,
  )
})
