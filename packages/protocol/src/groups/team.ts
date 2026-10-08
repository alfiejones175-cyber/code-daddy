import { AgentTeam } from "@opencode-ai/schema/agent-team"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { InvalidRequestError, ServiceUnavailableError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

const GlobalSettings = Schema.Struct({
  data: AgentTeam.Settings,
  directory: Schema.String,
})

export const TeamGroup = HttpApiGroup.make("server.team")
  .add(
    HttpApiEndpoint.post("team.draft", "/api/team/draft", {
      query: LocationQuery,
      payload: AgentTeam.DraftRequest,
      success: AgentTeam.Draft,
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.team.draft",
          summary: "Design a team draft",
          description:
            "Suggest a team using the connected default model and discovered agents and skills. Does not save configuration.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("team.get", "/api/team", {
      query: LocationQuery,
      success: Schema.Struct({ data: AgentTeam.Settings }),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.team.get",
          summary: "Get effective teams",
          description: "Retrieve team settings resolved for the requested location.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("team.configGet", "/api/team/config", {
      query: LocationQuery,
      success: GlobalSettings,
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.team.configGet",
          summary: "Get global team settings",
          description: "Retrieve global team settings and their configuration directory.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.patch("team.configUpdate", "/api/team/config", {
      query: LocationQuery,
      payload: AgentTeam.Settings,
      success: GlobalSettings,
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.team.configUpdate",
          summary: "Update global team settings",
          description: "Merge named team replacements and an optional default_team setting into global configuration.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({ title: "team", description: "Global and location-resolved agent team settings." }),
  )
