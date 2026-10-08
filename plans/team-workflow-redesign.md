# Team creation and collaborative delivery

Updated 8 October 2026. Implementation is in progress; build, installation and acceptance are recorded separately. This extends the existing [Teams implementation](agent-teams.md) and [draft repair](team-draft-repair.md).

The owner prioritizes creating a team and choosing its agents, models and skills. A team must also work together: research and plan in parallel, regroup with a visual proposal and consolidated questions, then build after the user resolves the design decisions. A website team needs planning, design/build and independent review for UI, frontend and backend, plus shared research, QA and overall coordination.

## Intended experience

1. Describe the job or start from an editable website or build-and-review template.
2. Review a compact roster and its workflow. Inspect one member at a time; see responsibility, model, skills and readiness together. Keep source profiles and detailed instructions secondary.
3. Review all assignments, workflow dependencies, user decision checkpoints and remaining blockers before saving. Disconnected selections can be saved; they cannot silently fall back to another model.
4. Use the team in a session. Keep its workflow diagram available on screen, alongside actual role activity and links to delegated conversations.
5. Run independent discovery in parallel, consolidate source-backed findings, present diagrams/design alternatives and ask one coordinated set of questions. A user decision checkpoint precedes implementation in the website template.
6. Handoff approved artifacts to area builders, then area reviewers, QA and final review. Report actual checks and unresolved findings. Review guidance is not represented as a durable scheduler or an enforced completion guarantee.

## Implementation ownership

| Workstream | Scope |
| --- | --- |
| Workflow contracts and orchestration | Backward-compatible workflow steps/dependencies, multiple restricted reviewers, lead skills, expanded AI drafting and prompt handoffs; V1 and V2 |
| Team builder | Purpose → team/workflow → review, templates, recoverable drafts, readable roster/details, model/skill readiness and scope |
| Skill packs and loading | Bundled planning, research, UI design, frontend, backend, QA and review workflows; resource parity and required lead skill loading |
| Session integration | Persistent team workflow view, legal-roster delegation, evidence-aware activity, clearer task draft action |
| Independent verification | Contract/permission regressions, builder behavior, screenshots, production baseline comparison, packaging/install provenance |

## Contracts and boundaries

- Team roles retain existing source profiles, model overrides, instructions, skills and standards. Optional role kind marks additional independent reviewers; it must enforce existing read-only restrictions in both runtimes.
- Optional workflow steps contain IDs, owner roles, instructions, dependencies, deliverables, checks and a user-decision checkpoint flag. Validate unknown roles/dependencies, duplicate IDs and cycles. Existing teams without workflows remain valid.
- Dependencies and checkpoints instruct the lead's existing task orchestration. They do not add automatic post-crash replay, hidden provider calls or a second scheduler. The session UI distinguishes the planned workflow from observed task outcomes.
- Skill packs provide procedures, not extra permissions. Load required lead/member skills through existing permission checks, preserve supporting resource context and avoid claiming filesystem resources for embedded skills.
- Save recoverable drafts locally, scoped to the server. Never write incomplete drafts over the user's configuration. Show global configuration scope and preserve project overrides.
- Preserve typed English copy, existing themes, local data, provider choices and both supported protocol paths.

## Acceptance

- Website starter contains research, three area planners, three area builders, three area reviewers, QA and final review, coordinated by the lead; the shared proposal checkpoint precedes builds.
- All workflow fields round-trip; legacy teams retain their behavior. Multiple reviewers cannot edit, run shell commands or delegate.
- Skill instructions appear for the intended role/lead. Missing or denied skills fail before provider work; supporting resources resolve under existing permissions.
- Closing/reopening setup restores the draft. Saving disconnected configurations remains possible with a clear warning. Invalid workflow graphs cannot be saved.
- A selected team has a visible dependency diagram. Live activity is derived from actual sessions/tools; a planned step is never marked complete merely because its role was used once.
- The delegation dialog offers only the selected team's allowed roles and clearly prepares an unsent request.
- Focused package tests and typechecks pass. Regenerate native client and legacy SDK for public contract changes. Compare a production session benchmark before/after session edits.
- Build/package the desktop dev app, install only while it is normally closed, preserve data and record matching artifact hashes plus installed feature smoke results. Never restart or force-quit the user's app/server.

## Later work kept separate

Arbitrary third-party skill installation, a durable workflow scheduler, automatic provider retries after restart, enforced review completion, and benchmark-ranked model recommendations need their own contracts and acceptance. This delivery must not imply those exist.
