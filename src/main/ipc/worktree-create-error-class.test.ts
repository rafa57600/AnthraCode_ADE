// Pin the classifier's substring set: widening it later requires explicit
// review per the schema-evolution doctrine in telemetry-events.ts. These
// cases fixture the actual throw sites in worktree-remote.ts so a refactor
// that renames the user-facing error strings shows up here as a regression.

import { describe, expect, it } from 'vitest'
import { classifyWorkspaceCreateError } from './worktree-create-error-class'

describe('classifyWorkspaceCreateError', () => {
  it('buckets the missing-base-ref throw as base_ref_missing', () => {
    const err = new Error(
      'Could not resolve a default base ref for this repo. Pick a base branch explicitly and try again.'
    )
    expect(classifyWorkspaceCreateError(err)).toBe('base_ref_missing')
  })

  it('buckets a branch-already-exists throw as path_collision', () => {
    const err = new Error('Branch "feature/foo" already exists. Pick a different worktree name.')
    expect(classifyWorkspaceCreateError(err)).toBe('path_collision')
  })

  it('buckets the suffix-exhaustion throw as path_collision', () => {
    const err = new Error(
      'Could not find an available worktree name for "feature". Pick a different worktree name.'
    )
    expect(classifyWorkspaceCreateError(err)).toBe('path_collision')
  })

  it('buckets EACCES errors as permission_denied', () => {
    const err = Object.assign(new Error("EACCES: permission denied, mkdir '/tmp/x'"), {
      code: 'EACCES'
    })
    expect(classifyWorkspaceCreateError(err)).toBe('permission_denied')
  })

  it('buckets generic git errors as git_failed', () => {
    const err = new Error('fatal: not a git repository')
    expect(classifyWorkspaceCreateError(err)).toBe('git_failed')
  })

  it('falls through to unknown for unrecognised errors', () => {
    const err = new Error('something completely unexpected')
    expect(classifyWorkspaceCreateError(err)).toBe('unknown')
  })

  it('handles non-Error values without throwing', () => {
    expect(classifyWorkspaceCreateError('a bare string')).toBe('unknown')
    expect(classifyWorkspaceCreateError(undefined)).toBe('unknown')
    expect(classifyWorkspaceCreateError(null)).toBe('unknown')
  })
})
