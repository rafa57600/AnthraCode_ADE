/**
 * native-agent-types — Component-level types for the Pi agent chat UI.
 *
 * These types are used internally by the NativeAgent components and are
 * separate from the IPC transport types in src/shared/pi-ipc-types.ts.
 */

import type { PiTokenUsage } from '../../../../shared/pi-ipc-types'
import type {
  PiToolUseEnd,
  PiToolUseStart,
  PiToolUseUpdate
} from '../../../../shared/pi-tool-use-events'

// ── Conversation entry (render model) ────────────────────────────────────────

/** A single visual entry in the Pi agent conversation output. */
export type ConversationEntry =
  | { kind: 'assistant_text'; text: string; ts: number }
  | { kind: 'tool_call'; toolUse: PiToolUseStart; ts: number }
  | { kind: 'tool_update'; toolUse: PiToolUseUpdate; ts: number }
  | { kind: 'tool_result'; toolUse: PiToolUseEnd; ts: number }
  | { kind: 'status_change'; status: string; ts: number }
  | { kind: 'error'; message: string; ts: number }

// ── Slash command ────────────────────────────────────────────────────────────

export type SlashCommandGroup = 'Actions' | 'Navigation' | 'Files'

export type SlashCommand = {
  id: string
  label: string
  aliases: string[]
  group: SlashCommandGroup
  description: string
  /** Execute the slash command — receives the input value and a callback to set it. */
  run: (input: string, setInput: (val: string) => void) => void
}

// ── Mention / file reference ─────────────────────────────────────────────────

export type FileMentionCandidate = {
  path: string
  relativePath: string
  isDirectory: boolean
}

// ── Undo/redo ────────────────────────────────────────────────────────────────

export type UndoableAction = {
  type: 'send_message' | 'edit_message' | 'clear'
  timestamp: number
  description: string
}

// ── Token display ────────────────────────────────────────────────────────────

export type TokenDisplay = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd?: number
}

export function toTokenDisplay(usage: PiTokenUsage): TokenDisplay {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.inputTokens + usage.outputTokens,
    estimatedCostUsd: usage.estimatedCostUsd
  }
}
