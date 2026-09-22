export type Source = "api" | "config" | "custom" | "env"

// `mergeProvider` owns the merge order. This boundary only preserves an
// authenticated source when a plugin/custom loader contributes options, while
// still marking a provider that first appears through that custom loader.
export function patch(input: { source: Source; existing: boolean }): { source?: Source } {
  if (input.source === "custom" && input.existing) return {}
  return { source: input.source }
}

export * as SourcePolicy from "./source-policy"
