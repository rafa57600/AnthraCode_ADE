import { FileText } from 'lucide-react'
import type { FileMentionCandidate } from './native-agent-types'

type FileMentionMenuProps = {
  candidates: FileMentionCandidate[]
  selectedIndex: number
  onSelect: (candidate: FileMentionCandidate) => void
}

export default function FileMentionMenu({
  candidates,
  selectedIndex,
  onSelect,
}: FileMentionMenuProps): React.JSX.Element | null {
  if (candidates.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 z-50 mx-3 mb-1.5 overflow-hidden rounded-lg border border-border/60 bg-popover shadow-lg">
      <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
        {candidates.map((candidate, i) => (
          <li
            key={candidate.relativePath}
            role="option"
            aria-selected={i === selectedIndex}
            onMouseDown={(e) => {
              // Why: select before textarea blur can close the completion menu.
              e.preventDefault()
              onSelect(candidate)
            }}
            className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px] ${
              i === selectedIndex
                ? 'bg-accent text-accent-foreground'
                : 'text-popover-foreground hover:bg-accent/50'
            }`}
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-primary/75" />
            <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
              {candidate.relativePath}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
