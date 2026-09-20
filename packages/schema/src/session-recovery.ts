export * as SessionRecovery from "./session-recovery"

import { Schema } from "effect"
import { SessionDelivery } from "./session-delivery"
import { SessionMessage } from "./session-message"

const Running = Schema.Struct({ type: Schema.Literal("running") })
const Idle = Schema.Struct({ type: Schema.Literal("idle") })
const Pending = Schema.Struct({
  type: Schema.Literal("pending"),
  delivery: SessionDelivery.Delivery,
})
const NeedsRecovery = Schema.Struct({
  type: Schema.Literal("needs_recovery"),
  reason: Schema.Literals(["promoted_input", "incomplete_assistant", "incomplete_tool", "continuation"]),
  messageID: SessionMessage.ID.pipe(Schema.optional),
})

export const Status = Schema.Union([Running, Idle, Pending, NeedsRecovery]).pipe(
  Schema.toTaggedUnion("type"),
  Schema.annotate({ identifier: "SessionRecovery.Status" }),
)
export type Status = typeof Status.Type
