export type DictationError = "permission" | "unavailable" | "network" | "no-speech" | "busy" | "failed"

export type DictationEvent = { id: string } & (
  | { type: "started" }
  | { type: "result"; text: string }
  | { type: "error"; error: DictationError }
  | { type: "end" }
)

export type DictationPlatform = {
  start: (id: string, locale: string) => Promise<void>
  stop: (id: string) => Promise<void>
  cancel: (id: string) => Promise<void>
  subscribe: (callback: (event: DictationEvent) => void) => () => void
}

export type DictationState = "idle" | "starting" | "listening" | "stopping"

export type SpeechRecognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onstart: (() => void) | null
  onresult:
    | ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void)
    | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

type DictationSession = {
  id: string
  state: DictationState
  recognition?: SpeechRecognition
  unsubscribe?: () => void
  timer?: ReturnType<typeof setTimeout>
  finalized: Set<number>
}

export function createDictationController(input: {
  native?: DictationPlatform
  recognition?: () => (new () => SpeechRecognition) | undefined
  locale: () => string
  onState: (state: DictationState) => void
  onFinal: (text: string) => void
  onError: (error: DictationError) => void
}) {
  let active: DictationSession | undefined

  const release = (cancel: boolean) => {
    const session = active
    if (!session) return
    active = undefined
    clearTimeout(session.timer)
    session.unsubscribe?.()
    if (session.recognition) {
      session.recognition.onstart = null
      session.recognition.onresult = null
      session.recognition.onerror = null
      session.recognition.onend = null
      if (cancel) {
        // Browser implementations may throw if recognition has already ended.
        try {
          session.recognition.abort()
        } catch {
          /* already stopped */
        }
      }
    }
    if (cancel) void input.native?.cancel(session.id).catch(() => undefined)
    input.onState("idle")
  }

  const fail = (id: string, error: DictationError) => {
    if (active?.id !== id) return
    release(true)
    input.onError(error)
  }

  const receive = (event: DictationEvent) => {
    if (active?.id !== event.id) return
    if (event.type === "error") return fail(event.id, event.error)
    if (event.type === "end") return release(false)
    if (event.type === "result") {
      const text = event.text.trim()
      if (text) input.onFinal(text)
      return
    }
    if (active.state !== "starting") return
    clearTimeout(active.timer)
    active.state = "listening"
    input.onState("listening")
  }

  const stop = () => {
    const session = active
    if (!session || session.state === "stopping") return
    session.state = "stopping"
    input.onState("stopping")
    clearTimeout(session.timer)
    session.timer = setTimeout(() => fail(session.id, "failed"), 10_000)
    if (input.native) {
      void input.native.stop(session.id).catch(() => fail(session.id, "failed"))
      return
    }
    try {
      session.recognition?.stop()
    } catch {
      fail(session.id, "failed")
    }
  }

  const start = () => {
    if (active) return
    const ctor = input.recognition?.()
    if (!input.native && !ctor) return input.onError("unavailable")
    const session: DictationSession = {
      id: crypto.randomUUID(),
      state: "starting",
      finalized: new Set(),
    }
    active = session
    input.onState("starting")
    session.timer = setTimeout(() => fail(session.id, "unavailable"), 60_000)
    if (input.native) {
      session.unsubscribe = input.native.subscribe(receive)
      void input.native.start(session.id, input.locale()).catch(() => fail(session.id, "failed"))
      return
    }
    try {
      const recognition = new ctor!()
      session.recognition = recognition
      recognition.lang = input.locale()
      recognition.interimResults = false
      recognition.continuous = false
      recognition.onstart = () => receive({ id: session.id, type: "started" })
      recognition.onend = () => receive({ id: session.id, type: "end" })
      recognition.onerror = (event) => fail(session.id, speechError(event.error))
      recognition.onresult = (event) => {
        if (active !== session) return
        const text = Array.from(event.results)
          .flatMap((result, index) => {
            if (index < (event.resultIndex ?? 0) || !result.isFinal || session.finalized.has(index)) return []
            session.finalized.add(index)
            return [result[0].transcript]
          })
          .join(" ")
        receive({ id: session.id, type: "result", text })
      }
      recognition.start()
    } catch {
      fail(session.id, "failed")
    }
  }

  return {
    start,
    stop,
    toggle: () => (active ? stop() : start()),
    cancel: () => release(true),
    supported: () => !!input.native || !!input.recognition?.(),
  }
}

function speechError(error: string): DictationError {
  if (error === "not-allowed" || error === "service-not-allowed" || error === "audio-capture") return "permission"
  if (error === "network" || error === "no-speech") return error
  if (error === "language-not-supported") return "unavailable"
  return "failed"
}
