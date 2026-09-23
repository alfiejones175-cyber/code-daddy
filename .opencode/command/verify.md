---
description: Verify changed code and report the actual checks
---

Verify the current changes against `dev` or `origin/dev`. Include uncommitted work, but do not edit unrelated changes.

1. Identify affected packages and read their `AGENTS.md` instructions.
2. Check formatting with Prettier and lint with oxlint on changed code. Fix issues introduced by this work only.
3. Run `bun typecheck` from each affected package directory. Never run tests from the repository root.
4. Run focused tests that exercise changed behavior. Include a real smoke check for changed UI or external integration when practical.
5. Review the resulting diff for accidental changes, missing error states, and code that conflicts with the local style guide. Use `/rmslop` guidance when it applies.

Report each command and its result, the behavior verified, and anything left unverified. Do not describe a check as passing unless it actually ran and passed. Do not claim the installed desktop app is current without following `documentation/desktop-updates.md`.
