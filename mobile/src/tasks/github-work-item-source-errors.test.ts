import { describe, expect, it } from 'vitest'
import {
  extractGitHubIssueSourceError,
  extractGitHubIssueSourceFallback
} from './github-work-item-source-errors'

describe('extractGitHubIssueSourceError', () => {
  it('keeps the failing issue source slug with the repo that produced it', () => {
    expect(
      extractGitHubIssueSourceError(
        { id: 'repo-1', path: '/work/anthraspace' },
        {
          sources: { issues: { owner: 'upstream', repo: 'anthraspace' } },
          errors: { issues: { message: 'HTTP 403: resource not accessible' } }
        }
      )
    ).toEqual({
      repoId: 'repo-1',
      repoPath: '/work/anthraspace',
      source: { owner: 'upstream', repo: 'anthraspace' },
      message: 'HTTP 403: resource not accessible'
    })
  })

  it('drops issue errors when the source slug is unavailable', () => {
    expect(
      extractGitHubIssueSourceError(
        { id: 'repo-1', path: '/work/anthraspace' },
        {
          sources: { issues: null },
          errors: { issues: { message: 'failed' } }
        }
      )
    ).toBeNull()
  })

  it('returns null when the envelope has no issue-side error', () => {
    expect(
      extractGitHubIssueSourceError(
        { id: 'repo-1', path: '/work/anthraspace' },
        {
          sources: { issues: { owner: 'stablyai', repo: 'anthraspace' } }
        }
      )
    ).toBeNull()
  })
})

describe('extractGitHubIssueSourceFallback', () => {
  it('reports the repo whose upstream issue source fell back to origin', () => {
    expect(
      extractGitHubIssueSourceFallback(
        { id: 'repo-1', path: '/work/anthraspace', displayName: 'anthraspace' },
        {
          issueSourceFellBack: true,
          sources: {
            issues: { owner: 'stablyai', repo: 'orca-fork' },
            prs: { owner: 'stablyai', repo: 'anthraspace' }
          }
        }
      )
    ).toEqual({
      repoId: 'repo-1',
      repoPath: '/work/anthraspace',
      repoLabel: 'stablyai/anthraspace'
    })
  })

  it('uses the Orca repo display name when the PR source is unavailable', () => {
    expect(
      extractGitHubIssueSourceFallback(
        { id: 'repo-1', path: '/work/anthraspace', displayName: 'anthraspace' },
        {
          issueSourceFellBack: true,
          sources: { issues: null, prs: null }
        }
      )
    ).toEqual({
      repoId: 'repo-1',
      repoPath: '/work/anthraspace',
      repoLabel: 'anthraspace'
    })
  })

  it('returns null when the source resolver did not fall back', () => {
    expect(
      extractGitHubIssueSourceFallback(
        { id: 'repo-1', path: '/work/anthraspace', displayName: 'anthraspace' },
        {
          sources: { issues: { owner: 'stablyai', repo: 'anthraspace' } }
        }
      )
    ).toBeNull()
  })
})
