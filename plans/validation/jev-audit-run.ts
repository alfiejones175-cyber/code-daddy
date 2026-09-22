import ts from "typescript"
import { createHash } from "node:crypto"
import { rankEvidence } from "../../packages/jev/src/evaluator"
import { loadSettings } from "../../packages/jev/src/settings"

// Run from the repository root. Inventory is local; --evaluate sends selected source excerpts to Jev.
const paths = (await Bun.$`rg --files packages github sdks script .github -g '*.{ts,tsx,js,jsx,mjs,cjs}'`.text())
  .trim()
  .split("\n")
  .filter((path) => !/(^|\/)(node_modules|dist|build|generated|generated-effect|gen|test|tests|e2e|test-browser|fixtures|i18n|locales|recordings)(\/|$)/.test(path))
  .filter((path) => !/\.(test|spec|stories|d)\.[cm]?[jt]sx?$/.test(path))

const files = await Promise.all(paths.map(async (path) => {
  const text = await Bun.file(path).text()
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  const functions: { line: number; end: number; lines: number; decisions: number; name: string }[] = []
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) {
      const decisions: ts.Node[] = []
      const count = (child: ts.Node) => {
        if (child !== node && ts.isFunctionLike(child)) return
        if (ts.isIfStatement(child) || ts.isConditionalExpression(child) || ts.isCaseClause(child) ||
          ts.isForStatement(child) || ts.isForOfStatement(child) || ts.isForInStatement(child) ||
          ts.isWhileStatement(child) || ts.isDoStatement(child) || ts.isCatchClause(child) ||
          (ts.isBinaryExpression(child) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(child.operatorToken.kind))) decisions.push(child)
        ts.forEachChild(child, count)
      }
      count(node)
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
      const end = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1
      const name = node.name?.getText(source) ?? (ts.isVariableDeclaration(node.parent) ? node.parent.name.getText(source) : "callback")
      functions.push({ line, end, lines: end - line + 1, decisions: decisions.length, name })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return {
    path,
    package: path.startsWith("packages/console/") || path.startsWith("packages/stats/") || path.startsWith("packages/sdk/")
      ? path.split("/").slice(0, 3).join("/") : path.split("/").slice(0, 2).join("/"),
    sha256: createHash("sha256").update(text).digest("hex"),
    lines: text.split("\n").length,
    markers: text.split("\n").flatMap((line, index) => /\b(TODO|FIXME|HACK)\b|not implemented|not available yet/.test(line) ? [index + 1] : []),
    functionCount: functions.length,
    functions: functions.sort((a, b) => b.decisions - a.decisions).slice(0, 5),
  }
}))
const inventory = {
  createdAt: new Date().toISOString(),
  head: (await Bun.$`git rev-parse HEAD`.text()).trim(),
  description: "TypeScript/JavaScript local inventory. Stores the five functions with most decision nodes per file. Decision counts are syntactic review signals, excluding nested functions, not proof of excessive complexity. Excludes generated code, tests, fixtures, declarations, translations. Working tree may differ from HEAD; per-file hashes identify inspected bytes.",
  files,
}
if (!process.argv.includes("--resume")) await Bun.write("plans/validation/jev-audit-inventory.json", JSON.stringify(inventory, null, 2) + "\n")
const hotspots = files.flatMap((file) => file.functions.slice(0, 1).map((fn) => ({ path: file.path, package: file.package, ...fn })))
  .sort((a, b) => b.decisions - a.decisions)
console.log(JSON.stringify({ files: files.length, lines: files.reduce((sum, file) => sum + file.lines, 0), packages: new Set(files.map((file) => file.package)).size, markers: files.reduce((sum, file) => sum + file.markers.length, 0), hotspots: hotspots.slice(0, 18) }, null, 2))

if (!process.argv.includes("--evaluate")) process.exit(0)
const settings = await loadSettings()
if (!settings.apiKey) throw new Error("Jev is not configured")

const packageLeaders = [...new Map(hotspots.toReversed().map((item) => [item.package, item])).values()]
const selected = [...new Map([...hotspots.slice(0, 12), ...packageLeaders].map((item) => [item.path, item])).values()]
const incomplete = files.filter((file) => file.markers.length > 0).sort((a, b) => b.markers.length - a.markers.length)
const markerLeaders = [...new Map(incomplete.toReversed().map((file) => [file.package, file])).values()]
const targets = [
  ...selected.map((item) => ({ path: item.path, line: item.line, category: "complexity", context: `Function ${item.name}, span ${item.lines} lines, ${item.decisions} syntactic decision nodes excluding nested functions. Only an excerpt follows, so do not infer a bug from size.` })),
  ...markerLeaders.map((item) => ({ path: item.path, line: item.markers[0], category: "incomplete", context: "A local incomplete-work marker selected this excerpt. Distinguish deliberate unsupported behavior and harmless comments from unfinished exposed behavior." })),
]
const excerpts: { id: string; path: string; category: string; start: number; end: number; sha256: string; text: string }[] = process.argv.includes("--resume")
  ? await Bun.file("plans/validation/jev-audit-excerpts.json").json()
  : await Promise.all(targets.map(async (item, index) => {
  const text = await Bun.file(item.path).text()
  const lines = text.split("\n")
  const start = Math.max(1, item.line - 6)
  const selected: string[] = []
  for (const [offset, line] of lines.slice(start - 1, start + 100).entries()) {
    if (selected.join("\n").length + line.length > 4800) break
    selected.push(`${start + offset}: ${line}`)
  }
  return { id: `source-${index + 1}`, path: item.path, category: item.category, start, end: start + selected.length - 1, sha256: createHash("sha256").update(text).digest("hex"), text: `${item.path}\n${item.context}\n${selected.join("\n")}` }
}))
// Never include the configured credential in a request or persisted evidence.
if (excerpts.some((item) => item.text.includes(settings.apiKey!))) throw new Error("Credential detected in selected source")
await Bun.write("plans/validation/jev-audit-excerpts.json", JSON.stringify(excerpts, null, 2) + "\n")
const results: { category: string; input: { query: string; passages: { id: string; text: string }[] }; result: Awaited<ReturnType<typeof rankEvidence>> }[] = process.argv.includes("--resume")
  ? (await Bun.file("plans/validation/jev-audit-results.json").json()).results
  : []
for (const category of ["complexity", "incomplete"]) {
  const subset = excerpts.filter((item) => item.category === category)
  for (let offset = 0; offset < subset.length; offset += 4) {
    const input = {
      query: category === "complexity"
        ? "Find specific source evidence worth reviewing for unnecessarily complicated control flow, mixed responsibilities, duplicated policy, or brittle state coordination. Large size alone is not a defect. Intentional compatibility layers may be necessary. Rank evidence relevance, not bug probability."
        : "Find specific source evidence of unfinished features, unreachable or stubbed operations, missing lifecycle handling, and actionable missing test coverage. Distinguish deliberate unsupported capabilities or harmless TODO comments from incomplete user-visible behavior. Rank evidence relevance, not bug probability.",
      passages: subset.slice(offset, offset + 4).map((item) => ({ id: item.id, text: item.text })),
    }
    if (results.some((item) => item.result.status === "ok" && JSON.stringify(item.input) === JSON.stringify(input))) continue
    const result = await rankEvidence(input, settings)
    results.push({ category, input, result })
    await Bun.write("plans/validation/jev-audit-results.json", JSON.stringify({ createdAt: new Date().toISOString(), results }, null, 2) + "\n")
    console.log(JSON.stringify({ batch: results.length, category, status: result.status, ...(result.status === "ok" ? { usage: result.usage, durationMs: result.durationMs, scores: result.ranking.map((item) => ({ id: item.id, score: item.score })) } : {}) }))
    if (result.status === "unavailable" && result.reason !== "invalid_response") throw new Error("Audit stopped after an unavailable Jev response; inspect sanitized result")
  }
}
