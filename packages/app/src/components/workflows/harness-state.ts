import type { Workflow } from "@opencode-ai/schema/workflow"

export function harnessExecutionModels(catalog: Workflow.Catalog, kind: "task" | "computer", requiresTools: boolean) {
  return catalog.models
    .filter((model) => (kind !== "computer" || model.vision) && (!requiresTools || model.toolcall !== false))
    .toSorted((left, right) => {
      const price = (model: typeof left) =>
        model.cost && model.cost.input + model.cost.output > 0
          ? model.cost.input + model.cost.output
          : Number.POSITIVE_INFINITY
      return price(left) - price(right) || left.name.localeCompare(right.name)
    })
}

export function lowestHarnessExecutionModel(
  catalog: Workflow.Catalog,
  kind: "task" | "computer",
  requiresTools: boolean,
) {
  return harnessExecutionModels(catalog, kind, requiresTools).find(
    (model) => model.cost && model.cost.input + model.cost.output > 0,
  )
}

export function canAcceptHarnessTrial(input: {
  nodeID: string
  nodeFingerprint: string
  draft?: Workflow.HarnessDraft
  run?: Workflow.Run
  dirty: boolean
  reviewed: boolean
}) {
  return (
    !input.dirty &&
    input.reviewed &&
    !!input.draft &&
    input.draft.nodeFingerprint === input.nodeFingerprint &&
    input.run?.status === "completed" &&
    input.run.trial?.nodeID === input.nodeID &&
    input.run.trial.revision === input.draft.revision &&
    input.run.steps.find((step) => step.nodeID === input.nodeID)?.validation?.passed === true
  )
}
