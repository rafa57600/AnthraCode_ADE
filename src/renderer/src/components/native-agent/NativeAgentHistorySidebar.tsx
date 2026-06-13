import { MessageSquare, Wrench, X } from 'lucide-react'
import type { ConversationEntry } from './native-agent-types'

type HistoryTurn = {
  id: string
  entryIndex: number
  prompt: string
  assistantPreview: string
  timestamp: number
  toolCount: number
  hasError: boolean
}

export type NativeAgentHistorySidebarProps = {
  entries: ConversationEntry[]
  currentText: string
  onClose: () => void
  onSelectEntry: (entryIndex: number) => void
}

function isPromptText(text: string): boolean {
  return text.trimStart().startsWith('> ')
}

function cleanPrompt(text: string): string {
  return text.trimStart().replace(/^>\s*/, '').trim()
}

function summarizeEntries(entries: ConversationEntry[], currentText: string): HistoryTurn[] {
  const turns: HistoryTurn[] = []

  entries.forEach((entry, index) => {
    if (entry.kind === 'assistant_text' && isPromptText(entry.text)) {
      turns.push({
        id: `${entry.ts}-${index}`,
        entryIndex: index,
        prompt: cleanPrompt(entry.text),
        assistantPreview: '',
        timestamp: entry.ts,
        toolCount: 0,
        hasError: false,
      })
      return
    }

    const currentTurn = turns.at(-1)
    if (!currentTurn) return

    if (entry.kind === 'assistant_text' && !currentTurn.assistantPreview) {
      currentTurn.assistantPreview = entry.text.trim()
    } else if (entry.kind === 'tool_call') {
      currentTurn.toolCount += 1
    } else if (entry.kind === 'error') {
      currentTurn.hasError = true
      if (!currentTurn.assistantPreview) currentTurn.assistantPreview = entry.message
    }
  })

  const activeTurn = turns.at(-1)
  if (activeTurn && currentText.trim()) {
    activeTurn.assistantPreview = currentText.trim()
  }

  return turns
}

function truncate(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

export default function NativeAgentHistorySidebar({
  entries,
  currentText,
  onClose,
  onSelectEntry,
}: NativeAgentHistorySidebarProps): React.JSX.Element {
  const turns = summarizeEntries(entries, currentText)

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border/40 bg-card text-card-foreground">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/40 px-3">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium">Conversation history</div>
          <div className="text-[11px] text-muted-foreground">{turns.length} turns</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          aria-label="Close conversation history"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {turns.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-[12px] text-muted-foreground/70">
          Send a prompt to build a navigable turn history.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {turns.map((turn, index) => (
              <button
                key={turn.id}
                type="button"
                onClick={() => onSelectEntry(turn.entryIndex)}
                className="group w-full rounded-md border border-transparent px-2.5 py-2 text-left transition hover:border-border/70 hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium uppercase tracking-wide">Turn {index + 1}</span>
                  <span className="ml-auto tabular-nums">{formatTime(turn.timestamp)}</span>
                </div>
                <div className="text-[12px] font-medium leading-snug text-foreground">
                  {truncate(turn.prompt || 'Untitled prompt', 72)}
                </div>
                <div className="mt-1 min-h-4 text-[11px] leading-snug text-muted-foreground">
                  {truncate(turn.assistantPreview || 'Waiting for assistant response…', 88)}
                </div>
                {(turn.toolCount > 0 || turn.hasError) && (
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground/80">
                    {turn.toolCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Wrench className="h-3 w-3" />
                        {turn.toolCount} tool{turn.toolCount === 1 ? '' : 's'}
                      </span>
                    )}
                    {turn.hasError && <span className="text-destructive">Error</span>}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
