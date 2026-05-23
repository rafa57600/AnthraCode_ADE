export function getRepositoryLocalCommandsSectionId(repoId: string): string {
  return `repo-${repoId}-local-commands`
}

export function getRepositoryBadgeColorSectionId(repoId: string): string {
  return `repo-${repoId}-badge-color`
}

export function getRepositorySourceControlAiSectionId(repoId: string): string {
  return `repo-${repoId}-source-control-ai`
}
