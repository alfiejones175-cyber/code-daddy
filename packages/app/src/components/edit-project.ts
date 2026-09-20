import { getFilename } from "@opencode-ai/core/util/path"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useMutation } from "@tanstack/solid-query"
import { normalizeProjectInfo } from "@/context/global-sync/utils"
import { createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobal } from "@/context/global"
import { type LocalProject } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"
import { updateProjectAppearance } from "@/utils/server"
import { ServerConnection } from "@/context/server"

export function createEditProjectModel(props: { project: LocalProject; server: ServerConnection.Any }) {
  const dialog = useDialog()
  const global = useGlobal()
  const platform = usePlatform()
  const language = useLanguage()
  const serverCtx = createMemo(() => global.ensureServerCtx(props.server))
  const folderName = createMemo(() => getFilename(props.project.worktree))
  const defaultName = createMemo(() => props.project.name || folderName())
  const [store, setStore] = createStore({
    name: defaultName(),
    color: props.project.icon?.color,
    iconOverride: props.project.icon?.override,
    startup: props.project.commands?.start ?? "",
    dragOver: false,
    iconHover: false,
  })
  let iconInput: HTMLInputElement | undefined

  function selectFile(file: File) {
    if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      showToast({ title: language.t("prompt.toast.pasteUnsupported.title") })
      return
    }
    const reader = new FileReader()
    reader.onerror = () => showToast({ title: language.t("toast.file.loadFailed.title") })
    reader.onload = (event) => {
      const result = event.target?.result
      if (typeof result !== "string") return
      setStore("iconOverride", result)
      setStore("iconHover", false)
    }
    reader.readAsDataURL(file)
  }

  function drop(event: DragEvent) {
    event.preventDefault()
    setStore("dragOver", false)
    const file = event.dataTransfer?.files[0]
    if (file) selectFile(file)
  }

  function dragOver(event: DragEvent) {
    event.preventDefault()
    setStore("dragOver", true)
  }

  function dragLeave() {
    setStore("dragOver", false)
  }

  function inputChange(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0]
    if (file) selectFile(file)
    if (iconInput) iconInput.value = ""
  }

  function iconClick() {
    iconInput?.click()
  }

  const save = useMutation(() => ({
    mutationFn: async () => {
      const name = store.name.trim() === folderName() ? "" : store.name.trim()
      const start = store.startup.trim()

      if (props.project.id && props.project.id !== "global") {
        const body = {
          name,
          icon: {
            ...(props.project.icon?.url ? { url: props.project.icon.url } : {}),
            color: store.color || "",
            override: store.iconOverride || "",
          },
          commands: { start },
        }
        const project =
          (await serverCtx().sdk.protocol) === "v1"
            ? await serverCtx()
                .sdk.client.project.update({
                  projectID: props.project.id,
                  directory: props.project.worktree,
                  ...body,
                })
                .then((result) => result.data)
            : await updateProjectAppearance({
                server: props.server.http,
                directory: props.project.worktree,
                body,
                fetch: platform.fetch,
              })
        if (!project) return
        serverCtx().sync.set("project", (items) =>
          items.map((item) => (item.id === project.id ? normalizeProjectInfo(project) : item)),
        )
        serverCtx().sync.project.icon(props.project.worktree, store.iconOverride || undefined)
        dialog.close()
        return
      }

      serverCtx().sync.project.meta(props.project.worktree, {
        name,
        icon: { color: store.color || undefined, override: store.iconOverride || undefined },
        commands: { start: start || undefined },
      })
      serverCtx().sync.project.icon(props.project.worktree, store.iconOverride || undefined)
      dialog.close()
    },
    onError: (error) =>
      showToast({
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : undefined,
      }),
  }))

  function submit(event: SubmitEvent) {
    event.preventDefault()
    if (save.isPending) return
    save.mutate()
  }

  return {
    store,
    setStore,
    folderName,
    defaultName,
    save,
    submit,
    drop,
    dragOver,
    dragLeave,
    inputChange,
    iconClick,
    close() {
      dialog.close()
    },
    setIconInput(input: HTMLInputElement) {
      iconInput = input
    },
  }
}
