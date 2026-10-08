# Project workflows

Code Daddy has an n8n-style visual workbench for its default local V1 server. Open **Workflows** in the project sidebar or **Settings → Workflows → Open workflows**. Choose an absolute project directory before creating or running a workflow.

The workbench uses the existing theme, model connections, MCP connections, skills, and permission rules. Workflow definitions and runs are stored under the server's OpenCode data directory in `workflows/`, partitioned by project. They are not stored in browser local storage. Import/export moves a definition as JSON; credentials are not part of a definition.

## Build and run

1. Create a workflow and name it. The initial Start connects to an AI task.
2. Select a step to configure it. Choose the exact model, instructions, skills, and MCP access for AI tasks. Computer tasks require an image-capable model and a connected browser/computer MCP.
3. Add and connect steps using the inspector. Drag steps, or focus a step and use the arrow keys, to arrange the canvas. Both Yes and No connections are required for a Clef decision. Connections must form an acyclic graph reachable from Start.
4. Save, supply the run input, and run. Run history shows progress and output. Open a step's task conversation to answer its tool/skill permissions. Approval steps pause until their specific step is approved.
5. Cancel stops further steps and signals the active operation. An external action already submitted may have completed; inspect its result before starting another run.

An AI task receives the run input, earlier completed outputs and the selected skill instructions. Direct MCP arguments accept `{{input}}` and `{{steps.STEP_ID}}` inside JSON string values. Copy a step's **Output reference** from its inspector. References do not evaluate code; missing outputs fail visibly. Branch merges run after all incoming paths have either completed or been skipped, with at least one selected incoming path.

Every run freezes the definition it started with. Editing a definition cannot change a paused run. Runs that were executing when the server stopped are marked interrupted when read, without replaying provider requests or tool side effects. Restart a reviewed workflow explicitly to do the work again. There is no unattended retry, loop, schedule, webhook trigger, or cloud placement in this implementation; existing Routines remain separate.

## Small agents and step harnesses

Open **Harness lab** from an AI or computer step's inspector. The builder saves the workflow first. A harness belongs to that specific step and contains its execution model, precise instructions, allowed tools, execution timeout, output contract, and review checklist.

1. Choose a **designer model** and a separate **execution model**. Use the lowest-estimated-price action to select a lower-cost compatible execution model from the connected catalog, or select one yourself. The designer can be stronger; future step runs use the execution model you accept.
2. Describe the goal and ask AI to design the harness. Review or edit its instructions and limits. The designer receives the step, your feedback, the previous draft, and bounded evidence from recent trials.
3. Test with a representative input. Optional prior-output fixtures supply earlier step outputs; the trial executes only this step. Trials use real tools and retain project permissions, so they can perform the allowed actions. Their task conversation exposes any permission request.
4. Inspect the output, automated validation, and human review checklist. Give feedback and refine with AI, or edit the draft yourself. Repeat with different examples or execution models until satisfied.
5. Explicitly **Accept & save** a successful trial. The exact tested revision becomes this step's accepted harness. Run the whole workflow to check how its accepted steps work together.

Drafts and trials persist separately from the accepted harness. Changing a draft does not replace the live harness. Acceptance requires a completed trial with passing automated checks and the same step and draft revision; interrupted, cancelled, failed, or stale trials cannot be accepted. Changing a step's model, instructions, skills, or MCP access after acceptance requires testing and accepting again. Changing its canvas position or display name does not invalidate the harness. Imported workflows must establish acceptance in their new project; imported acceptance is not trusted.

Accepted harnesses are applied by the runner, not merely displayed in the editor. The model is pinned, the exposed tool list is narrowed, sub-delegation is disabled, and existing project `ask`/`deny` rules remain authoritative. The timeout interrupts execution. Output length, JSON syntax, and required top-level JSON fields are checked before downstream steps continue. Failed checks retain bounded output for feedback. Review checklists are human criteria; they are not automatic proof of semantic correctness. The output-length check is not a provider token or spending cap, and cancellation cannot undo a tool action already completed.

Prices are catalog estimates per million tokens, not measured trial bills or quality rankings. Missing or zero-normalized prices are treated as unknown, not verified free. The low-price action compares a fixed input/output mix; actual cost depends on tokens, provider pricing tiers, tools, and retries. No model is silently substituted when unavailable. A small agent means a narrowly scoped task and constrained execution; the catalog does not guarantee a particular parameter count.

## Custom MCPs

Use **Connect a custom MCP** in the workbench. Remote HTTP endpoints and local command arrays are supported, with OAuth sign-in when the server requests it. The connection is persisted in the project's configuration and its discovered tools populate the picker. Local commands run on the project server. Existing MCP configuration, including its environment and authentication options, remains usable.

Selecting an MCP for a task restricts which MCP tools it receives. Existing `ask` and `deny` permissions are preserved. Direct MCP steps use the same permission service and before/after tool hooks; choosing a workflow does not silently authorize all tool actions. These restrictions are not an operating-system sandbox: an otherwise authorized shell tool still has the access allowed by the project's policies.

## Teach a skill

Choose **Teach a skill**, give it a lowercase hyphenated name and a goal, and select a connected vision model. Share a screen/window and capture key moments with notes, or upload PNG/JPEG/WebP screenshots. At most twelve frames are included. Captures are bounded and downscaled before submission; sharing stops on close, generation, or source termination.

The macOS 15+ desktop path uses the operating system's display-source picker; there is no automatic screen selection. Older systems and denied capture use screenshot uploads. The browser preview can use its native screen-sharing picker.

**Generate** sends the chosen captures and notes to the selected model and records them in a teaching session. It returns editable `SKILL.md` content. Review it, then **Save skill** writes `.opencode/skills/<name>/SKILL.md` in the selected project. Existing skills are not overwritten, and symlinked skill directories are rejected. The new skill is immediately available to workflow tasks. This creates reusable instructions; it does not fine-tune model weights or record an executable mouse macro.

## Model roles and Clef

Keep the model selection explicit; the backend does not silently substitute another model. Availability comes from the connected server catalog.

| Role | Candidate / selection rule |
| --- | --- |
| Write a skill from screenshots | A connected image-capable general model; compare how accurately it recovers prerequisites, actions and success checks from your demonstrations. |
| Execute computer/browser work | A vision/tool-capable model plus a compatible MCP. Claude Sonnet 5.5 and Opus 5.5 are supported computer-use candidates in Anthropic's current documentation; actual MCP behavior still needs task trials. |
| Choose a workflow branch | Cloudflare Clef or Clef-flash, using a typed yes/no question and a confidence threshold. |

Anthropic documents model/tool-version compatibility and the external execution environment; API support alone does not prove a given MCP or model is best for a task. Start with a small repeatable evaluation of task success, wrong actions, latency, and cost. [Anthropic computer-use documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)

Clef is a multimodal decision model, with Clef-flash as the lower-latency alternative. The implemented adapter sends workflow text/output evidence to its documented Workers AI endpoint, validates the probability, and refuses ambiguous decisions below the chosen confidence. It does not move the pointer or approve tools. Screenshot evidence sent directly to Clef is not implemented in this first adapter. [Cloudflare model API](https://developers.cloudflare.com/workers-ai/models/clef/), [Clef announcement](https://blog.cloudflare.com/clef-decision-models/)

Configure `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AUTH_TOKEN` (or `CLOUDFLARE_API_TOKEN`) in the **server process environment**. Do not put these credentials in a workflow definition. The catalog reports whether configuration is present; live service access is verified only by an actual successful request.

## Acceptance

See [dated validation](../plans/validation/workflows-2026-10-08.md) for tests, package provenance, installation state, and unverified live-provider/native capture paths. V2 servers show an unavailable state instead of offering a run path whose MCP support is incomplete.
