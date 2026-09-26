type Model = {
  id: string
  provider: { id: string }
  cost?: { input: number; output: number }
}

const number = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 })

export function openRouterPrice(model: Model) {
  if (model.provider.id !== "openrouter") return
  if (!model.cost) return { kind: "unavailable" as const }
  if (![model.cost.input, model.cost.output].every((value) => Number.isFinite(value) && value >= 0))
    return { kind: "unavailable" as const }

  // The provider catalog fills a missing cost with zero. Only explicit free IDs
  // should be shown as $0; router aliases and other missing rates can vary.
  if (
    model.cost.input === 0 &&
    model.cost.output === 0 &&
    !model.id.endsWith(":free") &&
    model.id !== "openrouter/free"
  )
    return { kind: "unavailable" as const }

  return { kind: "rate" as const, input: `$${number.format(model.cost.input)}`, output: `$${number.format(model.cost.output)}` }
}
