import { expect, test } from "bun:test"
import { createWorkflowCapture } from "./capture"

function media() {
  const track = new EventTarget()
  const state = { stopped: 0 }
  const stream = {
    getTracks: () => [
      {
        stop: () => {
          state.stopped += 1
        },
      },
    ],
    getVideoTracks: () => [track],
  } as unknown as MediaStream
  return { stream, track, state }
}

function video() {
  return { srcObject: null as HTMLVideoElement["srcObject"], play: async () => undefined }
}

test("closing teaching stops a display stream returned after the picker closes", async () => {
  const pending = Promise.withResolvers<MediaStream>()
  const display = video()
  const sharing: boolean[] = []
  const capture = createWorkflowCapture({
    video: () => display,
    request: () => pending.promise,
    changed: (value) => sharing.push(value),
  })
  const start = capture.start()
  capture.dispose()
  const late = media()
  pending.resolve(late.stream)
  await start
  expect(late.state.stopped).toBe(1)
  expect(display.srcObject).toBeNull()
  expect(sharing).not.toContain(true)
})

test("a newer display selection owns the preview when requests finish out of order", async () => {
  const first = Promise.withResolvers<MediaStream>()
  const second = Promise.withResolvers<MediaStream>()
  const requests = [first, second]
  const display = video()
  const capture = createWorkflowCapture({
    video: () => display,
    request: () => requests.shift()!.promise,
    changed: () => undefined,
  })
  const starts = [capture.start(), capture.start()]
  const newer = media()
  second.resolve(newer.stream)
  await starts[1]
  const older = media()
  first.resolve(older.stream)
  await starts[0]
  expect(display.srcObject).toBe(newer.stream)
  expect(older.state.stopped).toBe(1)
  expect(newer.state.stopped).toBe(0)
  capture.dispose()
  expect(newer.state.stopped).toBe(1)
})

test("ending sharing clears the preview and every display track", async () => {
  const source = media()
  const display = video()
  const sharing: boolean[] = []
  const capture = createWorkflowCapture({
    video: () => display,
    request: async () => source.stream,
    changed: (value) => sharing.push(value),
  })
  await capture.start()
  expect(display.srcObject).toBe(source.stream)
  expect(sharing.at(-1)).toBe(true)
  source.track.dispatchEvent(new Event("ended"))
  expect(source.state.stopped).toBe(1)
  expect(display.srcObject).toBeNull()
  expect(sharing.at(-1)).toBe(false)
  capture.dispose()
  expect(source.state.stopped).toBe(1)
})

test("a failed video preview releases the stream", async () => {
  const source = media()
  const display = {
    ...video(),
    play: async () => {
      throw new Error("Preview unavailable")
    },
  }
  const capture = createWorkflowCapture({
    video: () => display,
    request: async () => source.stream,
    changed: () => undefined,
  })
  await expect(capture.start()).rejects.toThrow("Preview unavailable")
  expect(source.state.stopped).toBe(1)
  expect(display.srcObject).toBeNull()
})
