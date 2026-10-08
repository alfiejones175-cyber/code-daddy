export * as TeamDraft from "./team-draft"

import { AgentTeam } from "@opencode-ai/schema/agent-team"
import { ConfigTeam } from "@opencode-ai/core/config/team"
import { ConfigTeamDraft } from "@opencode-ai/core/config/team-draft"
import { Effect, Schema } from "effect"
import { generateObject, NoObjectGeneratedError, streamObject } from "ai"
import { Agent } from "./agent"
import { Skill } from "@/skill"
import { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { Permission } from "@/permission"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"

export const generate = Effect.fn("TeamDraft.generate")(function* (input: AgentTeam.DraftRequest) {
  const agent = yield* Agent.Service
  const skill = yield* Skill.Service
  const provider = yield* Provider.Service
  const auth = yield* Auth.Service
  const config = yield* Config.Service
  const cfg = yield* config.get()
  const generated = new Set(
    Object.entries(cfg.teams ?? {}).flatMap(([name, team]) =>
      team.disabled
        ? []
        : [ConfigTeam.leadID(name), ...Object.keys(team.roles).map((role) => ConfigTeam.roleID(name, role))],
    ),
  )
  const skills = (yield* skill.all()).slice(0, 80)
  const agents = (yield* agent.list())
    .filter((source) => !source.hidden && !generated.has(source.name))
    .map((source) => ({
      id: source.name,
      mode: source.mode,
      skills: skills
        .filter((item) => Permission.evaluate("skill", item.name, source.permission).action !== "deny")
        .map((item) => item.name),
    }))
  const models = Object.values(yield* provider.list())
    .filter((item) => !input.providers || input.providers.includes(item.id))
    .flatMap((item) => Object.values(item.models))
    .filter((model) => model.capabilities.toolcall && model.capabilities.output.text && model.status !== "deprecated")
    .map((model) => ({
      id: `${model.providerID}/${model.id}`,
      name: model.name,
      inputModalities: Object.entries(model.capabilities.input)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name),
      context: model.limit.context,
      input: model.cost.input || undefined,
      output: model.cost.output || undefined,
    }))
  if (!models.length)
    return yield* new ConfigTeamDraft.DraftError({
      reason: "unavailable",
      message: "No usable models are available from the selected connected providers",
    })
  const generatedSchema = yield* Effect.try({
    try: () => ConfigTeamDraft.schema(agents),
    catch: () =>
      new ConfigTeamDraft.DraftError({
        reason: "unavailable",
        message: "A primary and a subagent profile are required",
      }),
  })
  const selected = {
    providerID: ProviderV2.ID.make(input.model.providerID),
    modelID: ModelV2.ID.make(input.model.modelID),
  }
  const model = yield* provider.getModel(selected.providerID, selected.modelID)
  const language = yield* provider.getLanguage(model)
  const credential = yield* auth.get(selected.providerID)
  const instructions = ConfigTeamDraft.prompt(
    input.goal,
    agents,
    skills.map((item) => ({
      name: item.name,
      description: item.description?.slice(0, 500),
      content: item.content.slice(0, 300),
    })),
    models,
  )
  const params = {
    model: language,
    messages: [{ role: "user" as const, content: instructions }],
    schema: Object.assign(Schema.toStandardSchemaV1(generatedSchema), Schema.toStandardJSONSchemaV1(generatedSchema)),
    maxOutputTokens: 12_288,
    maxRetries: 0,
  }
  const result = yield* Effect.tryPromise({
    try: async (signal) => {
      // Match the established subscription route used by Agent.generate.
      if (selected.providerID === "openai" && credential?.type === "oauth") {
        const result = streamObject({
          ...params,
          abortSignal: signal,
          onError: () => {},
          providerOptions: ProviderTransform.providerOptions(model, { instructions, store: false }),
        })
        for await (const part of result.fullStream) {
          if (part.type === "error") throw part.error
        }
        return result.object
      }
      return (await generateObject({ ...params, abortSignal: signal })).object
    },
    catch: (error) =>
      new ConfigTeamDraft.DraftError({
        reason: NoObjectGeneratedError.isInstance(error) ? "invalid" : "generation",
        message: "The model could not create a team draft",
      }),
  }).pipe(
    Effect.timeout("120 seconds"),
    Effect.mapError((error) =>
      error._tag === "TimeoutError"
        ? new ConfigTeamDraft.DraftError({ reason: "timeout", message: "Team drafting timed out" })
        : error,
    ),
  )
  return yield* Effect.try({
    try: () => ConfigTeamDraft.fromGenerated(result, agents, models),
    catch: () =>
      new ConfigTeamDraft.DraftError({ reason: "invalid", message: "The model returned an invalid team draft" }),
  })
})
