export const ANTHRASPACE_SKILLS_REPOSITORY_URL = 'https://github.com/rafa57600/AnthraSpace'

export const ANTHRASPACE_CLI_SKILL_NAME = 'anthraspace-cli'
export const COMPUTER_USE_SKILL_NAME = 'computer-use'
export const ORCHESTRATION_SKILL_NAME = 'orchestration'

export function buildAgentFeatureSkillInstallCommand(skillNames: readonly string[]): string {
  if (skillNames.length === 0) {
    throw new Error('At least one skill name is required.')
  }
  return `npx skills add ${ANTHRASPACE_SKILLS_REPOSITORY_URL} --skill ${skillNames.join(' ')} --global`
}

export const ANTHRASPACE_CLI_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ANTHRASPACE_CLI_SKILL_NAME
])

export const COMPUTER_USE_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  COMPUTER_USE_SKILL_NAME
])

export const ORCHESTRATION_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ORCHESTRATION_SKILL_NAME
])
