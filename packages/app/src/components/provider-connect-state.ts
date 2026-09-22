import type { IntegrationMethod } from "@opencode-ai/client/promise"

export type ProviderConnectMethod = Extract<IntegrationMethod, { type: "key" | "oauth" }>

export function providerConnectMethods(input: {
  legacy: boolean
  methods?: IntegrationMethod[]
  fallback: ProviderConnectMethod[]
}) {
  if (!input.methods) return []
  const methods = input.methods.filter(
    (method): method is ProviderConnectMethod => method.type === "key" || method.type === "oauth",
  )
  if (methods.length) return methods
  return input.legacy ? input.fallback : []
}

export function shouldAutoSelectProviderConnectMethod(methods: ProviderConnectMethod[]) {
  return methods.length === 1 && methods[0].type === "key"
}

export function providerOAuthAutoCode(instructions?: string) {
  return instructions?.match(/(?:^|\n)\s*Enter code:\s*([^\s]+)/i)?.[1]
}
