import { describe, expect, it } from 'vitest'
import {
  createPiToolUseEnd,
  createPiToolUseStart,
  createPiToolUseUpdate,
  getPiToolSource
} from './pi-tool-use-events'

describe('pi-tool-use-events', () => {
  it('classifies AnthraSpace-prefixed tools separately from Pi built-ins', () => {
    expect(getPiToolSource('anthraspace_read')).toBe('anthraspace')
    expect(getPiToolSource('anthraspace_terminal')).toBe('anthraspace')
    expect(getPiToolSource('read')).toBe('pi')
    expect(getPiToolSource('bash')).toBe('pi')
  })

  it('creates start/update/end tool-use payloads with stable ids and source', () => {
    expect(
      createPiToolUseStart({
        toolCallId: 'toolu_1',
        toolName: 'anthraspace_read',
        toolInput: { path: 'README.md' }
      })
    ).toEqual({
      phase: 'start',
      toolCallId: 'toolu_1',
      toolName: 'anthraspace_read',
      toolSource: 'anthraspace',
      toolInput: { path: 'README.md' }
    })

    expect(
      createPiToolUseUpdate({
        toolCallId: 'toolu_1',
        toolName: 'read',
        toolInput: { path: 'src/index.ts' },
        partialResult: { lines: 12 }
      })
    ).toMatchObject({
      phase: 'update',
      toolSource: 'pi',
      partialResult: { lines: 12 }
    })

    expect(
      createPiToolUseEnd({
        toolCallId: 'toolu_1',
        toolName: 'bash',
        toolResult: { exitCode: 0 },
        isError: false
      })
    ).toMatchObject({ phase: 'end', toolSource: 'pi', isError: false })
  })
})
