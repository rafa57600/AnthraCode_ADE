import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AgentFeatureSetupStep } from './AgentFeatureSetupStep'

describe('AgentFeatureSetupStep', () => {
  it('renders the agent feature setup checklist', () => {
    const html = renderToStaticMarkup(
      <AgentFeatureSetupStep
        featureSetup={{
          browserUse: true,
          computerUse: true,
          orchestration: true
        }}
        onFeatureSetupChange={vi.fn()}
        featureSetupCommand={null}
        featureSetupCommandSelection={null}
        setupBusyLabel={null}
        onStartFeatureSetup={vi.fn()}
      />
    )

    expect(html).toContain('Set up agent features')
    expect(html).toContain('Agent Browser Use')
    expect(html).toContain('Computer Use')
    expect(html).toContain('Agent Orchestration')
    expect(html).toContain('Set up selected features')
    expect(html).toContain(
      'Before opening setup, Orca may show a system prompt to register the orca command on PATH.'
    )
    expect(html).toContain('role="checkbox"')
  })
})
