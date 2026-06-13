/**
 * ChatInput — Text input bar for the Pi agent chat.
 *
 * Provides a textarea with Enter-to-send / Shift+Enter-for-newline,
 * an abort button during generation, and a send button when idle.
 * Extracted from NativeAgentPane to keep concerns separated.
 */

import { useCallback, useRef } from 'react'
import { Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'

type ChatInputProps = {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onAbort: () => void
  disabled: boolean
  isBusy: boolean
  aborting: boolean
  placeholder?: string
}

export default function ChatInput({
  value,
  onChange,
  onSend,
  onAbort,
  disabled,
  isBusy,
  aborting,
  placeholder = 'Type a message...',
}: ChatInputProps): React.JSX.Element {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape' && isBusy) {
        e.preventDefault()
        onAbort()
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSend()
      }
    },
    [isBusy, onAbort, onSend]
  )

  return (
    <div className="shrink-0 border-t border-border/40 px-4 py-3">
      <div className="flex items-end gap-2 rounded-lg border border-border/60 bg-accent/20 p-2 focus-within:border-border focus-within:bg-accent/30">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isBusy ? 'Agent is working...' : placeholder}
          disabled={isBusy}
          rows={1}
          className="min-h-[20px] flex-1 resize-none bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none disabled:opacity-40"
        />
        {isBusy ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={onAbort}
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
            onClick={onSend}
            disabled={!value.trim()}
            title="Send (Enter)"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
