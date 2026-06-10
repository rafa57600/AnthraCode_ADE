import { describe, expect, it } from 'vitest'
import { getDevInstanceIdentity } from './dev-instance-identity'

describe('dev-instance-identity', () => {
  it('keeps packaged identity stable', () => {
    expect(getDevInstanceIdentity(false, {})).toMatchObject({
      name: 'AnthraSpace',
      isDev: false,
      devLabel: null,
      dockBadgeLabel: null,
      appUserModelId: 'space.anthracode.anthraspace'
    })
  })

  it('derives a readable dev label from worktree and branch env', () => {
    const identity = getDevInstanceIdentity(true, {
      ANTHRASPACE_DEV_REPO_ROOT: '/repo/worktrees/dev-indicator',
      ANTHRASPACE_DEV_WORKTREE_NAME: 'dev-indicator',
      ANTHRASPACE_DEV_BRANCH: 'nwparker/dev-indicator'
    })

    expect(identity).toMatchObject({
      isDev: true,
      devLabel: 'dev-indicator',
      devBranch: 'nwparker/dev-indicator',
      devWorktreeName: 'dev-indicator',
      devRepoRoot: '/repo/worktrees/dev-indicator'
    })
    expect(identity.name).toBe('AnthraSpace: nwparker/dev-indicator')
    expect(identity.dockBadgeLabel).toBeNull()
    expect(identity.appUserModelId).toMatch(/^com\.stablyai\.orca\.dev\.[a-f0-9]{10}$/)
  })

  it('includes the branch when it differs from the worktree basename', () => {
    const identity = getDevInstanceIdentity(true, {
      ANTHRASPACE_DEV_REPO_ROOT: '/repo/worktrees/payment-ui',
      ANTHRASPACE_DEV_WORKTREE_NAME: 'payment-ui',
      ANTHRASPACE_DEV_BRANCH: 'feature/billing-shell'
    })

    expect(identity.devLabel).toBe('payment-ui @ feature/billing-shell')
    expect(identity.name).toBe('AnthraSpace: feature/billing-shell')
    expect(identity.dockBadgeLabel).toBeNull()
  })

  it('allows an explicit label override', () => {
    const identity = getDevInstanceIdentity(true, {
      ANTHRASPACE_DEV_INSTANCE_LABEL: 'manual label',
      ANTHRASPACE_DEV_WORKTREE_NAME: 'dev-indicator',
      ANTHRASPACE_DEV_BRANCH: 'feature/other'
    })

    expect(identity.devLabel).toBe('manual label')
    expect(identity.name).toBe('AnthraSpace: feature/other')
    expect(identity.dockBadgeLabel).toBeNull()
  })
})
