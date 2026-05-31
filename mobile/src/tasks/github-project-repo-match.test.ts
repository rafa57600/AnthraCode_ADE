import { describe, expect, it } from 'vitest'
import {
  filterGitHubProjectRowsForRepos,
  findRepoForGitHubProjectRepository,
  normalizeGitHubRepositorySlug
} from './github-project-repo-match'

const repos = [
  { id: 'repo-1', path: '/Users/me/anthraspace', displayName: 'anthraspace' },
  { id: 'repo-2', path: '/Users/me/other', displayName: 'other' }
]

describe('GitHub project repo matching', () => {
  it('normalizes owner/repo slugs case-insensitively', () => {
    expect(normalizeGitHubRepositorySlug(' rafa57600/AnthraSpace ')).toBe('stablyai/anthraspace')
    expect(normalizeGitHubRepositorySlug('anthraspace')).toBeNull()
    expect(normalizeGitHubRepositorySlug('stablyai/anthraspace/extra')).toBeNull()
  })

  it('matches project rows by resolved repo slug before path/display heuristics', () => {
    expect(
      findRepoForGitHubProjectRepository('stablyai/anthraspace', repos, {
        'repo-1': { path: '/Users/me/anthraspace', slug: 'stablyai/anthraspace' }
      })
    ).toBe(repos[0])
  })

  it('does not pick a repo when resolved slugs are ambiguous', () => {
    expect(
      findRepoForGitHubProjectRepository('stablyai/anthraspace', repos, {
        'repo-1': { path: '/Users/me/anthraspace', slug: 'stablyai/anthraspace' },
        'repo-2': { path: '/Users/me/other', slug: 'stablyai/anthraspace' }
      })
    ).toBeNull()
  })

  it('falls back to exact display/path slug matching when slug resolution is unavailable', () => {
    expect(
      findRepoForGitHubProjectRepository('stablyai/anthraspace', [
        { id: 'repo-1', path: '/Users/me/stablyai/anthraspace', displayName: 'anthraspace' }
      ])
    ).toEqual({ id: 'repo-1', path: '/Users/me/stablyai/anthraspace', displayName: 'anthraspace' })
  })

  it('normalizes Windows paths before path slug fallback matching', () => {
    expect(
      findRepoForGitHubProjectRepository('stablyai/anthraspace', [
        { id: 'repo-1', path: 'C:\\Users\\me\\stablyai\\orca', displayName: 'anthraspace' }
      ])
    ).toEqual({ id: 'repo-1', path: 'C:\\Users\\me\\stablyai\\orca', displayName: 'anthraspace' })
  })

  it('does not path-match a repo whose resolved slug points somewhere else', () => {
    expect(
      findRepoForGitHubProjectRepository(
        'stablyai/anthraspace',
        [{ id: 'repo-1', path: '/Users/me/stablyai/anthraspace', displayName: 'anthraspace' }],
        {
          'repo-1': { path: '/Users/me/stablyai/anthraspace', slug: 'fork/anthraspace' }
        }
      )
    ).toBeNull()
  })

  it('filters project rows to rows backed by open repositories', () => {
    const rows = [
      { id: 'row-1', content: { repository: 'stablyai/anthraspace' } },
      { id: 'row-2', content: { repository: 'other/missing' } },
      { id: 'row-3', content: { repository: null } }
    ]

    expect(
      filterGitHubProjectRowsForRepos(rows, repos, {
        'repo-1': { path: '/Users/me/anthraspace', slug: 'stablyai/anthraspace' }
      }).map((row) => row.id)
    ).toEqual(['row-1'])
  })
})
