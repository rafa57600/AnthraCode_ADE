/**
 * SlashMenu — Dropdown shown above the chat input when the user types "/".
 *
 * Renders a filtered list of available slash commands.  The parent
 * (ChatInput) drives keyboard navigation (ArrowUp/ArrowDown/Enter/Escape)
 * and passes the selected index back for visual highlighting.
 */

import type { SlashCommandDef } from './slash-commands'

type SlashMenuProps = {
  /** The filtered command list to display. */
  commands: SlashCommandDef[]
  /** Index of the currently-highlighted item (-1 = none). */
  selectedIndex: number
  /** Called when the user clicks a command. */
  onSelect: (id: string) => void
}

export default function SlashMenu({
  commands,
  selectedIndex,
  onSelect,
}: SlashMenuProps): React.JSX.Element | null {
  if (commands.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 z-50 mb-1.5 mx-3 overflow-hidden rounded-lg border border-border/60 bg-popover shadow-lg">
      <ul className="max-h-48 overflow-y-auto py-1" role="listbox">
        {commands.map((cmd, i) => (
          <li
            key={cmd.id}
            role="option"
            aria-selected={i === selectedIndex}
            onMouseDown={(e) => {
              // Why: use onMouseDown instead of onClick so the handler fires
              // before the textarea's onBlur, which would close the menu.
              e.preventDefault()
              onSelect(cmd.id)
            }}
            className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px] ${
              i === selectedIndex
                ? 'bg-accent text-accent-foreground'
                : 'text-popover-foreground hover:bg-accent/50'
            }`}
          >
            <span className="shrink-0 font-medium text-primary/80">
              {cmd.label}
            </span>
            <span className="truncate text-muted-foreground">
              {cmd.description}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
