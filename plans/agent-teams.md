# Agent teams

Implemented and installed in the local dev app on 30 September 2026. See the [configuration guide](../documentation/agent-teams.md) and [dated validation](validation/agent-teams.md).

## Delivered

- Settings → Teams creates, edits, renames and disables saved teams, with a lead, fixed role roster, optional instructions and a default command alias.
- `teams` and `default_team` work in JSON/JSONC configuration. More specific named entries replace complete rosters; explicit null clears the default alias.
- Both composer layouts offer a team selector. Selecting a team uses its generated lead agent; No team restores the prior ordinary agent and keeps the prompt draft.
- V1 and native V2 project generated leads and role agents from existing profiles, inheriting their models and permissions. Structural task checks enforce each lead's roster and prohibit nested role delegation.
- Native V2 supports global team settings read/patch and location-resolved reads. Writes preserve unrelated JSONC content and invalidate cached locations while active scoped leases continue.

## Acceptance boundaries

Live paid/free provider execution was not submitted during validation. The existing task runtime handles assignments and handoffs; this feature does not add durable orchestration or restart recovery. Concurrency remains governed by the existing runtime. Generated slash commands execute on V1; native V2 uses the composer selector.
