import { createEffect, For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { useLanguage } from "@/context/language"
import { usePlatform, type BrowserWorkspaceBounds, type BrowserWorkspaceDiagnostic } from "@/context/platform"

export function WorkspaceBrowserPreview(props: { url: string; valid: boolean; active: boolean }) {
  const platform = usePlatform()
  const language = useLanguage()
  const [state, setState] = createStore({
    open: false,
    busy: false,
    failed: false,
    image: undefined as string | undefined,
    captured: undefined as number | undefined,
    capturedUrl: undefined as string | undefined,
    currentUrl: undefined as string | undefined,
    diagnostics: [] as BrowserWorkspaceDiagnostic[],
  })
  let viewport: HTMLDivElement | undefined
  let disposed = false
  let wasActive = false
  let lastBounds = ""

  const bounds = (): BrowserWorkspaceBounds | undefined => {
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const clip = viewport.closest('[data-component="workspace-tools-scroll"]')?.getBoundingClientRect()
    const left = Math.max(rect.left, clip?.left ?? rect.left)
    const top = Math.max(rect.top, clip?.top ?? rect.top)
    const right = Math.min(rect.right, clip?.right ?? rect.right)
    const bottom = Math.min(rect.bottom, clip?.bottom ?? rect.bottom)
    if (right <= left || bottom <= top) return
    const zoom = platform.webviewZoom?.() ?? 1
    return {
      x: Math.round(left * zoom),
      y: Math.round(top * zoom),
      width: Math.round((right - left) * zoom),
      height: Math.round((bottom - top) * zoom),
    }
  }
  const updateBounds = () => {
    if (!state.open || !props.active || !platform.browserWorkspace) return
    const next = bounds()
    if (!next) return hide()
    if (!lastBounds) {
      lastBounds = `${next.x},${next.y},${next.width},${next.height}`
      void platform.browserWorkspace
        .show(next)
        .then((url) => setState("currentUrl", url))
        .catch(() => {
          lastBounds = ""
          setState("failed", true)
        })
      return
    }
    const key = `${next.x},${next.y},${next.width},${next.height}`
    if (key === lastBounds) return
    lastBounds = key
    void platform.browserWorkspace.setBounds(next).catch(() => setState("failed", true))
  }
  const hide = () => {
    if (!platform.browserWorkspace) return
    lastBounds = ""
    void platform.browserWorkspace.hide().catch(() => {})
  }
  const open = async () => {
    if (!platform.browserWorkspace || !props.valid || state.busy) return
    const next = bounds()
    if (!next) return
    setState({ busy: true, failed: false })
    lastBounds = `${next.x},${next.y},${next.width},${next.height}`
    await platform.browserWorkspace
      .navigate(props.url.trim(), next)
      .then((url) => {
        if (disposed || !props.active) {
          hide()
          return
        }
        setState({ open: true, image: undefined, capturedUrl: undefined, currentUrl: url, diagnostics: [] })
      })
      .catch(() => {
        hide()
        if (!disposed) setState({ open: false, failed: true })
      })
    if (!disposed) setState("busy", false)
  }
  const capture = async () => {
    if (!platform.browserWorkspace || !state.open || state.busy) return
    setState({ busy: true, failed: false })
    await platform.browserWorkspace
      .capture()
      .then(async (image) => {
        const url = await platform.browserWorkspace?.currentURL()
        if (!disposed)
          setState({
            image,
            captured: Date.now(),
            capturedUrl: url ?? state.currentUrl,
            currentUrl: url ?? state.currentUrl,
          })
      })
      .catch(() => setState("failed", true))
    if (!disposed) setState("busy", false)
  }
  const diagnostics = async () => {
    if (!platform.browserWorkspace || !state.open) return
    await Promise.all([platform.browserWorkspace.currentURL(), platform.browserWorkspace.diagnostics()])
      .then(([url, items]) => {
        if (!disposed) setState({ currentUrl: url ?? state.currentUrl, diagnostics: items })
      })
      .catch(() => setState("failed", true))
  }

  onMount(() => {
    const observer = new ResizeObserver(updateBounds)
    if (viewport) observer.observe(viewport)
    if (viewport?.parentElement) observer.observe(viewport.parentElement)
    const dialogBody = viewport?.closest('[data-component="workspace-tools-scroll"]')
    if (dialogBody instanceof HTMLElement) observer.observe(dialogBody)
    const mutations = new MutationObserver(() => requestAnimationFrame(updateBounds))
    if (dialogBody) mutations.observe(dialogBody, { attributes: true, childList: true, subtree: true })
    window.addEventListener("resize", updateBounds)
    window.addEventListener("scroll", updateBounds, true)
    const urlTimer = window.setInterval(() => {
      if (!state.open || !props.active || !platform.browserWorkspace) return
      void platform.browserWorkspace
        .currentURL()
        .then((url) => {
          if (disposed || !url || url === state.currentUrl) return
          setState({ currentUrl: url, diagnostics: [] })
        })
        .catch(() => {})
    }, 1500)
    onCleanup(() => {
      disposed = true
      observer.disconnect()
      mutations.disconnect()
      window.removeEventListener("resize", updateBounds)
      window.removeEventListener("scroll", updateBounds, true)
      window.clearInterval(urlTimer)
      void platform.browserWorkspace?.close().catch(() => {})
    })
  })
  createEffect(() => {
    const active = props.active
    if (!active) {
      hide()
    } else if (!wasActive && state.open) {
      updateBounds()
    }
    wasActive = active
  })

  return (
    <section class="flex min-h-0 flex-col gap-2" aria-label={language.t("workspaceTools.previewTitle")}>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-13-medium text-text-strong">{language.t("workspaceTools.previewTitle")}</h3>
          <p class="text-11-regular text-text-weak">{language.t("workspaceTools.previewDescription")}</p>
        </div>
        <Show
          when={platform.browserWorkspace}
          fallback={
            <span class="text-12-regular text-text-weak">{language.t("workspaceTools.previewDesktopOnly")}</span>
          }
        >
          <div class="flex flex-wrap gap-1.5">
            <Button size="small" disabled={!props.valid || state.busy} onClick={() => void open()}>
              {state.open ? language.t("workspaceTools.previewReload") : language.t("workspaceTools.previewOpen")}
            </Button>
            <Button
              size="small"
              variant="secondary"
              disabled={!state.open || state.busy}
              onClick={() => void capture()}
            >
              {language.t("workspaceTools.previewCapture")}
            </Button>
            <Button
              size="small"
              variant="ghost"
              disabled={!state.open}
              onClick={() => {
                void platform.browserWorkspace?.close()
                setState({ open: false, currentUrl: undefined, diagnostics: [] })
                lastBounds = ""
              }}
            >
              {language.t("workspaceTools.previewClose")}
            </Button>
          </div>
        </Show>
      </div>
      <Show when={platform.browserWorkspace}>
        <Show when={state.currentUrl}>
          {(url) => (
            <p class="break-all text-11-regular text-text-weak">
              {language.t("workspaceTools.previewViewing", { url: url() })}
            </p>
          )}
        </Show>
        <div
          ref={viewport}
          class="relative h-52 w-full overflow-hidden rounded-md border border-border-weak-base bg-background-base"
        >
          <Show when={!state.open}>
            <div class="flex size-full items-center justify-center px-4 text-center text-12-regular text-text-weak">
              {language.t("workspaceTools.previewEmpty")}
            </div>
          </Show>
        </div>
      </Show>
      <Show when={state.failed}>
        <p role="alert" class="text-12-regular text-text-weak">
          {language.t("workspaceTools.previewFailed")}
        </p>
      </Show>
      <Show when={state.image}>
        {(image) => (
          <details class="rounded-md border border-border-weak-base p-2">
            <summary class="cursor-pointer text-12-medium text-text-strong">
              {language.t("workspaceTools.previewCaptured", {
                time: new Date(state.captured ?? 0).toLocaleTimeString(),
              })}
            </summary>
            <p class="mt-1 break-all text-11-regular text-text-weak">{state.capturedUrl}</p>
            <img
              src={image()}
              alt={language.t("workspaceTools.previewTitle")}
              class="mt-2 max-h-48 w-full object-contain"
            />
          </details>
        )}
      </Show>
      <Show when={state.open}>
        <div class="flex items-center justify-between">
          <span class="break-all text-12-medium text-text-strong">
            {language.t("workspaceTools.previewDiagnosticsFor", { url: state.currentUrl ?? "" })}
          </span>
          <Button size="small" variant="ghost" onClick={() => void diagnostics()}>
            {language.t("workspaceTools.previewDiagnostics")}
          </Button>
        </div>
        <Show
          when={state.diagnostics.length > 0}
          fallback={<p class="text-11-regular text-text-weak">{language.t("workspaceTools.previewNoDiagnostics")}</p>}
        >
          <div class="max-h-24 overflow-auto rounded-md border border-border-weak-base p-2">
            <For each={state.diagnostics}>
              {(item) => (
                <p class="break-all text-11-regular text-text-weak">
                  {item.kind}: {item.message}
                </p>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </section>
  )
}
