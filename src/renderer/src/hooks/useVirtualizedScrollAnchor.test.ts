import { describe, expect, it } from 'vitest'
import { shouldCancelVirtualizedScrollOffsetRestore } from './useVirtualizedScrollAnchor'

describe('shouldCancelVirtualizedScrollOffsetRestore', () => {
  it('keeps a pending restore when there is no direct user scroll input', () => {
    expect(
      shouldCancelVirtualizedScrollOffsetRestore({
        restoring: true,
        shouldSkipRestore: () => false
      })
    ).toBe(false)
  })

  it('does not cancel when there is no pending restore', () => {
    expect(
      shouldCancelVirtualizedScrollOffsetRestore({
        restoring: false,
        shouldSkipRestore: () => true
      })
    ).toBe(false)
  })

  it('cancels a pending restore while direct user scroll input is active', () => {
    expect(
      shouldCancelVirtualizedScrollOffsetRestore({
        restoring: true,
        shouldSkipRestore: () => true
      })
    ).toBe(true)
  })
})
