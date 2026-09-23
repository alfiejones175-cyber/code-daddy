# Jev advisory tools

This package adds failure triage, research ranking, and completed-response review to Code Daddy's legacy and V2 plugin tools. It also provides a standalone Bun CLI for triage and ranking. It sends only explicitly supplied material to TypeSafe. It does not execute actions, alter test pass/fail results, or replace your coding model.

The app has an explicit **Review response with Jev** action on completed assistant responses. Automatic review is not implemented. See the [Jev integration roadmap](../../plans/jev-integration.md) for evaluation and follow-up work.

## Put your API key here

Create or edit `~/.config/code-daddy/jev.env`:

```dotenv
TYPESAFE_API_KEY=your_actual_typesafe_key
TYPESAFE_MODEL=jev-1.13.0
JEV_TIMEOUT_MS=10000
```

Keep this file private (`chmod 600 ~/.config/code-daddy/jev.env`). It is outside this repository. Get your key from the [TypeSafe console](https://console.typesafe.ai). Do not paste it into source files, prompts, or issue reports.

Both the CLI and plugin read this file on each invocation. Process environment values take precedence. `JEV_ENV_FILE` selects another private file. An explicitly empty environment key disables the key from the file. No configuration values are copied into the global process environment. The API endpoint is fixed to TypeSafe for normal CLI/plugin use.

## Check and test

Run from `packages/jev`:

```bash
bun run jev check
bun run jev smoke
bun run jev triage fixtures/failure.txt
bun run jev rank fixtures/research.json
```

`check` does not contact TypeSafe and never prints the key. `smoke` sends one synthetic failure example. The other commands send the specified file's contents; choose small excerpts and remove credentials first. Output is JSON. Exit code 0 means the evaluation completed, not that the application passed a test; 1 means invalid input and 2 means evaluation/configuration is unavailable.

`triage` accepts plain text or a JSON report as text, up to 24,000 characters. Results include a likely category, its distribution and confidence, model version, question revision, timing, and usage. Categories are `application`, `environment`, `test_setup`, `timing`, and `insufficient_evidence`. They are hypotheses for investigation.

`rank` accepts this shape:

```json
{
  "query": "Does Jev accept screenshots directly?",
  "claim": "Jev accepts screenshots directly.",
  "passages": [
    {
      "id": "models",
      "url": "https://docs.typesafe.ai/models",
      "text": "Jev accepts text input; image input is not supported."
    }
  ]
}
```

`claim` is optional and supplies the proposition for support/contradiction checks; without it the tool only ranks relevance and reports insufficient evidence for claim support. Keep source IDs unique. At most 20 passages, 6,000 characters per passage, and 30,000 total input characters are supported. All passages are preserved, including contradictory evidence. Ties retain input order. Source URLs come from the input, not generated output.

## Use inside Code Daddy

The repository's `.opencode/plugins/jev.ts` entry registers `jev_triage_failure`, `jev_rank_evidence`, and `jev_review_output` in legacy sessions. In V2 sessions, the tool names start with `plugin_jev_triage_failure_`, `plugin_jev_rank_evidence_`, and `plugin_jev_review_output_` (the registry appends stable identifiers). All use the same evaluator. Restart/reload the project's backend after installing the code so plugin discovery runs. Key changes do not require restart because settings are read per call.

In the app, open a completed response's Jev review action, check or edit the requirement, and optionally paste a small test or source excerpt with a link. **Run review** sends that bundle to TypeSafe through the local backend. Four typed findings cover requirement fit, support for check claims, completion boundaries, and actionable error steps. Findings are advisory; the original response, supplied excerpt, and changed-file list remain visible separately. A saved result survives reload and becomes stale if the response text changes. **Address findings** appends an editable draft to the composer. The app does not run checks or collect repository evidence for you; add an actual excerpt when review of a check claim matters.

Example requests:

> Use the Jev failure-triage tool on this failed test's assertion and relevant log excerpt. Treat its category as a hypothesis and investigate with ordinary tools.

> Use the Jev research-ranking tool to rank these documentation excerpts for my question. Preserve contradictory sources and inspect the original evidence before drawing a conclusion.

The tools use existing plugin permission checks, cancellation, and durable results. They do not create new permissions or run automatically on every message or test. A missing key, unavailable service, or invalid response cannot become a successful evaluation. Uncertain judgments remain advice to the coding agent; no production confidence threshold is implied.

The official TypeSafe skill is optional documentation support. These tools contain the actual integration. This package targets this repository's backend; it is not an installed tool in every other coding assistant on your computer.

## Validate without making live calls

```bash
bun test
bun typecheck
```

Tests use local HTTP fixtures and temporary private settings files. They never require a real API key. Live evaluations are separate from required CI and deterministic Playwright assertions.

To try the supplied labeled examples after configuring your key:

```bash
bun run jev evaluate fixtures/evaluation.json
```

This makes up to ten calls sequentially and reports accuracy among answered cases and coverage. It stops on service unavailability. The ten examples are synthetic sanity checks, including an injected instruction; they are not a validated benchmark or evidence of production reliability. Add real examples and reserve an untouched holdout before tuning questions or using scores for automation.

The model is pinned by default and calls have a total deadline plus bounded retries. Do not interpret a confidence of 0.9 as demonstrated 90% correctness. Consult [TypeSafe's confidence documentation](https://docs.typesafe.ai/confidence) and [known limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

### Sanitized validation diagnostics

Direct evaluator callers may opt into `{ ...settings, diagnostics: true }`.
An `invalid_response` then includes only a `validation` category:
`response_schema`, `answer_ids`, `choice_answer`, or `ranking_answer`.
Answer categories include score/choice shape and probability validation.
No request, response body, credential, or raw exception is included. The default
remains off, and malformed answers remain unavailable rather than usable results.
