import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Workflow } from "@opencode-ai/schema/workflow"
import { createMemo, For, Index, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import type { WorkflowApi } from "@/utils/workflow-api"
import { createWorkflowCapture } from "./capture"

export function WorkflowTeach(props: {
  catalog: Workflow.Catalog
  api: (signal: AbortSignal) => WorkflowApi
  onClose: () => void
  onSaved: () => void
}) {
  const language = useLanguage()
  const platform = usePlatform()
  const controller = new AbortController()
  const models = createMemo(() => props.catalog.models.filter((model) => model.vision))
  const [state, setState] = createStore({
    name: "",
    goal: "",
    model: "",
    frames: [] as Workflow.DemonstrationFrame[],
    sharing: false,
    busy: false,
    error: "",
    draft: undefined as Workflow.SkillDraft | undefined,
    saved: false,
  })
  let video: HTMLVideoElement | undefined
  let upload: HTMLInputElement | undefined
  const capture = createWorkflowCapture({
    video: () => video,
    request: () => navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }),
    changed: (sharing) => setState("sharing", sharing),
  })
  const stop = capture.stop
  onCleanup(() => {
    controller.abort()
    capture.dispose()
  })
  const share = () => {
    setState("error", "")
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setState("error", language.t("workflow.captureFailed"))
      return
    }
    void capture.start().catch(() => {
      if (!controller.signal.aborted) setState("error", language.t("workflow.captureFailed"))
    })
  }
  const addImage = (source: CanvasImageSource, width: number, height: number) => {
    if (state.frames.length >= 12 || controller.signal.aborted) return
    const canvas = document.createElement("canvas")
    const scale = Math.min(1, 1280 / Math.max(width, height))
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const context = canvas.getContext("2d")
    if (!context || !width || !height) {
      setState("error", language.t("workflow.imageFailed"))
      return
    }
    context.drawImage(source, 0, 0, canvas.width, canvas.height)
    setState("frames", [...state.frames, { image: canvas.toDataURL("image/jpeg", 0.8), note: "" }])
    setState({ draft: undefined, saved: false })
  }
  const readFile = async (file: File) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setState("error", language.t("workflow.imageFailed"))
      return
    }
    await createImageBitmap(file)
      .then((bitmap) => {
        addImage(bitmap, bitmap.width, bitmap.height)
        bitmap.close()
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error", language.t("workflow.imageFailed"))
      })
  }
  const chooseImages = () => {
    if (platform.openAttachmentPickerDialog) {
      void platform
        .openAttachmentPickerDialog({ multiple: true, extensions: ["png", "jpg", "jpeg", "webp"] }, readFile)
        .catch(() => setState("error", language.t("workflow.imageFailed")))
      return
    }
    upload?.click()
  }
  const generate = async () => {
    const model = models().find((item) => `${item.providerID}/${item.modelID}` === state.model)
    if (!model || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(state.name) || !state.goal.trim() || !state.frames.length) {
      setState("error", language.t("workflow.invalidSkill"))
      return
    }
    stop()
    setState({ busy: true, error: "", saved: false })
    await props
      .api(controller.signal)
      .teach({
        name: state.name,
        goal: state.goal,
        model: { providerID: model.providerID, modelID: model.modelID },
        frames: state.frames,
      })
      .then((draft) => {
        if (!controller.signal.aborted) setState("draft", draft)
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error", language.t("workflow.teachFailed"))
      })
    if (!controller.signal.aborted) setState("busy", false)
  }
  const save = async () => {
    if (!state.draft || !state.draft.content.trim()) return
    setState({ busy: true, error: "" })
    await props
      .api(controller.signal)
      .saveSkill(state.draft)
      .then(() => {
        if (controller.signal.aborted) return
        setState("saved", true)
        props.onSaved()
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error", language.t("workflow.actionFailed"))
      })
    if (!controller.signal.aborted) setState("busy", false)
  }
  return (
    <section class="workflow-teach" aria-label={language.t("workflow.teachTitle")}>
      <header class="workflow-section-heading">
        <h3>{language.t("workflow.teachTitle")}</h3>
        <ButtonV2 variant="neutral" onClick={props.onClose}>
          {language.t("workflow.closeTeach")}
        </ButtonV2>
      </header>
      <p class="workflow-hint">{language.t("workflow.teachHint")}</p>
      <Show when={state.error}>
        <p role="alert" class="workflow-error">
          {state.error}
        </p>
      </Show>
      <div class="workflow-teach-fields">
        <label class="workflow-field">
          {language.t("workflow.skillName")}
          <input
            value={state.name}
            maxLength={80}
            disabled={state.busy}
            onInput={(event) => setState("name", event.currentTarget.value)}
          />
          <span class="workflow-hint">{language.t("workflow.skillNameHint")}</span>
        </label>
        <label class="workflow-field">
          {language.t("workflow.model")}
          <select
            value={state.model}
            disabled={state.busy}
            onChange={(event) => setState("model", event.currentTarget.value)}
          >
            <option value="">{language.t("workflow.selectModel")}</option>
            <For each={models()}>
              {(model) => <option value={`${model.providerID}/${model.modelID}`}>{model.name}</option>}
            </For>
          </select>
        </label>
        <label class="workflow-field workflow-span">
          {language.t("workflow.skillGoal")}
          <textarea
            rows={2}
            maxLength={4000}
            value={state.goal}
            disabled={state.busy}
            onInput={(event) => setState("goal", event.currentTarget.value)}
          />
        </label>
      </div>
      <Show when={!models().length}>
        <p class="workflow-hint">{language.t("workflow.noVisionModels")}</p>
      </Show>
      <div class="workflow-actions">
        <ButtonV2 variant="neutral" disabled={state.busy} onClick={state.sharing ? stop : share}>
          {language.t(state.sharing ? "workflow.stopSharing" : "workflow.share")}
        </ButtonV2>
        <ButtonV2
          variant="neutral"
          disabled={!state.sharing || state.busy || state.frames.length >= 12}
          onClick={() => video && addImage(video, video.videoWidth, video.videoHeight)}
        >
          {language.t("workflow.capture")}
        </ButtonV2>
        <ButtonV2 variant="neutral" disabled={state.busy || state.frames.length >= 12} onClick={chooseImages}>
          {language.t("workflow.upload")}
        </ButtonV2>
      </div>
      <video
        ref={video}
        muted
        playsinline
        class="workflow-share-preview"
        style={{ display: state.sharing ? "block" : "none" }}
      />
      <input
        ref={upload}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={async (event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ""
          for (const file of files) await readFile(file)
        }}
      />
      <p class="workflow-hint">{language.t("workflow.captureLimit")}</p>
      <div class="workflow-frames">
        <Index each={state.frames}>
          {(frame, index) => (
            <div class="workflow-frame">
              <img src={frame().image} alt={language.t("workflow.framePreview", { number: index + 1 })} />
              <label class="workflow-field">
                {language.t("workflow.stepNumber", { number: index + 1 })}
                <textarea
                  rows={2}
                  maxLength={4000}
                  aria-label={language.t("workflow.frameNote")}
                  value={frame().note}
                  disabled={state.busy}
                  onInput={(event) =>
                    setState(
                      "frames",
                      state.frames.map((item, i) =>
                        i === index ? { ...item, note: event.currentTarget.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                class="workflow-text-button"
                disabled={state.busy}
                aria-label={language.t("workflow.removeFrame", { number: index + 1 })}
                onClick={() =>
                  setState(
                    "frames",
                    state.frames.filter((_, item) => item !== index),
                  )
                }
              >
                {language.t("workflow.removeStep")}
              </button>
            </div>
          )}
        </Index>
      </div>
      <ButtonV2 disabled={state.busy || !models().length || !state.frames.length} onClick={() => void generate()}>
        {language.t(state.busy && !state.draft ? "workflow.generating" : "workflow.generate")}
      </ButtonV2>
      <Show when={state.draft}>
        {(draft) => (
          <section class="workflow-draft">
            <h3>{language.t("workflow.reviewSkill")}</h3>
            <label class="workflow-field">
              {language.t("workflow.skillName")}
              <input
                value={draft().name}
                disabled={state.busy}
                onInput={(event) => setState("draft", { ...draft(), name: event.currentTarget.value })}
              />
            </label>
            <label class="workflow-field">
              {language.t("workflow.skillContent")}
              <textarea
                class="workflow-code"
                rows={15}
                value={draft().content}
                disabled={state.busy}
                onInput={(event) => setState("draft", { ...draft(), content: event.currentTarget.value })}
              />
            </label>
            <ButtonV2 disabled={state.busy || !draft().content.trim()} onClick={() => void save()}>
              {language.t("workflow.saveSkill")}
            </ButtonV2>
            <Show when={state.saved}>
              <p role="status" class="workflow-hint">
                {language.t("workflow.skillSaved")}
              </p>
            </Show>
          </section>
        )}
      </Show>
    </section>
  )
}
