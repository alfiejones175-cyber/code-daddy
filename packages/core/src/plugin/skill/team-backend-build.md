Implement the approved backend behavior using the repository's established contracts, persistence model, and runtime boundaries. Skills are instructions, not permission grants; use only tools and access explicitly available to your role.

## Workflow

1. Read the product decision, API/schema definitions, callers, persistence behavior, and relevant tests before editing. Map the data flow and ownership boundaries. Ask the lead to resolve any mismatch between the brief and existing contracts.
2. Define or preserve explicit input, output, error, and idempotency behavior. Validate untrusted data at the boundary. Keep durable state changes atomic where the existing architecture supports it, and do not weaken authorization or tenant/session isolation.
3. Follow the project's dependency direction and migration conventions. Avoid unrelated refactors and new dependencies. Do not edit generated files when the repository provides a generator.
4. Handle missing, duplicate, stale, and conflicting data deliberately. Preserve existing records unless the approved behavior says otherwise. Keep external calls bounded and do not claim a network result without evidence.
5. Run checks permitted by your role and project instructions. Report exactly which commands or harnesses ran and their outcomes; state skipped checks plainly.
6. Handoff to QA and independent review with changed paths, contract changes, data implications, migration or compatibility notes, evidence, and unresolved risks.

## Output

Map each acceptance criterion to the implementation and evidence. Cite schema, handler, and test paths. Separate code-inspection conclusions from executed results. Never claim correctness solely because the happy path works.
