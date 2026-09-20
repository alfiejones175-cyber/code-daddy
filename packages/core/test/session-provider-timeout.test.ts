import { describe, expect } from "bun:test"
import { Cause, Duration, Effect, Exit, Fiber, Stream } from "effect"
import { TestClock } from "effect/testing"
import { ProviderTimeoutError } from "@opencode-ai/core/session/runner"
import { withProviderTimeouts } from "@opencode-ai/core/session/runner/llm"
import { it } from "./lib/effect"

const timeout = (stream: Stream.Stream<string>) =>
  withProviderTimeouts(stream, { firstEventMs: 100, inactivityMs: 250 })

const failure = (exit: Exit.Exit<unknown, unknown>) => {
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isSuccess(exit)) throw new Error("Expected stream failure")
  return Cause.squash(exit.cause)
}

describe("Session provider watchdog", () => {
  it.effect("fails when the provider sends no first event", () =>
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(Stream.runCollect(timeout(Stream.never)).pipe(Effect.exit))
      yield* TestClock.adjust(Duration.millis(100))
      const error = failure(yield* Fiber.join(fiber))
      expect(error).toBeInstanceOf(ProviderTimeoutError)
      expect(error).toMatchObject({ phase: "first_event", timeoutMs: 100 })
    }),
  )

  it.effect("resets to the inactivity deadline after the first event", () =>
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        Stream.runCollect(timeout(Stream.concat(Stream.make("ready"), Stream.never))).pipe(Effect.exit),
      )
      yield* Effect.yieldNow
      yield* TestClock.adjust(Duration.millis(250))
      const error = failure(yield* Fiber.join(fiber))
      expect(error).toBeInstanceOf(ProviderTimeoutError)
      expect(error).toMatchObject({ phase: "inactivity", timeoutMs: 250 })
    }),
  )
})
