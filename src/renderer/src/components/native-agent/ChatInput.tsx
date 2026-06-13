/**
 * ChatInput — Text input bar for the Pi agent chat.
 *
 * Provides a textarea with Enter-to-send / Shift+Enter-for-newline,
 * slash-command autocomplete (triggered by typing "/"), an abort button
 * during generation, and a send button when idle.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { filterSlashCommands } from './slash-commands'
import type { SlashCommandDef } from './slash-commands'
import SlashMenu from './SlashMenu'

type ChatInputProps = {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onAbort: () => void
  /** Called when the user selects a slash command (e.g. "/clear"). */
  onCommand?: (commandId: string) => void
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
  onCommand,
  disabled,
  isBusy,
  aborting,
  placeholder = 'Type a message...',
}: ChatInputProps): React.JSX.Element {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // ── Slash-command state (derived) ─────────────────────────────────────────

  const slashPrefix = value.startsWith('/') ? value.slice(1) : null
  const filteredCommands: SlashCommandDef[] =
    slashPrefix != null ? filterSlashCommands(slashPrefix) : []
  const showSlashMenu =
    Boolean(onCommand) && !disabled && !isBusy && slashPrefix != null && filteredCommands.length > 0

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(filteredCommands.length - 1, 0)))
  }, [filteredCommands.length])

  // ── Command execution ─────────────────────────────────────────────────────

  const executeCommand = useCallback(
    (commandId: string) => {
      onChange('')
      onCommand?.(commandId)
    },
    [onChange, onCommand]
  )

  // ── Select next/previous filtered command ─────────────────────────────────

  const selectNext = useCallback(() => {
    setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1))
  }, [filteredCommands.length])

  const selectPrev = useCallback(() => {
    setSelectedIndex((prev) => Math.max(prev - 1, 0))
  }, [])

  // ── Keyboard handling ─────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // ── While the slash menu is open ──────────────────────────────────────
      if (showSlashMenu) {
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault()
            selectNext()
            return
          case 'ArrowUp':
            e.preventDefault()
            selectPrev()
            return
          case 'Enter':
          case 'Tab':
            e.preventDefault()
            if (filteredCommands[selectedIndex]) {
              executeCommand(filteredCommands[selectedIndex].id)
            }
            return
          case 'Escape':
            e.preventDefault()
            onChange('')
            return
        }
      }

      // ── Normal input keybindings ─────────────────────────────────────────
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
    [showSlashMenu, isBusy, selectNext, selectPrev, filteredCommands, selectedIndex, executeCommand, onChange, onAbort, onSend]
  )

  return (
    <div className="relative shrink-0 border-t border-border/40">
      {/* Slash-command dropdown — rendered above the input bar */}
      {showSlashMenu && (
        <SlashMenu
          commands={filteredCommands}
          selectedIndex={selectedIndex}
          onSelect={executeCommand}
        />
      )}

      <div className="flex items-end gap-2 px-4 py-3">
        <div className="flex flex-1 items-end gap-2 rounded-lg border border-border/60 bg-accent/20 p-2 focus-within:border-border focus-within:bg-accent/30">
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              // Why: reset highlight to the top when the user modifies text so
              // the first matching command is always pre-selected.
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder={isBusy ? 'Agent is working...' : placeholder}
            disabled={disabled}
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
              disabled={disabled || !value.trim()}
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
