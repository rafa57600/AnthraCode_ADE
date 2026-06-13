import type { AgentTool, ThinkingLevel } from '@earendil-works/pi-agent-core'
import type { Model, Transport } from '@earendil-works/pi-ai'
import type { AgentHookSource } from '../../shared/agent-hook-relay'
import type { ToolExecutionMode } from '@earendil-works/pi-agent-core'

/**
 * Re-export shared IPC types so existing main-process imports still resolve.
 * See src/shared/pi-ipc-types.ts for the canonical definitions.
 */
export type {
  PiSessionStatus,
  PiSessionSnapshot,
  PiSessionEvent,
  PiSessionEventCallback,
  PiSessionToolCallEvent,
  PiSessionToolUpdateEvent,
  PiSessionToolResultEvent,
  PiTokenUsage
} from '../../shared/pi-ipc-types'

/** Parameters for creating a native Pi session. */
export interface CreatePiSessionParams {
  /** Absolute path to the worktree the session operates in. */
  worktreePath: string
  /** The AI model to use. */
  model: Model<any>
  /** Optional api key override. Falls back to env/provider resolution when omitted. */
  apiKey?: string
  /** Optional system prompt override. */
  systemPrompt?: string
  /** Optional thinking level. */
  thinkingLevel?: ThinkingLevel
  /** Pane key for agent status routing. */
  paneKey?: string
  /** Additional Orca-provided tools beyond Pi's built-ins. */
  tools?: AgentTool<any>[]
  /** Unique session identifier. Auto-generated when omitted. */
  sessionId?: string
  /** Transport preference for the Pi AgentSession stream. */
  transport?: Transport
  /** Tool execution mode. */
  toolExecution?: ToolExecutionMode
}

// Pi session snapshot/event types are re-exported from
// src/shared/pi-ipc-types.ts above.

/**
 * Source identifier used when routing native Pi events through Orca's
 * agent hook / agent status pipeline. Reuses 'pi' from AgentHookSource
 * so existing label/icon/tool-state resolution works unchanged.
 */
export const NATIVE_PI_HOOK_SOURCE: AgentHookSource = 'pi'
