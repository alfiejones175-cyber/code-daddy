import { onCleanup, type Accessor } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"

export function useWorkflowDialog(directory?: Accessor<string | undefined>) {
  const dialog = useDialog()
  let disposed = false
  onCleanup(() => {
    disposed = true
  })
  return async () => {
    const selected = directory?.()
    const { DialogWorkflows } = await import("./dialog-workflows")
    if (!disposed) void dialog.show(() => <DialogWorkflows directory={selected} />)
  }
}

export function WorkflowLauncher(props: { directory?: string }) {
  const language = useLanguage()
  const open = useWorkflowDialog(() => props.directory)
  return (
    <div class="flex flex-col items-start gap-4 p-6">
      <h2 class="text-16-medium text-text-strong">{language.t("workflow.title")}</h2>
      <p class="text-14-regular text-text-weak">{language.t("workflows.launchDescription")}</p>
      <ButtonV2 type="button" variant="contrast" onClick={() => void open()}>
        {language.t("workflows.open")}
      </ButtonV2>
    </div>
  )
}
