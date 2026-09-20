import { Project } from "@opencode-ai/schema/project"
import { Location } from "@opencode-ai/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { LocationQuery, locationQueryOpenApi } from "./location"

export class ProjectAppearanceError extends Schema.ErrorClass<ProjectAppearanceError>("ProjectAppearanceError")(
  {
    name: Schema.Literal("ProjectAppearanceError"),
    data: Schema.Struct({ message: Schema.String }),
  },
  { httpApiStatus: 400 },
) {}

export const ProjectGroup = HttpApiGroup.make("server.project")
  .add(
    HttpApiEndpoint.patch("project.appearance.update", "/api/project/current/appearance", {
      query: LocationQuery,
      payload: Project.Appearance,
      success: Location.response(Project.Info),
      error: ProjectAppearanceError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.project.appearance.update",
          summary: "Update current project appearance",
          description: "Update the name, icon, or startup command for the project at the requested location.",
        }),
      ),
  )
  .annotateMerge(OpenApi.annotations({ title: "project", description: "Current project appearance routes." }))
