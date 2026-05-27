import type { Repo, RepoGroup, RepoGroupCreatedFrom } from './types'

export const UNGROUPED_REPO_GROUP_KEY = 'repo-group:ungrouped'

function createRepoGroupId(): string {
  const randomUUID = globalThis.crypto?.randomUUID
  if (randomUUID) {
    return randomUUID.call(globalThis.crypto)
  }
  return `repo-group-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function normalizeRepoGroupName(name: string, fallback = 'Untitled group'): string {
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

export function createRepoGroup(input: {
  name: string
  parentPath?: string | null
  parentGroupId?: string | null
  createdFrom: RepoGroupCreatedFrom
  tabOrder: number
  now?: number
}): RepoGroup {
  const now = input.now ?? Date.now()
  return {
    id: createRepoGroupId(),
    name: normalizeRepoGroupName(input.name),
    parentPath: input.parentPath ?? null,
    parentGroupId: input.parentGroupId ?? null,
    createdFrom: input.createdFrom,
    tabOrder: input.tabOrder,
    isCollapsed: false,
    color: null,
    createdAt: now,
    updatedAt: now
  }
}

export function normalizeRepoGroups(value: unknown): RepoGroup[] {
  if (!Array.isArray(value)) {
    return []
  }
  const groups: RepoGroup[] = []
  const seen = new Set<string>()
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') {
      continue
    }
    const raw = candidate as Partial<RepoGroup>
    if (typeof raw.id !== 'string' || seen.has(raw.id)) {
      continue
    }
    seen.add(raw.id)
    const now = Date.now()
    groups.push({
      id: raw.id,
      name: normalizeRepoGroupName(typeof raw.name === 'string' ? raw.name : ''),
      parentPath: typeof raw.parentPath === 'string' ? raw.parentPath : null,
      parentGroupId: typeof raw.parentGroupId === 'string' ? raw.parentGroupId : null,
      createdFrom:
        raw.createdFrom === 'manual' ||
        raw.createdFrom === 'folder-scan' ||
        raw.createdFrom === 'migration'
          ? raw.createdFrom
          : 'manual',
      tabOrder:
        typeof raw.tabOrder === 'number' && Number.isFinite(raw.tabOrder) ? raw.tabOrder : 0,
      isCollapsed: raw.isCollapsed === true,
      color: typeof raw.color === 'string' ? raw.color : null,
      createdAt:
        typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now,
      updatedAt:
        typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : now
    })
  }
  groups.sort(
    (left, right) => left.tabOrder - right.tabOrder || left.name.localeCompare(right.name)
  )
  const groupIds = new Set(groups.map((group) => group.id))
  for (const group of groups) {
    if (group.parentGroupId === group.id || !groupIds.has(group.parentGroupId ?? '')) {
      group.parentGroupId = null
    }
  }
  return groups
}

export function clearMissingRepoGroupMemberships(repos: Repo[], groups: RepoGroup[]): Repo[] {
  const groupIds = new Set(groups.map((group) => group.id))
  return repos.map((repo) =>
    repo.repoGroupId && !groupIds.has(repo.repoGroupId) ? { ...repo, repoGroupId: null } : repo
  )
}

export function getNextRepoGroupOrder(repos: readonly Repo[], groupId: string | null): number {
  let max = -1
  for (const repo of repos) {
    if ((repo.repoGroupId ?? null) !== groupId) {
      continue
    }
    const order = repo.repoGroupOrder
    if (typeof order === 'number' && Number.isFinite(order)) {
      max = Math.max(max, order)
    }
  }
  return max + 1
}
