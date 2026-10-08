import { afterEach, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Agent } from "@/agent/agent"
import { TeamDraft } from "@/agent/team-draft"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { Skill } from "@/skill"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { disposeAllInstances, provideTmpdirServer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"

const it = testEffect(
  Layer.merge(
    LayerNode.compile(
      LayerNode.group([
        Agent.node,
        Plugin.node,
        Provider.node,
        Auth.node,
        Config.node,
        Skill.node,
        RuntimeFlags.node,
        CrossSpawnSpawner.node,
      ]),
    ),
    TestLLMServer.layer,
  ),
)

afterEach(disposeAllInstances)

it.live("team drafting streams a strict OpenAI schema and returns a validated configuration without saving", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const auth = yield* Auth.Service
        const before = yield* Effect.promise(() => Bun.file(`${dir}/opencode.json`).text())
        yield* llm.text(
          JSON.stringify({
            name: "invoice-team",
            team: {
              description: "Design and test invoice matching",
              lead: "build",
              model: 0,
              modelReason: "Coordinate the work",
              instructions: "Coordinate the team and review evidence",
              skills: [],
              roles: [
                {
                  name: "implementation",
                  kind: "worker",
                  description: "Implement invoice matching",
                  agent: "general",
                  model: 0,
                  modelReason: "Fits this bounded role",
                  instructions: "Implement invoice matching",
                  skills: [],
                  standards: ["Test currency and VAT matching"],
                },
                {
                  name: "review",
                  kind: "reviewer",
                  description: "Review invoice matching changes",
                  agent: "general",
                  model: 0,
                  modelReason: "Fits this bounded role",
                  instructions: "Review independently",
                  skills: [],
                  standards: ["Inspect requirement coverage"],
                },
              ],
              workflow: [
                {
                  id: "discovery",
                  title: "Agree on requirements",
                  role: "implementation",
                  instructions: "Collect requirements and identify open questions before implementation.",
                  dependsOn: [],
                  deliverables: ["Shared requirements"],
                  checks: ["Open questions are resolved"],
                  approval: true,
                },
              ],
              review: { role: "review", checklist: ["Verify matching tests"] },
            },
          }),
        )
        // The provider itself uses the local API-key fixture. Select the OAuth
        // streaming branch only for this request, without real credentials.
        const result = yield* TeamDraft.generate({
          goal: "Design and test invoice matching",
          model: { providerID: "openai", modelID: "gpt-6-astra" },
          providers: ["openai"],
        }).pipe(
          Effect.provideService(Auth.Service, {
            ...auth,
            get: () =>
              Effect.succeed(new Auth.Oauth({ type: "oauth", access: "fixture", refresh: "fixture", expires: 0 })),
          }),
        )
        expect(result.name).toBe("invoice-team")
        expect(Object.keys(result.team.roles)).toEqual(["implementation", "review"])
        expect(result.team.review?.role).toBe("review")
        expect(result.team.model).toStartWith("openai/")
        expect(result.team.roles.implementation.model).toStartWith("openai/")
        const inputs = yield* llm.inputs
        expect(inputs).toHaveLength(1)
        expect(inputs[0].model).toBe("gpt-6-astra")
        expect(inputs[0].stream).toBe(true)
        expect(JSON.stringify(inputs[0].text)).not.toContain('"allOf"')
        expect(JSON.stringify(inputs[0].text)).not.toContain('"patternProperties"')
        expect(yield* Effect.promise(() => Bun.file(`${dir}/opencode.json`).text())).toBe(before)
      }),
    {
      config: (url) => ({
        enabled_providers: ["openai"],
        provider: {
          openai: {
            npm: "@ai-sdk/openai",
            options: { apiKey: "fixture", baseURL: url },
            models: {
              "gpt-6-astra": {
                name: "Fixture Astra",
                limit: { context: 100_000, output: 10_000 },
              },
            },
          },
        },
      }),
    },
  ),
)

for (const mode of ["all", "one", "invalid-profile", "invalid-model", "unavailable"] as const) {
  it.live(`team drafting validates provider scope and ${mode} result without saving`, () =>
    provideTmpdirServer(
      ({ dir, llm }) =>
        Effect.gen(function* () {
          const auth = yield* Auth.Service
          const before = yield* Effect.promise(() => Bun.file(`${dir}/opencode.json`).text())
          if (mode !== "unavailable")
            yield* llm.text(
              JSON.stringify({
                name: "scoped-team",
                team: {
                  description: "Scoped test",
                  lead: mode === "invalid-profile" ? "invoice-agent-builder" : "build",
                  model: mode === "invalid-model" ? 999999 : 0,
                  modelReason: "Coordinate",
                  instructions: "Coordinate",
                  skills: [],
                  roles: ["work", "review"].map((name) => ({
                    name,
                    kind: name === "review" ? "reviewer" : "worker",
                    description: `Handle ${name}`,
                    agent: "general",
                    model: 0,
                    modelReason: "Bounded work",
                    instructions: "Handle the role",
                    skills: [],
                    standards: ["Report evidence"],
                  })),
                  workflow: [
                    {
                      id: "discovery",
                      title: "Agree on requirements",
                      role: "work",
                      instructions: "Collect requirements before implementation.",
                      dependsOn: [],
                      deliverables: ["Shared requirements"],
                      checks: ["Open questions are resolved"],
                      approval: true,
                    },
                  ],
                  review: { role: "review", checklist: ["Review evidence"] },
                },
              }),
            )
          const result = yield* TeamDraft.generate({
            goal: "Invoice matching",
            model: { providerID: "openai", modelID: "gpt-6-astra" },
            providers:
              mode === "all"
                ? undefined
                : mode === "one"
                  ? ["secondary"]
                  : mode === "unavailable"
                    ? ["disconnected"]
                    : ["openai"],
          }).pipe(
            Effect.provideService(Auth.Service, {
              ...auth,
              get: () =>
                Effect.succeed(new Auth.Oauth({ type: "oauth", access: "fixture", refresh: "fixture", expires: 0 })),
            }),
            Effect.result,
          )
          if (mode === "all" || mode === "one") {
            expect(result._tag).toBe("Success")
            if (result._tag === "Success") {
              expect(result.success.team.model).toBeDefined()
              if (mode === "one") expect(result.success.team.model).toStartWith("secondary/")
              expect(
                Object.values(result.success.team.roles).every((role) => role.model === result.success.team.model),
              ).toBe(true)
            }
          } else {
            expect(result._tag).toBe("Failure")
            if (result._tag === "Failure")
              expect(result.failure).toMatchObject({ reason: mode === "unavailable" ? "unavailable" : "invalid" })
          }
          expect(yield* Effect.promise(() => Bun.file(`${dir}/opencode.json`).text())).toBe(before)
          expect(yield* llm.inputs).toHaveLength(mode === "unavailable" ? 0 : 1)
        }),
      {
        config: (url) => ({
          enabled_providers: ["openai", "secondary"],
          provider: {
            openai: {
              npm: "@ai-sdk/openai",
              options: { apiKey: "fixture", baseURL: url },
              models: { "gpt-6-astra": { name: "Fixture Astra", limit: { context: 100000, output: 10000 } } },
            },
            secondary: {
              npm: "@ai-sdk/openai",
              options: { apiKey: "fixture", baseURL: url },
              models: {
                fixture: {
                  name: "Secondary",
                  tool_call: true,
                  modalities: { input: ["text"], output: ["text"] },
                  limit: { context: 100000, output: 10000 },
                },
              },
            },
          },
        }),
      },
    ),
  )
}
