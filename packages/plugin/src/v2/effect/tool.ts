import type { Effect, Schema, Scope } from "effect"
import type { Registration } from "./registration.js"

export interface ToolContext {
  readonly sessionID: string
  readonly agent: string
  readonly assistantMessageID: string
  readonly toolCallID: string
}

export interface ToolDefinition<Input = unknown, Output = unknown> {
  readonly description: string
  readonly input: Schema.Codec<Input, unknown, never, never>
  readonly output: Schema.Codec<Output, unknown, never, never>
  readonly execute: (input: Input, context: ToolContext) => Effect.Effect<Output, unknown>
}

export interface ToolHooks {
  readonly register: <Input, Output>(
    tools: Readonly<Record<string, ToolDefinition<Input, Output>>>,
  ) => Effect.Effect<Registration, never, Scope.Scope>
}
