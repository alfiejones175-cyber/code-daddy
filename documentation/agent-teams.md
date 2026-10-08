# Agent teams

Agent teams give a lead agent a fixed roster of role agents for coordinating complex work. Configure teams in **Settings → Teams**, or define them in `opencode.json` / `opencode.jsonc`.

## Create a team

Choose **New team**, describe its purpose, and either **Draft with AI** or **Start with a blank team**. AI setup requires an explicitly selected connected model and uses its normal provider pricing. Choose one connected provider or all connected providers for member recommendations. The design model proposes a small team with a model for the lead and every member, member standards, relevant installed skills, and an independent reviewer. The design model itself is selected separately. Review the draft in the Members step before saving; generation does not write configuration.

Choose an existing primary agent as the lead and existing subagents for its roles. Each member's **Skills and work standards** section lets you select installed skills and add concrete standards. The chooser excludes skills denied by that source profile. Select an independent review member and a checklist. The Settings editor saves teams to global configuration. In the composer, select a team to select its generated lead agent for the prompt; selecting **No team** returns to the previously selected agent. The `default_team` setting only enables the `/team` command alias. It does not automatically select or assign that team to new prompts.

For example, this JSONC configuration uses the built-in `build`, `explore`, and `general` agents:

```jsonc
{
  "teams": {
    "review": {
      "description": "Review code changes",
      "lead": "build",
      "instructions": "Coordinate a focused review, then summarize findings and checks.",
      "roles": {
        "explorer": {
          "agent": "explore",
          "instructions": "Inspect relevant code and report precise file and line references.",
        },
        "implementer": {
          "agent": "general",
          "instructions": "Handle a bounded implementation assignment and report changed files and checks.",
          "standards": ["Use the smallest change that satisfies the requirement.", "Report the checks actually run."],
        },
        "reviewer": {
          "agent": "general",
          "standards": ["Trace each finding to code and explain its user impact."],
        },
      },
      "review": {
        "role": "reviewer",
        "checklist": ["Requirement coverage", "Permission preservation", "Unnecessary complexity"],
      },
    },
  },
  "default_team": "review",
}
```

The lead receives guidance to delegate to the listed roles, review their results, and manage follow-up assignments. A lead can dispatch only to its configured roster; a role cannot dispatch nested tasks. Each generated role inherits its source agent's step limit and permissions. An optional `model` override on the team selects the lead model; an optional `model` on each role selects that member's execution model. The Members editor lets you search connected models and change these choices, required skills, instructions and standards before saving. With no override, the source profile's model and variant remain inherited. An explicit model override clears the inherited variant. Existing disconnected selections remain visible with a warning; reconnect their provider or select another model before running the team.

## Model recommendations and benchmarks

AI setup receives the selected connected catalog's model names, tool/text capabilities, context limits and available pricing. It returns a short `modelReason` for each recommendation. These are catalog-based recommendations, not verified claims that a model is best. AI setup does not browse benchmark websites.

The editor links to [Artificial Analysis](https://artificialanalysis.ai/leaderboards/models) for current quality, speed and price comparisons and [SWE-bench](https://www.swebench.com/) for coding-agent results. Opening a benchmark does not send the team's purpose or configuration. No benchmark scores are scraped, cached or invented. General benchmarks help shortlist models; task-specific checks, such as invoice field extraction and amount/currency/VAT matching, should determine final task suitability.

## Member harnesses and skills

Set a role's `skills` to installed skill names and `standards` to concise, observable requirements. Required skill bodies are loaded before admitting the child task, subject to the lead, source role and session permissions. A missing or denied skill stops dispatch; skills that require approval ask before dispatch. Standards and the review checklist are prompt instructions, so they guide the agents but are not automated acceptance tests.

The review member receives a restricted tool set for inspection and skills. It cannot edit files, run shell commands, execute code, or delegate. The lead is instructed to request this member's independent final review and resolve findings before presenting completion. This is a prompted workflow, not a durable completion gate.

On a saved team, **Research skills with AI** prepares a normal chat draft with the team's configuration. Send it when ready to research primary sources, inspect candidate skills, and propose relevant harness instructions. Research does not automatically install skills or change team settings. AI setup itself uses the installed catalog; it does not browse or run skill scripts.

## Jev advisory review

For a review member, optional file configuration `review.jev: true` permits the canonical Jev code-review tool when its source profile allows it. It does not enable Jev globally or automatically send a request. Jev must already be configured and available. V1 uses `jev_review_code`; V2 uses a registered `plugin_jev_review_code_*` tool.

The tool accepts bounded code changes and requirements, and checks unnecessary abstraction, duplication and scope. Its result is advisory evidence with an input digest and rubric version; it does not replace tests or the independent reviewer. Identical successful session reviews are reused, concurrent identical requests are joined, and failed retries preserve the previous successful review while reporting the failure.

## Configuration scope

Global teams are the starting configuration. A project `opencode.json` or `opencode.jsonc` can define a team with the same name to replace that complete team for the project. Team entries are replaced as a whole, so include the full `lead` and `roles` when overriding one. Set `default_team` to a team name to enable `/team`; set it to `null` in a narrower configuration to clear an inherited alias. For a project-only team, define its source agents in the project configuration too.

To disable an inherited team in a project, use a tombstone that retains the required team fields:

```jsonc
{
  "teams": {
    "review": {
      "lead": "build",
      "roles": {
        "explorer": { "agent": "explore" },
        "implementer": { "agent": "general" },
      },
      "disabled": true,
    },
  },
}
```

The team editor and file configuration currently share the same team definitions. Team-specific concurrency limits are not configurable; the runtime's existing task limits apply.

## Current behavior and limits

The composer team selector works with both V1 and V2 agents. Generated `/team-NAME` commands and the default `/team` alias are V1 commands; V2 native command execution does not currently run these generated commands. Teams do not provide a durable scheduler or replay assignments after an app or server restart. Do not rely on an interrupted team run being resumed automatically.
