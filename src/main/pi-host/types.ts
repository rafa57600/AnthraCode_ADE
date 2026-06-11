import type { AgentTool, ThinkingLevel } from '@earendil-works/pi-agent-core'
import type { Model, Transport } from '@earendil-works/pi-ai'
import type { AgentHookSource } from '../../shared/agent-hook-relay'
import type { ToolExecutionMode } from '@earendil-works/pi-agent-core'

/**
 * Orca-level status of a native Pi session.
 * Mirrors the visual states used by the agent status system.
 */
export type PiSessionStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'streaming'
  | 'interrupted'
  | 'error'
  | 'finished'

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

/** Snapshot of a native Pi session for management and reporting. */
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

/**
 * Events emitted by PiSessionHost for consumption by Orca's agent status system
 * and the broader runtime integration.
 */
export type PiSessionEvent =
  | { type: 'status_change'; status: PiSessionStatus; sessionId: string }
  | { type: 'error'; sessionId: string; error: Error }
  | { type: 'finished'; sessionId: string; messageCount: number }
  | { type: 'tool_call'; sessionId: string; toolName: string; toolInput: unknown }
  | { type: 'tool_result'; sessionId: string; toolName: string; isError: boolean }
  | { type: 'assistant_message'; sessionId: string; text: string }

/** Callback signature for Pi session event consumers. */
export type PiSessionEventCallback = (event: PiSessionEvent) => void

/**
 * Source identifier used when routing native Pi events through Orca's
 * agent hook / agent status pipeline. Reuses 'pi' from AgentHookSource
 * so existing label/icon/tool-state resolution works unchanged.
 */
export const NATIVE_PI_HOOK_SOURCE: AgentHookSource = 'pi'
