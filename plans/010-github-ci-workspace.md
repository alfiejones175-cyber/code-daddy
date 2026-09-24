# To do: GitHub and CI workspace

Status: draft, 24 September 2026. The current read-only GitHub MCP preset has not been live-validated on this Mac.

## Goal

Let an agent start from a failing check or issue and carry the evidence through a local fix and review.

## Work

1. Smoke-test the current read-only GitHub preset in the packaged V2 desktop app, including authentication, repository scope, and failure recovery.
2. Show repository, branch, issue/PR context, Actions run status, failing job, and bounded log excerpt in one project workspace. Always link back to the source run.
3. Make the task result cite the exact local checks performed and the CI run inspected. A green local check must not be presented as a green remote run.
4. Add write actions only as explicit, reviewable operations: create branch/PR, comment, or rerun a workflow. Show target repository and proposed content before sending.
5. Provide stale-state handling when the branch, PR, or run changes while an agent is working.

## Acceptance

A failed Actions run can be inspected from Code Daddy, tied to a local change, and reviewed with clear local/remote evidence. No GitHub write occurs through the read-only preset. [GitHub MCP toolsets](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/configure-toolsets).
