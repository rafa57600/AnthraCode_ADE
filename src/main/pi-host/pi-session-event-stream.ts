import type { AgentEvent } from '@earendil-works/pi-agent-core'
import type { PiSessionEvent } from './types'
import {
  createPiToolUseEnd,
  createPiToolUseStart,
  createPiToolUseUpdate
} from '../../shared/pi-tool-use-events'

/**
 * Convert Pi SDK stream events into serializable AnthraSpace IPC events.
 *
 * Kept separate from PiSessionHost so tests can verify streaming/tool-event
 * behavior without running an LLM request.
 */
export function mapPiAgentEventToSessionEvents(
  event: AgentEvent,
  sessionId: string
): PiSessionEvent[] {
  switch (event.type) {
    case 'turn_start':
      return [{ type: 'status_change', status: 'streaming', sessionId }]

    case 'tool_execution_start': {
      const toolUse = createPiToolUseStart({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        toolInput: event.args
      })
      return [
        {
          type: 'tool_call',
          sessionId,
          toolUse,
          toolCallId: toolUse.toolCallId,
          toolName: toolUse.toolName,
          toolSource: toolUse.toolSource,
          toolInput: toolUse.toolInput
        }
      ]
    }

    case 'tool_execution_update': {
      const toolUse = createPiToolUseUpdate({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        toolInput: event.args,
        partialResult: event.partialResult
      })
      return [
        {
          type: 'tool_update',
          sessionId,
          toolUse,
          toolCallId: toolUse.toolCallId,
          toolName: toolUse.toolName,
          toolSource: toolUse.toolSource,
          toolInput: toolUse.toolInput,
          partialResult: toolUse.partialResult
        }
      ]
    }

    case 'tool_execution_end': {
      const toolUse = createPiToolUseEnd({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        toolResult: event.result,
        isError: event.isError
      })
      return [
        {
          type: 'tool_result',
          sessionId,
          toolUse,
          toolCallId: toolUse.toolCallId,
          toolName: toolUse.toolName,
          toolSource: toolUse.toolSource,
          toolResult: toolUse.toolResult,
          isError: toolUse.isError
        }
      ]
    }

    case 'message_update': {
      const assistantEvent = event.assistantMessageEvent
      return assistantEvent.type === 'text_delta' && assistantEvent.delta
        ? [{ type: 'assistant_message', sessionId, text: assistantEvent.delta }]
        : []
    }

    case 'message_end': {
      const msg = event.message as any
      // Why: when the LLM API call fails, Pi SDK creates an AssistantMessage with
      // empty content[] and stopReason="error". We surface the errorMessage as
      // the assistant text so the user sees what went wrong instead of silence.
      if (msg?.stopReason === 'error') {
        const errMsg =
          typeof msg?.errorMessage === 'string' && msg.errorMessage.length > 0
            ? msg.errorMessage
            : `stopReason=error (no errorMessage; api=${msg.api}; provider=${msg.provider})`
        console.log(`[pi-native] message_end error: ${errMsg}`)
        return [{ type: 'assistant_message', sessionId, text: `[Pi API Error] ${errMsg}` }]
      }
      const text = extractAssistantText(event.message as any)
      return text ? [{ type: 'assistant_message', sessionId, text }] : []
    }

    default:
      return []
  }
}

/**
 * Extract assistant-role text content from a Pi AgentMessage.
 *
 * Why: accepts a broad object because the Pi SDK's AgentMessage union includes
 * BashExecutionMessage (no `content`, no `role`), but at runtime message_end
 * always delivers an AssistantMessage-shaped payload.  We check role+content
 * at runtime anyway, so a broad parameter avoids unnecessary type gymnastics
 * at every call site.
 */
export function extractAssistantText(message: { role?: string; content?: unknown[] }): string | null {
  if (message.role !== 'assistant' || !Array.isArray(message.content)) {
    console.log(`[pi-native] extractAssistantText: skip role=${message.role} hasContent=${Array.isArray(message.content)}`)
    return null
  }

  const parts: string[] = []
  for (const block of message.content) {
    if (!block || typeof block !== 'object') continue
    if (!('type' in block)) continue

    if (block.type === 'text' && 'text' in block && typeof block.text === 'string') {
      parts.push(block.text)
    } else if (block.type === 'thinking' && 'thinking' in block && typeof block.thinking === 'string') {
      parts.push(block.thinking)
    } else if (block.type === 'toolCall') {
      // tool calls don't carry assistant text
    } else {
      console.log(`[pi-native] extractAssistantText: unknown block type=${(block as any).type}`, block)
    }
  }

  if (parts.length === 0) {
    // Dump each block using Object.getOwnPropertyNames to catch non-enumerable / Proxy properties
    const blockSummary = (message.content as any[]).map((b: any, i: number) => {
      if (b === null || b === undefined) return `[${i}]=null`
      if (typeof b !== 'object') return `[${i}]=${typeof b}`
      const own = Object.getOwnPropertyNames(b)
      return `[${i}] type=${b.type} ownKeys=[${own.join(',')}] textProp=${'text' in b ? `"${String(b.text).slice(0, 80)}"` : 'missing'} thinkingProp=${'thinking' in b ? `"${String(b.thinking).slice(0, 80)}"` : 'missing'}`
    })
    console.log(`[pi-native] extractAssistantText: blocks=${message.content.length}`, blockSummary.join(' | '))
    return null
  }

  return parts.join('\n')
}
