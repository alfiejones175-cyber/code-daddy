import { createEffect, createMemo, createResource, onCleanup, type Accessor } from "solid-js"
import { usePlatform } from "@/context/platform"
import { useServerProtocol, useServerSDK } from "@/context/server-sdk"
import { createWorkspaceApi } from "@/utils/workspace-api"

export function useCapabilities(directory: Accessor<string | undefined>) {
  const sdk = useServerSDK()
  const platform = usePlatform()
  const protocol = useServerProtocol()
  const [result, actions] = createResource(
    () =>
      protocol() === "v1" || !directory()
        ? undefined
        : { scope: sdk().scope, server: sdk().server.http, directory: directory()! },
    async (input) =>
      createWorkspaceApi({ server: input.server, fetch: platform.fetch })
        .capabilities({ directory: input.directory })
        .then((data) => ({ scope: input.scope, directory: input.directory, data, failed: false }))
        .catch(() => ({ scope: input.scope, directory: input.directory, data: [], failed: true })),
  )
  const current = createMemo(() => {
    const value = result.latest
    return value?.scope === sdk().scope && value.directory === directory() ? value : undefined
  })
  createEffect(() => {
    const server = sdk()
    onCleanup(
      server.event.listen((event) => {
        const type: string = event.details.type
        if (type === "mcp.status.changed" || type === "config.updated" || type === "server.instance.disposed")
          void actions.refetch()
      }),
    )
  })
  createEffect(() => {
    const refresh = () => {
      void actions.refetch()
    }
    window.addEventListener("focus", refresh)
    onCleanup(() => window.removeEventListener("focus", refresh))
  })
  return {
    list: () => current()?.data ?? [],
    loading: () => result.loading,
    failed: () => current()?.failed ?? false,
    refresh: () => actions.refetch(),
    supported: () => protocol() !== "v1",
    api: () => createWorkspaceApi({ server: sdk().server.http, fetch: platform.fetch }),
    scope: () => sdk().scope,
  }
}
