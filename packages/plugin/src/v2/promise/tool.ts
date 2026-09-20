import type { Schema } from "effect"
import type { ToolContext } from "../effect/tool.js"
import type { Registration } from "./registration.js"

export type { ToolContext }

export interface ToolDefinition<Input = unknown, Output = unknown> {
  readonly description: string
  readonly input: Schema.Codec<Input, unknown, never, never>
  readonly output: Schema.Codec<Output, unknown, never, never>
  readonly execute: (input: Input, context: ToolContext) => Promise<Output> | Output
}

export interface ToolHooks {
  readonly register: <Input, Output>(
    tools: Readonly<Record<string, ToolDefinition<Input, Output>>>,
  ) => Promise<Registration>
}
