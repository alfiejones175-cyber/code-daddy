import { describe, expect, test, vi } from "bun:test"
import {
  createDictationController,
  type DictationEvent,
  type DictationPlatform,
  type DictationState,
  type SpeechRecognition,
} from "./dictation"

function createNativePlatform() {
  const subscribers = new Set<(event: DictationEvent) => void>()
  const startCalls: Array<{ id: string; locale: string }> = []
  const stopCalls: string[] = []
  const cancelCalls: string[] = []
  const platform: DictationPlatform = {
    start: async (id, locale) => {
      startCalls.push({ id, locale })
    },
    stop: async (id) => {
      stopCalls.push(id)
    },
    cancel: async (id) => {
      cancelCalls.push(id)
    },
    subscribe: (callback) => {
      subscribers.add(callback)
      return () => subscribers.delete(callback)
    },
  }

  return {
    platform,
    startCalls,
    stopCalls,
    cancelCalls,
    emit: (event: DictationEvent) => subscribers.forEach((subscriber) => subscriber(event)),
    subscriber: () => subscribers.values().next().value as ((event: DictationEvent) => void) | undefined,
  }
}

function createRecognitionPlatform(input?: { throwStarts?: number }) {
  const instances: FakeRecognition[] = []
  let remainingThrows = input?.throwStarts ?? 0

  class FakeRecognition implements SpeechRecognition {
    lang = ""
    interimResults = true
    continuous = true
    startCalls = 0
    stopCalls = 0
    abortCalls = 0
    onstart: SpeechRecognition["onstart"] = null
    onresult: SpeechRecognition["onresult"] = null
    onerror: SpeechRecognition["onerror"] = null
    onend: SpeechRecognition["onend"] = null

    constructor() {
      instances.push(this)
    }

    start() {
      this.startCalls += 1
      if (remainingThrows === 0) return
      remainingThrows -= 1
      throw new Error("start failed")
    }

    stop() {
      this.stopCalls += 1
    }

    abort() {
      this.abortCalls += 1
    }
  }

  return { instances, recognition: () => FakeRecognition }
}

function createOutput() {
  const states: DictationState[] = []
  const finals: string[] = []
  const errors: string[] = []
  return {
    states,
    finals,
    errors,
    callbacks: {
      onState: (state: DictationState) => states.push(state),
      onFinal: (text: string) => finals.push(text),
      onError: (error: string) => errors.push(error),
    },
  }
}

describe("dictation controller", () => {
  test("prefers native dictation and flushes a final result while stopping", () => {
    const native = createNativePlatform()
    const browser = createRecognitionPlatform()
    const output = createOutput()
    const controller = createDictationController({
      native: native.platform,
      recognition: browser.recognition,
      locale: () => "pt-BR",
      ...output.callbacks,
    })

    controller.start()
    const id = native.startCalls[0]?.id
    expect(id).toBeString()
    expect(native.startCalls).toEqual([{ id, locale: "pt-BR" }])
    expect(browser.instances).toHaveLength(0)

    native.emit({ id: id!, type: "started" })
    controller.stop()
    native.emit({ id: id!, type: "result", text: " final words " })
    native.emit({ id: id!, type: "end" })

    expect(native.stopCalls).toEqual([id])
    expect(native.cancelCalls).toEqual([])
    expect(output.finals).toEqual(["final words"])
    expect(output.errors).toEqual([])
    expect(output.states).toEqual(["starting", "listening", "stopping", "idle"])
  })

  test("cancel discards stale native callbacks captured before unsubscribe", () => {
    const native = createNativePlatform()
    const output = createOutput()
    const controller = createDictationController({
      native: native.platform,
      locale: () => "en",
      ...output.callbacks,
    })

    controller.start()
    const id = native.startCalls[0]!.id
    const stale = native.subscriber()!
    native.emit({ id, type: "started" })
    controller.cancel()
    stale({ id, type: "result", text: "must not be inserted" })
    stale({ id, type: "error", error: "network" })
    stale({ id, type: "end" })

    expect(native.cancelCalls).toEqual([id])
    expect(output.finals).toEqual([])
    expect(output.errors).toEqual([])
    expect(output.states).toEqual(["starting", "listening", "idle"])
  })

  test("an old browser end callback cannot stop a newer recording", () => {
    const browser = createRecognitionPlatform()
    const output = createOutput()
    const controller = createDictationController({
      recognition: browser.recognition,
      locale: () => "en",
      ...output.callbacks,
    })

    controller.start()
    const first = browser.instances[0]!
    const staleEnd = first.onend!
    first.onstart?.()
    controller.cancel()

    controller.start()
    const second = browser.instances[1]!
    second.onstart?.()
    staleEnd()

    expect(output.states.at(-1)).toBe("listening")
    controller.stop()
    expect(second.stopCalls).toBe(1)
    second.onend?.()
    expect(output.states.at(-1)).toBe("idle")
  })

  test("deduplicates cumulative final browser results", () => {
    const browser = createRecognitionPlatform()
    const output = createOutput()
    const controller = createDictationController({
      recognition: browser.recognition,
      locale: () => "en",
      ...output.callbacks,
    })

    controller.start()
    const recognition = browser.instances[0]!
    recognition.onstart?.()
    recognition.onresult?.({
      resultIndex: 0,
      results: [{ 0: { transcript: "hello" }, isFinal: true }],
    })
    recognition.onresult?.({
      resultIndex: 0,
      results: [
        { 0: { transcript: "hello" }, isFinal: true },
        { 0: { transcript: "world" }, isFinal: true },
      ],
    })
    recognition.onend?.()

    expect(output.finals).toEqual(["hello", "world"])
    expect(output.states.at(-1)).toBe("idle")
  })

  test("returns to idle after a synchronous start error and can retry", () => {
    const browser = createRecognitionPlatform({ throwStarts: 1 })
    const output = createOutput()
    const controller = createDictationController({
      recognition: browser.recognition,
      locale: () => "en",
      ...output.callbacks,
    })

    controller.start()
    expect(browser.instances[0]?.abortCalls).toBe(1)
    expect(output.states).toEqual(["starting", "idle"])
    expect(output.errors).toEqual(["failed"])

    controller.start()
    const retry = browser.instances[1]!
    retry.onstart?.()
    expect(output.states.at(-1)).toBe("listening")
    controller.cancel()
  })

  test("times out startup and a stop that never ends", () => {
    vi.useFakeTimers()
    try {
      const browser = createRecognitionPlatform()
      const output = createOutput()
      const controller = createDictationController({
        recognition: browser.recognition,
        locale: () => "en",
        ...output.callbacks,
      })

      controller.start()
      vi.advanceTimersByTime(60_000)
      expect(output.errors).toEqual(["unavailable"])
      expect(output.states.at(-1)).toBe("idle")

      controller.start()
      const retry = browser.instances[1]!
      retry.onstart?.()
      controller.stop()
      vi.advanceTimersByTime(10_000)

      expect(output.errors).toEqual(["unavailable", "failed"])
      expect(output.states.at(-1)).toBe("idle")
      expect(retry.abortCalls).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
