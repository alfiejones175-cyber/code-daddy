export * as SessionRunner from "./index"

import type { LLMError } from "@opencode-ai/llm"
import { Context, Effect, Schema } from "effect"
import { SessionSchema } from "../schema"
import type { ContextSnapshotDecodeError, MessageDecodeError } from "../error"
import { SessionRunnerModel } from "./model"
import type { SystemContext } from "../../system-context/index"
import type { ToolOutputStore } from "../../tool-output-store"

export class ProviderTimeoutError extends Schema.TaggedErrorClass<ProviderTimeoutError>()(
  "SessionRunner.ProviderTimeoutError",
  {
    phase: Schema.Literals(["first_event", "inactivity"]),
    timeoutMs: Schema.Number,
  },
) {
  override get message() {
    return this.phase === "first_event"
      ? `Provider did not send its first event within ${this.timeoutMs}ms`
      : `Provider stopped sending events for ${this.timeoutMs}ms`
  }
}

export type RunError =
  | LLMError
  | SessionRunnerModel.Error
  | MessageDecodeError
  | ContextSnapshotDecodeError
  | SystemContext.InitializationBlocked
  | ProviderTimeoutError
  | ToolOutputStore.Error

/** Runs one local continuation from already-recorded Session history. */
export interface Interface {
  /** Drains eligible durable work. Explicit runs perform one provider attempt even when no work is eligible. */
  readonly run: (input: {
    readonly sessionID: SessionSchema.ID
    readonly force: boolean
  }) => Effect.Effect<void, RunError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/SessionRunner") {}
