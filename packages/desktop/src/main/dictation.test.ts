import { describe, expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import type { ChildProcessWithoutNullStreams } from "node:child_process"
import type { WebContents } from "electron"
import { createDictationBridge } from "./dictation"

function child() {
  const result = new EventEmitter() as EventEmitter & Partial<ChildProcessWithoutNullStreams>
  result.stdin = new PassThrough()
  result.stdout = new PassThrough()
  result.stderr = new PassThrough()
  let killed = false
  result.kill = () => {
    killed = true
    return true
  }
  return { child: result as ChildProcessWithoutNullStreams, killed: () => killed }
}

function sender() {
  const events: unknown[] = []
  const result = new EventEmitter() as EventEmitter & Partial<WebContents>
  result.isDestroyed = () => false
  result.send = (_channel, event) => events.push(event)
  return { sender: result as WebContents, events }
}

describe("dictation bridge", () => {
  test("preserves speech characters split across stdout chunks", async () => {
    const process = child()
    const bridge = createDictationBridge({
      helper: "/dictation",
      exists: () => true,
      platform: "darwin",
      spawn: () => process.child,
    })
    const current = sender()
    await bridge.start(current.sender, "unicode", "pt-BR")
    const payload = Buffer.from('{"id":"unicode","type":"result","text":"olá 世界"}\n')
    const split = payload.indexOf(Buffer.from("á")) + 1
    process.child.stdout.write(payload.subarray(0, split))
    process.child.stdout.write(payload.subarray(split))
    expect(current.events).toEqual([{ id: "unicode", type: "result", text: "olá 世界" }])
    bridge.clear()
  })

  test("forwards only matching helper events and reports busy sessions", async () => {
    const process = child()
    const bridge = createDictationBridge({
      helper: "/dictation",
      exists: () => true,
      platform: "darwin",
      spawn: () => process.child,
    })
    const first = sender()
    const second = sender()

    await bridge.start(first.sender, "first", "en-US")
    process.child.stdout.write('{"id":"wrong","type":"result","text":"ignore"}\n')
    process.child.stdout.write('{"id":"first","type":"started"}\n')
    await bridge.start(second.sender, "second", "en-US")

    expect(first.events).toEqual([{ id: "first", type: "started" }])
    expect(second.events).toEqual([
      { id: "second", type: "error", error: "busy" },
      { id: "second", type: "end" },
    ])
    await bridge.cancel(first.sender, "first")
    expect(first.events).toEqual([
      { id: "first", type: "started" },
      { id: "first", type: "end" },
    ])
  })

  test("kills broken helpers and ignores events after their end or malformed output", async () => {
    const process = child()
    const bridge = createDictationBridge({
      helper: "/dictation",
      exists: () => true,
      platform: "darwin",
      spawn: () => process.child,
    })
    const current = sender()
    await bridge.start(current.sender, "first", "en-US")
    process.child.stdout.write('{"id":"first","type":"end"}\n{"id":"first","type":"result","text":"late"}\n')
    expect(current.events).toEqual([{ id: "first", type: "end" }])

    await bridge.start(current.sender, "second", "en-US")
    process.child.stdout.write('not-json\n{"id":"second","type":"result","text":"late"}\n')
    expect(current.events).toEqual([
      { id: "first", type: "end" },
      { id: "second", type: "error", error: "failed" },
      { id: "second", type: "end" },
    ])

    const broken = child()
    const next = createDictationBridge({
      helper: "/dictation",
      exists: () => true,
      platform: "darwin",
      spawn: () => broken.child,
    })
    await next.start(current.sender, "third", "en-US")
    broken.child.stdin.emit("error", new Error("EPIPE"))
    expect(broken.killed()).toBe(true)
    expect(current.events).toEqual([
      { id: "first", type: "end" },
      { id: "second", type: "error", error: "failed" },
      { id: "second", type: "end" },
      { id: "third", type: "error", error: "failed" },
      { id: "third", type: "end" },
    ])
  })
})
