// Own display streams independently of the view so a late picker result cannot
// resume screen sharing after the teaching panel has closed.
export function createWorkflowCapture(input: {
  video: () => Pick<HTMLVideoElement, "srcObject" | "play"> | undefined
  request: () => Promise<MediaStream>
  changed: (sharing: boolean) => void
}) {
  let stream: MediaStream | undefined
  let generation = 0
  let disposed = false
  const release = () => {
    stream?.getTracks().forEach((track) => track.stop())
    stream = undefined
    const video = input.video()
    if (video) video.srcObject = null
    input.changed(false)
  }
  const stop = () => {
    generation += 1
    release()
  }
  return {
    stop,
    dispose: () => {
      disposed = true
      stop()
    },
    start: async () => {
      if (disposed) return
      const current = ++generation
      const media = await input.request()
      if (disposed || current !== generation) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      release()
      const video = input.video()
      if (!video) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      stream = media
      video.srcObject = media
      media.getVideoTracks()[0]?.addEventListener(
        "ended",
        () => {
          if (stream === media) stop()
        },
        { once: true },
      )
      await video.play().catch((error: unknown) => {
        if (stream === media) stop()
        throw error
      })
      if (!disposed && current === generation) input.changed(true)
    },
  }
}
