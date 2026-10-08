import path from "node:path"
import { mkdir, symlink } from "node:fs/promises"
import { expect, test } from "bun:test"
import { WorkflowSkill } from "../../src/workflow/skill"
import { tmpdir } from "../fixture/fixture"

const draft = {
  name: "file-export",
  content:
    "---\nname: file-export\ndescription: Export a report from the app.\n---\nOpen Reports. Select Export. Check the downloaded file.\n",
}

test("saved skill is immediately discoverable and cannot overwrite a skill", async () => {
  await using project = await tmpdir()
  await WorkflowSkill.saveSkill(project.path, draft)
  expect(await Bun.file(path.join(project.path, ".opencode/skills/file-export/SKILL.md")).text()).toBe(draft.content)
  expect(WorkflowSkill.list(project.path)[0]?.content).toContain("Select Export")
  await expect(WorkflowSkill.saveSkill(project.path, { ...draft, content: `${draft.content}changed` })).rejects.toThrow(
    "already exists",
  )
  expect(await Bun.file(path.join(project.path, ".opencode/skills/file-export/SKILL.md")).text()).toBe(draft.content)
})

test("skill names and required frontmatter are validated before writing", async () => {
  await using project = await tmpdir()
  for (const input of [
    { ...draft, name: "../../escape" },
    { ...draft, content: draft.content.replace("name: file-export", "name: different") },
    { ...draft, content: "---\nname: file-export\n---\nInstructions" },
    { ...draft, content: "---\nname: file-export\ndescription: Description\n---\n" },
  ])
    await expect(WorkflowSkill.saveSkill(project.path, input)).rejects.toBeInstanceOf(WorkflowSkill.RequestError)
  expect(await Bun.file(path.join(project.path, ".opencode/skills/file-export/SKILL.md")).exists()).toBe(false)
})

test("skill writes reject symlinked project skill directories", async () => {
  await using project = await tmpdir()
  await using outside = await tmpdir()
  await mkdir(path.join(project.path, ".opencode"))
  await symlink(outside.path, path.join(project.path, ".opencode/skills"))
  await expect(WorkflowSkill.saveSkill(project.path, draft)).rejects.toThrow("symbolic links")
  expect(await Bun.file(path.join(outside.path, "file-export/SKILL.md")).exists()).toBe(false)
})
