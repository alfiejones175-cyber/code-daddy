import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import type { dict } from "@/i18n/en"

type Description = {
  key: keyof typeof dict
  params?: Record<string, string>
}

export function pluginPermissionDescription(request: PermissionRequest): Description | undefined {
  if (isJevPermission(request.permission, "jev_triage_failure")) {
    return { key: "permission.plugin.jev.triage.description" }
  }
  if (isJevPermission(request.permission, "jev_rank_evidence")) {
    return { key: "permission.plugin.jev.rank.description" }
  }
  if (!request.permission.startsWith("plugin.")) return

  const destination = request.metadata.destination
  const data = request.metadata.data
  if (typeof destination === "string" && typeof data === "string") {
    return { key: "permission.plugin.destinationData.description", params: { destination, data } }
  }
  if (typeof destination === "string") return { key: "permission.plugin.destination.description", params: { destination } }
  return { key: "permission.plugin.generic.description" }
}

function isJevPermission(permission: string, name: string) {
  return permission === name || new RegExp(`^plugin\\.${name}_[a-z0-9]{1,7}$`).test(permission)
}
