import { Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useLanguage } from "@/context/language"
import type { useProviderConnections } from "@/hooks/use-provider-connections"

export function ProviderConnectionStatus(props: { connections: ReturnType<typeof useProviderConnections> }) {
  const language = useLanguage()
  return (
    <Show when={props.connections.loading() || props.connections.failed()}>
      <div class="flex flex-col items-center gap-3 px-4 py-6 text-13-regular text-text-weak" aria-live="polite">
        <Show
          when={!props.connections.loading()}
          fallback={
            <>
              <Spinner class="size-4" />
              {language.t("common.loading")}
            </>
          }
        >
          <p role="alert">{language.t("providers.loadFailed")}</p>
          <Button variant="secondary" onClick={() => void props.connections.retry()}>
            {language.t("common.retry")}
          </Button>
        </Show>
      </div>
    </Show>
  )
}
