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
import { Loader2, Send, Square, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ── Types ───────────────────────────────────────────────────────────────────

type ConversationEntry =
  | { kind: 'assistant_text'; text: string; ts: number }
  | { kind: 'tool_call'; toolName: string; toolInput: unknown; ts: number }
  | { kind: 'tool_result'; toolName: string; isError: boolean; ts: number }
  | { kind: 'status_change'; status: string; ts: number }
  | { kind: 'error'; message: string; ts: number }

// ── Props ───────────────────────────────────────────────────────────────────

export type NativeAgentPaneProps = {
  sessionId: string
  /** Label shown in the output header. Defaults to "Pi Agent". */
  agentLabel?: string
}

// ── Component ───────────────────────────────────────────────────────────────

export default function NativeAgentPane({
  sessionId,
  agentLabel = 'Pi Agent'
}: NativeAgentPaneProps): React.JSX.Element {
  const [entries, setEntries] = useState<ConversationEntry[]>([])
  const [currentText, setCurrentText] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [status, setStatus] = useState<string>('idle')
  const [aborting, setAborting] = useState(false)

  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // ── Subscribe to IPC events ──────────────────────────────────────────────

  useEffect(() => {
    const unsub = window.api.piNative.onEvent((raw: unknown) => {
      const event = raw as Record<string, unknown>
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
              toolName: String(event.toolName ?? ''),
              toolInput: event.toolInput,
              ts: now,
            })
            return [...prev, ...next]
          })
          setCurrentText('')
          break
        }

        case 'tool_result': {
          setEntries((prev) => [
            ...prev,
            {
              kind: 'tool_result',
              toolName: String(event.toolName ?? ''),
              isError: event.isError === true,
              ts: now,
            },
          ])
          break
        }

        case 'status_change': {
          const s = String(event.status ?? '')
          setStatus(s)
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
          if (s === 'error') {
            const msg = String(event.error instanceof Error ? event.error.message : event.error ?? '')
            if (msg) {
              setEntries((prev) => [
                ...prev,
                { kind: 'error', message: msg, ts: now },
              ])
            }
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

  // ── Focus input when the session is idle ──────────────────────────────────

  useEffect(() => {
    if (status === 'idle' || status === 'finished') {
      inputRef.current?.focus()
    }
  }, [status])

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    const text = inputValue.trim()
    if (!text) return
    if (status === 'running' || status === 'streaming') return

    // Show the user prompt as an entry
    setEntries((prev) => [
      ...prev,
      { kind: 'assistant_text', text: `> ${text}`, ts: Date.now() },
    ])

    setInputValue('')
    setStatus('running')

    window.api.piNative
      .prompt(sessionId, text)
      .then(() => {
        // The IPC event stream will handle status updates; no action needed.
      })
      .catch((err: Error) => {
        setEntries((prev) => [
          ...prev,
          { kind: 'error', message: err.message, ts: Date.now() },
        ])
        setStatus('error')
      })
  }, [inputValue, status, sessionId])

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape' && (status === 'running' || status === 'streaming')) {
        e.preventDefault()
        handleAbort()
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleAbort, handleSend, status]
  )

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderEntry(entry: ConversationEntry, idx: number): React.JSX.Element {
    switch (entry.kind) {
      case 'assistant_text':
        return (
          <div key={idx} className="px-4 py-1 text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
            {entry.text}
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
              <span className="font-medium text-foreground/80">{entry.toolName}</span>
              <pre className="mt-0.5 overflow-x-auto text-[11px] leading-snug text-muted-foreground/70">
                {typeof entry.toolInput === 'string'
                  ? entry.toolInput
                  : JSON.stringify(entry.toolInput, null, 1)}
              </pre>
            </div>
          </div>
        )

      case 'tool_result':
        return (
          <div
            key={idx}
            className="mx-8 mb-1 flex items-center gap-2 text-[11px] text-muted-foreground/60"
          >
            <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
            {entry.isError ? '⚠ failed:' : '✓'} {entry.toolName}
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
        {isBusy && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {status === 'streaming' ? 'Streaming...' : 'Working...'}
          </span>
        )}
        {status === 'interrupted' && (
          <span className="ml-auto text-[11px] text-amber-500">Interrupted</span>
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

      {/* Input bar */}
      <div className="shrink-0 border-t border-border/40 px-4 py-3">
        <div className="flex items-end gap-2 rounded-lg border border-border/60 bg-accent/20 p-2 focus-within:border-border focus-within:bg-accent/30">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isBusy ? 'Agent is working...' : 'Type a message...'}
            disabled={isBusy}
            rows={1}
            className="min-h-[20px] flex-1 resize-none bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none disabled:opacity-40"
          />
          {isBusy ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={handleAbort}
              disabled={aborting}
              title="Abort (Escape)"
            >
              <Square className="h-3.5 w-3.5 text-destructive" />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={handleSend}
              disabled={!inputValue.trim()}
              title="Send (Enter)"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
