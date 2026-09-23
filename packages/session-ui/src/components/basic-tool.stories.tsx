// @ts-nocheck
import { createSignal } from "solid-js"
import * as mod from "./basic-tool"
import { create } from "@opencode-ai/ui/storybook/scaffold"

const docs = `### Overview
Expandable tool panel with a structured trigger and optional details.

Use structured triggers for consistent layout; custom triggers allowed.

### API
- Required: \`icon\` and \`trigger\` (structured or custom JSX).
- Optional: \`status\`, \`defaultOpen\`, \`forceOpen\`, \`defer\`, \`locked\`.

### Variants and states
- Pending/running status animates the title via TextShimmer.

### Behavior
- Uses Collapsible; can defer content rendering until open.
- Locked state prevents closing.

### Accessibility
- TODO: confirm trigger semantics and aria labeling.

### Theming/tokens
- Uses \`data-component="tool-trigger"\` and related slots.

`

const story = create({
  title: "UI/Basic Tool",
  mod,
  args: {
    icon: "mcp",
    defaultOpen: true,
    trigger: {
      title: "Basic Tool",
      subtitle: "Example subtitle",
      args: ["--flag", "value"],
    },
    children: "Details content",
  },
})

export default {
  title: "UI/Basic Tool",
  id: "components-basic-tool",
  component: story.meta.component,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs,
      },
    },
  },
}

export const Basic = story.Basic

export const Pending = {
  args: {
    status: "pending",
    trigger: {
      title: "Running tool",
      subtitle: "Working...",
    },
    children: "Progress details",
  },
}

export const Locked = {
  args: {
    locked: true,
    trigger: {
      title: "Locked tool",
      subtitle: "Cannot close",
    },
    children: "Locked details",
  },
}

export const Deferred = {
  args: {
    defer: true,
    defaultOpen: false,
    trigger: {
      title: "Deferred tool",
      subtitle: "Content mounts on open",
    },
    children: "Deferred content",
  },
}

export const ForceOpen = {
  args: {
    forceOpen: true,
    trigger: {
      title: "Forced open",
      subtitle: "Cannot close",
    },
    children: "Forced content",
  },
}

export const HideDetails = {
  args: {
    hideDetails: true,
    trigger: {
      title: "Summary only",
      subtitle: "Details hidden",
    },
    children: "Hidden content",
  },
}

export const SubtitleAction = {
  render: () => {
    const [message, setMessage] = createSignal("Subtitle not clicked")
    return (
      <div style={{ display: "grid", gap: "8px" }}>
        <div style={{ "font-size": "12px", color: "var(--text-weak)" }}>{message()}</div>
        <mod.BasicTool
          icon="mcp"
          trigger={{ title: "Clickable subtitle", subtitle: "Click me" }}
          onSubtitleClick={() => setMessage("Subtitle clicked")}
        >
          Subtitle action details
        </mod.BasicTool>
      </div>
    )
  },
}

export const JevResult = {
  render: () => (
    <mod.GenericTool
      tool="plugin_jev_triage_failure_4x5b"
      input={{ evidence: "Expected the session to become idle, but it remained busy after the retry completed." }}
      output={JSON.stringify({
        status: "ok",
        advisory: true,
        category: "timing",
        confidence: 0.82,
        model: "jev-1.13.0",
      })}
    />
  ),
}

export const JevUnavailable = {
  render: () => (
    <mod.GenericTool
      tool="jev_rank_evidence"
      input={{
        query: "Why did the regression fail?",
        passages: [{ id: "failure-log", text: "The retry completed but the session remained busy." }],
      }}
      output={JSON.stringify({
        status: "unavailable",
        reason: "missing_key",
        message: "Jev is unavailable because no API key is configured.",
      })}
    />
  ),
}

export const JevLargeEvidence = {
  render: () => (
    <mod.GenericTool
      tool="jev_triage_failure"
      input={{ evidence: "A".repeat(24_000) }}
      output={JSON.stringify({
        status: "invalid_input",
        reason: "invalid_input",
        message: "Input did not match the expected schema.",
      })}
    />
  ),
}
