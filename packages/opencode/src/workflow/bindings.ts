import type { Json } from "effect/Schema"

export class BindingError extends Error {}

/** Bind JSON values once; replacement text and object keys are never interpreted. */
export function bind(
  arguments_: Readonly<Record<string, Json>>,
  context: { input: string; outputs: Record<string, string> },
) {
  const budget = { characters: 0, values: 0 }
  const visit = (value: Json, depth: number): Json => {
    if (depth > 64 || ++budget.values > 10_000)
      throw new BindingError("MCP arguments are too deeply nested or contain too many values.")
    if (typeof value === "string") {
      budget.characters += value.length
      if (budget.characters > 1_000_000) throw new BindingError("MCP argument text exceeds the 1 MB binding limit.")
      return value.replace(
        /\{\{\s*(input|steps\.([a-zA-Z0-9_-]+))\s*\}\}/g,
        (token: string, reference: string, nodeID: string | undefined) => {
          if (reference !== "input" && (!nodeID || nodeID.length > 100 || !Object.hasOwn(context.outputs, nodeID)))
            throw new BindingError(
              `No completed step output is available for ${token}. Connect that step before this MCP step.`,
            )
          const replacement = reference === "input" ? context.input : context.outputs[nodeID!]
          budget.characters += replacement.length - token.length
          if (budget.characters > 1_000_000) throw new BindingError("MCP argument text exceeds the 1 MB binding limit.")
          return replacement
        },
      )
    }
    if (value === null || typeof value !== "object") return value
    if (Array.isArray(value)) return value.map((item) => visit(item, depth + 1))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, depth + 1)]))
  }
  return Object.fromEntries(Object.entries(arguments_).map(([key, value]) => [key, visit(value, 1)]))
}

export * as WorkflowBindings from "./bindings"
