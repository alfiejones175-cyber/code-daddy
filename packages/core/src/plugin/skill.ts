/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill"

import { define } from "./internal"
import { Effect } from "effect"
import { AbsolutePath } from "../schema"
import { SkillV2 } from "../skill"
import customizeOpencodeContent from "./skill/customize-opencode.md" with { type: "text" }
import teamPlanning from "./skill/team-planning.md" with { type: "text" }
import teamResearch from "./skill/team-research.md" with { type: "text" }
import teamUIDesign from "./skill/team-ui-design.md" with { type: "text" }
import teamFrontendBuild from "./skill/team-frontend-build.md" with { type: "text" }
import teamBackendBuild from "./skill/team-backend-build.md" with { type: "text" }
import teamQA from "./skill/team-qa.md" with { type: "text" }
import teamReview from "./skill/team-review.md" with { type: "text" }

export const CustomizeOpencodeContent = customizeOpencodeContent

export const TeamSkills = [
  {
    name: "team-planning",
    description: "Coordinate a team from task intake through research, a human decision checkpoint, implementation, evidence, and handoff.",
    content: teamPlanning,
  },
  {
    name: "team-research",
    description: "Produce source-backed research, fit analysis, diagrams, and one consolidated set of questions before implementation.",
    content: teamResearch,
  },
  {
    name: "team-ui-design",
    description: "Explore UI options and define a coherent, reviewable interface direction before frontend implementation.",
    content: teamUIDesign,
  },
  {
    name: "team-frontend-build",
    description: "Implement an approved frontend direction with accessible interactions, responsive behavior, and evidence.",
    content: teamFrontendBuild,
  },
  {
    name: "team-backend-build",
    description: "Implement backend behavior with clear contracts, safe data flow, and evidence tied to acceptance criteria.",
    content: teamBackendBuild,
  },
  {
    name: "team-qa",
    description: "Validate a change against its acceptance criteria using checks permitted by the assigned role and report evidence.",
    content: teamQA,
  },
  {
    name: "team-review",
    description: "Independently review supplied changes and evidence for concrete defects without editing or running commands.",
    content: teamReview,
  },
].map((skill) =>
  SkillV2.Info.make({
    ...skill,
    location: AbsolutePath.make(`/builtin/${skill.name}.md`),
  }),
)

export const Plugin = define({
  id: "skill",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.skill.transform((draft) => {
      draft.source(
        SkillV2.EmbeddedSource.make({
          type: "embedded",
          skill: SkillV2.Info.make({
            name: "customize-opencode",
            description:
              "Use ONLY when the user is editing or creating opencode's own configuration: opencode.json, opencode.jsonc, files under .opencode/, or files under ~/.config/opencode/. Also use when creating or fixing opencode agents, subagents, commands, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring opencode itself.",
            location: AbsolutePath.make("/builtin/customize-opencode.md"),
            content: CustomizeOpencodeContent,
          }),
        }),
      )
      for (const skill of TeamSkills) {
        draft.source(SkillV2.EmbeddedSource.make({ type: "embedded", skill }))
      }
    })
  }),
})
