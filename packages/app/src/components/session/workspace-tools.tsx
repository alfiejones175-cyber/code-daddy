import { createMemo, For, Show, type Component } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { Tabs } from "@opencode-ai/ui/tabs"
import { TextField } from "@opencode-ai/ui/text-field"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { useCapabilities } from "@/hooks/use-capabilities"
import { useServerSync } from "@/context/server-sync"
import { extractBrowserEvidence, isHttpUrl } from "./workspace-tools-model"
import { SettingsCapabilities } from "../settings-capabilities"

export type WorkspaceToolsProps = {
  directory: string
  sessionID?: string
  onPreparePrompt: (text: string) => void
}

export const WorkspaceTools: Component<WorkspaceToolsProps> = (props) => {
  const language = useLanguage()
  const dialog = useDialog()
  const sync = useServerSync()
  const capabilities = useCapabilities(() => props.directory)
  const [state, setState] = createStore({ tab: "browser", url: "" })
  const validUrl = createMemo(() => isHttpUrl(state.url.trim()))
  const browser = createMemo(() =>
    capabilities
      .list()
      .find(
        (item) =>
          item.state === "available" &&
          (item.id === "browser" ||
            item.tools.some((tool) =>
              /browser_(navigate|snapshot|click|type)|playwright/i.test(`${tool.source} ${tool.name}`),
            )),
      ),
  )
  const xcode = createMemo(() =>
    capabilities
      .list()
      .find(
        (item) =>
          item.state === "available" &&
          (item.id === "xcode" ||
            item.tools.some((tool) => /XcodeListWindows|BuildProject|xcode/i.test(`${tool.source} ${tool.name}`))),
      ),
  )
  const evidence = createMemo(() =>
    extractBrowserEvidence(
      Object.values(sync().session.data.message).flat(),
      sync().session.data.part,
      props.sessionID,
    ).toReversed(),
  )

  const prepare = (text: string) => {
    dialog.close()
    props.onPreparePrompt(text)
  }

  const setup = () => {
    void dialog.show(() => (
      <Dialog size="large" title={language.t("capabilities.title")}>
        <SettingsCapabilities directory={() => props.directory} hideTitle />
      </Dialog>
    ))
  }

  return (
    <Dialog size="large" title={language.t("workspaceTools.title")}>
      <div class="flex min-h-0 flex-col gap-4 p-5">
        <header class="flex flex-col gap-1">
          <p class="text-13-regular text-text-weak">{language.t("workspaceTools.description")}</p>
        </header>
        <Tabs value={state.tab} onChange={(value) => setState("tab", value)} class="min-h-0" variant="settings">
          <Tabs.List class="flex-row">
            <Tabs.Trigger value="browser">
              <Icon name="window-cursor" size="small" />
              {language.t("workspaceTools.browser")}
            </Tabs.Trigger>
            <Tabs.Trigger value="xcode">
              <Icon name="code" size="small" />
              {language.t("workspaceTools.xcode")}
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="browser" class="flex min-h-0 flex-col gap-4 pt-4">
            <p class="text-13-regular text-text-weak">{language.t("workspaceTools.browserDescription")}</p>
            <TextField
              value={state.url}
              onChange={(value) => setState("url", value)}
              class="w-full"
              label={language.t("workspaceTools.url")}
              placeholder={language.t("workspaceTools.urlPlaceholder")}
              type="url"
              error={state.url && !validUrl() ? language.t("workspaceTools.invalidUrl") : undefined}
            />
            <Show when={capabilities.loading()}>
              <p role="status" class="text-13-regular text-text-weak">
                {language.t("common.loading")}
              </p>
            </Show>
            <Show when={capabilities.failed()}>
              <div role="alert" class="flex flex-wrap items-center gap-3 text-13-regular text-text-weak">
                <p>{language.t("capabilities.loadFailed")}</p>
                <Button variant="secondary" onClick={() => void capabilities.refresh()}>
                  {language.t("common.retry")}
                </Button>
              </div>
            </Show>
            <Show when={!capabilities.loading() && !capabilities.failed()}>
              <Show when={browser()} fallback={<CapabilityUnavailable onSetup={setup} />}>
                <div class="flex flex-wrap gap-2">
                  <Button
                    disabled={!validUrl()}
                    onClick={() => prepare(language.t("workspaceTools.prompt.navigate", { url: state.url.trim() }))}
                  >
                    {language.t("workspaceTools.prepareNavigate")}
                  </Button>
                  <Button variant="secondary" onClick={() => prepare(language.t("workspaceTools.prompt.screenshot"))}>
                    {language.t("workspaceTools.prepareScreenshot")}
                  </Button>
                  <Button variant="ghost" onClick={() => prepare(language.t("workspaceTools.prompt.console"))}>
                    {language.t("workspaceTools.prepareConsole")}
                  </Button>
                </div>
              </Show>
            </Show>
            <p class="text-12-regular text-text-weak">{language.t("workspaceTools.editPrompt")}</p>
          </Tabs.Content>
          <Tabs.Content value="xcode" class="flex min-h-0 flex-col gap-4 pt-4">
            <p class="text-13-regular text-text-weak">{language.t("workspaceTools.xcodeDescription")}</p>
            <Show when={capabilities.loading()}>
              <p role="status" class="text-13-regular text-text-weak">
                {language.t("common.loading")}
              </p>
            </Show>
            <Show when={capabilities.failed()}>
              <div role="alert" class="flex flex-wrap items-center gap-3 text-13-regular text-text-weak">
                <p>{language.t("capabilities.loadFailed")}</p>
                <Button variant="secondary" onClick={() => void capabilities.refresh()}>
                  {language.t("common.retry")}
                </Button>
              </div>
            </Show>
            <Show when={!capabilities.loading() && !capabilities.failed()}>
              <Show when={xcode()} fallback={<CapabilityUnavailable onSetup={setup} />}>
                <div class="flex flex-wrap gap-2">
                  <Button
                    onClick={() => prepare(language.t("workspaceTools.prompt.inspect", { directory: props.directory }))}
                  >
                    {language.t("workspaceTools.prepareInspect")}
                  </Button>
                  <Button variant="secondary" onClick={() => prepare(language.t("workspaceTools.prompt.build"))}>
                    {language.t("workspaceTools.prepareBuild")}
                  </Button>
                  <Button variant="ghost" onClick={() => prepare(language.t("workspaceTools.prompt.test"))}>
                    {language.t("workspaceTools.prepareTest")}
                  </Button>
                </div>
              </Show>
            </Show>
            <p class="text-12-regular text-text-weak">{language.t("workspaceTools.editPrompt")}</p>
          </Tabs.Content>
        </Tabs>
        <Show when={props.sessionID}>
          <section class="border-t border-border-weak-base pt-3">
            <h3 class="text-13-medium text-text-strong">{language.t("workspaceTools.evidence")}</h3>
            <Show
              when={evidence().length > 0}
              fallback={<p class="mt-1 text-12-regular text-text-weak">{language.t("workspaceTools.noEvidence")}</p>}
            >
              <div class="mt-2 flex max-h-64 flex-col gap-3 overflow-y-auto">
                <For each={evidence()}>
                  {(item) => (
                    <article class="flex flex-col gap-2 rounded-md border border-border-weak-base p-2">
                      <span class="text-11-medium text-text-weak">{item.tool}</span>
                      <Show when={item.image}>
                        <img src={item.image?.url} alt={item.tool} class="max-h-48 w-full rounded object-contain" />
                      </Show>
                      <Show when={item.text}>
                        <details>
                          <summary class="cursor-pointer text-12-medium text-text-weak">{item.tool}</summary>
                          <pre class="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-11-regular text-text-weak">
                            {item.text}
                          </pre>
                        </details>
                      </Show>
                    </article>
                  )}
                </For>
              </div>
            </Show>
          </section>
        </Show>
      </div>
    </Dialog>
  )
}

const CapabilityUnavailable: Component<{ onSetup: () => void }> = (props) => {
  const language = useLanguage()
  return (
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-weak-base p-3">
      <p class="text-13-regular text-text-weak">{language.t("workspaceTools.unavailable")}</p>
      <Button variant="secondary" onClick={props.onSetup}>
        {language.t("workspaceTools.setup")}
      </Button>
    </div>
  )
}
