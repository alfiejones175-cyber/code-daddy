export * as Workflow from "./workflow"

import { Schema } from "effect"
import { optional } from "./schema"

export const ID = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]{1,100}$/)).annotate({
  identifier: "Workflow.ID",
})
const Label = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200))
const Text = Schema.String.check(Schema.isMaxLength(100_000))

export const Model = Schema.Struct({ providerID: Label, modelID: Label }).annotate({ identifier: "Workflow.Model" })
export interface Model extends Schema.Schema.Type<typeof Model> {}

const Fingerprint = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const HarnessText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(12_000))
const ShortText = Schema.String.check(Schema.isMaxLength(4_000))
export const HarnessSpec = Schema.Struct({
  model: Model,
  instructions: HarnessText,
  modelReason: ShortText,
  allowedTools: Schema.Array(Label).check(Schema.isMaxLength(80)),
  timeoutSeconds: Schema.Int.check(Schema.isBetween({ minimum: 5, maximum: 300 })),
  maxOutputChars: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100_000 })),
  outputFormat: Schema.Literals(["text", "json"]),
  requiredJsonKeys: Schema.Array(Label).check(Schema.isMaxLength(32)),
  checklist: Schema.Array(HarnessText).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
}).annotate({ identifier: "Workflow.HarnessSpec" })
export interface HarnessSpec extends Schema.Schema.Type<typeof HarnessSpec> {}

export const HarnessAccepted = Schema.Struct({
  spec: HarnessSpec,
  fingerprint: Fingerprint,
  testRunID: ID,
  acceptedAt: Schema.Finite,
}).annotate({ identifier: "Workflow.HarnessAccepted" })
export interface HarnessAccepted extends Schema.Schema.Type<typeof HarnessAccepted> {}

export const HarnessDraft = Schema.Struct({
  revision: ID,
  nodeFingerprint: Fingerprint,
  goal: ShortText,
  feedback: ShortText,
  spec: HarnessSpec,
  updatedAt: Schema.Finite,
}).annotate({ identifier: "Workflow.HarnessDraft" })
export interface HarnessDraft extends Schema.Schema.Type<typeof HarnessDraft> {}

export const HarnessSaveRequest = Schema.Struct({
  spec: HarnessSpec,
  goal: ShortText,
  feedback: ShortText,
  expectedRevision: Schema.NullOr(ID),
  nodeFingerprint: Fingerprint,
}).annotate({ identifier: "Workflow.HarnessSaveRequest" })
export interface HarnessSaveRequest extends Schema.Schema.Type<typeof HarnessSaveRequest> {}

export const HarnessDesignRequest = Schema.Struct({
  designerModel: Model,
  executionModel: Model,
  goal: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4_000)),
  feedback: ShortText,
  expectedRevision: Schema.NullOr(ID),
  nodeFingerprint: Fingerprint,
}).annotate({ identifier: "Workflow.HarnessDesignRequest" })
export interface HarnessDesignRequest extends Schema.Schema.Type<typeof HarnessDesignRequest> {}

export const HarnessTestRequest = Schema.Struct({
  revision: ID,
  input: Text,
  outputs: Schema.Record(ID, Text),
}).annotate({ identifier: "Workflow.HarnessTestRequest" })
export interface HarnessTestRequest extends Schema.Schema.Type<typeof HarnessTestRequest> {}

export const HarnessAcceptRequest = Schema.Struct({ revision: ID, testRunID: ID }).annotate({
  identifier: "Workflow.HarnessAcceptRequest",
})
export interface HarnessAcceptRequest extends Schema.Schema.Type<typeof HarnessAcceptRequest> {}

const base = { id: ID, name: Label, x: Schema.Finite, y: Schema.Finite }
export const Node = Schema.Union([
  Schema.Struct({ ...base, kind: Schema.Literal("start") }),
  Schema.Struct({
    ...base,
    kind: Schema.Literals(["task", "computer"]),
    prompt: Text,
    model: Model,
    skills: Schema.Array(Schema.String),
    mcpServers: Schema.Array(Schema.String),
    harness: HarnessAccepted.pipe(optional),
  }),
  Schema.Struct({
    ...base,
    kind: Schema.Literal("mcp"),
    server: Schema.String,
    tool: Schema.String,
    arguments: Schema.Record(Schema.String, Schema.Json),
  }),
  Schema.Struct({
    ...base,
    kind: Schema.Literal("decision"),
    model: Schema.Literals(["clef", "clef-flash"]),
    question: Text,
    threshold: Schema.Number.check(Schema.isBetween({ minimum: 0.5, maximum: 1 })),
  }),
  Schema.Struct({ ...base, kind: Schema.Literal("approval"), instructions: Text }),
]).annotate({ identifier: "Workflow.Node" })
export type Node = typeof Node.Type

export const Edge = Schema.Struct({
  id: ID,
  from: ID,
  to: ID,
  outcome: Schema.Literals(["yes", "no"]).pipe(optional),
}).annotate({ identifier: "Workflow.Edge" })
export interface Edge extends Schema.Schema.Type<typeof Edge> {}

export const Definition = Schema.Struct({
  version: Schema.Literal(1),
  id: ID,
  name: Label,
  directory: Schema.String.check(Schema.isMinLength(1)),
  description: Text,
  nodes: Schema.Array(Node).check(Schema.isMaxLength(100)),
  edges: Schema.Array(Edge).check(Schema.isMaxLength(300)),
  updatedAt: Schema.Finite,
}).annotate({ identifier: "Workflow.Definition" })
export interface Definition extends Schema.Schema.Type<typeof Definition> {}

export const Validation = Schema.Struct({
  passed: Schema.Boolean,
  errors: Schema.Array(ShortText).check(Schema.isMaxLength(40)),
}).annotate({ identifier: "Workflow.Validation" })
export interface Validation extends Schema.Schema.Type<typeof Validation> {}

export const Step = Schema.Struct({
  nodeID: ID,
  status: Schema.Literals(["pending", "running", "completed", "failed", "skipped", "waiting", "cancelled"]),
  output: Text.pipe(optional),
  error: Text.pipe(optional),
  sessionID: Schema.String.pipe(optional),
  outcome: Schema.Literals(["yes", "no"]).pipe(optional),
  startedAt: Schema.Finite.pipe(optional),
  finishedAt: Schema.Finite.pipe(optional),
  validation: Validation.pipe(optional),
}).annotate({ identifier: "Workflow.Step" })
export interface Step extends Schema.Schema.Type<typeof Step> {}

export const Run = Schema.Struct({
  id: ID,
  workflowID: ID,
  definition: Definition,
  input: Text,
  status: Schema.Literals(["running", "waiting", "completed", "failed", "cancelled", "interrupted"]),
  steps: Schema.Array(Step),
  createdAt: Schema.Finite,
  updatedAt: Schema.Finite,
  error: Text.pipe(optional),
  trial: Schema.Struct({
    nodeID: ID,
    revision: ID,
    fingerprint: Fingerprint,
    spec: HarnessSpec,
    outputs: Schema.Record(ID, Text),
  }).pipe(optional),
}).annotate({ identifier: "Workflow.Run" })
export interface Run extends Schema.Schema.Type<typeof Run> {}

export const HarnessLab = Schema.Struct({
  nodeFingerprint: Fingerprint,
  draft: HarnessDraft.pipe(optional),
  trials: Schema.Array(Run),
}).annotate({ identifier: "Workflow.HarnessLab" })
export interface HarnessLab extends Schema.Schema.Type<typeof HarnessLab> {}

export const Tool = Schema.Struct({
  key: Schema.String.pipe(optional),
  server: Schema.String,
  name: Schema.String,
  description: Schema.String,
  inputSchema: Schema.Json,
}).annotate({ identifier: "Workflow.Tool" })
export interface Tool extends Schema.Schema.Type<typeof Tool> {}

export const Catalog = Schema.Struct({
  models: Schema.Array(
    Schema.Struct({
      ...Model.fields,
      name: Schema.String,
      vision: Schema.Boolean,
      toolcall: Schema.Boolean.pipe(optional),
      cost: Schema.Struct({
        input: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
        output: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
      }).pipe(optional),
    }),
  ),
  skills: Schema.Array(Schema.Struct({ name: Schema.String, description: Schema.String })),
  servers: Schema.Array(Schema.Struct({ name: Schema.String, status: Schema.String })),
  tools: Schema.Array(Tool),
  clefConfigured: Schema.Boolean,
  builtinTools: Schema.Array(Schema.String).pipe(optional),
}).annotate({ identifier: "Workflow.Catalog" })
export interface Catalog extends Schema.Schema.Type<typeof Catalog> {}

export const DemonstrationFrame = Schema.Struct({
  image: Schema.String.check(Schema.isPattern(/^data:image\/(png|jpeg|webp);base64,/), Schema.isMaxLength(3_000_000)),
  note: Schema.String.check(Schema.isMaxLength(4_000)),
}).annotate({ identifier: "Workflow.DemonstrationFrame" })
export interface DemonstrationFrame extends Schema.Schema.Type<typeof DemonstrationFrame> {}

export const TeachRequest = Schema.Struct({
  name: Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/), Schema.isMaxLength(80)),
  goal: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4_000)),
  model: Model,
  frames: Schema.Array(DemonstrationFrame).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
}).annotate({ identifier: "Workflow.TeachRequest" })
export interface TeachRequest extends Schema.Schema.Type<typeof TeachRequest> {}

export const SkillDraft = Schema.Struct({ name: Schema.String, content: Text }).annotate({
  identifier: "Workflow.SkillDraft",
})
export interface SkillDraft extends Schema.Schema.Type<typeof SkillDraft> {}
