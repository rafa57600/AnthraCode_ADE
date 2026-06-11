/**
 * pi-host — Native Pi Coding Agent SDK integration.
 *
 * Provides in-process Pi Agent session management (`PiAgentHost`, `PiSessionHost`)
 * as an alternative to the subprocess-PTY overlay approach in `src/main/pi/`.
 *
 * ## Quick start
 *
 * ```ts
 * import { piAgentHost } from './pi-host'
 * import { getModel } from '@earendil-works/pi-ai'
 *
 * const model = await getModel({ provider: 'openai', model: 'gpt-4o' })
 * const session = await piAgentHost.createSession({
 *   worktreePath: '/path/to/worktree',
 *   model,
 *   paneKey: 'my-pane',
 * })
 *
 * await session.prompt('Explain this codebase')
 * ```
 *
 * ## Architecture
 *
 * ```
 * PiAgentHost (singleton, main process)
 *   ├── PiSessionHost 1  →  Agent (Pi SDK) + Session (store) + NodeExecutionEnv
 *   ├── PiSessionHost 2  →  Agent (Pi SDK) + Session (store) + NodeExecutionEnv
 *   └── ...
 * ```
 *
 * Events flow:
 * ```
 * Pi Agent.subscribe() → PiSessionHost.handleAgentEvent()
 *                      → PiSessionHost._emitEvent() → PiAgentHost callbacks
 *                      → agent-hook-server.ts → HookListenerState → IPC → Renderer
 * ```
 *
 * @module pi-host
 */

export {
  PiAgentHost,
  PiSessionHost,
  PiHostError,
  piAgentHost,
} from './agent-host'
export type { HostOptions } from './agent-host'

export { buildStatusPayload, buildToolSnapshot } from './agent-status-bridge'
export { registerPiNativeHandlers } from './pi-native-ipc'

export type {
  PiSessionStatus,
  CreatePiSessionParams,
  PiSessionSnapshot,
  PiSessionEvent,
  PiSessionEventCallback,
} from './types'

export { NATIVE_PI_HOOK_SOURCE } from './types'
