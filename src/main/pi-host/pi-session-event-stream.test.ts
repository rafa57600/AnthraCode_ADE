import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '@earendil-works/pi-agent-core'
import { mapPiAgentEventToSessionEvents } from './pi-session-event-stream'

describe('mapPiAgentEventToSessionEvents', () => {
  it('maps turn_start into a streaming status event', () => {
    expect(mapPiAgentEventToSessionEvents({ type: 'turn_start' }, 'session-1')).toEqual([
      { type: 'status_change', status: 'streaming', sessionId: 'session-1' }
    ])
  })

  it('maps text_delta message updates into assistant_message events', () => {
    const event = {
      type: 'message_update',
      message: { role: 'assistant', content: [] },
      assistantMessageEvent: { type: 'text_delta', delta: 'hello' }
    } as unknown as AgentEvent

    expect(mapPiAgentEventToSessionEvents(event, 'session-1')).toEqual([
      { type: 'assistant_message', sessionId: 'session-1', text: 'hello' }
    ])
  })

  it('maps Pi tool lifecycle events into typed tool-use IPC events', () => {
    const start = mapPiAgentEventToSessionEvents(
      {
        type: 'tool_execution_start',
        toolCallId: 'toolu_1',
        toolName: 'anthraspace_terminal',
        args: { command: 'pnpm test' }
      },
      'session-1'
    )
    expect(start[0]).toMatchObject({
      type: 'tool_call',
      toolCallId: 'toolu_1',
      toolName: 'anthraspace_terminal',
      toolSource: 'anthraspace',
      toolUse: { phase: 'start', toolSource: 'anthraspace' }
    })

    const update = mapPiAgentEventToSessionEvents(
      {
        type: 'tool_execution_update',
        toolCallId: 'toolu_1',
        toolName: 'read',
        args: { path: 'README.md' },
        partialResult: { returnedLines: 10 }
      },
      'session-1'
    )
    expect(update[0]).toMatchObject({
      type: 'tool_update',
      toolName: 'read',
      toolSource: 'pi',
      partialResult: { returnedLines: 10 },
      toolUse: { phase: 'update', toolSource: 'pi' }
    })

    const end = mapPiAgentEventToSessionEvents(
      {
        type: 'tool_execution_end',
        toolCallId: 'toolu_1',
        toolName: 'bash',
        result: { exitCode: 0 },
        isError: false
      },
      'session-1'
    )
    expect(end[0]).toMatchObject({
      type: 'tool_result',
      toolName: 'bash',
      toolSource: 'pi',
      toolResult: { exitCode: 0 },
      toolUse: { phase: 'end', isError: false }
    })
  })
})
