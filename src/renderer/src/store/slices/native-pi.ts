/**
 * native-pi — Renderer store slice for native Pi SDK sessions.
 *
 * Tracks in-process Pi sessions created via the main-process PiAgentHost
 * (bypassing the subprocess-PTY path). Each native Pi session is associated
 * with a worktree and surfaced in the agent status panel.
 *
 * Interaction (sending prompts, viewing output) is deferred to a follow-up
 * phase — this slice only manages session lifecycle tracking.
 */

import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { PiSessionSnapshot } from '../../../../shared/pi-ipc-types'

// ── Types ───────────────────────────────────────────────────────────────────

export type NativePiSessionEntry = {
  sessionId: string
  worktreeId: string
  createdAt: number
  /** Last known snapshot from the main process (from listSessions / getSession). */
  snapshot: PiSessionSnapshot | null
}

export type NativePiSlice = {
  /** Native Pi sessions keyed by session id. */
  nativePiSessions: Record<string, NativePiSessionEntry>

  /** Set a native Pi session entry. */
  setNativePiSession: (entry: NativePiSessionEntry) => void

  /** Remove a native Pi session entry by id. */
  removeNativePiSession: (sessionId: string) => void

  /** Update the snapshot for a session. */
  updateNativePiSnapshot: (sessionId: string, snapshot: PiSessionSnapshot) => void
}

// ── Slice creator ───────────────────────────────────────────────────────────

export const createNativePiSlice: StateCreator<AppState, [], [], NativePiSlice> = (set) => ({
  nativePiSessions: {},

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
    })
})
