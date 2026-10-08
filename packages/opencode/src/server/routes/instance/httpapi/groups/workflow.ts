import { Schema } from "effect"
import { Workflow } from "@opencode-ai/schema/workflow"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"

export class WorkflowInvalidError extends Schema.TaggedErrorClass<WorkflowInvalidError>()(
  "WorkflowInvalidError",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}
export class WorkflowNotFoundError extends Schema.TaggedErrorClass<WorkflowNotFoundError>()(
  "WorkflowNotFoundError",
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}
export class WorkflowConflictError extends Schema.TaggedErrorClass<WorkflowConflictError>()(
  "WorkflowConflictError",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}
export class WorkflowServerError extends Schema.TaggedErrorClass<WorkflowServerError>()(
  "WorkflowServerError",
  { message: Schema.String },
  { httpApiStatus: 500 },
) {}
const error = [WorkflowInvalidError, WorkflowNotFoundError, WorkflowConflictError, WorkflowServerError]
const query = WorkspaceRoutingQuery
const workflowParams = { workflowID: Workflow.ID }
const runParams = { runID: Workflow.ID }
const nodeParams = { workflowID: Workflow.ID, nodeID: Workflow.ID }

export const WorkflowApi = HttpApi.make("workflow").add(
  HttpApiGroup.make("workflow")
    .add(
      HttpApiEndpoint.get("list", "/workflow", {
        query,
        success: Schema.Array(Workflow.Definition),
        error,
      }).annotateMerge(OpenApi.annotations({ identifier: "workflow.list", summary: "List project workflows" })),
      HttpApiEndpoint.put("save", "/workflow", {
        query,
        payload: Workflow.Definition,
        success: Workflow.Definition,
        error,
      }).annotateMerge(OpenApi.annotations({ identifier: "workflow.save", summary: "Save a project workflow" })),
      HttpApiEndpoint.get("catalog", "/workflow/catalog", { query, success: Workflow.Catalog, error }).annotateMerge(
        OpenApi.annotations({ identifier: "workflow.catalog", summary: "List workflow models, skills and MCP tools" }),
      ),
      HttpApiEndpoint.post("teach", "/workflow/teach", {
        query,
        payload: Workflow.TeachRequest,
        success: Workflow.SkillDraft,
        error,
      }).annotateMerge(
        OpenApi.annotations({ identifier: "workflow.teach", summary: "Draft a skill from a screenshot demonstration" }),
      ),
      HttpApiEndpoint.post("saveSkill", "/workflow/skill", {
        query,
        payload: Workflow.SkillDraft,
        success: Workflow.SkillDraft,
        error,
      }).annotateMerge(
        OpenApi.annotations({ identifier: "workflow.saveSkill", summary: "Save an edited demonstrated skill" }),
      ),
      HttpApiEndpoint.delete("remove", "/workflow/:workflowID", {
        query,
        params: workflowParams,
        success: Schema.Boolean,
        error,
      }).annotateMerge(OpenApi.annotations({ identifier: "workflow.remove", summary: "Delete a workflow" })),
      HttpApiEndpoint.get("runs", "/workflow/:workflowID/runs", {
        query,
        params: workflowParams,
        success: Schema.Array(Workflow.Run),
        error,
      }).annotateMerge(OpenApi.annotations({ identifier: "workflow.runs", summary: "List workflow run history" })),
      HttpApiEndpoint.post("start", "/workflow/:workflowID/run", {
        query,
        params: workflowParams,
        payload: Schema.Struct({ input: Schema.String.check(Schema.isMaxLength(100_000)) }),
        success: Workflow.Run,
        error,
      }).annotateMerge(OpenApi.annotations({ identifier: "workflow.start", summary: "Start a workflow" })),
      HttpApiEndpoint.get("harness", "/workflow/:workflowID/node/:nodeID/harness", {
        query,
        params: nodeParams,
        success: Workflow.HarnessLab,
        error,
      }).annotateMerge(
        OpenApi.annotations({ identifier: "workflow.harness", summary: "Get step harness draft and trials" }),
      ),
      HttpApiEndpoint.put("saveHarness", "/workflow/:workflowID/node/:nodeID/harness", {
        query,
        params: nodeParams,
        payload: Workflow.HarnessSaveRequest,
        success: Workflow.HarnessDraft,
        error,
      }).annotateMerge(
        OpenApi.annotations({ identifier: "workflow.saveHarness", summary: "Save a new step harness revision" }),
      ),
      HttpApiEndpoint.post("designHarness", "/workflow/:workflowID/node/:nodeID/harness/design", {
        query,
        params: nodeParams,
        payload: Workflow.HarnessDesignRequest,
        success: Workflow.HarnessDraft,
        error,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "workflow.designHarness",
          summary: "Design or refine a step harness with AI",
        }),
      ),
      HttpApiEndpoint.post("testHarness", "/workflow/:workflowID/node/:nodeID/harness/test", {
        query,
        params: nodeParams,
        payload: Workflow.HarnessTestRequest,
        success: Workflow.Run,
        error,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "workflow.testHarness",
          summary: "Run a saved harness revision against a test input",
        }),
      ),
      HttpApiEndpoint.post("acceptHarness", "/workflow/:workflowID/node/:nodeID/harness/accept", {
        query,
        params: nodeParams,
        payload: Workflow.HarnessAcceptRequest,
        success: Workflow.Definition,
        error,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "workflow.acceptHarness",
          summary: "Accept a successful trial and bind its harness to the step",
        }),
      ),
      HttpApiEndpoint.get("getRun", "/workflow/run/:runID", {
        query,
        params: runParams,
        success: Workflow.Run,
        error,
      }).annotateMerge(OpenApi.annotations({ identifier: "workflow.getRun", summary: "Get workflow run progress" })),
      HttpApiEndpoint.post("approve", "/workflow/run/:runID/approve", {
        query,
        params: runParams,
        payload: Schema.Struct({ nodeID: Workflow.ID }),
        success: Workflow.Run,
        error,
      }).annotateMerge(
        OpenApi.annotations({ identifier: "workflow.approve", summary: "Approve the current waiting step" }),
      ),
      HttpApiEndpoint.post("cancel", "/workflow/run/:runID/cancel", {
        query,
        params: runParams,
        success: Workflow.Run,
        error,
      }).annotateMerge(OpenApi.annotations({ identifier: "workflow.cancel", summary: "Cancel a workflow run" })),
    )
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization),
)
