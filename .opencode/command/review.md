---
description: Review the current diff for regressions
---

Review the current changes against `dev` or `origin/dev`, including uncommitted edits relevant to the task. Read affected `AGENTS.md` files first. Identify concrete bugs, regressions, data-loss risks, missing error handling, and violations of the repository's dependency or V2 session invariants. Verify each finding against the changed code and its callers before reporting it.

Report actionable findings in priority order with file and line, the triggering scenario, and the expected behavior. If no actionable finding remains, say so plainly and mention any material validation gap. Do not edit files unless the user asks you to fix the findings.
