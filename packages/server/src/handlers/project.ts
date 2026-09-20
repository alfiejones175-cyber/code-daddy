import { ProjectAppearance } from "@opencode-ai/core/project/appearance"
import { ProjectAppearanceError } from "@opencode-ai/protocol/groups/project"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const ProjectHandler = HttpApiBuilder.group(Api, "server.project", (handlers) =>
  handlers.handle("project.appearance.update", (ctx) =>
    response(
      ProjectAppearance.Service.use((appearance) => appearance.update(ctx.payload)).pipe(
        Effect.mapError(
          (error) =>
            new ProjectAppearanceError({
              name: "ProjectAppearanceError",
              data: { message: error.message },
            }),
        ),
      ),
    ),
  ),
)
