import { describe, expect, it } from 'vitest'
import {
  clearMissingRepoGroupMemberships,
  createRepoGroup,
  getNextRepoGroupOrder,
  normalizeRepoGroupName,
  normalizeRepoGroups
} from './repo-groups'
import type { Repo } from './types'

function repo(overrides: Partial<Repo>): Repo {
  return {
    id: overrides.id ?? 'repo-1',
    path: overrides.path ?? '/repo',
    displayName: overrides.displayName ?? 'repo',
    badgeColor: '#999',
    addedAt: 1,
    kind: 'git',
    ...overrides
  }
}

describe('repo-groups', () => {
  it('creates a durable repo group with normalized defaults', () => {
    const group = createRepoGroup({
      name: '  Platform  ',
      parentPath: '/srv/platform',
      createdFrom: 'folder-scan',
      tabOrder: 3,
      now: 100
    })

    expect(group).toMatchObject({
      name: 'Platform',
      parentPath: '/srv/platform',
      createdFrom: 'folder-scan',
      tabOrder: 3,
      isCollapsed: false,
      color: null,
      createdAt: 100,
      updatedAt: 100
    })
  })

  it('trims empty group names to a fallback', () => {
    expect(normalizeRepoGroupName('   ', 'Existing')).toBe('Existing')
  })

  it('normalizes persisted groups and drops malformed entries', () => {
    const groups = normalizeRepoGroups([
      { id: 'b', name: 'B', tabOrder: 2 },
      { id: 'a', name: 'A', tabOrder: 1, createdFrom: 'folder-scan', isCollapsed: true },
      { id: 'a', name: 'duplicate' },
      { name: 'missing id' }
    ])

    expect(groups.map((group) => group.id)).toEqual(['a', 'b'])
    expect(groups[0]).toMatchObject({ createdFrom: 'folder-scan', isCollapsed: true })
  })

  it('clears repo memberships whose group no longer exists', () => {
    const groups = [createRepoGroup({ name: 'Known', createdFrom: 'manual', tabOrder: 0 })]
    const repos = clearMissingRepoGroupMemberships(
      [repo({ id: 'known', repoGroupId: groups[0].id }), repo({ id: 'missing', repoGroupId: 'x' })],
      groups
    )

    expect(repos.find((entry) => entry.id === 'known')?.repoGroupId).toBe(groups[0].id)
    expect(repos.find((entry) => entry.id === 'missing')?.repoGroupId).toBeNull()
  })

  it('computes the next order inside a group independently from ungrouped repos', () => {
    expect(
      getNextRepoGroupOrder(
        [
          repo({ id: 'a', repoGroupId: 'g', repoGroupOrder: 2 }),
          repo({ id: 'b', repoGroupId: null, repoGroupOrder: 9 })
        ],
        'g'
      )
    ).toBe(3)
  })
})
