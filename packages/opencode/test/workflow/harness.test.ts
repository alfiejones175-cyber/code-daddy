import { expect, test } from "bun:test"
import { Workflow } from "@opencode-ai/schema/workflow"
import { Permission } from "../../src/permission"
import { WorkflowHarness } from "../../src/workflow/harness"

const spec: Workflow.HarnessSpec = {
  model: { providerID: "test", modelID: "small" },
  instructions: "Extract the customer name only.",
  modelReason: "Small text model is sufficient.",
  allowedTools: [],
  timeoutSeconds: 5,
  maxOutputChars: 100,
  outputFormat: "text",
  requiredJsonKeys: [],
  checklist: ["Matches the input customer."],
}

test("harness tools preserve inherited ask and patterned deny, while aliases remain exactly gated", () => {
  const result = WorkflowHarness.policy(
    { ...spec, allowedTools: ["write", "demo_lookup", "read"] },
    ["write", "edit", "apply_patch", "read", "shell", "demo_lookup"],
    [
      { permission: "*", pattern: "*", action: "allow" },
      { permission: "edit", pattern: "*.secret", action: "deny" },
      { permission: "read", pattern: "*", action: "ask" },
      { permission: "demo_*", pattern: "*", action: "ask" },
    ],
  )
  expect(result.tools).toMatchObject({
    write: true,
    edit: false,
    apply_patch: false,
    read: true,
    shell: false,
    task: false,
    skill: false,
  })
  expect(Permission.evaluate("edit", "customer.txt", result.permission).action).toBe("allow")
  expect(Permission.evaluate("edit", "customer.secret", result.permission).action).toBe("deny")
  expect(Permission.evaluate("read", "customer.txt", result.permission).action).toBe("ask")
  expect(Permission.evaluate("demo_lookup", "*", result.permission).action).toBe("ask")
  expect(Permission.evaluate("shell", "*", result.permission).action).toBe("deny")
  for (const tool of ["task", "skill", "read_mcp_resource", "unavailable"])
    expect(() =>
      WorkflowHarness.policy({ ...spec, allowedTools: [tool] }, tool === "unavailable" ? [] : [tool], []),
    ).toThrow(WorkflowHarness.InvalidError)
})

test("harness output limits retain a capped failed result and JSON checks use own top-level fields", () => {
  expect(WorkflowHarness.output(spec, "Jane")).toEqual({ output: "Jane", validation: { passed: true, errors: [] } })
  expect(WorkflowHarness.output({ ...spec, maxOutputChars: 3 }, "Jane")).toMatchObject({
    output: "Jan",
    validation: { passed: false },
  })
  expect(WorkflowHarness.output(spec, "  ").validation.passed).toBe(false)
  const json = { ...spec, outputFormat: "json" as const, requiredJsonKeys: ["name"] }
  expect(WorkflowHarness.output(json, '{"name":"Jane"}').validation.passed).toBe(true)
  for (const text of ['```json\n{"name":"Jane"}\n```', "null", "[]", "{}", '{"constructor":"Jane"}'])
    expect(WorkflowHarness.output(json, text).validation.passed).toBe(false)
  expect(WorkflowHarness.output({ ...json, requiredJsonKeys: ["constructor"] }, "{}").validation.passed).toBe(false)
})

test("harness catalog prices distinguish unknown zero defaults from credible rates", () => {
  const cost = (input: number, output: number) => ({ cost: { input, output, cache: { read: 0, write: 0 } } })
  expect(WorkflowHarness.price(cost(0, 0))).toBeUndefined()
  expect(WorkflowHarness.price(cost(-1, 2))).toBeUndefined()
  expect(WorkflowHarness.price(cost(Number.NaN, 2))).toBeUndefined()
  expect(WorkflowHarness.price(cost(0.1, 0.2))).toEqual({ input: 0.1, output: 0.2 })
  expect(WorkflowHarness.price(cost(0, 0.2))).toEqual({ input: 0, output: 0.2 })
})
