import { expect, test } from "bun:test"
import type { Workflow } from "@opencode-ai/schema/workflow"
import { canAcceptHarnessTrial, harnessExecutionModels, lowestHarnessExecutionModel } from "./harness-state"

const spec: Workflow.HarnessSpec = {
  model: { providerID: "connected", modelID: "small" },
  instructions: "Return the requested answer.",
  modelReason: "Small task",
  allowedTools: [],
  timeoutSeconds: 30,
  maxOutputChars: 1000,
  outputFormat: "text",
  requiredJsonKeys: [],
  checklist: ["Check the answer"],
}
const draft: Workflow.HarnessDraft = {
  revision: "draft_two",
  nodeFingerprint: "a".repeat(64),
  goal: "Answer",
  feedback: "",
  spec,
  updatedAt: 1,
}
const run: Workflow.Run = {
  id: "trial_one",
  workflowID: "workflow_one",
  input: "Sample",
  status: "completed",
  createdAt: 1,
  updatedAt: 2,
  definition: {
    version: 1,
    id: "workflow_one",
    name: "Workflow",
    directory: "/project",
    description: "",
    updatedAt: 1,
    nodes: [
      {
        id: "task_one",
        name: "Task",
        kind: "task",
        x: 0,
        y: 0,
        prompt: "Answer",
        model: spec.model,
        skills: [],
        mcpServers: [],
      },
    ],
    edges: [],
  },
  steps: [{ nodeID: "task_one", status: "completed", output: "Answer", validation: { passed: true, errors: [] } }],
  trial: { nodeID: "task_one", revision: draft.revision, fingerprint: "b".repeat(64), spec, outputs: {} },
}

test("lowest estimated price respects computer vision and tool capability without treating unknown prices as free", () => {
  const catalog: Workflow.Catalog = {
    models: [
      { providerID: "p", modelID: "unknown", name: "Unknown", vision: true, toolcall: true },
      {
        providerID: "p",
        modelID: "zero",
        name: "Zero estimate",
        vision: true,
        toolcall: true,
        cost: { input: 0, output: 0 },
      },
      {
        providerID: "p",
        modelID: "no-vision",
        name: "Text only",
        vision: false,
        toolcall: true,
        cost: { input: 0.01, output: 0.01 },
      },
      {
        providerID: "p",
        modelID: "no-tools",
        name: "No tools",
        vision: true,
        toolcall: false,
        cost: { input: 0.02, output: 0.02 },
      },
      {
        providerID: "p",
        modelID: "small",
        name: "Small vision",
        vision: true,
        toolcall: true,
        cost: { input: 0.1, output: 0.2 },
      },
      {
        providerID: "p",
        modelID: "large",
        name: "Large vision",
        vision: true,
        toolcall: true,
        cost: { input: 2, output: 8 },
      },
    ],
    servers: [],
    skills: [],
    tools: [],
    clefConfigured: false,
  }
  expect(lowestHarnessExecutionModel(catalog, "computer", true)?.modelID).toBe("small")
  expect(lowestHarnessExecutionModel(catalog, "task", true)?.modelID).toBe("no-vision")
  expect(harnessExecutionModels(catalog, "computer", true).map((model) => model.modelID)).not.toContain("no-tools")
  expect(
    lowestHarnessExecutionModel({ ...catalog, models: catalog.models.slice(0, 2) }, "computer", true),
  ).toBeUndefined()
})

test("acceptance requires a reviewed successful trial of the unchanged current draft", () => {
  const input = { nodeID: "task_one", nodeFingerprint: draft.nodeFingerprint, draft, run, dirty: false, reviewed: true }
  expect(canAcceptHarnessTrial(input)).toBe(true)
  expect(canAcceptHarnessTrial({ ...input, dirty: true })).toBe(false)
  expect(canAcceptHarnessTrial({ ...input, reviewed: false })).toBe(false)
  expect(canAcceptHarnessTrial({ ...input, nodeFingerprint: "c".repeat(64) })).toBe(false)
  expect(canAcceptHarnessTrial({ ...input, draft: { ...draft, revision: "new_revision" } })).toBe(false)
  expect(canAcceptHarnessTrial({ ...input, nodeID: "another_node" })).toBe(false)
  expect(canAcceptHarnessTrial({ ...input, run: { ...run, status: "failed" } })).toBe(false)
  expect(canAcceptHarnessTrial({ ...input, run: { ...run, trial: undefined } })).toBe(false)
  expect(
    canAcceptHarnessTrial({
      ...input,
      run: {
        ...run,
        steps: [
          { nodeID: "task_one", status: "completed", validation: { passed: false, errors: ["Missing required key"] } },
        ],
      },
    }),
  ).toBe(false)
  expect(
    canAcceptHarnessTrial({ ...input, run: { ...run, steps: [{ nodeID: "task_one", status: "completed" }] } }),
  ).toBe(false)
})
