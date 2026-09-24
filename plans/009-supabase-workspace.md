# To do: Supabase workspace

Status: draft, 24 September 2026. No Supabase connection is enabled by this document.

## Goal

Give an agent project-scoped database context and diagnostics while keeping schema changes deliberate and reviewable.

## Work

1. Make the V2 desktop connection and remote MCP OAuth work end to end; currently `packages/core/src/mcp.ts` rejects remote OAuth. Confirm account-backed authentication in the packaged app before adding a one-click preset.
2. Offer Supabase's official MCP server with the selected `project_ref`, `read_only=true`, and only the docs, database, debugging, and development feature groups initially. Do not connect all account projects by default. Prefer a local or development project first. [Supabase MCP documentation](https://supabase.com/docs/guides/ai-tools/mcp).
3. Show connection state, project identity, environment label, permitted tools, and authentication errors in Capabilities. Keep credentials out of repository config and logs.
4. Add a workspace view for tables, migrations, advisors, and filtered logs. Link each observation to its project and collection time; bound row counts and redact sensitive values.
5. Add an explicit write workflow for migrations and Edge Function deployment: show target environment, proposed change, diff, test result, and approval before applying it. Preserve a local migration file and verify the resulting schema.

## Acceptance

The agent can read a development project's schema and one bounded diagnostic result; a production project is not selected accidentally; a failed OAuth flow recovers; a proposed migration is visible before any write and is verified after application. No tool may silently switch from a development to a production project.
