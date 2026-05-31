import { toast } from 'sonner'
import type { CliInstallStatus } from '../../../shared/cli-install-types'

type EnsureAnthraSpaceCliAvailableOptions = {
  onStatusChange?: (status: CliInstallStatus) => void
  registrationPromptDelayMs?: number
}

export const AGENT_SKILL_CLI_PREREQUISITE_NOTICE =
  'Before opening setup, AnthraSpace may show a system prompt to register the anthraspace command on PATH.'

export const CLI_PREREQUISITE_REGISTRATION_TOAST = 'AnthraSpace needs to register its CLI on PATH.'
export const CLI_PREREQUISITE_REGISTRATION_TOAST_DESCRIPTION =
  'Approve the system prompt so skill setup can use the anthraspace command.'

export function isAnthraSpaceCliAvailableOnPath(
  status: CliInstallStatus | null | undefined
): boolean {
  return status?.state === 'installed' && status.pathConfigured
}

export async function ensureAnthraSpaceCliAvailableForAgentSkillTerminal({
  onStatusChange,
  registrationPromptDelayMs = 700
}: EnsureAnthraSpaceCliAvailableOptions = {}): Promise<CliInstallStatus | null> {
  try {
    const status = await window.api.cli.getInstallStatus()
    onStatusChange?.(status)

    if (!status.supported) {
      showCliPrerequisiteWarning(status)
      return status
    }

    if (status.state !== 'installed' || !status.pathConfigured) {
      // Why: macOS may immediately show a native authorization prompt, so the
      // user needs app-level context before that OS dialog appears.
      await showAnthraSpaceCliRegistrationPromptToast(registrationPromptDelayMs)
      const next = await window.api.cli.install()
      onStatusChange?.(next)
      showCliPrerequisiteWarning(next)
      return next
    }

    return status
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : 'Failed to register `anthraspace` in PATH.'
    )
    return null
  }
}

export async function showAnthraSpaceCliRegistrationPromptToast(delayMs = 700): Promise<void> {
  toast.message(CLI_PREREQUISITE_REGISTRATION_TOAST, {
    description: CLI_PREREQUISITE_REGISTRATION_TOAST_DESCRIPTION
  })
  await delay(delayMs)
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve()
  }
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function showCliPrerequisiteWarning(status: CliInstallStatus): void {
  if (!status.supported) {
    toast.warning('AnthraSpace CLI registration is unavailable', {
      description: status.detail ?? 'Install the AnthraSpace CLI before running agent skill setup.'
    })
    return
  }

  if (status.state !== 'installed') {
    toast.warning('AnthraSpace CLI registration needs attention', {
      description: status.detail ?? 'Install the AnthraSpace CLI before running agent skill setup.'
    })
    return
  }

  if (!status.pathConfigured) {
    // Why: the skill installer opens a real shell; agents only get the expected
    // AnthraSpace affordances when that shell can resolve the `anthraspace` command.
    toast.warning('`anthraspace` is not visible on PATH yet', {
      description:
        status.detail ??
        'Restart your shell or add the AnthraSpace CLI directory to PATH before setup.'
    })
  }
}
