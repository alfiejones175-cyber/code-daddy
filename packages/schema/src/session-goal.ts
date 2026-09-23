export * as SessionGoal from "./session-goal"

import { Schema } from "effect"
import { SessionID } from "./session-id"
import { PositiveInt } from "./schema"

const Text = Schema.String.check(Schema.isMinLength(1))

export const Blockers = Schema.Array(Text)

export const Status = Schema.Literals(["active", "paused", "blocked", "completed"])
export type Status = typeof Status.Type

export const Info = Schema.Struct({
  objective: Text,
  acceptanceCriteria: Schema.Array(Text),
  budget: PositiveInt.pipe(Schema.optional),
  status: Status,
  progress: Schema.String.pipe(Schema.optional),
  blockers: Blockers,
  evidence: Schema.String.pipe(Schema.optional),
}).annotate({ identifier: "SessionGoal" })
export type Info = typeof Info.Type

export const Set = Schema.Struct({
  objective: Info.fields.objective,
  acceptanceCriteria: Info.fields.acceptanceCriteria.pipe(Schema.optional),
  budget: PositiveInt.pipe(Schema.optional),
  progress: Schema.String.pipe(Schema.optional),
  blockers: Blockers.pipe(Schema.optional),
  evidence: Schema.String.pipe(Schema.optional),
}).annotate({ identifier: "SessionGoal.Set" })
export type Set = typeof Set.Type

export const Complete = Schema.Struct({
  evidence: Schema.String.check(Schema.isMinLength(1)),
}).annotate({ identifier: "SessionGoal.Complete" })
export type Complete = typeof Complete.Type

export const Block = Schema.Struct({
  blockers: Blockers.check(Schema.isMinLength(1)),
  progress: Schema.String.pipe(Schema.optional),
}).annotate({ identifier: "SessionGoal.Block" })
export type Block = typeof Block.Type

export const SessionSet = Schema.Struct({ sessionID: SessionID, ...Set.fields }).annotate({
  identifier: "SessionGoal.SessionSet",
})
export type SessionSet = typeof SessionSet.Type

export const SessionBlock = Schema.Struct({ sessionID: SessionID, ...Block.fields }).annotate({
  identifier: "SessionGoal.SessionBlock",
})
export type SessionBlock = typeof SessionBlock.Type
