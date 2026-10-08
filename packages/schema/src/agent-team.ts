export * as AgentTeam from "./agent-team"

import { Schema } from "effect"
import { optional } from "./schema"

export const Name = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)).annotate({
  identifier: "AgentTeam.Name",
  description: "A lowercase name using letters, numbers and single hyphens",
})

const AgentName = Schema.String.check(Schema.isPattern(/\S/))
const Model = Schema.String.check(Schema.isPattern(/^[^/\s]+\/.+$/))

export interface Role extends Schema.Schema.Type<typeof Role> {}
export const Role = Schema.Struct({
  agent: AgentName,
  kind: Schema.Literals(["worker", "reviewer"]).pipe(optional),
  description: Schema.String.pipe(optional),
  model: Model.pipe(optional),
  modelReason: Schema.String.pipe(optional),
  instructions: Schema.String.pipe(optional),
  skills: Schema.Array(Schema.String).pipe(optional),
  standards: Schema.Array(Schema.String).pipe(optional),
}).annotate({ identifier: "AgentTeam.Role" })

export interface Review extends Schema.Schema.Type<typeof Review> {}
export const Review = Schema.Struct({
  role: Name,
  checklist: Schema.Array(Schema.String).pipe(optional),
  jev: Schema.Boolean.pipe(optional),
}).annotate({ identifier: "AgentTeam.Review" })

export interface Step extends Schema.Schema.Type<typeof Step> {}
export const Step = Schema.Struct({
  id: Name,
  title: Schema.String,
  role: Name,
  instructions: Schema.String,
  dependsOn: Schema.Array(Schema.String).pipe(optional),
  deliverables: Schema.Array(Schema.String).pipe(optional),
  checks: Schema.Array(Schema.String).pipe(optional),
  approval: Schema.Boolean.pipe(optional),
}).annotate({ identifier: "AgentTeam.Step" })

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  description: Schema.String.pipe(optional),
  lead: AgentName,
  model: Model.pipe(optional),
  modelReason: Schema.String.pipe(optional),
  roles: Schema.Record(Name, Role),
  skills: Schema.Array(Schema.String).pipe(optional),
  workflow: Schema.Array(Step).pipe(optional),
  instructions: Schema.String.pipe(optional),
  review: Review.pipe(optional),
  disabled: Schema.Boolean.pipe(optional),
}).annotate({ identifier: "AgentTeam.Info" })

export const Teams = Schema.Record(Name, Info).annotate({ identifier: "AgentTeam.Teams" })
export type Teams = typeof Teams.Type

// Null explicitly clears an inherited default when configuration is patched.
export const Default = Schema.NullOr(Name).annotate({ identifier: "AgentTeam.Default" })

export interface Settings extends Schema.Schema.Type<typeof Settings> {}
export const Settings = Schema.Struct({
  teams: Teams.pipe(optional),
  default_team: Default.pipe(optional),
}).annotate({ identifier: "AgentTeam.Settings" })

export interface DraftRequest extends Schema.Schema.Type<typeof DraftRequest> {}
export const DraftRequest = Schema.Struct({
  goal: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4_000)),
  model: Schema.Struct({
    providerID: Schema.String.check(Schema.isMinLength(1)),
    modelID: Schema.String.check(Schema.isMinLength(1)),
  }),
  providers: Schema.Array(Schema.String.check(Schema.isMinLength(1))).pipe(optional),
}).annotate({
  identifier: "AgentTeam.DraftRequest",
})

export interface Draft extends Schema.Schema.Type<typeof Draft> {}
export const Draft = Schema.Struct({ name: Name, team: Info }).annotate({ identifier: "AgentTeam.Draft" })
