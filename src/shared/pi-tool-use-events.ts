/**
 * Shared tool-use event definitions for native Pi SDK sessions.
 *
 * Pi emits tool execution events with a `toolCallId`, `toolName`, args, and
 * results. AnthraSpace forwards those over IPC so renderer surfaces can show
 * accurate in-flight tool state without understanding Pi SDK internals.
 */

export const ANTHRASPACE_PI_TOOL_NAMES = [
  'anthraspace_read',
  'anthraspace_browser',
  'anthraspace_terminal',
  'anthraspace_orchestrate'
] as const

export type AnthraSpacePiToolName = (typeof ANTHRASPACE_PI_TOOL_NAMES)[number]
export type PiToolName = AnthraSpacePiToolName | (string & {})
export type PiToolSource = 'anthraspace' | 'pi'

export interface PiToolUseBase {
  toolCallId: string
  toolName: PiToolName
  toolSource: PiToolSource
}

export interface PiToolUseStart extends PiToolUseBase {
  phase: 'start'
  toolInput: unknown
}

export interface PiToolUseUpdate extends PiToolUseBase {
  phase: 'update'
  toolInput: unknown
  partialResult: unknown
}

export interface PiToolUseEnd extends PiToolUseBase {
  phase: 'end'
  toolResult: unknown
  isError: boolean
}

export type PiToolUse = PiToolUseStart | PiToolUseUpdate | PiToolUseEnd

export function getPiToolSource(toolName: string): PiToolSource {
  return toolName.startsWith('anthraspace_') ? 'anthraspace' : 'pi'
}

export function createPiToolUseStart(args: {
  toolCallId: string
  toolName: string
  toolInput: unknown
}): PiToolUseStart {
  return {
    phase: 'start',
    toolCallId: args.toolCallId,
    toolName: args.toolName,
    toolSource: getPiToolSource(args.toolName),
    toolInput: args.toolInput
  }
}

export function createPiToolUseUpdate(args: {
  toolCallId: string
  toolName: string
  toolInput: unknown
  partialResult: unknown
}): PiToolUseUpdate {
  return {
    phase: 'update',
    toolCallId: args.toolCallId,
    toolName: args.toolName,
    toolSource: getPiToolSource(args.toolName),
    toolInput: args.toolInput,
    partialResult: args.partialResult
  }
}

export function createPiToolUseEnd(args: {
  toolCallId: string
  toolName: string
  toolResult: unknown
  isError: boolean
}): PiToolUseEnd {
  return {
    phase: 'end',
    toolCallId: args.toolCallId,
    toolName: args.toolName,
    toolSource: getPiToolSource(args.toolName),
    toolResult: args.toolResult,
    isError: args.isError
  }
}
