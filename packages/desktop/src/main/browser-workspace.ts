import type { BrowserWindow, WebContentsView } from "electron"

export type BrowserWorkspaceBounds = { x: number; y: number; width: number; height: number }
export type BrowserWorkspaceDiagnostic =
  | { kind: "console"; message: string; time: number; level?: number; line?: number; source?: string }
  | { kind: "request"; message: string; time: number; code?: number; url?: string }

export const MAX_BROWSER_WORKSPACE_DIAGNOSTICS = 100
const MAX_DIAGNOSTIC_TEXT = 500

export function resolveBrowserWorkspaceURL(value: string) {
  if (!URL.canParse(value)) return undefined
  const url = new URL(value)
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
  if (!url.hostname || url.username || url.password) return undefined
  return url.href
}

export function appendBrowserWorkspaceDiagnostic(
  diagnostics: BrowserWorkspaceDiagnostic[],
  diagnostic: BrowserWorkspaceDiagnostic,
) {
  diagnostics.push(diagnostic)
  if (diagnostics.length > MAX_BROWSER_WORKSPACE_DIAGNOSTICS) diagnostics.shift()
}

export function clearBrowserWorkspaceDiagnostics(diagnostics: BrowserWorkspaceDiagnostic[]) {
  diagnostics.length = 0
}

export async function createBrowserWorkspace(input: { window: BrowserWindow }) {
  const { session, WebContentsView } = await import("electron")
  if (input.window.isDestroyed()) throw new Error("Browser workspace window is closed")
  const partition = `browser-workspace-${input.window.id}`
  const browserSession = session.fromPartition(partition)
  browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  browserSession.setPermissionCheckHandler(() => false)
  const view = new WebContentsView({
    webPreferences: {
      partition,
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })
  const diagnostics: BrowserWorkspaceDiagnostic[] = []
  let destroyed = false

  const append = (diagnostic: BrowserWorkspaceDiagnostic) => {
    appendBrowserWorkspaceDiagnostic(diagnostics, diagnostic)
  }
  const diagnosticURL = (url: string) => resolveBrowserWorkspaceURL(url)?.slice(0, MAX_DIAGNOSTIC_TEXT)
  const requestFilter = { urls: ["<all_urls>"] }
  const belongsToView = (details: { webContentsId?: number }) => details.webContentsId === view.webContents.id
  const onErrorOccurred = (details: Electron.OnErrorOccurredListenerDetails) => {
    if (!belongsToView(details)) return
    append({
      kind: "request",
      message: details.error.slice(0, MAX_DIAGNOSTIC_TEXT),
      time: Date.now(),
      url: diagnosticURL(details.url),
    })
  }
  const onCompleted = (details: Electron.OnCompletedListenerDetails) => {
    if (!belongsToView(details) || details.statusCode < 400) return
    append({
      kind: "request",
      message: `${details.statusCode} ${details.statusLine}`.slice(0, MAX_DIAGNOSTIC_TEXT),
      time: Date.now(),
      code: details.statusCode,
      url: diagnosticURL(details.url),
    })
  }

  browserSession.webRequest.onErrorOccurred(requestFilter, onErrorOccurred)
  browserSession.webRequest.onCompleted(requestFilter, onCompleted)

  view.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  view.webContents.on("will-navigate", (event, url) => {
    if (!resolveBrowserWorkspaceURL(url)) event.preventDefault()
  })
  view.webContents.on("will-redirect", (event, url) => {
    if (!resolveBrowserWorkspaceURL(url)) event.preventDefault()
  })
  view.webContents.on("did-start-navigation", (_event, _url, _isInPlace, isMainFrame) => {
    if (isMainFrame) clearBrowserWorkspaceDiagnostics(diagnostics)
  })
  view.webContents.on("console-message", (_event, level, message, line, source) => {
    append({
      kind: "console",
      level,
      message: message.slice(0, MAX_DIAGNOSTIC_TEXT),
      time: Date.now(),
      line,
      source: source.slice(0, MAX_DIAGNOSTIC_TEXT),
    })
  })
  view.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame) return
    append({
      kind: "request",
      code,
      message: description.slice(0, MAX_DIAGNOSTIC_TEXT),
      time: Date.now(),
      url: diagnosticURL(url),
    })
  })

  const onClosed = () => destroy()
  input.window.once("closed", onClosed)

  const setBounds = (bounds: BrowserWorkspaceBounds) => {
    if (destroyed || input.window.isDestroyed()) throw new Error("Browser workspace is closed")
    if (
      ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
      bounds.width <= 0 ||
      bounds.height <= 0
    )
      throw new Error("Browser workspace bounds are invalid")
    const next = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height)),
    }
    view.setBounds(next)
  }

  function destroy() {
    if (destroyed) return
    destroyed = true
    input.window.removeListener("closed", onClosed)
    browserSession.webRequest.onErrorOccurred(null)
    browserSession.webRequest.onCompleted(null)
    if (!input.window.isDestroyed()) input.window.contentView.removeChildView(view)
    if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false })
  }

  return {
    async navigate(url: string, bounds: BrowserWorkspaceBounds) {
      if (destroyed || input.window.isDestroyed()) throw new Error("Browser workspace is closed")
      const safeURL = resolveBrowserWorkspaceURL(url)
      if (!safeURL) throw new Error("Browser workspace URL must use HTTP or HTTPS")
      setBounds(bounds)
      clearBrowserWorkspaceDiagnostics(diagnostics)
      if (!input.window.contentView.children.includes(view)) input.window.contentView.addChildView(view)
      view.setVisible(false)
      await view.webContents.loadURL(safeURL)
      if (destroyed || input.window.isDestroyed()) throw new Error("Browser workspace is closed")
      const finalURL = resolveBrowserWorkspaceURL(view.webContents.getURL())
      if (!finalURL) throw new Error("Browser workspace ended at an unsafe URL")
      view.setVisible(true)
      return finalURL
    },
    setBounds,
    show(bounds: BrowserWorkspaceBounds) {
      if (destroyed || input.window.isDestroyed()) throw new Error("Browser workspace is closed")
      const url = resolveBrowserWorkspaceURL(view.webContents.getURL())
      if (!url) throw new Error("Browser workspace has no safe page to show")
      setBounds(bounds)
      if (!input.window.contentView.children.includes(view)) input.window.contentView.addChildView(view)
      view.setVisible(true)
      return url
    },
    hide() {
      if (destroyed) return
      view.setVisible(false)
    },
    destroy,
    async capture() {
      if (destroyed) throw new Error("Browser workspace is closed")
      return (await view.webContents.capturePage()).toDataURL()
    },
    getDiagnostics() {
      return diagnostics.slice()
    },
    currentURL() {
      if (destroyed || input.window.isDestroyed() || view.webContents.isDestroyed()) return undefined
      return resolveBrowserWorkspaceURL(view.webContents.getURL())
    },
  }
}

export type BrowserWorkspace = Awaited<ReturnType<typeof createBrowserWorkspace>>
