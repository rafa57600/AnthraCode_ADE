/**
 * NativeAgentPane — Hybrid terminal UI for native Pi SDK sessions.
 *
 * Renders the streaming conversation with a Pi agent in a scrollable output
 * area with a text input bar at the bottom.  Subscribes to `pi-native:event`
 * IPC messages for real-time assistant messages, tool calls, and status
 * changes.
 *
 * Escape aborts the current generation.  Enter sends a follow-up prompt.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Wrench } from 'lucide-react'
import { useAppStore } from '@/store'
import MarkdownRenderer from './MarkdownRenderer'
import ChatInput from './ChatInput'
import { SLASH_COMMANDS } from './slash-commands'
import type { PiSessionStatus } from '../../../../shared/pi-ipc-types'
import type { FileMentionCandidate } from './native-agent-types'
import type {
  PiToolUseEnd,
  PiToolUseStart,
  PiToolUseUpdate
} from '../../../../shared/pi-tool-use-events'

// ── Types ───────────────────────────────────────────────────────────────────

type ConversationEntry =
  | { kind: 'assistant_text'; text: string; ts: number }
  | { kind: 'tool_call'; toolUse: PiToolUseStart; ts: number }
  | { kind: 'tool_update'; toolUse: PiToolUseUpdate; ts: number }
  | { kind: 'tool_result'; toolUse: PiToolUseEnd; ts: number }
  | { kind: 'status_change'; status: PiSessionStatus; ts: number }
  | { kind: 'error'; message: string; ts: number }

// ── Props ───────────────────────────────────────────────────────────────────

export type NativeAgentPaneProps = {
  sessionId: string
  /** Label shown in the output header. Defaults to "Pi Agent". */
  agentLabel?: string
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/')
}

function joinWorktreePath(rootPath: string, relativePath: string): string {
  const separator = rootPath.includes('\\') ? '\\' : '/'
  const trimmedRoot = rootPath.replace(/[\\/]+$/, '')
  const normalizedRelative = relativePath.replace(/[\\/]+/g, separator)
  return `${trimmedRoot}${separator}${normalizedRelative}`
}

// ── Component ───────────────────────────────────────────────────────────────

export default function NativeAgentPane({
  sessionId,
  agentLabel = 'Pi Agent'
}: NativeAgentPaneProps): React.JSX.Element {
  const [entries, setEntries] = useState<ConversationEntry[]>([])
  const [currentText, setCurrentText] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [status, setStatus] = useState<PiSessionStatus>('idle')
  const [aborting, setAborting] = useState(false)
  const [fileMentionCandidates, setFileMentionCandidates] = useState<FileMentionCandidate[]>([])
  const [selectedFileMentions, setSelectedFileMentions] = useState<FileMentionCandidate[]>([])

  // Store actions and selectors for session-scoped token tracking
  const setTokenUsage = useAppStore((s) => s.setTokenUsage)
  const tokenUsage = useAppStore((s) => s.nativePiTokenUsage[sessionId])
  const nativePiSession = useAppStore((s) => s.nativePiSessions[sessionId])
  const worktree = useAppStore((s) => {
    const worktreeId = s.nativePiSessions[sessionId]?.worktreeId
    if (!worktreeId) return null
    return Object.values(s.worktreesByRepo)
      .flat()
      .find((candidate) => candidate.id === worktreeId) ?? null
  })
  const repoConnectionId = useAppStore((s) => {
    if (!worktree?.repoId) return undefined
    return s.repos.find((repo) => repo.id === worktree.repoId)?.connectionId ?? undefined
  })
  // Why: detect dark mode from the persistent settings so markdown code blocks
  // use the correct HLJS theme (markdown-preview.css scopes under .markdown-dark).
  const isDark = useAppStore(
    (s) =>
      s.settings?.theme === 'dark' ||
      (s.settings?.theme === 'system' &&
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
  )

  const outputRef = useRef<HTMLDivElement>(null)

  // ── Load file mention candidates ──────────────────────────────────────────

  useEffect(() => {
    const rootPath = nativePiSession?.snapshot?.worktreePath ?? worktree?.path
    if (!rootPath) {
      setFileMentionCandidates([])
      return
    }

    let cancelled = false
    window.api.fs
      .listFiles({ rootPath, connectionId: repoConnectionId ?? undefined })
      .then((paths) => {
        if (cancelled) return
        setFileMentionCandidates(
          paths.map((relativePath) => ({
            path: joinWorktreePath(rootPath, relativePath),
            relativePath: normalizeRelativePath(relativePath),
            isDirectory: false,
          }))
        )
      })
      .catch((err: Error) => {
        console.warn('[pi-native] could not load @mention files:', err)
        if (!cancelled) setFileMentionCandidates([])
      })

    return () => {
      cancelled = true
    }
  }, [nativePiSession?.snapshot?.worktreePath, repoConnectionId, worktree?.path])

  // ── Subscribe to IPC events ──────────────────────────────────────────────

  useEffect(() => {
    const unsub = window.api.piNative.onEvent((event) => {
      if (event.sessionId !== sessionId) {
        return
      }
      const now = Date.now()

      switch (event.type) {
        case 'assistant_message': {
          const text = String(event.text ?? '')
          // Why: accumulate streaming text deltas in `currentText` and only
          // commit a full entry when the agent stops or a tool call breaks the
          // stream.  This gives the user a smooth typewriter effect instead of
          // hundreds of tiny entries per sentence.
          setCurrentText((prev) => prev + text)
          break
        }

        case 'tool_call': {
          // Why: snapshot the in-flight assistant text before the tool call so
          // the output groups text that arrived before this tool invocation.
          setEntries((prev) => {
            const next: ConversationEntry[] = []
            if (currentText) {
              next.push({ kind: 'assistant_text', text: currentText, ts: now })
            }
            next.push({
              kind: 'tool_call',
              toolUse: event.toolUse,
              ts: now,
            })
            return [...prev, ...next]
          })
          setCurrentText('')
          break
        }

        case 'tool_update': {
          setEntries((prev) => [...prev, { kind: 'tool_update', toolUse: event.toolUse, ts: now }])
          break
        }

        case 'tool_result': {
          setEntries((prev) => [
            ...prev,
            {
              kind: 'tool_result',
              toolUse: event.toolUse,
              ts: now,
            },
          ])
          break
        }

        case 'status_change': {
          const s = event.status
          setStatus(s)
          setEntries((prev) => {
            const last = prev.at(-1)
            if (last?.kind === 'status_change' && last.status === s) {
              return prev
            }
            return [...prev, { kind: 'status_change', status: s, ts: now }]
          })
          // Why: commit any buffered streaming text when the session finishes
          // or errors so the user sees the complete assistant response.
          if (s === 'finished' || s === 'error' || s === 'interrupted') {
            setEntries((prev) => {
              if (!currentText) return prev
              const entry: ConversationEntry = {
                kind: 'assistant_text',
                text: currentText,
                ts: now,
              }
              return [...prev, entry]
            })
            setCurrentText('')
          }
          break
        }

        case 'finished': {
          setEntries((prev) => {
            if (!currentText) return prev
            return [
              ...prev,
              { kind: 'assistant_text', text: currentText, ts: now },
            ]
          })
          setCurrentText('')
          setStatus('idle')
          break
        }

        case 'error': {
          const msg = String(event.error instanceof Error ? event.error.message : event.error ?? '')
          setEntries((prev) => [
            ...prev,
            { kind: 'error', message: msg, ts: now },
          ])
          setStatus('error')
          break
        }

        case 'usage': {
          // Why: dispatch per-prompt token usage to the store so it accumulates
          // across turns. The store's setTokenUsage merges with existing counts.
          setTokenUsage(sessionId, event.tokenUsage)
          break
        }
      }
    })

    return () => {
      unsub()
    }
    // Why: the event stream is tied to `sessionId` — if the parent swaps
    // sessions the old listener is torn down and a new one attaches.
  }, [sessionId, currentText])

  // ── Auto-scroll on new content ────────────────────────────────────────────

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [entries, currentText])

  // ── Slash-command handler ─────────────────────────────────────────────────

  const handleSlashCommand = useCallback(
    (commandId: string) => {
      switch (commandId) {
        case 'clear':
          setEntries([])
          setCurrentText('')
          break

        case 'help': {
          const helpText = [
            '**Available commands**',
            '',
            ...SLASH_COMMANDS.map(
              (cmd) => `- \`${cmd.label}\` — ${cmd.description}`
            ),
            '',
            'Type a message and press Enter to send. Shift+Enter inserts a newline.',
          ].join('\n')

          setEntries((prev) => [
            ...prev,
            { kind: 'assistant_text', text: helpText, ts: Date.now() },
          ])
          break
        }
      }
    },
    []
  )

  const handleFileMentionSelect = useCallback((candidate: FileMentionCandidate) => {
    setSelectedFileMentions((prev) => {
      if (prev.some((mention) => mention.relativePath === candidate.relativePath)) return prev
      return [...prev, candidate]
    })
  }, [])

  const handleFileMentionRemove = useCallback((relativePath: string) => {
    setSelectedFileMentions((prev) =>
      prev.filter((mention) => mention.relativePath !== relativePath)
    )
  }, [])

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = inputValue.trim()
    if (!text) return
    if (status === 'running' || status === 'streaming') return

    let fileAttachments: Array<{ path: string; content?: string }> | undefined
    if (selectedFileMentions.length > 0) {
      try {
        fileAttachments = await Promise.all(
          selectedFileMentions.map(async (mention) => {
            const result = await window.api.fs.readFile({
              filePath: mention.path,
              connectionId: repoConnectionId ?? undefined,
            })
            return {
              path: mention.relativePath,
              content: result.isBinary ? undefined : result.content,
            }
          })
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setEntries((prev) => [
          ...prev,
          { kind: 'error', message: `Could not read @mentioned file: ${message}`, ts: Date.now() },
        ])
        return
      }
    }

    // Show the user prompt as an entry
    setEntries((prev) => [
      ...prev,
      { kind: 'assistant_text', text: `> ${text}`, ts: Date.now() },
    ])

    setInputValue('')
    setSelectedFileMentions([])
    setStatus('running')

    window.api.piNative
      .prompt(sessionId, text, fileAttachments)
      .then((snapshot) => {
        setStatus(snapshot.status)
        if (snapshot.lastAssistantMessage?.trim()) {
          const text = snapshot.lastAssistantMessage.trim()
          setEntries((prev) => {
            const alreadyRendered = prev.some(
              (entry) => entry.kind === 'assistant_text' && entry.text.trim() === text
            )
            return alreadyRendered ? prev : [...prev, { kind: 'assistant_text', text, ts: Date.now() }]
          })
          setCurrentText('')
        }
      })
      .catch((err: Error) => {
        setEntries((prev) => [
          ...prev,
          { kind: 'error', message: err.message, ts: Date.now() },
        ])
        setStatus('error')
      })
  }, [inputValue, status, sessionId, selectedFileMentions, repoConnectionId])

  const handleAbort = useCallback(() => {
    if (aborting) return
    setAborting(true)
    window.api.piNative
      .abort(sessionId)
      .then(() => setStatus('interrupted'))
      .catch(() => {
        // Best-effort; abort is not critical
      })
      .finally(() => setAborting(false))
  }, [aborting, sessionId])

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderEntry(entry: ConversationEntry, idx: number): React.JSX.Element {
    switch (entry.kind) {
      case 'assistant_text':
        return (
          <div key={idx} className="px-4 py-1">
            <MarkdownRenderer content={entry.text} isDark={isDark} />
          </div>
        )

      case 'tool_call':
        return (
          <div
            key={idx}
            className="mx-4 my-1 flex items-start gap-2 rounded-md border border-border/40 bg-accent/30 px-3 py-2 text-[12px] text-muted-foreground"
          >
            <Wrench className="mt-px h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="font-medium text-foreground/80">{entry.toolUse.toolName}</span>
              <pre className="mt-0.5 overflow-x-auto text-[11px] leading-snug text-muted-foreground/70">
                {typeof entry.toolUse.toolInput === 'string'
                  ? entry.toolUse.toolInput
                  : JSON.stringify(entry.toolUse.toolInput, null, 1)}
              </pre>
            </div>
          </div>
        )

      case 'tool_update':
        return (
          <div
            key={idx}
            className="mx-8 mb-1 flex items-center gap-2 text-[11px] text-muted-foreground/60"
          >
            <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
            ↻ {entry.toolUse.toolName}
          </div>
        )

      case 'tool_result':
        return (
          <div
            key={idx}
            className="mx-8 mb-1 flex items-center gap-2 text-[11px] text-muted-foreground/60"
          >
            <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
            {entry.toolUse.isError ? '⚠ failed:' : '✓'} {entry.toolUse.toolName}
          </div>
        )

      case 'status_change':
        return (
          <div
            key={idx}
            className="mx-4 my-1 text-[11px] uppercase tracking-wide text-muted-foreground/50"
          >
            Pi status: {entry.status}
          </div>
        )

      case 'error':
        return (
          <div
            key={idx}
            className="mx-4 my-1 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-600"
          >
            {entry.message}
          </div>
        )

      default:
        return <div key={idx} />
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isBusy = status === 'running' || status === 'streaming'

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-4 py-2 text-[13px] font-medium text-foreground">
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        {agentLabel}
        {/* Right-aligned status / token area — single ml-auto wrapper */}
        {(isBusy || status === 'interrupted' || (tokenUsage && (tokenUsage.inputTokens > 0 || tokenUsage.outputTokens > 0))) && (
          <span className="ml-auto flex items-center gap-3 text-[11px]">
            {isBusy && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {status === 'streaming' ? 'Streaming...' : 'Working...'}
              </span>
            )}
            {status === 'interrupted' && (
              <span className="text-amber-500">Interrupted</span>
            )}
            {/* Token usage — compact display, shown when non-zero */}
            {tokenUsage && (tokenUsage.inputTokens > 0 || tokenUsage.outputTokens > 0) && (
              <span className="flex items-center gap-2 text-muted-foreground/70">
                <span>
                  ↑{tokenUsage.outputTokens >= 1000
                    ? `${(tokenUsage.outputTokens / 1000).toFixed(1)}k`
                    : tokenUsage.outputTokens.toLocaleString()}
                </span>
                {tokenUsage.estimatedCostUsd != null && tokenUsage.estimatedCostUsd > 0 && (
                  <span>
                    ${tokenUsage.estimatedCostUsd < 0.01
                      ? tokenUsage.estimatedCostUsd.toFixed(4)
                      : tokenUsage.estimatedCostUsd.toFixed(2)}
                  </span>
                )}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Output area */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto py-3"
      >
        {entries.length === 0 && !currentText ? (
          <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground/50">
            {status === 'running' || status === 'streaming'
              ? 'Waiting for response...'
              : 'Session ready. Type a prompt below.'}
          </div>
        ) : (
          <>
            {entries.map((entry, idx) => renderEntry(entry, idx))}
            {currentText && (
              <div className="px-4 py-1 text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
                {currentText}
                <span className="ml-px inline-block h-3.5 w-[2px] animate-pulse bg-foreground/60" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Chat input bar */}
      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
        onAbort={handleAbort}
        onCommand={handleSlashCommand}
        fileMentionCandidates={fileMentionCandidates}
        selectedFileMentions={selectedFileMentions}
        onFileMentionSelect={handleFileMentionSelect}
        onFileMentionRemove={handleFileMentionRemove}
        disabled={isBusy}
        isBusy={isBusy}
        aborting={aborting}
      />
    </div>
  )
}
