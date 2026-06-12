/**
 * pi-native-ipc — IPC handlers for native Pi SDK sessions.
 *
 * Exposes the PiAgentHost singleton to the renderer via Electron IPC channels.
 * The renderer uses these when the agent catalog marks Pi as `nativeSdk: true`,
 * bypassing the subprocess-PTY path entirely.
 *
 * ## Channel convention
 * All channels follow `pi-native:<action>` to avoid collisions.
 *
 * ## Why not pass `model` as a string and resolve it in the handler?
 * The Pi SDK's `getModel()` requires a known-provider literal and a model name
 * that exists in the provider's registry. At the IPC boundary we accept
 * `modelProvider` + `modelName` strings and resolve them, which keeps the
 * contract serializable while letting the main process handle SDK imports.
 */

import { ipcMain } from 'electron'
import type { PiSessionSnapshot } from './types'

// ── Safe guards ─────────────────────────────────────────────────────────────

let registered = false
let sdkAvailableLogged = false

async function getPiAgentHost() {
  // Why: native Pi is experimental and Pi's SDK packages are ESM-only. Lazy
  // loading keeps normal app startup on the subprocess fallback path from
  // touching SDK imports at all.
  const mod = await import('./agent-host')
  return mod.piAgentHost
}

async function resolvePiModel(provider: string, name: string) {
  const { getModel } = await import('@earendil-works/pi-ai')
  return getModel(provider as any, name as any)
}

async function logSdkAvailability(): Promise<void> {
  // Why: run the SDK smoke check exactly once at startup so operators can see
  // in the logs whether the in-process Pi SDK path will work.  Never blocks
  // app startup — a failed check just means the subprocess fallback is used.
  if (sdkAvailableLogged) return
  sdkAvailableLogged = true
  try {
    const { verifyPiSdkAvailable } = await import('./sdk-smoke')
    const ok = await verifyPiSdkAvailable()
    if (ok) {
      console.log('[pi-native] Pi SDK verified — native sessions available')
    } else {
      console.warn('[pi-native] Pi SDK smoke-check returned false — native sessions may fail')
    }
  } catch (err) {
    console.warn('[pi-native] Pi SDK smoke-check threw — native sessions unavailable', err)
  }
}

// ── Public registration ─────────────────────────────────────────────────────

export function registerPiNativeHandlers(): void {
  // Why: the macOS window re-creation path could trigger double-registration.
  // ipcMain.handle() throws on duplicate channels, so we guard with a
  // module-level flag (same pattern as register-core-handlers.ts).
  if (registered) return
  registered = true

  // Fire-and-forget SDK availability log. Never blocks registration.
  void logSdkAvailability()

  /** Create a new native Pi SDK session. */
  ipcMain.handle('pi-native:create-session', async (_event, params: unknown) => {
    const webContents = _event.sender
    const config = params as Record<string, unknown>

    if (typeof config?.modelProvider !== 'string' || typeof config?.modelName !== 'string') {
      throw new Error('pi-native:create-session requires modelProvider and modelName strings')
    }

    // Resolve the model via Pi SDK only after the native path is invoked.
    const model = await resolvePiModel(config.modelProvider, config.modelName)
    const piAgentHost = await getPiAgentHost()

    const session = await piAgentHost.createSession({
      worktreePath: String(config.worktreePath ?? ''),
      model,
      apiKey: typeof config.apiKey === 'string' ? config.apiKey : undefined,
      systemPrompt: typeof config.systemPrompt === 'string' ? config.systemPrompt : undefined,
      thinkingLevel: typeof config.thinkingLevel === 'string'
        ? config.thinkingLevel as any
        : undefined,
      paneKey: typeof config.paneKey === 'string' ? config.paneKey : undefined,
      sessionId: typeof config.sessionId === 'string' ? config.sessionId : undefined,
      toolExecution: typeof config.toolExecution === 'string'
        ? config.toolExecution as any
        : undefined,
    })

    // Why: native-agent tabs are renderer-owned, but Pi SDK events originate in
    // main. Forward serializable session events so the tab can show streaming
    // text and tool activity without polling snapshots.
    session.onEvent((event) => {
      webContents.send('pi-native:event', event)
    })

    return session.snapshot()
  })

  /** Destroy a session by id. Idempotent. */
  ipcMain.handle('pi-native:destroy-session', async (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string') {
      throw new Error('pi-native:destroy-session requires a sessionId string')
    }
    const piAgentHost = await getPiAgentHost()
    await piAgentHost.destroySession(sessionId)
    return { ok: true }
  })

  /** Send a text prompt to a session. */
  ipcMain.handle('pi-native:prompt', async (_event, params: unknown) => {
    const config = params as Record<string, unknown>
    if (typeof config?.sessionId !== 'string' || typeof config?.text !== 'string') {
      throw new Error('pi-native:prompt requires sessionId and text strings')
    }

    const piAgentHost = await getPiAgentHost()
    const session = piAgentHost.getSession(config.sessionId)
    if (!session) {
      throw new Error(`Session ${config.sessionId} not found`)
    }

    await session.prompt(config.text)
    return session.snapshot()
  })

  /** Abort the current inference in a session. */
  ipcMain.handle('pi-native:abort', async (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string') {
      throw new Error('pi-native:abort requires a sessionId string')
    }
    const piAgentHost = await getPiAgentHost()
    const session = piAgentHost.getSession(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }
    session.abort()
    return { ok: true }
  })

  /** Return snapshots of all active native Pi sessions. */
  ipcMain.handle('pi-native:list-sessions', async (): Promise<PiSessionSnapshot[]> => {
    const piAgentHost = await getPiAgentHost()
    return piAgentHost.listSessions()
  })

  /** Return a single session snapshot by id. Undefined if not found. */
  ipcMain.handle('pi-native:get-session', async (_event, sessionId: unknown): Promise<PiSessionSnapshot | undefined> => {
    if (typeof sessionId !== 'string') return undefined
    const piAgentHost = await getPiAgentHost()
    const session = piAgentHost.getSession(sessionId)
    return session?.snapshot()
  })
}
