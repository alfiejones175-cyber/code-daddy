// The bundled client still addresses OAuth attempts beneath their integration.
// Current servers own attempts directly; keep this migration at the SDK boundary.
export function currentIntegrationFetch<T extends (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
  fetcher: T,
) {
  return Object.assign((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    const path = url.pathname.replace(
      /\/api\/integration\/[^/]+\/connect\/oauth\/([^/]+)(\/complete)?$/,
      "/api/integration/attempt/$1$2",
    )
    if (path === url.pathname) return fetcher(input, init)
    url.pathname = path
    return fetcher(input instanceof Request ? new Request(url, input) : url, init)
  }, fetcher)
}
