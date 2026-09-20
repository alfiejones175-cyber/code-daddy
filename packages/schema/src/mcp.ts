export * as MCP from "./mcp"

import { Schema } from "effect"
import { optional } from "./schema"

export const ID = Schema.String.pipe(Schema.brand("MCP.ID"))
export type ID = typeof ID.Type

export const Transport = Schema.Literals(["local", "remote"])
export type Transport = typeof Transport.Type

export const State = Schema.Literals(["configured", "connected", "available", "failed", "disabled"])
export type State = typeof State.Type

export class Tool extends Schema.Class<Tool>("MCP.Tool")({
  name: Schema.String,
  source: Schema.String,
  description: Schema.String.pipe(optional),
}) {}

export class Info extends Schema.Class<Info>("MCP.Info")({
  id: ID,
  name: Schema.String,
  transport: Transport,
  state: State,
  error: Schema.String.pipe(optional),
  tools: Schema.Array(Tool),
}) {}
