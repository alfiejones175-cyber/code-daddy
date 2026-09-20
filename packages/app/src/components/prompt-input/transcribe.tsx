import { createEffect, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLocation } from "@solidjs/router"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import { getSpeechRecognitionCtor } from "@/utils/runtime-adapters"
import { createDictationController, type DictationState, type SpeechRecognition } from "@/utils/dictation"

export function createTranscription(input: { onFinal: (text: string) => void; lang?: () => string }) {
  const language = useLanguage()
  const platform = usePlatform()
  const [state, setState] = createStore({ phase: "idle" as DictationState, error: null as string | null })
  const controller = createDictationController({
    native: platform.dictation,
    // Electron exposes a Web Speech constructor without a working recognition service.
    recognition: () => (platform.platform === "web" ? getSpeechRecognitionCtor<SpeechRecognition>(window) : undefined),
    locale: () => input.lang?.() ?? language.intl(),
    onState: (phase) => {
      setState("phase", phase)
      if (phase === "starting") setState("error", null)
    },
    onFinal: input.onFinal,
    onError: (error) =>
      setState(
        "error",
        language.t(
          error === "unavailable" && !controller.supported() ? "transcribe.unsupported" : `transcribe.${error}`,
        ),
      ),
  })
  onCleanup(controller.cancel)
  return {
    ...controller,
    phase: () => state.phase,
    listening: () => state.phase !== "idle",
    error: () => state.error,
  }
}

export function TranscribeButton(props: { onFinal: (text: string) => void }) {
  const language = useLanguage()
  const location = useLocation()
  const prompt = usePrompt()
  const sdk = useSDK()
  const transcription = createTranscription({ onFinal: props.onFinal })
  // A reused composer must never receive speech recorded for the previous route.
  createEffect(() => {
    location.pathname
    location.search
    prompt.capture()
    sdk().directory
    transcription.cancel()
  })
  const label = () => (transcription.listening() ? language.t("transcribe.stop") : language.t("transcribe.start"))
  const status = () => {
    if (transcription.phase() === "starting") return language.t("transcribe.starting")
    if (transcription.phase() === "stopping") return language.t("transcribe.stopping")
    return language.t("transcribe.listening")
  }

  return (
    <div class="flex min-w-0 flex-wrap items-center justify-center gap-2" data-component="dictation">
      <Tooltip value={label()} placement="top">
        <IconButton
          icon="speech-bubble"
          variant="ghost"
          class="size-6 rounded-md"
          data-action="prompt-transcribe"
          aria-label={label()}
          aria-pressed={transcription.listening()}
          disabled={transcription.phase() === "stopping"}
          onClick={() => transcription.toggle()}
        />
      </Tooltip>
      <Show when={transcription.listening()}>
        <span class="text-12-regular text-text-weak" role="status">
          {status()}
        </span>
      </Show>
      <Show when={transcription.error()}>
        <span class="text-12-regular text-text-weak" role="alert">
          {transcription.error()}
        </span>
      </Show>
    </div>
  )
}
