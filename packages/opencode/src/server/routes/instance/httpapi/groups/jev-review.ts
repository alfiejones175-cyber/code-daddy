import { ReviewInput, ReviewResult } from "@opencode-ai/jev"
import { MessageID, SessionID } from "@/session/schema"
import { Schema, Struct } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { ApiNotFoundError } from "../errors"

export const ReviewPayload = Schema.Struct(
  Struct.omit(ReviewInput.fields, ["projectID", "sessionID", "messageID", "response"]),
)
export const ReviewRecord = Schema.Struct({
  createdAt: Schema.Int,
  responseDigest: Schema.String,
  requirements: ReviewPayload.fields.requirements,
  evidence: ReviewPayload.fields.evidence,
  result: ReviewResult,
})
export type ReviewRecord = typeof ReviewRecord.Type

export const ReviewState = Schema.Struct({
  status: Schema.Literals(["not_reviewed", "reviewed", "stale"]),
  responseDigest: Schema.String,
  review: Schema.NullOr(ReviewRecord),
})

export const JevReviewPath = "/session/:sessionID/jev-review/:messageID"
const params = { sessionID: SessionID, messageID: MessageID }

export const JevReviewApi = HttpApi.make("jevReview").add(
  HttpApiGroup.make("jevReview")
    .add(
      HttpApiEndpoint.get("get", JevReviewPath, {
        params,
        query: WorkspaceRoutingQuery,
        success: ReviewState,
        error: [HttpApiError.BadRequest, ApiNotFoundError],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "session.jevReview.get",
          summary: "Get response review",
          description: "Get the saved advisory review for a completed assistant response.",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.post("create", JevReviewPath, {
        params,
        query: WorkspaceRoutingQuery,
        payload: ReviewPayload,
        success: ReviewState,
        error: [HttpApiError.BadRequest, ApiNotFoundError],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "session.jevReview.create",
          summary: "Review completed response",
          description:
            "Send explicit requirements and supplied evidence to Jev for advisory review of one completed response.",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "jevReview", description: "Advisory response review." }))
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization),
)
