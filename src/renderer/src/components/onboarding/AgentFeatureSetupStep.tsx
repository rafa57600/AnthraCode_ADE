import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  AGENT_SKILL_CLI_PREREQUISITE_NOTICE,
  isOrcaCliAvailableOnPath
} from '@/lib/agent-skill-cli-prerequisite'
import { Button } from '@/components/ui/button'
import { FeatureSetupChecklist } from './FeatureSetupChecklist'
import { FeatureSetupInlineTerminal } from './FeatureSetupInlineTerminal'
import {
  hasSelectedOnboardingFeatureSetup,
  type OnboardingFeatureSetupSelection
} from './onboarding-feature-setup'

type AgentFeatureSetupStepProps = {
  featureSetup: OnboardingFeatureSetupSelection
  onFeatureSetupChange: (value: OnboardingFeatureSetupSelection) => void
  featureSetupCommand: string | null
  featureSetupCommandSelection: OnboardingFeatureSetupSelection | null
  setupBusyLabel: string | null
  onStartFeatureSetup: () => void
}

export function AgentFeatureSetupStep({
  featureSetup,
  onFeatureSetupChange,
  featureSetupCommand,
  featureSetupCommandSelection,
  setupBusyLabel,
  onStartFeatureSetup
}: AgentFeatureSetupStepProps): React.JSX.Element {
  const [showCliNotice, setShowCliNotice] = useState(true)
  const hasSelectedFeatures = hasSelectedOnboardingFeatureSetup(featureSetup)
  const showSetupAction = !featureSetupCommand

  useEffect(() => {
    let canceled = false
    const refreshCliNotice = async (): Promise<void> => {
      try {
        const status = await window.api.cli.getInstallStatus()
        if (!canceled) {
          setShowCliNotice(!isOrcaCliAvailableOnPath(status))
        }
      } catch {
        if (!canceled) {
          setShowCliNotice(true)
        }
      }
    }

    void refreshCliNotice()
    window.addEventListener('focus', refreshCliNotice)
    return () => {
      canceled = true
      window.removeEventListener('focus', refreshCliNotice)
    }
  }, [])

  return (
    <>
      <FeatureSetupChecklist value={featureSetup} onChange={onFeatureSetupChange} />
      {showSetupAction ? (
        <div className="mt-4 flex flex-col items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-[12px] leading-relaxed text-muted-foreground">
            {showCliNotice ? (
              <span id="agent-feature-setup-cli-notice">{AGENT_SKILL_CLI_PREREQUISITE_NOTICE}</span>
            ) : (
              <span>Run setup now, or continue and set this up later in Settings.</span>
            )}
          </div>
          <Button
            type="button"
            variant="default"
            className="w-full shrink-0 sm:w-auto"
            disabled={!hasSelectedFeatures || Boolean(setupBusyLabel)}
            aria-describedby={showCliNotice ? 'agent-feature-setup-cli-notice' : undefined}
            onClick={onStartFeatureSetup}
          >
            {setupBusyLabel ? <Loader2 className="size-4 animate-spin" /> : null}
            {setupBusyLabel ?? 'Set up selected features'}
          </Button>
        </div>
      ) : null}
      {featureSetupCommand ? (
        <FeatureSetupInlineTerminal
          command={featureSetupCommand}
          selection={featureSetupCommandSelection ?? featureSetup}
        />
      ) : null}
    </>
  )
}
