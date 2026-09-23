import { For, Show, createEffect, createResource, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useCapabilities } from "@/hooks/use-capabilities"

export function SettingsCapabilities(props: { directory: Accessor<string | undefined>; hideTitle?: boolean }) {
  const language = useLanguage()
  const platform = usePlatform()
  const capabilities = useCapabilities(props.directory)
  const [state, setState] = createStore({
    busy: undefined as string | undefined,
    failed: false,
    error: undefined as string | undefined,
    name: "",
    url: "",
  })
  const [xcode] = createResource(() => platform.xcodeDetect?.().catch(() => undefined))
  createEffect(() => {
    props.directory()
    capabilities.scope()
    setState({ busy: undefined, failed: false, error: undefined })
  })
  const run = async (id: string, action: "test" | "reconnect" | "disconnect" | "remove" | "setup") => {
    const directory = props.directory()
    if (!directory || state.busy) return
    const scope = capabilities.scope()
    setState({ busy: id, failed: false, error: undefined })
    const api = capabilities.api()
    await (
      action === "setup" && (id === "browser" || id === "xcode" || id === "openai-docs" || id === "github")
        ? api.setup({ directory }, id)
        : action === "test"
          ? api.test({ directory }, id)
          : action === "disconnect"
            ? api.disconnect({ directory }, id)
            : action === "remove"
              ? api.remove({ directory }, id)
              : api.reconnect({ directory }, id)
    )
      .then((result) => {
        if (
          props.directory() === directory &&
          capabilities.scope() === scope &&
          (result.state === "failed" || result.error)
        )
          setState({ failed: true, error: result.error })
        void capabilities.refresh()
      })
      .catch(() => {
        if (props.directory() === directory && capabilities.scope() === scope) setState("failed", true)
      })
    if (props.directory() === directory && capabilities.scope() === scope) setState("busy", undefined)
  }
  const addRemote = async () => {
    const directory = props.directory()
    if (!directory || state.busy) return
    const scope = capabilities.scope()
    setState({ busy: "remote", failed: false, error: undefined })
    await capabilities
      .api()
      .addRemote({ directory }, { name: state.name, url: state.url })
      .then((result) => {
        if (props.directory() !== directory || capabilities.scope() !== scope) return
        if (result.state === "failed") setState({ failed: true, error: result.error })
        else setState({ name: "", url: "" })
        void capabilities.refresh()
      })
      .catch((error: unknown) => {
        if (props.directory() === directory && capabilities.scope() === scope)
          setState({ failed: true, error: error instanceof Error ? error.message : String(error) })
      })
    if (props.directory() === directory && capabilities.scope() === scope) setState("busy", undefined)
  }

  return (
    <section class="flex h-full min-h-0 flex-col gap-5 overflow-y-auto p-5" data-component="settings-capabilities">
      <header class="flex flex-col gap-2">
        <Show when={!props.hideTitle}>
          <h2 class="text-16-medium text-text-strong">{language.t("capabilities.title")}</h2>
        </Show>
        <p class="text-13-regular text-text-weak">{language.t("capabilities.description")}</p>
        <Show when={props.directory()}>
          {(directory) => <code class="break-all text-12-regular text-text-weak">{directory()}</code>}
        </Show>
      </header>
      <Show
        when={props.directory() && capabilities.supported()}
        fallback={
          <p class="text-13-regular text-text-weak">
            {language.t(props.directory() ? "capabilities.legacy" : "capabilities.chooseProject")}
          </p>
        }
      >
        <Show when={capabilities.loading()}>
          <div role="status" class="flex items-center gap-2">
            <Spinner class="size-4" />
            {language.t("common.loading")}
          </div>
        </Show>
        <Show when={state.failed || capabilities.failed()}>
          <div role="alert" class="flex flex-wrap items-center gap-3 text-13-regular text-text-weak">
            <p>{language.t("capabilities.loadFailed")}</p>
            <Show when={state.error}>{(error) => <p class="w-full break-words">{error()}</p>}</Show>
            <Button variant="secondary" onClick={() => void capabilities.refresh()}>
              {language.t("common.retry")}
            </Button>
          </div>
        </Show>
        <div class="flex flex-col divide-y divide-border-weak-base rounded-lg border border-border-weak-base">
          <For each={["browser", "xcode", "openai-docs", "github"] as const}>
            {(preset) => (
              <Show
                when={
                  !capabilities.loading() &&
                  !capabilities.failed() &&
                  !capabilities.list().some((item) => item.id === preset)
                }
              >
                <div class="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div class="min-w-0 flex-1">
                    <h3 class="text-14-medium text-text-strong">
                      {language.t(
                        preset === "browser"
                          ? "capabilities.browser"
                          : preset === "xcode"
                            ? "capabilities.xcode"
                            : preset === "openai-docs"
                              ? "capabilities.openaiDocs"
                              : "capabilities.github",
                      )}
                    </h3>
                    <p class="mt-1 text-13-regular text-text-weak">
                      {language.t(
                        preset === "browser"
                          ? "capabilities.browserDescription"
                          : preset === "xcode"
                            ? "capabilities.xcodeDescription"
                            : preset === "openai-docs"
                              ? "capabilities.openaiDocsDescription"
                              : "capabilities.githubDescription",
                      )}
                    </p>
                    <Show when={preset === "xcode" && xcode()}>
                      <p class="mt-2 text-12-regular text-text-weak">
                        {language.t(xcode()?.installed ? "capabilities.xcodeDetected" : "xcode.status.missing", {
                          version: xcode()?.version ?? "",
                        })}
                      </p>
                    </Show>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={!!state.busy}
                    onClick={() => void run(preset, "setup")}
                    data-action={`setup-${preset}`}
                  >
                    <Show when={state.busy === preset} fallback={language.t("capabilities.setup")}>
                      <Spinner class="size-4" />
                    </Show>
                  </Button>
                </div>
              </Show>
            )}
          </For>
          <For each={capabilities.list()}>
            {(item) => (
              <div class="flex flex-col gap-3 p-4" data-capability={item.id}>
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="flex min-w-0 flex-wrap items-center gap-2">
                    <Icon name="window-cursor" size="small" />
                    <h3 class="break-all text-14-medium text-text-strong">{item.name}</h3>
                    <span
                      class="rounded bg-surface-base-active px-2 py-0.5 text-12-regular text-text-weak"
                      data-state={item.state}
                    >
                      {language.t(`capabilities.state.${item.state}`)}
                    </span>
                  </div>
                  <div class="flex gap-2">
                    <Button variant="ghost" disabled={!!state.busy} onClick={() => void run(item.id, "test")}>
                      {language.t("capabilities.test")}
                    </Button>
                    <Show when={item.state === "available" || item.state === "connected"}>
                      <Button variant="ghost" disabled={!!state.busy} onClick={() => void run(item.id, "disconnect")}>
                        {language.t("capabilities.disconnect")}
                      </Button>
                    </Show>
                    <Button variant="secondary" disabled={!!state.busy} onClick={() => void run(item.id, "reconnect")}>
                      <Show when={state.busy === item.id} fallback={language.t("capabilities.reconnect")}>
                        <Spinner class="size-4" />
                      </Show>
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={!!state.busy}
                      onClick={() => {
                        if (!window.confirm(language.t("capabilities.removeConfirm", { name: item.name }))) return
                        void run(item.id, "remove")
                      }}
                    >
                      {language.t("capabilities.remove")}
                    </Button>
                  </div>
                </div>
                <Show when={item.error}>
                  {(error) => (
                    <p role="alert" class="break-words text-13-regular text-text-weak">
                      {error()}
                    </p>
                  )}
                </Show>
                <Show when={item.tools.length > 0}>
                  <details class="text-12-regular text-text-weak">
                    <summary class="cursor-pointer">
                      {language.t("capabilities.tools", { count: item.tools.length })}
                    </summary>
                    <ul class="mt-2 flex flex-col gap-1">
                      <For each={item.tools}>
                        {(tool) => (
                          <li class="break-words">
                            <code class="break-all">{tool.name}</code>
                            <Show when={tool.description}>
                              {(description) => <p class="mt-0.5">{description()}</p>}
                            </Show>
                          </li>
                        )}
                      </For>
                    </ul>
                  </details>
                </Show>
              </div>
            )}
          </For>
        </div>
        <form
          class="flex flex-col gap-3 rounded-lg border border-border-weak-base p-4"
          onSubmit={(event) => {
            event.preventDefault()
            void addRemote()
          }}
        >
          <h3 class="text-14-medium text-text-strong">{language.t("capabilities.addRemote")}</h3>
          <p class="text-13-regular text-text-weak">{language.t("capabilities.addRemoteDescription")}</p>
          <label class="flex flex-col gap-1 text-13-regular text-text-weak">
            {language.t("capabilities.serverName")}
            <input
              class="rounded border border-border-weak-base bg-surface-base p-2 text-text-strong"
              value={state.name}
              onInput={(event) => setState("name", event.currentTarget.value)}
              required
              pattern="[A-Za-z][A-Za-z0-9_-]{0,63}"
            />
          </label>
          <label class="flex flex-col gap-1 text-13-regular text-text-weak">
            {language.t("capabilities.serverUrl")}
            <input
              class="rounded border border-border-weak-base bg-surface-base p-2 text-text-strong"
              type="url"
              value={state.url}
              onInput={(event) => setState("url", event.currentTarget.value)}
              required
            />
          </label>
          <Button variant="secondary" type="submit" disabled={!!state.busy}>
            {language.t("capabilities.add")}
          </Button>
        </form>
      </Show>
    </section>
  )
}
