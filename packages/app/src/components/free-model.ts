type ModelCost = {
  input: number
  output: number
  cache: { read: number; write: number }
  tiers?: readonly ModelCost[]
  experimentalOver200K?: ModelCost
}

export function isFreeModel(model: { provider: { id: string }; cost?: ModelCost }) {
  if (model.provider.id !== "opencode" || !model.cost) return false
  const costs = [
    model.cost,
    ...(model.cost.tiers ?? []),
    ...(model.cost.experimentalOver200K ? [model.cost.experimentalOver200K] : []),
  ]
  return costs.every((cost) =>
    [cost.input, cost.output, cost.cache.read, cost.cache.write].every((value) => Number.isFinite(value) && value === 0),
  )
}
