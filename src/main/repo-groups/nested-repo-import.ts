import type { RepoGroup, RepoGroupImportMode } from '../../shared/types'

type CreateGroupInput = {
  name: string
  parentPath?: string | null
  parentGroupId?: string | null
  createdFrom: RepoGroup['createdFrom']
}

type NestedRepoGroupResolver = {
  getGroupForRepo: (repoPath: string) => RepoGroup | undefined
  getRootGroup: () => RepoGroup | undefined
  getCreatedGroups: () => RepoGroup[]
}

function trimPathSeparators(path: string): string {
  return path.replace(/[\\/]+$/g, '')
}

function splitPath(path: string): string[] {
  return trimPathSeparators(path)
    .split(/[\\/]+/)
    .filter(Boolean)
}

function joinPath(parentPath: string, segments: readonly string[]): string {
  const trimmedParent = trimPathSeparators(parentPath)
  const separator = parentPath.includes('\\') && !parentPath.includes('/') ? '\\' : '/'
  return segments.length === 0
    ? trimmedParent
    : `${trimmedParent}${separator}${segments.join(separator)}`
}

function getRelativeSegments(parentPath: string, repoPath: string): string[] {
  const normalizedParent = trimPathSeparators(parentPath)
  const normalizedRepo = trimPathSeparators(repoPath)
  const parentWithSeparator = `${normalizedParent}/`
  const normalizedRepoForMatch = normalizedRepo.replace(/\\/g, '/')
  const normalizedParentForMatch = normalizedParent.replace(/\\/g, '/')
  const parentWithMatchSeparator = `${normalizedParentForMatch}/`
  if (normalizedRepoForMatch.startsWith(parentWithMatchSeparator)) {
    return splitPath(normalizedRepoForMatch.slice(parentWithMatchSeparator.length))
  }
  if (normalizedRepo.startsWith(parentWithSeparator)) {
    return splitPath(normalizedRepo.slice(parentWithSeparator.length))
  }
  return splitPath(normalizedRepo).slice(-1)
}

export function createNestedRepoGroupResolver(args: {
  parentPath: string
  groupName: string
  mode: RepoGroupImportMode
  createGroup: (input: CreateGroupInput) => RepoGroup
}): NestedRepoGroupResolver {
  const createdGroups: RepoGroup[] = []
  const groupsByRelativeDir = new Map<string, RepoGroup>()

  const ensureGroup = (relativeDirs: readonly string[]): RepoGroup | undefined => {
    if (args.mode !== 'group') {
      return undefined
    }
    const key = relativeDirs.join('/')
    const existing = groupsByRelativeDir.get(key)
    if (existing) {
      return existing
    }
    const parentDirs = relativeDirs.slice(0, -1)
    const parentGroup = relativeDirs.length > 0 ? ensureGroup(parentDirs) : undefined
    const group = args.createGroup({
      name: relativeDirs.length === 0 ? args.groupName : (relativeDirs.at(-1) ?? args.groupName),
      parentPath: joinPath(args.parentPath, relativeDirs),
      parentGroupId: parentGroup?.id ?? null,
      createdFrom: 'folder-scan'
    })
    groupsByRelativeDir.set(key, group)
    createdGroups.push(group)
    return group
  }

  return {
    getGroupForRepo: (repoPath) => {
      const segments = getRelativeSegments(args.parentPath, repoPath)
      // Why: direct child repos belong to the selected-folder group; nested repos
      // belong to the deepest intermediate directory group.
      return ensureGroup(segments.slice(0, -1))
    },
    getRootGroup: () => groupsByRelativeDir.get(''),
    getCreatedGroups: () => [...createdGroups]
  }
}
