import path from "node:path"
import { mkdir, lstat, realpath, writeFile } from "node:fs/promises"
import { ConfigMarkdown } from "@opencode-ai/core/config/markdown"
import { Workflow } from "@opencode-ai/schema/workflow"
import type { Skill } from "@/skill"

export class RequestError extends Error {}
const saved = new Map<string, Map<string, Skill.Info>>()

export function validateSkill(draft: Workflow.SkillDraft) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(draft.name) || draft.name.length > 80)
    throw new RequestError("Use a lowercase skill name with words separated by hyphens.")
  const parsed = ConfigMarkdown.parseOption(draft.content)
  if (
    !parsed ||
    parsed.data.name !== draft.name ||
    typeof parsed.data.description !== "string" ||
    !parsed.data.description.trim() ||
    parsed.data.description.length > 1024 ||
    !parsed.content.trim()
  )
    throw new RequestError(
      "SKILL.md must have matching name and a description in YAML frontmatter, followed by instructions.",
    )
  return parsed
}

export async function saveSkill(directory: string, draft: Workflow.SkillDraft) {
  const parsed = validateSkill(draft)
  const root = await realpath(directory)
  const location = path.join(root, ".opencode", "skills", draft.name)
  for (const entry of [path.join(root, ".opencode"), path.join(root, ".opencode", "skills")]) {
    await mkdir(entry).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error
    })
    const stat = await lstat(entry)
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new RequestError("Skill directories must be local directories, without symbolic links.")
  }
  await mkdir(location).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new RequestError("A skill with this name already exists. Choose another name.")
    throw error
  })
  await writeFile(path.join(location, "SKILL.md"), draft.content, { flag: "wx" })
  const skill = {
    name: draft.name,
    description: parsed.data.description as string,
    content: parsed.content,
    location: path.join(location, "SKILL.md"),
  }
  const entries = saved.get(directory) ?? new Map<string, Skill.Info>()
  entries.set(draft.name, skill)
  saved.set(directory, entries)
  return draft
}

export function list(directory: string) {
  return [...(saved.get(directory)?.values() ?? [])]
}

export * as WorkflowSkill from "./skill"
