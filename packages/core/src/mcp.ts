export * as MCP from "./mcp"

import path from "node:path"
import { pathToFileURL } from "node:url"
import Ajv from "ajv"
import Ajv2020 from "ajv/dist/2020.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { CallToolResultSchema, ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { MCP } from "@opencode-ai/schema/mcp"
import { Cause, Context, Effect, Exit, Layer, Scope, Schema } from "effect"
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"
import { Config } from "./config"
import { ConfigMCP } from "./config/mcp"
import { makeLocationNode } from "./effect/app-node"
import { FSUtil } from "./fs-util"
import { Location } from "./location"
import { PermissionV2 } from "./permission"
import { Tool } from "./tool/tool"
import { ToolRegistry } from "./tool/registry"
import { Tools } from "./tool/tools"

const DEFAULT_STARTUP_TIMEOUT = 30_000
const DEFAULT_REQUEST_TIMEOUT = 30_000
const Input = Schema.Record(Schema.String, Schema.Json)
const Content = Schema.Union([
  Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }),
  Schema.Struct({
    type: Schema.Literal("file"),
    data: Schema.String,
    mime: Schema.String,
    name: Schema.String.pipe(Schema.optional),
  }),
])
const Output = Schema.Struct({ content: Schema.Array(Content), output: Schema.String })

type Server = typeof ConfigMCP.Server.Type
type MCPTool = {
  readonly name: string
  readonly description?: string
  readonly inputSchema: Record<string, unknown>
}

type Entry = {
  readonly config: Server
  client?: Client
  scope?: Scope.Closeable
  revision: number
  tools: MCPTool[]
  info: MCP.Info
}

export interface Interface {
  readonly list: () => Effect.Effect<MCP.Info[]>
  readonly connect: (id: MCP.ID) => Effect.Effect<MCP.Info>
  readonly disconnect: (id: MCP.ID) => Effect.Effect<MCP.Info>
  readonly reconnect: (id: MCP.ID) => Effect.Effect<MCP.Info>
  readonly test: (id: MCP.ID) => Effect.Effect<MCP.Info>
  readonly preset: (id: "browser" | "xcode" | "openai-docs" | "github") => Effect.Effect<MCP.Info>
  readonly addRemote: (input: { name: string; url: string }) => Effect.Effect<MCP.Info>
  readonly remove: (id: MCP.ID) => Effect.Effect<MCP.Info>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/MCP") {}

const errorText = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))
const clean = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "_")

export const toolName = (server: string, tool: string) => {
  const name = `mcp_${clean(server)}_${clean(tool)}`
  const checksum = Array.from(`${server}\u0000${tool}`)
    .reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0)
    .toString(36)
  return `${name.slice(0, 63 - checksum.length)}_${checksum}`
}

const timeout = (server: Server, kind: "startup" | "request") =>
  server.timeout?.[kind] ?? (kind === "startup" ? DEFAULT_STARTUP_TIMEOUT : DEFAULT_REQUEST_TIMEOUT)

function output(result: { content: unknown; structuredContent?: unknown; isError?: unknown }) {
  const base = (Array.isArray(result.content) ? result.content : []).reduce<Array<typeof Content.Type>>(
    (result, item) => {
      if (!item || typeof item !== "object") return result
      const value = item as Record<string, unknown>
      if (value.type === "text" && typeof value.text === "string")
        return [...result, { type: "text" as const, text: value.text }]
      if (value.type === "image" && typeof value.data === "string" && typeof value.mimeType === "string")
        return [...result, { type: "file" as const, data: value.data, mime: value.mimeType }]
      if (value.type === "resource" && value.resource && typeof value.resource === "object") {
        const resource = value.resource as Record<string, unknown>
        if (typeof resource.text === "string") return [...result, { type: "text" as const, text: resource.text }]
      }
      return result
    },
    [],
  )
  const content =
    result.structuredContent === undefined
      ? base
      : [...base, { type: "text" as const, text: JSON.stringify(result.structuredContent) }]
  const text = content
    .filter((item): item is Extract<typeof Content.Type, { type: "text" }> => item.type === "text")
    .map((item) => item.text)
  if (text.length > 0) return { content, output: text.join("\n\n") }
  return { content, output: "MCP tool completed without text output." }
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const location = yield* Location.Service
    const fs = yield* FSUtil.Service
    const permissions = yield* PermissionV2.Service
    const tools = yield* Tools.Service
    const root = yield* Scope.make()
    const entries = new Map<MCP.ID, Entry>()

    yield* Effect.addFinalizer((exit) =>
      Effect.gen(function* () {
        for (const entry of entries.values()) {
          if (entry.scope) yield* Scope.close(entry.scope, exit).pipe(Effect.ignore)
        }
        yield* Scope.close(root, exit).pipe(Effect.ignore)
      }),
    )

    const makeInfo = (id: MCP.ID, server: Server, state: MCP.State, details: Partial<MCP.Info> = {}) =>
      new MCP.Info({
        id,
        name: id,
        transport: server.type,
        state,
        tools: [],
        ...details,
      })

    const close = Effect.fn("MCP.close")(function* (entry: Entry) {
      entry.client = undefined
      entry.tools = []
      const scope = entry.scope
      entry.scope = undefined
      if (scope) yield* Scope.close(scope, Exit.void).pipe(Effect.ignore)
    })

    const connect = Effect.fn("MCP.connect")(function* (id: MCP.ID, entry: Entry) {
      yield* close(entry)
      entry.revision += 1
      const revision = entry.revision
      if (entry.config.disabled) {
        entry.info = makeInfo(id, entry.config, "disabled")
        return entry.info
      }
      if (entry.config.type === "remote" && entry.config.oauth) {
        entry.info = makeInfo(id, entry.config, "failed", { error: "Remote MCP OAuth is not supported yet" })
        return entry.info
      }
      entry.info = makeInfo(id, entry.config, "configured")
      const transport =
        entry.config.type === "local"
          ? new StdioClientTransport({
              command: entry.config.command[0]!,
              args: entry.config.command.slice(1),
              cwd: entry.config.cwd ? path.resolve(location.directory, entry.config.cwd) : location.directory,
              env: {
                ...Object.fromEntries(
                  Object.entries(process.env).filter((entry): entry is [string, string] => !!entry[1]),
                ),
                ...entry.config.environment,
              },
              stderr: "pipe",
            })
          : new StreamableHTTPClientTransport(new URL(entry.config.url), {
              requestInit: entry.config.headers ? { headers: entry.config.headers } : undefined,
            })
      const client = new Client({ name: "opencode", version: "v2" }, { capabilities: { roots: {} } })
      client.setRequestHandler(ListRootsRequestSchema, () =>
        Promise.resolve({
          roots: [{ uri: pathToFileURL(location.directory).toString(), name: path.basename(location.directory) }],
        }),
      )
      const connected = yield* Effect.exit(
        Effect.tryPromise({ try: () => client.connect(transport), catch: errorText }).pipe(
          Effect.timeout(timeout(entry.config, "startup")),
          Effect.as(client),
        ),
      )
      if (Exit.isFailure(connected)) {
        yield* Effect.tryPromise(() => transport.close()).pipe(Effect.ignore)
        entry.info = makeInfo(id, entry.config, "failed", { error: errorText(Cause.squash(connected.cause)) })
        return entry.info
      }
      const listed = yield* Effect.exit(
        Effect.tryPromise({
          try: async () => {
            const tools: MCPTool[] = []
            let cursor: string | undefined
            do {
              const page = await client.listTools(cursor ? { cursor } : undefined, {
                timeout: timeout(entry.config, "request"),
              })
              tools.push(...page.tools)
              cursor = typeof page.nextCursor === "string" ? page.nextCursor : undefined
            } while (cursor)
            return tools
          },
          catch: errorText,
        }),
      )
      if (Exit.isFailure(listed)) {
        yield* Effect.tryPromise(() => client.close()).pipe(Effect.ignore)
        entry.info = makeInfo(id, entry.config, "failed", { error: errorText(Cause.squash(listed.cause)) })
        return entry.info
      }
      if (revision !== entry.revision) {
        yield* Effect.tryPromise(() => client.close()).pipe(Effect.ignore)
        return entry.info
      }
      const validated = yield* Effect.exit(
        Effect.try({
          try: () =>
            new Map(
              listed.value.map((item) => {
                const ajv =
                  item.inputSchema.$schema === "http://json-schema.org/draft-07/schema#"
                    ? new Ajv({ allErrors: true, strict: false })
                    : new Ajv2020({ allErrors: true, strict: false })
                return [item.name, ajv.compile(item.inputSchema)]
              }),
            ),
          catch: errorText,
        }),
      )
      if (Exit.isFailure(validated)) {
        yield* Effect.tryPromise(() => client.close()).pipe(Effect.ignore)
        entry.info = makeInfo(id, entry.config, "failed", { error: errorText(Cause.squash(validated.cause)) })
        return entry.info
      }
      const child = yield* Scope.fork(root)
      entry.scope = child
      entry.client = client
      entry.tools = listed.value
      entry.info = makeInfo(id, entry.config, listed.value.length ? "available" : "connected", {
        tools: listed.value.map(
          (item) => new MCP.Tool({ name: toolName(id, item.name), source: item.name, description: item.description }),
        ),
      })
      yield* Effect.addFinalizer(() => Effect.tryPromise(() => client.close()).pipe(Effect.ignore)).pipe(
        Scope.provide(child),
      )
      yield* tools
        .register(
          Object.fromEntries(
            listed.value.map((item) => [
              toolName(id, item.name),
              Tool.withPermission(
                Tool.make({
                  description: item.description ?? `MCP tool ${item.name} from ${id}`,
                  input: Input,
                  inputSchema: item.inputSchema,
                  output: Output,
                  toModelOutput: ({ output }) => output.content,
                  execute: (input, context) =>
                    Effect.gen(function* () {
                      if (entry.client !== client || entry.revision !== revision)
                        return yield* new Tool.Failure({ message: `MCP server ${id} changed; retry the tool call` })
                      const validator = validated.value.get(item.name)!
                      if (!validator(input))
                        return yield* new Tool.Failure({
                          message: `Invalid MCP input: ${validator.errors?.map((error: { message?: string }) => error.message).join(", ")}`,
                        })
                      yield* permissions
                        .assert({
                          action: `mcp.${id}.${item.name}`,
                          resources: [`server:${id}/tool:${item.name}`],
                          save: [`server:${id}/tool:${item.name}`],
                          sessionID: context.sessionID,
                          agent: context.agent,
                          source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
                        })
                        .pipe(
                          Effect.mapError(
                            () => new Tool.Failure({ message: `Permission denied for MCP ${id}/${item.name}` }),
                          ),
                        )
                      const result = yield* Effect.tryPromise({
                        try: (signal) =>
                          client.callTool({ name: item.name, arguments: input }, CallToolResultSchema, {
                            timeout: timeout(entry.config, "request"),
                            signal,
                            resetTimeoutOnProgress: true,
                            onprogress: () => {},
                          }),
                        catch: errorText,
                      }).pipe(
                        Effect.mapError(
                          (error) => new Tool.Failure({ message: `MCP ${id}/${item.name} failed: ${error}` }),
                        ),
                      )
                      if (entry.client !== client || entry.revision !== revision)
                        return yield* new Tool.Failure({
                          message: `MCP server ${id} changed while the tool was running`,
                        })
                      const normalized = output(result)
                      if (result.isError) return yield* new Tool.Failure({ message: normalized.output })
                      return normalized
                    }),
                }),
                `mcp.${id}.${item.name}`,
              ),
            ]),
          ),
        )
        .pipe(Scope.provide(child), Effect.orDie)
      return entry.info
    })

    const configEntries = yield* config.entries()
    const configured = Config.latest(configEntries, "mcp")?.servers ?? {}
    for (const [name, server] of Object.entries(configured)) {
      const id = MCP.ID.make(name)
      const entry: Entry = { config: server, revision: 0, tools: [], info: makeInfo(id, server, "configured") }
      entries.set(id, entry)
      yield* connect(id, entry)
    }
    const get = (id: MCP.ID) => entries.get(id)
    const unavailable = (id: MCP.ID) =>
      new MCP.Info({
        id,
        name: id,
        transport: "remote",
        state: "failed",
        error: "MCP server is not configured",
        tools: [],
      })
    const connectExisting = (id: MCP.ID) => {
      const entry = get(id)
      if (!entry) return Effect.succeed(unavailable(id))
      return connect(id, entry)
    }
    return Service.of({
      list: () => Effect.sync(() => Array.from(entries.values(), (entry) => entry.info)),
      connect: connectExisting,
      disconnect: (id) => {
        const entry = get(id)
        if (!entry) return Effect.succeed(unavailable(id))
        return Effect.gen(function* () {
          entry.revision += 1
          yield* close(entry)
          entry.info = makeInfo(id, entry.config, "configured")
          return entry.info
        })
      },
      reconnect: connectExisting,
      test: (id) => {
        const entry = get(id)
        if (!entry) return Effect.succeed(unavailable(id))
        if (!entry.client) return connect(id, entry)
        return Effect.gen(function* () {
          const client = entry.client
          if (!client) return yield* connect(id, entry)
          const revision = entry.revision
          const listed = yield* Effect.exit(
            Effect.tryPromise({
              try: () => client.listTools(undefined, { timeout: timeout(entry.config, "request") }),
              catch: errorText,
            }),
          )
          if (entry.client !== client || entry.revision !== revision) return entry.info
          if (Exit.isFailure(listed)) {
            yield* close(entry)
            entry.info = makeInfo(id, entry.config, "failed", { error: errorText(Cause.squash(listed.cause)) })
            return entry.info
          }
          return entry.info
        })
      },
      preset: (preset) =>
        Effect.gen(function* () {
          const id = MCP.ID.make(preset)
          const existing = get(id)
          if (existing) return existing.info
          if (preset === "xcode" && process.platform !== "darwin")
            return new MCP.Info({
              id,
              name: id,
              transport: "local",
              state: "failed",
              error: "Xcode MCP is available only on macOS",
              tools: [],
            })
          const server: Server =
            preset === "browser"
              ? new ConfigMCP.Local({ type: "local", command: ["npx", "-y", "@playwright/mcp", "--isolated"] })
              : preset === "xcode"
                ? new ConfigMCP.Local({ type: "local", command: ["xcrun", "mcpbridge"] })
                : preset === "openai-docs"
                  ? new ConfigMCP.Remote({ type: "remote", url: "https://developers.openai.com/mcp" })
                  : new ConfigMCP.Local({
                      type: "local",
                      command: [
                        "docker",
                        "run",
                        "-i",
                        "--rm",
                        "-p",
                        "127.0.0.1:8085:8085",
                        "-e",
                        "GITHUB_OAUTH_CALLBACK_PORT=8085",
                        "-e",
                        "GITHUB_READ_ONLY=1",
                        "-e",
                        "GITHUB_TOOLSETS=repos,issues,pull_requests,actions",
                        "ghcr.io/github/github-mcp-server",
                      ],
                      timeout: new ConfigMCP.Timeout({ startup: 120_000 }),
                    })
          const json = path.join(location.directory, "opencode.json")
          const jsonc = path.join(location.directory, "opencode.jsonc")
          const jsoncSource = yield* fs.readFileStringSafe(jsonc)
          const jsonSource = jsoncSource === undefined ? yield* fs.readFileStringSafe(json) : undefined
          const filepath = jsoncSource === undefined ? json : jsonc
          const source = jsoncSource ?? jsonSource ?? "{}\n"
          const errors: ParseError[] = []
          const current = parse(source, errors, { allowTrailingComma: true })
          if (errors.length > 0)
            return new MCP.Info({
              id,
              name: id,
              transport: server.type,
              state: "failed",
              error: `Cannot configure MCP preset because ${path.basename(filepath)} has invalid JSON`,
              tools: [],
            })
          const existingServer =
            current &&
            typeof current === "object" &&
            (current as { mcp?: { servers?: Record<string, unknown> } }).mcp?.servers?.[preset]
          if (existingServer !== undefined)
            return new MCP.Info({
              id,
              name: id,
              transport: server.type,
              state: "configured",
              error: `MCP preset already exists in ${path.basename(filepath)}`,
              tools: [],
            })
          yield* fs.writeWithDirs(
            filepath,
            applyEdits(
              source,
              modify(source, ["mcp", "servers", preset], server, {
                formattingOptions: { insertSpaces: true, tabSize: 2 },
              }),
            ),
          )
          const entry: Entry = { config: server, revision: 0, tools: [], info: makeInfo(id, server, "configured") }
          entries.set(id, entry)
          return yield* connect(id, entry)
        }).pipe(
          Effect.catch((error) =>
            Effect.succeed(
              new MCP.Info({
                id: MCP.ID.make(preset),
                name: preset,
                transport: preset === "openai-docs" ? "remote" : "local",
                state: "failed",
                error: errorText(error),
                tools: [],
              }),
            ),
          ),
        ),
      addRemote: (input) =>
        Effect.gen(function* () {
          const id = MCP.ID.make(input.name.trim())
          const server = new ConfigMCP.Remote({ type: "remote", url: input.url.trim() })
          if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id))
            return makeInfo(id, server, "failed", { error: "Invalid MCP server name" })
          const url = URL.canParse(server.url) ? new URL(server.url) : undefined
          if (
            !url ||
            !!url.username ||
            !!url.password ||
            (url.protocol !== "https:" &&
              !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
          )
            return makeInfo(id, server, "failed", { error: "Use an HTTPS URL, or HTTP on localhost" })
          if (get(id)) return makeInfo(id, server, "failed", { error: "MCP server already exists" })
          const json = path.join(location.directory, "opencode.json")
          const jsonc = path.join(location.directory, "opencode.jsonc")
          const jsoncSource = yield* fs.readFileStringSafe(jsonc)
          const jsonSource = jsoncSource === undefined ? yield* fs.readFileStringSafe(json) : undefined
          const filepath = jsoncSource === undefined ? json : jsonc
          const source = jsoncSource ?? jsonSource ?? "{}\n"
          const errors: ParseError[] = []
          const current = parse(source, errors, { allowTrailingComma: true })
          if (errors.length > 0)
            return makeInfo(id, server, "failed", { error: `${path.basename(filepath)} has invalid JSON` })
          const existing =
            current &&
            typeof current === "object" &&
            (current as { mcp?: { servers?: Record<string, unknown> } }).mcp?.servers?.[id]
          if (existing !== undefined) return makeInfo(id, server, "failed", { error: "MCP server already exists" })
          yield* fs.writeWithDirs(
            filepath,
            applyEdits(
              source,
              modify(source, ["mcp", "servers", id], server, {
                formattingOptions: { insertSpaces: true, tabSize: 2 },
              }),
            ),
          )
          const entry: Entry = { config: server, revision: 0, tools: [], info: makeInfo(id, server, "configured") }
          entries.set(id, entry)
          return yield* connect(id, entry)
        }).pipe(
          Effect.catch((error) =>
            Effect.succeed(
              makeInfo(MCP.ID.make(input.name), new ConfigMCP.Remote({ type: "remote", url: input.url }), "failed", {
                error: errorText(error),
              }),
            ),
          ),
        ),
      remove: (id) =>
        Effect.gen(function* () {
          const entry = get(id)
          if (!entry) return unavailable(id)
          const json = path.join(location.directory, "opencode.json")
          const jsonc = path.join(location.directory, "opencode.jsonc")
          const sources = yield* Effect.all([fs.readFileStringSafe(json), fs.readFileStringSafe(jsonc)])
          const files = [
            { filepath: json, source: sources[0] },
            { filepath: jsonc, source: sources[1] },
          ].filter((file): file is { filepath: string; source: string } => file.source !== undefined)
          const configured = files.flatMap((file) => {
            const errors: ParseError[] = []
            const current = parse(file.source, errors, { allowTrailingComma: true })
            if (errors.length > 0) return [{ ...file, error: `${path.basename(file.filepath)} has invalid JSON` }]
            const server =
              current &&
              typeof current === "object" &&
              (current as { mcp?: { servers?: Record<string, unknown> } }).mcp?.servers?.[id]
            return server === undefined ? [] : [{ ...file }]
          })
          const invalid = configured.find((file) => "error" in file)
          if (invalid && typeof invalid.error === "string")
            return makeInfo(id, entry.config, "failed", { error: invalid.error })
          if (configured.length === 0)
            return makeInfo(id, entry.config, "failed", { error: "MCP server is not in the project config" })
          yield* Effect.forEach(
            configured,
            (file) =>
              fs.writeWithDirs(
                file.filepath,
                applyEdits(
                  file.source,
                  modify(file.source, ["mcp", "servers", id], undefined, {
                    formattingOptions: { insertSpaces: true, tabSize: 2 },
                  }),
                ),
              ),
            { concurrency: 1 },
          )
          entry.revision += 1
          yield* close(entry)
          entries.delete(id)
          return makeInfo(id, entry.config, "disabled")
        }).pipe(
          Effect.catch((error) =>
            Effect.succeed(
              new MCP.Info({
                id,
                name: id,
                transport: get(id)?.config.type ?? "remote",
                state: "failed",
                error: errorText(error),
                tools: [],
              }),
            ),
          ),
        ),
    })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Config.node, Location.node, FSUtil.node, PermissionV2.node, ToolRegistry.toolsNode],
})
