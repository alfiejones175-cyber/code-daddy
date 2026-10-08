import { createHash } from "node:crypto"
import { REVIEW_RUBRIC_VERSION, reviewOutput } from "@opencode-ai/jev"
import { Session } from "@/session/session"
import { MessageV2 } from "@/session/message-v2"
import { MessageID, SessionID } from "@/session/schema"
import { Storage } from "@/storage/storage"
import { loadSettings } from "@opencode-ai/jev/settings"
import { Effect, Option, Schema } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { ReviewPayload, ReviewRecord } from "../groups/jev-review"
import * as SessionError from "./session-errors"

type Review = Awaited<ReturnType<typeof reviewOutput>>
const reviews = new Map<string, { promise: Promise<Review>; controller: AbortController; waiters: number }>()

export function reviewOnce(key: string, input: Parameters<typeof reviewOutput>[0], settings: Parameters<typeof reviewOutput>[1], signal: AbortSignal) {
  const existing = reviews.get(key)
  const entry = existing ?? (() => {
    const controller = new AbortController()
    const promise = reviewOutput(input, { ...settings, signal: controller.signal }).finally(() => {
      if (reviews.get(key)?.controller === controller) reviews.delete(key)
    })
    const created = { promise, controller, waiters: 0 }
    reviews.set(key, created)
    return created
  })()
  entry.waiters += 1
  let released = false
  const release = () => {
    if (released) return
    released = true
    entry.waiters -= 1
    if (entry.waiters === 0 && reviews.get(key) === entry) {
      reviews.delete(key)
      entry.controller.abort()
    }
  }
  signal.addEventListener("abort", release, { once: true })
  return entry.promise.finally(() => {
    signal.removeEventListener("abort", release)
    release()
  })
}

export const jevReviewHandlers = HttpApiBuilder.group(InstanceHttpApi, "jevReview", (handlers) =>
  Effect.gen(function* () {
    const session = yield* Session.Service
    const storage = yield* Storage.Service

    const source = Effect.fn("JevReviewHttpApi.source")(function* (params: {
      sessionID: SessionID
      messageID: MessageID
    }) {
      const owner = yield* SessionError.mapStorageNotFound(session.get(params.sessionID))
      const message = yield* SessionError.mapStorageNotFound(MessageV2.get(params))
      if (message.info.role !== "assistant" || typeof message.info.time.completed !== "number")
        return yield* new HttpApiError.BadRequest({})
      const response = message.parts
        .flatMap((part) => (part.type === "text" && !part.synthetic ? [part.text] : []))
        .filter(Boolean)
        .join("\n\n")
        .trim()
      if (!response) return yield* new HttpApiError.BadRequest({})
      return { owner, response, responseDigest: createHash("sha256").update(response).digest("hex") }
    })

    const read = Effect.fn("JevReviewHttpApi.read")(function* (params: { sessionID: SessionID; messageID: MessageID }) {
      const current = yield* source(params)
      const saved = yield* storage.read<unknown>(["jev-review", params.sessionID, params.messageID]).pipe(
        Effect.catchIf(Storage.NotFoundError.isInstance, () => Effect.succeed(undefined)),
        Effect.orDie,
      )
      const decoded = Schema.decodeUnknownOption(ReviewRecord)(saved)
      const review = Option.isSome(decoded) ? decoded.value : null
      return {
        status: review
          ? review.responseDigest === current.responseDigest
            ? ("reviewed" as const)
            : ("stale" as const)
          : ("not_reviewed" as const),
        responseDigest: current.responseDigest,
        review,
      }
    })

    const create = Effect.fn("JevReviewHttpApi.create")(function* (ctx: {
      params: { sessionID: SessionID; messageID: MessageID }
      payload: typeof ReviewPayload.Type
    }) {
      const current = yield* source(ctx.params)
      const settings = yield* Effect.promise(() => loadSettings().catch(() => ({ model: undefined })))
      const saved = yield* storage.read<unknown>(["jev-review", ctx.params.sessionID, ctx.params.messageID]).pipe(
        Effect.catchIf(Storage.NotFoundError.isInstance, () => Effect.succeed(undefined)),
        Effect.orDie,
      )
      const previous = Schema.decodeUnknownOption(ReviewRecord)(saved)
      const match = Option.isSome(previous) &&
        previous.value.result.status === "ok" &&
        previous.value.responseDigest === current.responseDigest &&
        previous.value.result.rubricVersion === REVIEW_RUBRIC_VERSION &&
        previous.value.result.model === (settings.model ?? "jev-1.13.0") &&
        JSON.stringify(previous.value.requirements) === JSON.stringify(ctx.payload.requirements) &&
        JSON.stringify(previous.value.evidence) === JSON.stringify(ctx.payload.evidence)
      if (match && Option.isSome(previous)) return {
        status: "reviewed" as const,
        responseDigest: current.responseDigest,
        review: previous.value,
      }
      const key = createHash("sha256").update(JSON.stringify({
        projectID: current.owner.projectID,
        sessionID: ctx.params.sessionID,
        messageID: ctx.params.messageID,
        responseDigest: current.responseDigest,
        requirements: ctx.payload.requirements,
        evidence: ctx.payload.evidence,
        rubric: REVIEW_RUBRIC_VERSION,
        model: settings.model ?? "jev-1.13.0",
      })).digest("hex")
      const result = yield* Effect.tryPromise((signal) => reviewOnce(key, {
        projectID: current.owner.projectID,
        sessionID: ctx.params.sessionID,
        messageID: ctx.params.messageID,
        requirements: ctx.payload.requirements,
        response: current.response,
        evidence: ctx.payload.evidence,
      }, settings, signal)).pipe(Effect.orDie)
      const review = {
        createdAt: Date.now(),
        responseDigest: current.responseDigest,
        requirements: ctx.payload.requirements,
        evidence: ctx.payload.evidence,
        result,
      }
      if (result.status === "ok" || Option.isNone(previous) || previous.value.result.status !== "ok")
        yield* storage.write(["jev-review", ctx.params.sessionID, ctx.params.messageID], review).pipe(Effect.orDie)
      const latest = yield* source(ctx.params)
      return {
        status: latest.responseDigest === current.responseDigest ? ("reviewed" as const) : ("stale" as const),
        responseDigest: latest.responseDigest,
        review,
      }
    })

    return handlers.handle("get", (ctx) => read(ctx.params)).handle("create", create)
  }),
)
