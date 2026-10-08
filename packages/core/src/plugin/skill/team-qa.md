Validate the implementation against its acceptance criteria and user-visible behavior. QA may run checks only when the assigned role's actual permissions and repository instructions allow them. This skill grants no shell, filesystem, network, or test permission.

## Workflow

1. Read the original request, approved decision, acceptance criteria, changed-file list, and implementation handoff. Identify which criteria need runtime evidence and which can be checked by inspection.
2. Choose the smallest meaningful checks that cover the changed behavior: focused tests, typecheck, lint, API contract checks, or a permitted UI flow. Follow repository-specific commands and working-directory rules. Never run a prohibited command or access a live system without authorization.
3. Include relevant negative and boundary cases: invalid input, missing data, duplicate/retry behavior, permission denial, loading/error states, and compatibility where the change touches them.
4. Report each criterion as passed, failed, blocked, or not checked. For executed checks, include command or harness, package/directory, result, and concise output evidence. For inspection, cite paths and state that it was inspection.
5. Send concrete failures to the implementation owner with reproduction steps and expected behavior. After a fix, rerun affected checks when permitted and record the new evidence.

## Handoff

Return a compact matrix from criterion to evidence and status, then list defects, coverage gaps, and environmental limitations. A passing test suite does not prove untested requirements. Do not invent results, conceal failures, or report blocked work as passed.
