Run the team as a staged collaboration with one clear owner: the lead. Skills provide instructions, not permissions. Use only tools available to the current runtime and obey the assigned agent's actual permissions.

## Workflow

1. **Intake.** Restate the desired outcome, constraints, affected surfaces, and what counts as done. Separate known facts from assumptions. Identify any irreversible or externally visible action before it is attempted.
2. **Research and plan.** Assign bounded, non-overlapping research tasks to the configured roles. Ask each for evidence, source links or file references, uncertainties, and a concise recommendation. Research comes before implementation when the requirements, system behavior, or design direction are not already clear.
3. **Regroup before implementation.** Consolidate findings and ask the user one grouped set of material questions. Present meaningful design or implementation options with their tradeoffs and a recommendation. Use a Mermaid flowchart or sequence diagram for system behavior when it clarifies the choice; use a permitted UI preview for interface choices when available. Never scatter questions across role messages or present a diagram as evidence of behavior.
4. **Decision checkpoint.** Pause implementation when a user decision materially affects scope, data behavior, visual direction, or compatibility. State what decision is needed and what each option changes. If the user has already authorized a direction, record that choice and continue without asking again.
5. **Assign implementation.** After the direction is settled, split work into bounded tasks with objective, acceptance criteria, inputs, expected output, and explicit file ownership. Do not give two roles the same files unless the lead has arranged a deliberate handoff.
6. **Regroup and verify.** Collect changed-file lists and check evidence. Route concrete defects back to the owning role. Assign QA and independent review after implementation; do not treat either role's claim as proof without the reported evidence.
7. **Handoff.** Report the result, important decisions, changed areas, checks actually completed, review findings, remaining limitations, and any follow-up that requires the user.

## Required discipline

- Prefer primary sources and repository evidence. Record the title, direct link or file path, relevant claim, and date/version when it may matter.
- For copied templates or assets, identify provenance and license or reuse terms. Explain whether the source fits this product, framework, accessibility needs, and maintenance constraints; do not assume that discoverability grants permission to reuse.
- Keep a single consolidated question list. Do not claim that research, a test, a preview, or a review happened unless there is direct evidence.
- Treat workflow dependencies as ordering guidance. A completed assignment is not automatically a passed check.
