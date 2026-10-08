import { Config } from "@opencode-ai/core/config"
import { ConfigTeam } from "@opencode-ai/core/config/team"
import { ConfigTeamSettings } from "@opencode-ai/core/config/team-settings"
import { ConfigTeamDraft } from "@opencode-ai/core/config/team-draft"
import { InvalidRequestError, ServiceUnavailableError } from "@opencode-ai/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"

export const TeamHandler = HttpApiBuilder.group(Api, "server.team", (handlers) =>
  handlers
    .handle("team.draft", (ctx) =>
      ConfigTeamDraft.Service.use((draft) => draft.generate(ctx.payload)).pipe(
        Effect.mapError(
          (error) =>
            new ServiceUnavailableError({
              message: "Could not create a team draft with the connected model",
              service: `team_draft_${error.reason}`,
            }),
        ),
      ),
    )
    .handle(
      "team.get",
      Effect.fn(function* () {
        const config = yield* Config.Service
        const entries = yield* config.entries()
        return {
          data: ConfigTeam.resolve(entries.filter((entry) => entry.type === "document").map((entry) => entry.info)),
        }
      }),
    )
    .handle("team.configGet", () =>
      ConfigTeamSettings.Service.use((settings) => settings.get()).pipe(Effect.mapError(configError)),
    )
    .handle("team.configUpdate", (ctx) =>
      ConfigTeamSettings.Service.use((settings) => settings.update(ctx.payload)).pipe(Effect.mapError(configError)),
    ),
)

function configError(error: unknown) {
  return new InvalidRequestError({
    message: error instanceof Error ? error.message : String(error),
    kind: "team_config",
  })
}
