import type { FileMentionCandidate } from './native-agent-types'

export type ActiveFileMention = {
  start: number
  end: number
  query: string
}

const FILE_MENTION_RE = /(^|\s)@([^\s@]*)$/

export function getActiveFileMention(value: string): ActiveFileMention | null {
  const match = FILE_MENTION_RE.exec(value)
  if (!match) return null
  const atOffset = match[1].length
  const start = match.index + atOffset
  return { start, end: value.length, query: match[2] ?? '' }
}

export function filterFileMentionCandidates(
  candidates: FileMentionCandidate[],
  query: string,
  limit = 30
): FileMentionCandidate[] {
  const lower = query.toLowerCase()
  const filtered = lower
    ? candidates.filter((candidate) => candidate.relativePath.toLowerCase().includes(lower))
    : candidates

  return [...filtered]
    .sort((a, b) => scoreCandidate(b, lower) - scoreCandidate(a, lower))
    .slice(0, limit)
}

export function replaceActiveFileMention(
  value: string,
  active: ActiveFileMention,
  relativePath: string
): string {
  return `${value.slice(0, active.start)}@${relativePath} ${value.slice(active.end)}`
}

function scoreCandidate(candidate: FileMentionCandidate, query: string): number {
  if (!query) return 0
  const path = candidate.relativePath.toLowerCase()
  const name = path.split('/').at(-1) ?? path
  if (path === query) return 100
  if (name === query) return 90
  if (name.startsWith(query)) return 75
  if (path.startsWith(query)) return 60
  return 10
}
