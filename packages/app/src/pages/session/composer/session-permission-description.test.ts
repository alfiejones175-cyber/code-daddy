import { describe, expect, test } from "bun:test"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import { pluginPermissionDescription } from "./session-permission-description"

function request(permission: string, metadata: Record<string, unknown> = {}) {
  return { permission, metadata } as PermissionRequest
}

describe("pluginPermissionDescription", () => {
  test("explains legacy Jev permissions without exposing the action as the primary copy", () => {
    expect(pluginPermissionDescription(request("jev_triage_failure"))).toEqual({
      key: "permission.plugin.jev.triage.description",
    })
    expect(pluginPermissionDescription(request("jev_rank_evidence"))).toEqual({
      key: "permission.plugin.jev.rank.description",
    })
  })

  test("explains checksum-scoped V2 Jev permissions", () => {
    expect(pluginPermissionDescription(request("plugin.jev_triage_failure_14s5b"))).toEqual({
      key: "permission.plugin.jev.triage.description",
    })
    expect(pluginPermissionDescription(request("plugin.jev_rank_evidence_14s5b"))).toEqual({
      key: "permission.plugin.jev.rank.description",
    })
    expect(pluginPermissionDescription(request("plugin.jev_triage_failure_other_extra"))).toEqual({
      key: "permission.plugin.generic.description",
    })
  })

  test("uses supplied plugin metadata before the generic fallback", () => {
    expect(
      pluginPermissionDescription(request("plugin.audit_14s5b", { destination: "Example", data: "Redacted evidence" })),
    ).toEqual({
      key: "permission.plugin.destinationData.description",
      params: { destination: "Example", data: "Redacted evidence" },
    })
    expect(pluginPermissionDescription(request("plugin.audit_14s5b"))).toEqual({
      key: "permission.plugin.generic.description",
    })
  })
})
