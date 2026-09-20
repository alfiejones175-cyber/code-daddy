export * as SessionRecovery from "./recovery"

import { SessionRecovery } from "@opencode-ai/schema"
import { and, desc, eq, gt, isNull } from "drizzle-orm"
import { Effect, Schema } from "effect"
import type { Database } from "../database/database"
import { MessageDecodeError } from "./error"
import { SessionMessage } from "./message"
import { SessionSchema } from "./schema"
import { SessionInputTable, SessionMessageTable } from "./sql"

type DatabaseService = Database.Interface["db"]

export const Status = SessionRecovery.Status
export type Status = SessionRecovery.Status

const decodeMessage = Schema.decodeUnknownEffect(SessionMessage.Message)

export const inspect = Effect.fn("SessionRecovery.inspect")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
) {
  const pending = yield* db
    .select({ delivery: SessionInputTable.delivery })
    .from(SessionInputTable)
    .where(and(eq(SessionInputTable.session_id, sessionID), isNull(SessionInputTable.promoted_seq)))
    .orderBy(desc(SessionInputTable.admitted_seq))
    .all()
    .pipe(Effect.orDie)
  const next = pending.find((input) => input.delivery === "steer") ?? pending[0]
  if (next) return SessionRecovery.Status.make({ type: "pending", delivery: next.delivery })

  const promoted = yield* db
    .select({ seq: SessionInputTable.promoted_seq })
    .from(SessionInputTable)
    .where(and(eq(SessionInputTable.session_id, sessionID), gt(SessionInputTable.promoted_seq, 0)))
    .orderBy(desc(SessionInputTable.promoted_seq))
    .get()
    .pipe(Effect.orDie)
  if (promoted?.seq === null || promoted?.seq === undefined) return SessionRecovery.Status.make({ type: "idle" })

  const row = yield* db
    .select()
    .from(SessionMessageTable)
    .where(
      and(
        eq(SessionMessageTable.session_id, sessionID),
        eq(SessionMessageTable.type, "assistant"),
        gt(SessionMessageTable.seq, promoted.seq),
      ),
    )
    .orderBy(desc(SessionMessageTable.seq))
    .get()
    .pipe(Effect.orDie)
  if (!row) return SessionRecovery.Status.make({ type: "needs_recovery", reason: "promoted_input" })

  const message = yield* decodeMessage({ ...row.data, id: row.id, type: row.type }).pipe(
    Effect.mapError(
      () =>
        new MessageDecodeError({
          sessionID,
          messageID: SessionMessage.ID.make(row.id),
        }),
    ),
  )
  if (message.type !== "assistant") return yield* Effect.die("Assistant query decoded to another message type")
  const unfinishedTool = message.content.some(
    (part) => part.type === "tool" && (part.state.status === "pending" || part.state.status === "running"),
  )
  if (unfinishedTool)
    return SessionRecovery.Status.make({ type: "needs_recovery", reason: "incomplete_tool", messageID: message.id })
  if (message.time.completed === undefined)
    return SessionRecovery.Status.make({
      type: "needs_recovery",
      reason: "incomplete_assistant",
      messageID: message.id,
    })
  const continuation =
    message.error === undefined &&
    message.finish === "tool-calls" &&
    message.content.some(
      (part) =>
        part.type === "tool" &&
        part.provider?.executed !== true &&
        (part.state.status === "completed" || part.state.status === "error"),
    )
  if (continuation)
    return SessionRecovery.Status.make({ type: "needs_recovery", reason: "continuation", messageID: message.id })
  return SessionRecovery.Status.make({ type: "idle" })
})
