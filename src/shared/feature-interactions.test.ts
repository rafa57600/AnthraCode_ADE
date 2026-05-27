import { describe, expect, it } from 'vitest'
import {
  FEATURE_INTERACTIONS,
  hasFeatureInteraction,
  normalizeFeatureInteractions,
  type FeatureInteractionId
} from './feature-interactions'

type DefinedFeatureInteractionId = (typeof FEATURE_INTERACTIONS)[number]['id']
type MissingFeatureInteractionId = Exclude<FeatureInteractionId, DefinedFeatureInteractionId>
type ExtraFeatureInteractionId = Exclude<DefinedFeatureInteractionId, FeatureInteractionId>

describe('feature interactions', () => {
  it('defines local interaction semantics for product education features', () => {
    const catalogMatchesPublicUnion: [
      MissingFeatureInteractionId,
      ExtraFeatureInteractionId
    ] extends [never, never]
      ? true
      : never = true
    const expectedIds: FeatureInteractionId[] = [
      'workspace-board',
      'workspace-board-actions',
      'browser',
      'tasks',
      'automations',
      'automation-created',
      'automation-run',
      'workspace-creation',
      'agent-browser-use',
      'agent-orchestration',
      'ai-commit-pr',
      'computer-use',
      'floating-workspace',
      'mobile-pairing',
      'notifications',
      'quick-commands',
      'resource-manager',
      'review-notes',
      'usage-tracking',
      'voice-dictation'
    ]

    expect(catalogMatchesPublicUnion).toBe(true)
    expect(FEATURE_INTERACTIONS.map((feature) => feature.id)).toEqual(expectedIds)
    for (const feature of FEATURE_INTERACTIONS) {
      expect(feature.interaction.length).toBeGreaterThan(0)
    }
  })

  it('normalizes persisted records by removing unknown ids and malformed timestamps', () => {
    expect(
      normalizeFeatureInteractions({
        tasks: { firstInteractedAt: 100 },
        browser: { firstInteractedAt: Number.NaN },
        unknown: { firstInteractedAt: 200 },
        'voice-dictation': { firstInteractedAt: 300 }
      })
    ).toEqual({
      tasks: { firstInteractedAt: 100 },
      'voice-dictation': { firstInteractedAt: 300 }
    })
  })

  it('treats only valid known records as interacted', () => {
    expect(hasFeatureInteraction({ tasks: { firstInteractedAt: 100 } }, 'tasks')).toBe(true)
    expect(hasFeatureInteraction({ tasks: { firstInteractedAt: 100 } }, 'browser')).toBe(false)
    expect(
      hasFeatureInteraction({ tasks: { firstInteractedAt: Number.POSITIVE_INFINITY } }, 'tasks')
    ).toBe(false)
  })
})
