export * as Routine from "./routine"

import { Schema } from "effect"
import { ascending } from "./identifier"
import { DateTimeUtcFromMillis, NonNegativeInt, optional, statics } from "./schema"
import { SessionID } from "./session-id"
import { SessionMessage } from "./session-message"

export const ID = Schema.String.check(Schema.isStartsWith("rtn_")).pipe(
  Schema.brand("Routine.ID"),
  statics((schema) => ({ create: () => schema.make("rtn_" + ascending()) })),
)
export type ID = typeof ID.Type

export const RunID = Schema.String.check(Schema.isStartsWith("rtr_")).pipe(
  Schema.brand("Routine.RunID"),
  statics((schema) => ({ create: () => schema.make("rtr_" + ascending()) })),
)
export type RunID = typeof RunID.Type

export const Status = Schema.Literals(["active", "paused"])
export type Status = typeof Status.Type

export const RunStatus = Schema.Literals(["claimed", "admitted", "failed", "cancelled"])
export type RunStatus = typeof RunStatus.Type

export const IntervalMs = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(60_000),
  Schema.isLessThanOrEqualTo(2_592_000_000),
)
export type IntervalMs = typeof IntervalMs.Type

const Text = Schema.String.check(Schema.isMinLength(1))

export const Create = Schema.Struct({
  sessionID: SessionID,
  name: Text,
  prompt: Text,
  intervalMs: IntervalMs,
}).annotate({ identifier: "Routine.Create" })
export type Create = typeof Create.Type

export const Info = Schema.Struct({
  id: ID,
  sessionID: SessionID,
  name: Text,
  prompt: Text,
  intervalMs: IntervalMs,
  status: Status,
  nextRunAt: DateTimeUtcFromMillis,
  time: Schema.Struct({
    created: DateTimeUtcFromMillis,
    updated: DateTimeUtcFromMillis,
  }),
}).annotate({ identifier: "Routine.Info" })
export type Info = typeof Info.Type

export const Run = Schema.Struct({
  id: RunID,
  routineID: ID,
  sessionID: SessionID,
  messageID: SessionMessage.ID,
  scheduledAt: DateTimeUtcFromMillis,
  status: RunStatus,
  admittedSeq: NonNegativeInt.pipe(optional),
  error: Schema.String.pipe(optional),
  time: Schema.Struct({
    claimed: DateTimeUtcFromMillis,
    updated: DateTimeUtcFromMillis,
  }),
}).annotate({ identifier: "Routine.Run" })
export type Run = typeof Run.Type
