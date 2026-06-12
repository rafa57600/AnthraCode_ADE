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

    default:
      return []
  }
}
