import { createEffect, createMemo, createResource, onCleanup, type Accessor } from "solid-js"
import { useServerProtocol, useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"

export function providerConnectionKind(connection?: { type: string; authType?: string; methodID?: string }) {
  if (connection?.type === "env") return "environment"
  if (connection?.authType === "key") return "key"
  if (connection?.authType === "oauth") {
    if (connection.methodID === "chatgpt-browser" || connection.methodID === "chatgpt-headless") return "chatgpt"
    return "oauth"
  }
  return "connected"
}

export function useProviderConnections(directory: Accessor<string | undefined>) {
  const sdk = useServerSDK()
  const protocol = useServerProtocol()
  const sync = useServerSync()
  const [integrations, actions] = createResource(
    () => (protocol() === "v1" ? undefined : { sdk: sdk(), directory: directory() }),
    async (input) =>
      input.sdk.api.integration
        .list({ location: input.directory ? { directory: input.directory } : undefined })
        .then((result) => ({ scope: input.sdk.scope, directory: input.directory, data: result.data, failed: false }))
        .catch(() => ({ scope: input.sdk.scope, directory: input.directory, data: [], failed: true })),
  )
  const list = createMemo(() => {
    const value = integrations.latest
    return value?.scope === sdk().scope && value.directory === directory() ? value.data : []
  })
  createEffect(() => {
    const server = sdk()
    onCleanup(
      server.event.listen((event) => {
        if (event.details.type === "integration.connection.updated" || event.details.type === "integration.updated")
          void actions.refetch()
      }),
    )
  })
  return {
    list,
    loading: () => integrations.loading,
    failed: () => {
      const value = integrations.latest
      return value?.scope === sdk().scope && value.directory === directory() && value.failed
    },
    retry: () => actions.refetch(),
    connection: (id: string) => list().find((item) => item.id === id)?.connections[0],
    methodLabel: (id: string) => {
      const integration = list().find((item) => item.id === id)
      const connection = integration?.connections[0]
      const method = integration?.methods.find(
        (method) =>
          method.type === "oauth" && connection && "methodID" in connection && method.id === connection.methodID,
      )
      return method?.type === "oauth" ? method.label : undefined
    },
    disconnect: async (id: string) => {
      const server = sdk()
      const state = sync()
      const location = directory() ? { directory: directory()! } : undefined
      const integration = (await server.api.integration.get({ integrationID: id, location })).data
      await Promise.all(
        (integration?.connections ?? []).flatMap((connection) =>
          connection.type === "credential"
            ? [server.api.credential.remove({ credentialID: connection.id, location })]
            : [],
        ),
      )
      await actions.refetch()
      await state.refreshProviders()
    },
  }
}
