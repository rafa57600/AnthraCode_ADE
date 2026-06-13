/**
 * native-pi — Renderer store slice for native Pi SDK sessions.
 *
 * Tracks in-process Pi sessions created via the main-process PiAgentHost
 * (bypassing the subprocess-PTY path). Also holds conversation turns,
 * token usage, and undo/redo stacks for the Pi agent UI.
 *
 * Interaction (sending prompts, viewing output) is deferred to a follow-up
 * phase — this slice only manages session lifecycle tracking.
 */

import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { PiSessionSnapshot, PiTokenUsage } from '../../../../shared/pi-ipc-types'

// ── Types ───────────────────────────────────────────────────────────────────

export type NativePiSessionEntry = {
  sessionId: string
  worktreeId: string
  createdAt: number
  /** Last known snapshot from the main process (from listSessions / getSession). */
  snapshot: PiSessionSnapshot | null
}

/**
 * A single turn in the Pi conversation.
 * Turns are ordered; each user prompt creates one user+assistant pair.
 */
export type NativePiConversationTurn = {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: number
  isStreaming: boolean
  tokens?: PiTokenUsage
}

/**
 * A snapshot of the conversation used for undo/redo.
 * Captures all turns up to a point in time.
 */
export type NativePiConversationSnapshot = {
  turns: NativePiConversationTurn[]
  lastPrompt: string
}

export type NativePiSlice = {
  /** Native Pi sessions keyed by session id. */
  nativePiSessions: Record<string, NativePiSessionEntry>

  /** Conversation turns per session (ordered list). */
  nativePiTurns: Record<string, NativePiConversationTurn[]>

  /** Undo stack per session (arrays of turn snapshots). */
  nativePiUndoStack: Record<string, NativePiConversationSnapshot[]>

  /** Redo stack per session (arrays of turn snapshots). */
  nativePiRedoStack: Record<string, NativePiConversationSnapshot[]>

  /** Cumulative token usage per session. */
  nativePiTokenUsage: Record<string, PiTokenUsage>

  /** Whether the conversation history sidebar is open. */
  nativePiHistorySidebarOpen: boolean

  // ── Session lifecycle ──

  /** Set a native Pi session entry. */
  setNativePiSession: (entry: NativePiSessionEntry) => void

  /** Remove a native Pi session entry by id. */
  removeNativePiSession: (sessionId: string) => void

  /** Update the snapshot for a session. */
  updateNativePiSnapshot: (sessionId: string, snapshot: PiSessionSnapshot) => void

  // ── Conversation turns ──

  /** Append a new turn to a session's conversation. */
  appendTurn: (sessionId: string, turn: NativePiConversationTurn) => void

  /** Update the streaming text of the last assistant turn. */
  updateStreamingTurn: (sessionId: string, text: string) => void

  /** Finalize a streaming turn (set isStreaming=false). */
  finalizeStreamingTurn: (sessionId: string) => void

  // ── Undo / Redo ──

  /** Save a snapshot before mutating the conversation (for undo). */
  pushUndoSnapshot: (sessionId: string) => void

  /** Undo the last action — returns the restored turns or null. */
  undoConversation: (sessionId: string) => NativePiConversationTurn[] | null

  /** Redo a previously undone action — returns the restored turns or null. */
  redoConversation: (sessionId: string) => NativePiConversationTurn[] | null

  // ── Token usage ──

  /** Set or accumulate token usage for a session. */
  setTokenUsage: (sessionId: string, usage: PiTokenUsage) => void

  // ── UI state ──

  /** Toggle the history sidebar open/closed. */
  toggleHistorySidebar: () => void
}

// ── Slice creator ───────────────────────────────────────────────────────────

export const createNativePiSlice: StateCreator<AppState, [], [], NativePiSlice> = (set, get) => ({
  nativePiSessions: {},
  nativePiTurns: {},
  nativePiUndoStack: {},
  nativePiRedoStack: {},
  nativePiTokenUsage: {},
  nativePiHistorySidebarOpen: false,

  // ── Session lifecycle ──

  setNativePiSession: (entry) =>
    set((s) => ({
      nativePiSessions: { ...s.nativePiSessions, [entry.sessionId]: entry }
    })),

  removeNativePiSession: (sessionId) =>
    set((s) => {
      const { [sessionId]: _, ...rest } = s.nativePiSessions
      return { nativePiSessions: rest }
    }),

  updateNativePiSnapshot: (sessionId, snapshot) =>
    set((s) => {
      const existing = s.nativePiSessions[sessionId]
      if (!existing) return s
      return {
        nativePiSessions: {
          ...s.nativePiSessions,
          [sessionId]: { ...existing, snapshot }
        }
      }
    }),

  // ── Conversation turns ──

  appendTurn: (sessionId, turn) =>
    set((s) => ({
      nativePiTurns: {
        ...s.nativePiTurns,
        [sessionId]: [...(s.nativePiTurns[sessionId] ?? []), turn]
      }
    })),

  updateStreamingTurn: (sessionId, text) =>
    set((s) => {
      const turns = s.nativePiTurns[sessionId]
      if (!turns || turns.length === 0) return s
      const last = turns[turns.length - 1]
      if (last.role !== 'assistant') return s
      return {
        nativePiTurns: {
          ...s.nativePiTurns,
          [sessionId]: [
            ...turns.slice(0, -1),
            { ...last, text, timestamp: Date.now() }
          ]
        }
      }
    }),

  finalizeStreamingTurn: (sessionId) =>
    set((s) => {
      const turns = s.nativePiTurns[sessionId]
      if (!turns || turns.length === 0) return s
      const last = turns[turns.length - 1]
      if (!last.isStreaming) return s
      return {
        nativePiTurns: {
          ...s.nativePiTurns,
          [sessionId]: [
            ...turns.slice(0, -1),
            { ...last, isStreaming: false, timestamp: Date.now() }
          ]
        }
      }
    }),

  // ── Undo / Redo ──

  pushUndoSnapshot: (sessionId) =>
    set((s) => {
      const turns = s.nativePiTurns[sessionId]
      const snapshot: NativePiConversationSnapshot = {
        turns: turns ? [...turns] : [],
        lastPrompt: ''
      }
      const stack = s.nativePiUndoStack[sessionId] ?? []
      return {
        nativePiUndoStack: {
          ...s.nativePiUndoStack,
          [sessionId]: [...stack, snapshot]
        },
        // Clear redo stack on new action
        nativePiRedoStack: {
          ...s.nativePiRedoStack,
          [sessionId]: []
        }
      }
    }),

  undoConversation: (sessionId) => {
    const state = get()
    const stack = state.nativePiUndoStack[sessionId]
    if (!stack || stack.length === 0) return null

    const currentTurns = state.nativePiTurns[sessionId] ?? []
    const snapshot = stack[stack.length - 1]

    set((s) => ({
      nativePiUndoStack: {
        ...s.nativePiUndoStack,
        [sessionId]: stack.slice(0, -1)
      },
      nativePiRedoStack: {
        ...s.nativePiRedoStack,
        [sessionId]: [
          ...(s.nativePiRedoStack[sessionId] ?? []),
          { turns: [...currentTurns], lastPrompt: '' }
        ]
      },
      nativePiTurns: {
        ...s.nativePiTurns,
        [sessionId]: [...snapshot.turns]
      }
    }))

    return snapshot.turns
  },

  redoConversation: (sessionId) => {
    const state = get()
    const stack = state.nativePiRedoStack[sessionId]
    if (!stack || stack.length === 0) return null

    const currentTurns = state.nativePiTurns[sessionId] ?? []
    const snapshot = stack[stack.length - 1]

    set((s) => ({
      nativePiRedoStack: {
        ...s.nativePiRedoStack,
        [sessionId]: stack.slice(0, -1)
      },
      nativePiUndoStack: {
        ...s.nativePiUndoStack,
        [sessionId]: [
          ...(s.nativePiUndoStack[sessionId] ?? []),
          { turns: [...currentTurns], lastPrompt: '' }
        ]
      },
      nativePiTurns: {
        ...s.nativePiTurns,
        [sessionId]: [...snapshot.turns]
      }
    }))

    return snapshot.turns
  },

  // ── Token usage ──

  setTokenUsage: (sessionId, usage) =>
    set((s) => {
      const existing = s.nativePiTokenUsage[sessionId]
      return {
        nativePiTokenUsage: {
          ...s.nativePiTokenUsage,
          [sessionId]: existing
            ? {
                inputTokens: existing.inputTokens + usage.inputTokens,
                outputTokens: existing.outputTokens + usage.outputTokens,
                estimatedCostUsd:
                  (existing.estimatedCostUsd ?? 0) + (usage.estimatedCostUsd ?? 0)
              }
            : usage
        }
      }
    }),

  // ── UI state ──

  toggleHistorySidebar: () =>
    set((s) => ({ nativePiHistorySidebarOpen: !s.nativePiHistorySidebarOpen }))
})
