import type { SettingsSearchEntry } from './settings-search'

export const EXPERIMENTAL_PANE_SEARCH_ENTRIES: SettingsSearchEntry[] = [
  {
    title: 'Pet',
    description: 'Floating animated pet in the bottom-right corner.',
    keywords: [
      'experimental',
      'pet',
      'sidekick',
      'mascot',
      'overlay',
      'animated',
      'corner',
      'character'
    ]
  },
  {
    title: 'Agents View',
    description: 'Threaded left-sidebar feed for agent completions and blocking states.',
    keywords: [
      'experimental',
      'agents',
      'agents view',
      'activity',
      'notifications',
      'worktrees',
      'timeline',
      'unread',
      'bell',
      'sidebar'
    ]
  },
  {
    title: 'Symlinks on worktrees',
    description:
      'Automatically symlink configured files or folders into newly created worktrees so shared state (envs, caches, installs) stays connected.',
    keywords: [
      'experimental',
      'worktree',
      'worktrees',
      'symlink',
      'symlinks',
      'link',
      'links',
      'shared',
      'env',
      'node_modules'
    ]
  },
  {
    title: 'Native Pi SDK',
    description: 'Route Pi launches through the in-process Pi SDK host instead of a PTY.',
    keywords: [
      'experimental',
      'pi',
      'native',
      'sdk',
      'agent',
      'in-process',
      'pty',
      'subprocess'
    ]
  }
]

// Why: title-keyed lookup avoids a fragile numeric-index invariant — the array
// shape can change without breaking consumers, and a typo/rename throws loudly
// instead of silently matching the wrong (or empty) entry.
function findEntry(title: string): SettingsSearchEntry {
  const entry = EXPERIMENTAL_PANE_SEARCH_ENTRIES.find((e) => e.title === title)
  if (!entry) {
    throw new Error(`Missing experimental-pane search entry: "${title}"`)
  }
  return entry
}

export const EXPERIMENTAL_SEARCH_ENTRY = {
  pet: findEntry('Pet'),
  activity: findEntry('Agents View'),
  symlinks: findEntry('Symlinks on worktrees'),
  nativePi: findEntry('Native Pi SDK')
} as const
