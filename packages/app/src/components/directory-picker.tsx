import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ServerConnection } from "@/context/server"
import { usePlatform } from "@/context/platform"
import { useSettings } from "@/context/settings"
import { lazy } from "solid-js"
import { DialogSelectDirectory } from "./dialog-select-directory"
import { directoryPickerKind, directoryPickerStart } from "./directory-picker-policy"

const DialogSelectDirectoryV2 = lazy(() =>
  import("./dialog-select-directory-v2").then((module) => ({ default: module.DialogSelectDirectoryV2 })),
)

type DirectoryPickerInput = {
  server: ServerConnection.Any
  title?: string
  multiple?: boolean
  start?: string
  onSelect: (result: string | string[] | null) => void
}

export function useDirectoryPicker() {
  const platform = usePlatform()
  const settings = useSettings()
  const dialog = useDialog()

  return (input: DirectoryPickerInput) => {
    const start = directoryPickerStart(
      input.start,
      ServerConnection.local(input.server) ? settings.general.defaultProjectsFolder() : "",
    )
    if (directoryPickerKind(platform.platform, input.server) === "native" && platform.platform === "desktop") {
      void platform
        .openDirectoryPickerDialog({ title: input.title, multiple: input.multiple, defaultPath: start })
        .then(input.onSelect)
      return
    }

    let selected = false
    const onSelect = (result: string | string[] | null) => {
      selected = result !== null
      input.onSelect(result)
    }
    const cancel = () => {
      if (!selected) input.onSelect(null)
    }
    if (platform.platform === "desktop" && settings.general.newLayoutDesigns()) {
      void dialog.show(() => <DialogSelectDirectoryV2 {...input} start={start} onSelect={onSelect} />, cancel)
      return
    }
    void dialog.show(() => <DialogSelectDirectory {...input} start={start} onSelect={onSelect} />, cancel)
  }
}
