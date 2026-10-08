import { Dialog, DialogHeader, DialogTitle } from "@opencode-ai/ui/v2/dialog-v2"
import { useLanguage } from "@/context/language"
import { WorkflowBuilder } from "./workflows"
import "./dialog-workflows.css"

export function DialogWorkflows(props: { directory?: string }) {
  const language = useLanguage()
  return (
    <Dialog size="x-large" class="workflow-dialog" containerClass="workflow-dialog-container">
      <DialogHeader>
        <DialogTitle>{language.t("workflow.title")}</DialogTitle>
      </DialogHeader>
      <WorkflowBuilder directory={props.directory} />
    </Dialog>
  )
}
