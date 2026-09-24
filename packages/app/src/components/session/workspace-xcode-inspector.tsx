import { createEffect, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { useLanguage } from "@/context/language"
import { usePlatform, type XcodeSimulator, type XcodeWorkspaceInfo } from "@/context/platform"

export function WorkspaceXcodeInspector(props: { directory: string; active: boolean }) {
  const platform = usePlatform()
  const language = useLanguage()
  const [state, setState] = createStore({
    busy: false,
    failed: false,
    captureFailed: false,
    project: undefined as XcodeWorkspaceInfo | undefined,
    simulators: [] as XcodeSimulator[],
    selected: "",
    image: undefined as string | undefined,
    captured: undefined as number | undefined,
    capturedDevice: undefined as string | undefined,
  })
  let loaded = false
  const refresh = async () => {
    if (!platform.xcodeWorkspaceInspect || !platform.xcodeWorkspaceSimulators || state.busy) return
    setState({ busy: true, failed: false, image: undefined, capturedDevice: undefined })
    const results = await Promise.allSettled([
      platform.xcodeWorkspaceInspect(props.directory),
      platform.xcodeWorkspaceSimulators(),
    ] as const)
    if (results[0].status === "fulfilled") setState("project", results[0].value)
    else setState({ project: undefined, failed: true })
    if (results[1].status === "fulfilled") {
      setState("simulators", results[1].value)
      if (!results[1].value.some((device) => device.udid === state.selected))
        setState("selected", results[1].value.find((device) => device.state === "Booted")?.udid ?? "")
    } else {
      setState({ simulators: [], selected: "", failed: true })
    }
    setState("busy", false)
  }
  const capture = async () => {
    if (!platform.xcodeWorkspaceCapture || !state.selected || state.busy) return
    const device = state.simulators.find((item) => item.udid === state.selected)
    setState({ busy: true, captureFailed: false })
    await platform
      .xcodeWorkspaceCapture(state.selected)
      .then((image) => setState({ image, captured: Date.now(), capturedDevice: device?.name }))
      .catch(() => setState("captureFailed", true))
    setState("busy", false)
  }
  createEffect(() => {
    if (!props.active || loaded) return
    loaded = true
    void refresh()
  })

  return (
    <section
      class="flex flex-col gap-3 rounded-md border border-border-weak-base p-3"
      aria-label={language.t("workspaceTools.xcodeProject")}
    >
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-13-medium text-text-strong">{language.t("workspaceTools.xcodeProject")}</h3>
        <Button size="small" variant="ghost" disabled={state.busy} onClick={() => void refresh()}>
          {language.t("workspaceTools.xcodeRefresh")}
        </Button>
      </div>
      <Show when={!platform.xcodeWorkspaceInspect}>
        <p class="text-12-regular text-text-weak">{language.t("workspaceTools.previewDesktopOnly")}</p>
      </Show>
      <Show when={state.failed}>
        <p role="alert" class="text-12-regular text-text-weak">
          {language.t("workspaceTools.xcodeInspectFailed")}
        </p>
      </Show>
      <Show when={state.project}>
        {(project) => (
          <div class="grid gap-2 text-12-regular text-text-weak sm:grid-cols-2">
            <div>
              <p class="text-12-medium text-text-strong">{language.t("workspaceTools.xcodeProject")}</p>
              <Show
                when={project().projects.length > 0}
                fallback={<p>{language.t("workspaceTools.xcodeProjectNone")}</p>}
              >
                <For each={project().projects}>{(item) => <p class="break-all">{item.name}</p>}</For>
              </Show>
            </div>
            <div>
              <p class="text-12-medium text-text-strong">{language.t("workspaceTools.xcodeSchemes")}</p>
              <p class="break-words">{project().schemes.join(", ") || "—"}</p>
              <p class="mt-2 text-12-medium text-text-strong">{language.t("workspaceTools.xcodeTargets")}</p>
              <p class="break-words">{project().targets.join(", ") || "—"}</p>
            </div>
          </div>
        )}
      </Show>
      <div class="flex flex-col gap-2 border-t border-border-weak-base pt-2">
        <label for="workspace-xcode-simulator" class="text-12-medium text-text-strong">
          {language.t("workspaceTools.xcodeSimulators")}
        </label>
        <Show
          when={state.simulators.length > 0}
          fallback={<p class="text-12-regular text-text-weak">{language.t("workspaceTools.xcodeNoSimulators")}</p>}
        >
          <div class="flex flex-wrap items-center gap-2">
            <select
              id="workspace-xcode-simulator"
              class="min-w-0 flex-1 rounded border border-border-weak-base bg-background-base px-2 py-1 text-12-regular text-text-strong"
              value={state.selected}
              onChange={(event) =>
                setState({ selected: event.currentTarget.value, image: undefined, capturedDevice: undefined })
              }
            >
              <For each={state.simulators}>
                {(device) => (
                  <option value={device.udid}>
                    {device.name} · {device.state} · {device.runtime}
                  </option>
                )}
              </For>
            </select>
            <Button
              size="small"
              variant="secondary"
              disabled={
                !state.simulators.some((device) => device.udid === state.selected && device.state === "Booted") ||
                state.busy
              }
              onClick={() => void capture()}
            >
              {language.t("workspaceTools.xcodeCapture")}
            </Button>
          </div>
        </Show>
        <Show when={state.captureFailed}>
          <p role="alert" class="text-12-regular text-text-weak">
            {language.t("workspaceTools.xcodeCaptureFailed")}
          </p>
        </Show>
        <Show when={state.image}>
          {(image) => (
            <details class="rounded-md border border-border-weak-base p-2">
              <summary class="cursor-pointer text-12-medium text-text-strong">
                {language.t("workspaceTools.xcodeCapturedDevice", {
                  device: state.capturedDevice ?? "",
                  time: new Date(state.captured ?? 0).toLocaleTimeString(),
                })}
              </summary>
              <img
                src={image()}
                alt={language.t("workspaceTools.xcodeSimulators")}
                class="mt-2 max-h-48 w-full object-contain"
              />
            </details>
          )}
        </Show>
      </div>
    </section>
  )
}
