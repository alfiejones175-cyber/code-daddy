import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { SessionHistoryQuery, SessionsCursor, SessionsQuery } from "../src/groups/session"
import { Session } from "@opencode-ai/schema/session"

describe("SessionsCursor", () => {
  test("decodes the root-only null query string", () => {
    expect(Schema.decodeUnknownSync(Schema.toCodecStringTree(SessionsQuery))({ parentID: "null" })).toMatchObject({
      parentID: null,
    })
  })
  test("retains an explicit root-only parent filter", async () => {
    const input = { parentID: null, anchor: { id: Session.ID.make("ses_root"), time: 1, direction: "next" as const } }
    expect(await Effect.runPromise(SessionsCursor.parse(SessionsCursor.make(input)))).toEqual(input)
  })
  test("round trips without Node globals", async () => {
    const input = {
      workspace: undefined,
      search: "protocol",
      parentID: Session.ID.make("ses_parent"),
      order: "desc" as const,
      anchor: { id: Session.ID.make("ses_test"), time: 1, direction: "next" as const },
    }
    const cursor = SessionsCursor.make(input)

    expect(await Effect.runPromise(SessionsCursor.parse(cursor))).toEqual(input)
  })
})

describe("SessionHistoryQuery", () => {
  test("decodes numeric paging inputs", async () => {
    const query = await Effect.runPromise(Schema.decodeUnknownEffect(SessionHistoryQuery)({ after: "3", limit: "10" }))

    expect(query).toEqual({ after: 3, limit: 10 })
  })
})
