/**
 * Bridge: Pi SDK AgentEvents → Orca agent status payloads.
 *
 * Replicates the event→state mapping in `normalizePiCompatibleEvent`
 * (`src/shared/agent-hook-listener.ts`) but operates in-process instead of
 * through the HTTP loopback hook. The produced `ParsedAgentStatusPayload`
 * values feed into Orca's existing `applyNormalizedStatus` pipeline, making
 * the native Pi session visible to every component that already renders a
 * subprocess Pi agent.
 */

import type { AgentEvent, AgentMessage } from '@earendil-works/pi-agent-core'
import type { ToolSnapshot } from '../../shared/agent-hook-listener'
import type { ParsedAgentStatusPayload } from '../../shared/agent-status-types'
import { NATIVE_PI_HOOK_SOURCE } from './types'

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Build a `ParsedAgentStatusPayload` from a Pi `AgentEvent`.
 *
 * Returns `null` when the event should not produce a visible status change
 * (same filtering as `normalizePiCompatibleEvent`).
 */
export function buildStatusPayload(
  event: AgentEvent,
  promptText: string
): ParsedAgentStatusPayload | null {
  const stateName = piEventToStateName(event.type)
  if (!stateName) return null

  const fields = extractFields(event)

  return {
    state: stateName,
    prompt: promptText,
    agentType: NATIVE_PI_HOOK_SOURCE,
    toolName: fields.toolName,
    toolInput: fields.toolInput != null ? String(fields.toolInput) : undefined,
    lastAssistantMessage: fields.lastAssistantMessage,
  }
}

/**
 * Return a tool-snapshot update to merge into a HookListenerState.
 *
 * `reset: true` when the event signals a new turn (existing tool state for
 * the pane should be discarded first).
 */
export function buildToolSnapshot(
  event: AgentEvent
): { reset: boolean; update: ToolSnapshot } {
  const isNewTurn = event.type === 'turn_start'
  const fields = extractFields(event)

  return {
    reset: isNewTurn,
    update: {
      toolName: fields.toolName,
      toolInput: fields.toolInput != null ? String(fields.toolInput) : undefined,
      lastAssistantMessage: fields.lastAssistantMessage,
    },
  }
}

// ── Event → state mapping ──────────────────────────────────────────────────

const STATE_MAP: Record<string, 'working' | 'done'> = {
  turn_start: 'working',
  turn_end: 'working',
  message_start: 'working',
  message_update: 'working',
  message_end: 'working',
  tool_execution_start: 'working',
  tool_execution_update: 'working',
  tool_execution_end: 'working',
  agent_end: 'done',
}

function piEventToStateName(
  eventType: AgentEvent['type']
): 'working' | 'done' | null {
  return STATE_MAP[eventType] ?? null
}

// ── Field extraction ───────────────────────────────────────────────────────

interface ToolFields {
  toolName?: string
  toolInput?: unknown
  lastAssistantMessage?: string
}

function extractFields(event: AgentEvent): ToolFields {
  switch (event.type) {
    case 'tool_execution_start':
    case 'tool_execution_update':
      return {
        toolName: event.toolName,
        toolInput: event.args,
      }

    case 'tool_execution_end':
      // tool_execution_end has `result` instead of `args`
      return { toolName: event.toolName }

    case 'message_end': {
      const text = extractAssistantText(event.message)
      return text ? { lastAssistantMessage: text } : {}
    }

    default:
      return {}
  }
}

/** Pull text content out of an assistant AgentMessage content array. */
function extractAssistantText(message: AgentMessage): string | undefined {
  if (message.role !== 'assistant') return undefined

  const content = message.content
  if (!Array.isArray(content)) return undefined

  const parts: string[] = []
  for (const block of content) {
    if (
      block &&
      typeof block === 'object' &&
      'type' in block &&
      block.type === 'text'
    ) {
      const text = (block as { text: string }).text
      if (typeof text === 'string') parts.push(text)
    }
  }

  return parts.length > 0 ? parts.join('') : undefined
}
