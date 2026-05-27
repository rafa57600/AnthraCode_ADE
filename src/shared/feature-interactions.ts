export type FeatureInteractionId =
  | 'workspace-board'
  | 'workspace-board-actions'
  | 'browser'
  | 'tasks'
  | 'automations'
  | 'automation-created'
  | 'automation-run'
  | 'workspace-creation'
  | 'agent-browser-use'
  | 'agent-orchestration'
  | 'ai-commit-pr'
  | 'computer-use'
  | 'floating-workspace'
  | 'mobile-pairing'
  | 'notifications'
  | 'quick-commands'
  | 'resource-manager'
  | 'review-notes'
  | 'usage-tracking'
  | 'voice-dictation'

export type FeatureInteractionDefinition = {
  id: FeatureInteractionId
  /** The product action that counts as "the user has interacted with this feature." */
  interaction: string
}

export type FeatureInteractionRecord = {
  /** Unix timestamp in milliseconds for the first local interaction. */
  firstInteractedAt: number
}

export type FeatureInteractionState = Partial<
  Record<FeatureInteractionId, FeatureInteractionRecord>
>

// Why: education state has three separate meanings; see
// docs/reference/feature-education-state.md before adding or reusing ids here.
export const FEATURE_INTERACTIONS = [
  {
    id: 'workspace-board',
    interaction: 'workspace board opened'
  },
  {
    id: 'workspace-board-actions',
    interaction: 'workspace board card, lane, density, or status action used'
  },
  {
    id: 'browser',
    interaction: 'non-blank browser page viewed'
  },
  {
    id: 'tasks',
    interaction: 'Tasks page opened'
  },
  {
    id: 'automations',
    interaction: 'Automations page opened'
  },
  {
    id: 'automation-created',
    interaction: 'automation created'
  },
  {
    id: 'automation-run',
    interaction: 'automation run queued'
  },
  {
    id: 'workspace-creation',
    interaction: 'workspace creation flow opened'
  },
  {
    id: 'agent-browser-use',
    interaction: 'Agent Browser Use setup enabled or used'
  },
  {
    id: 'agent-orchestration',
    interaction: 'Agent Orchestration setup enabled or used'
  },
  {
    id: 'ai-commit-pr',
    interaction: 'AI commit message or pull request generation enabled or used'
  },
  {
    id: 'computer-use',
    interaction: 'Computer Use setup or permission flow opened'
  },
  {
    id: 'floating-workspace',
    interaction: 'Floating Workspace opened or configured'
  },
  {
    id: 'mobile-pairing',
    interaction: 'mobile pairing enabled or QR code generated'
  },
  {
    id: 'notifications',
    interaction: 'desktop notifications enabled or tested'
  },
  {
    id: 'quick-commands',
    interaction: 'terminal quick command created or edited'
  },
  {
    id: 'resource-manager',
    interaction: 'Resource Manager opened or configured'
  },
  {
    id: 'review-notes',
    interaction: 'review note added or sent to an agent'
  },
  {
    id: 'usage-tracking',
    interaction: 'Stats & Usage or provider usage details opened or configured'
  },
  {
    id: 'voice-dictation',
    interaction: 'dictation session started'
  }
] as const satisfies readonly FeatureInteractionDefinition[]

export const FEATURE_INTERACTION_IDS = FEATURE_INTERACTIONS.map((feature) => feature.id)

export function isFeatureInteractionId(value: unknown): value is FeatureInteractionId {
  return (
    typeof value === 'string' && FEATURE_INTERACTION_IDS.includes(value as FeatureInteractionId)
  )
}

export function hasFeatureInteraction(
  state: FeatureInteractionState | null | undefined,
  id: FeatureInteractionId
): boolean {
  return isValidFeatureInteractionRecord(state?.[id])
}

export function normalizeFeatureInteractions(value: unknown): FeatureInteractionState {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const input = value as Record<string, unknown>
  const out: FeatureInteractionState = {}
  for (const id of FEATURE_INTERACTION_IDS) {
    const record = input[id]
    if (isValidFeatureInteractionRecord(record)) {
      out[id] = { firstInteractedAt: record.firstInteractedAt }
    }
  }
  return out
}

function isValidFeatureInteractionRecord(value: unknown): value is FeatureInteractionRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const firstInteractedAt = (value as Record<string, unknown>).firstInteractedAt
  return (
    typeof firstInteractedAt === 'number' &&
    Number.isFinite(firstInteractedAt) &&
    firstInteractedAt >= 0
  )
}
