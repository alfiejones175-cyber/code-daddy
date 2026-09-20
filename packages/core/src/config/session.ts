export * as ConfigSession from "./session"

import { Schema } from "effect"
import { PositiveInt } from "../schema"

export class Info extends Schema.Class<Info>("ConfigV2.Session")({
  first_event_timeout_ms: PositiveInt.pipe(Schema.optional).annotate({
    description: "Maximum time in milliseconds to wait for the first provider stream event",
  }),
  inactivity_timeout_ms: PositiveInt.pipe(Schema.optional).annotate({
    description: "Maximum time in milliseconds between provider stream events",
  }),
}) {}
