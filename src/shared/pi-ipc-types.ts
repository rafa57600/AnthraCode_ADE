/**
 * pi-ipc-types — Shared types for Pi native SDK IPC channels.
 *
 * These types are consumed by both the main process (handler params/returns),
 * the preload bridge (method signatures), and the renderer (call sites).
 * They live in `src/shared/` so all three typecheck targets can import them
 * without cross-scope dependency violations.
 *
 * ## Related types (main-process only)
 * The internal `CreatePiSessionParams` (accepts Pi SDK `Model` objects) lives
 * in `src/main/pi-host/types.ts`. This file holds the serializable IPC-surface
 * types that cross the process boundary.
 */

// ── Session status ───────────────────────────────────────────────────────────

/** Orca-level status of a native Pi session. */
export type PiSessionStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'streaming'
  | 'interrupted'
  | 'error'
  | 'finished'

// ── Snapshot (response type) ─────────────────────────────────────────────────

/** Snapshot of a native Pi session — the primary response type. */
export interface PiSessionSnapshot {
  sessionId: string
  status: PiSessionStatus
  paneKey?: string
  worktreePath: string
  createdAt: number
  lastActivityAt: number
  messageCount: number
  errorMessage?: string
}

// ── Events (push from main to renderer) ──────────────────────────────────────

/** Events emitted by a native Pi session to the renderer. */
export type PiSessionEvent =
  | { type: 'status_change'; status: PiSessionStatus; sessionId: string }
  | { type: 'error'; sessionId: string; error: Error }
  | { type: 'finished'; sessionId: string; messageCount: number }
  | { type: 'tool_call'; sessionId: string; toolName: string; toolInput: unknown }
  | { type: 'tool_result'; sessionId: string; toolName: string; isError: boolean }
  | { type: 'assistant_message'; sessionId: string; text: string }

/** Callback signature for Pi session event consumers. */
export type PiSessionEventCallback = (event: PiSessionEvent) => void

// ── IPC request shapes ───────────────────────────────────────────────────────

/** Parameters for pi-native:create-session (serializable IPC surface). */
export interface PiCreateSessionConfig {
  modelProvider: string
  modelName: string
  worktreePath: string
  paneKey?: string
  systemPrompt?: string
  apiKey?: string
  thinkingLevel?: string
  sessionId?: string
  toolExecution?: string
}

/** Parameters for pi-native:prompt. */
export interface PiPromptParams {
  sessionId: string
  text: string
}

// ── IPC channel map (documentation / IDE support) ────────────────────────────

/**
 * Map of every pi-native IPC channel to its [request, response] tuple.
 * Not used at runtime — serves as a single source of truth for the channel
 * contracts consumed by the preload bridge and the main handler.
 */
export interface PiNativeChannelMap {
  'pi-native:create-session': { request: PiCreateSessionConfig; response: PiSessionSnapshot }
  'pi-native:destroy-session': { request: string; response: { ok: boolean } }
  'pi-native:prompt': { request: PiPromptParams; response: PiSessionSnapshot }
  'pi-native:abort': { request: string; response: { ok: boolean } }
  'pi-native:list-sessions': { request: void; response: PiSessionSnapshot[] }
  'pi-native:get-session': { request: string; response: PiSessionSnapshot | undefined }
}
