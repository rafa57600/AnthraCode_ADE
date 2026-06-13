import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '@earendil-works/pi-agent-core'
import { extractAssistantText, mapPiAgentEventToSessionEvents } from './pi-session-event-stream'

describe('extractAssistantText', () => {
  it('extracts text and thinking blocks from Pi assistant messages', () => {
    const msg = {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'hidden reasoning' },
        { type: 'text', text: 'visible answer' }
      ]
    }
    expect(extractAssistantText(msg as any)).toBe('hidden reasoning\nvisible answer')
  })

  it('extracts thinking blocks when no text blocks exist', () => {
    const msg = {
      role: 'assistant',
      content: [{ type: 'thinking', thinking: 'just thinking' }]
    }
    expect(extractAssistantText(msg as any)).toBe('just thinking')
  })

  it('returns null for non-assistant messages', () => {
    expect(extractAssistantText({ role: 'user', content: [{ type: 'text', text: 'hi' }] } as any)).toBeNull()
  })

  it('returns null for empty content', () => {
    expect(extractAssistantText({ role: 'assistant', content: [] } as any)).toBeNull()
  })

  it('joins multiple text blocks with newline', () => {
    const msg = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'first' },
        { type: 'text', text: 'second' },
      ]
    }
    expect(extractAssistantText(msg as any)).toBe('first\nsecond')
  })
})

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

  it('maps message_end assistant text as a non-streaming fallback', () => {
    const event = {
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'final answer' }]
      }
    } as unknown as AgentEvent

    expect(mapPiAgentEventToSessionEvents(event, 'session-1')).toEqual([
      { type: 'assistant_message', sessionId: 'session-1', text: 'final answer' }
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
