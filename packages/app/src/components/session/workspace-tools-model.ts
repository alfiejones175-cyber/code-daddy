import type { FilePart, ToolPart } from "@opencode-ai/sdk/v2"

export type WorkspaceEvidence = { image?: FilePart; text?: string; tool: string; time: number }

export function isHttpUrl(value: string) {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname && !url.username && !url.password
}

export function extractWorkspaceEvidence(
  messages: readonly { id: string; sessionID?: string; time?: { created?: number } }[],
  parts: Record<string, readonly unknown[] | undefined>,
  sessionID?: string,
): WorkspaceEvidence[] {
  return messages
    .filter((message) => !sessionID || message.sessionID === sessionID)
    .flatMap((message) =>
      (parts[message.id] ?? []).flatMap((value) => {
        const part = value as Partial<ToolPart>
        if (
          part.type !== "tool" ||
          typeof part.tool !== "string" ||
          !/browser|playwright|xcode|simulator/i.test(part.tool)
        )
          return []
        if (part.state?.status !== "completed") return []
        const state = part.state
        const image = state.attachments?.find(
          (attachment) =>
            /^(data:image\/(png|jpeg|webp);base64,)/i.test(attachment.url) &&
            /^(image\/(png|jpeg|webp))$/i.test(attachment.mime),
        )
        return [{ image, text: state.output, tool: part.tool, time: state.time.end ?? message.time?.created ?? 0 }]
      }),
    )
}
