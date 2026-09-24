import { createEffect, createMemo, createResource, onCleanup, Show, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"

export function WorkspaceLegacyMcp(props: ParentProps<{ directory: string; preset: "browser" | "xcode" }>) {
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServerSDK()
  const [state, setState] = createStore({ busy: false, failed: false, filepath: "" })
  const source = createMemo(() => {
    const sdk = server()
    if (sdk.protocolKind() !== "v1") return
    return { sdk, directory: props.directory }
  })
  const [status, actions] = createResource(
    source,
    async (input) =>
      (await input.sdk.createClient({ directory: input.directory, throwOnError: true }).mcp.status()).data ?? {},
  )
  createEffect(() => {
    const sdk = server()
    if (sdk.protocolKind() !== "v1") return
    const refresh = () => void actions.refetch()
    const stop = sdk.event.listen((event) => {
      const type: string = event.details.type
      if (type === "mcp.tools.changed" || type === "mcp.status.changed" || type === "config.updated") refresh()
    })
    window.addEventListener("focus", refresh)
    onCleanup(() => {
      stop()
      window.removeEventListener("focus", refresh)
    })
  })
  const connected = () => status()?.[props.preset]?.status === "connected"
  const error = () => {
    const value = status()?.[props.preset]
    return value?.status === "failed" ? value.error : undefined
  }
  const setup = async () => {
    if (!platform.legacyMcpPreset || state.busy) return
    setState({ busy: true, failed: false })
    await platform
      .legacyMcpPreset(props.directory, props.preset)
      .then(async (preset) => {
        await server().createClient({ directory: props.directory, throwOnError: true }).mcp.add({
          name: props.preset,
          config: preset.config,
        })
        setState("filepath", preset.filepath)
        await actions.refetch()
      })
      .catch(() => setState("failed", true))
    setState("busy", false)
  }

  return (
    <Show
      when={platform.legacyMcpPreset}
      fallback={<p class="text-12-regular text-text-weak">{language.t("workspaceTools.legacyDesktopOnly")}</p>}
    >
      <Show when={status.loading}>
        <p role="status" class="text-12-regular text-text-weak">
          {language.t("common.loading")}
        </p>
      </Show>
      <Show when={status.error || state.failed}>
        <p role="alert" class="text-12-regular text-text-weak">
          {language.t("workspaceTools.legacySetupFailed")}
        </p>
      </Show>
      <Show when={error()}>
        {(message) => (
          <p role="alert" class="break-all text-11-regular text-text-weak">
            {message()}
          </p>
        )}
      </Show>
      <Show when={!status.loading}>
        <Show
          when={connected()}
          fallback={
            <div class="flex flex-wrap items-center gap-2">
              <Button variant="secondary" disabled={state.busy} onClick={() => void setup()}>
                {language.t(state.busy ? "workspaceTools.legacyConnecting" : "workspaceTools.legacyConnect")}
              </Button>
              <p class="text-11-regular text-text-weak">{language.t("workspaceTools.legacyDescription")}</p>
            </div>
          }
        >
          <div class="flex flex-col gap-2">
            <p class="text-11-regular text-text-weak">{language.t("workspaceTools.legacyConnected")}</p>
            {props.children}
            <Show when={state.filepath}>
              {(filepath) => <code class="break-all text-11-regular text-text-weak">{filepath()}</code>}
            </Show>
          </div>
        </Show>
      </Show>
    </Show>
  )
}
