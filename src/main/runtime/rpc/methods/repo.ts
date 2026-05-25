import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import { OptionalFiniteNumber, OptionalString, requiredString } from '../schemas'
import { sanitizeRepoIcon } from '../../../../shared/repo-icon'

const RepoSelector = z.object({
  repo: requiredString('Missing repo selector')
})

const RepoPath = z.object({
  path: requiredString('Missing repo path'),
  kind: z.enum(['git', 'folder']).optional()
})

const RepoCreate = z.object({
  parentPath: requiredString('Missing parent path'),
  name: requiredString('Missing repo name'),
  kind: z.enum(['git', 'folder']).optional()
})

const RepoClone = z.object({
  url: requiredString('Missing clone URL'),
  destination: requiredString('Missing clone destination')
})

const RepoSetBaseRef = z.object({
  repo: requiredString('Missing repo selector'),
  ref: requiredString('Missing base ref')
})

const RepoUpdate = RepoSelector.extend({
  updates: z.object({
    displayName: OptionalString,
    badgeColor: OptionalString,
    repoIcon: z
      .unknown()
      .transform((value) => sanitizeRepoIcon(value))
      .optional(),
    hookSettings: z.unknown().optional(),
    worktreeBaseRef: OptionalString,
    kind: z.enum(['git', 'folder']).optional(),
    symlinkPaths: z.array(z.string()).optional(),
    issueSourcePreference: z.enum(['auto', 'upstream', 'origin']).optional(),
    externalWorktreeVisibility: z.enum(['hide', 'show']).optional(),
    externalWorktreeVisibilityPromptDismissedAt: z.number().finite().optional(),
    repoGroupId: OptionalString.nullable().optional(),
    repoGroupOrder: OptionalFiniteNumber
  })
})

const RepoSearchRefs = z.object({
  repo: requiredString('Missing repo selector'),
  query: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : undefined))
    .pipe(z.string({ message: 'Missing query' })),
  limit: OptionalFiniteNumber
})

const RepoReorder = z.object({
  orderedIds: z.array(z.string())
})

const RepoGroupCreate = z.object({
  name: requiredString('Missing group name'),
  parentPath: OptionalString,
  createdFrom: z.enum(['manual', 'folder-scan', 'migration']).optional()
})

const RepoGroupUpdate = z.object({
  groupId: requiredString('Missing group id'),
  updates: z.object({
    name: OptionalString,
    isCollapsed: z.boolean().optional(),
    tabOrder: OptionalFiniteNumber,
    color: OptionalString.nullable().optional()
  })
})

const RepoGroupSelector = z.object({
  groupId: requiredString('Missing group id')
})

const RepoGroupMoveRepo = z.object({
  repo: requiredString('Missing repo selector'),
  groupId: OptionalString.nullable(),
  order: OptionalFiniteNumber
})

const RepoGroupScanNested = z.object({
  path: requiredString('Missing folder path')
})

const RepoGroupImportNested = z.discriminatedUnion('mode', [
  z.object({
    parentPath: requiredString('Missing parent path'),
    groupName: requiredString('Missing group name'),
    repoPaths: z.array(z.string()),
    mode: z.literal('group')
  }),
  z.object({
    parentPath: requiredString('Missing parent path'),
    // Why: "Import separately" does not create a group, so SSH must accept the
    // same empty group-name state that the local dialog allows.
    groupName: z.string().optional().default(''),
    repoPaths: z.array(z.string()),
    mode: z.literal('separate')
  })
])

const RepoIssueCommandWrite = RepoSelector.extend({
  content: z.string()
})

const RepoSparsePresetSave = RepoSelector.extend({
  id: OptionalString,
  name: requiredString('Missing preset name'),
  directories: z.array(z.string())
})

export const REPO_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'repo.list',
    params: null,
    handler: (_params, { runtime }) => ({ repos: runtime.listRepos() })
  }),
  defineMethod({
    name: 'repoGroup.list',
    params: null,
    handler: (_params, { runtime }) => ({ groups: runtime.listRepoGroups() })
  }),
  defineMethod({
    name: 'repoGroup.create',
    params: RepoGroupCreate,
    handler: async (params, { runtime }) => ({
      group: await runtime.createRepoGroup(params)
    })
  }),
  defineMethod({
    name: 'repoGroup.update',
    params: RepoGroupUpdate,
    handler: async (params, { runtime }) => ({
      group: await runtime.updateRepoGroup(params.groupId, params.updates)
    })
  }),
  defineMethod({
    name: 'repoGroup.delete',
    params: RepoGroupSelector,
    handler: async (params, { runtime }) => runtime.deleteRepoGroup(params.groupId)
  }),
  defineMethod({
    name: 'repoGroup.moveRepo',
    params: RepoGroupMoveRepo,
    handler: async (params, { runtime }) => ({
      repo: await runtime.moveRepoToGroup(params.repo, params.groupId ?? null, params.order)
    })
  }),
  defineMethod({
    name: 'repoGroup.scanNested',
    params: RepoGroupScanNested,
    handler: async (params, { runtime }) => runtime.scanNestedRepos(params.path)
  }),
  defineMethod({
    name: 'repoGroup.importNested',
    params: RepoGroupImportNested,
    handler: async (params, { runtime }) => runtime.importNestedRepos(params)
  }),
  defineMethod({
    name: 'repo.sparsePresets',
    params: RepoSelector,
    handler: async (params, { runtime }) => ({
      presets: await runtime.listSparsePresets(params.repo)
    })
  }),
  defineMethod({
    name: 'repo.saveSparsePreset',
    params: RepoSparsePresetSave,
    handler: async (params, { runtime }) => ({
      preset: await runtime.saveSparsePreset(params.repo, {
        ...(params.id ? { id: params.id } : {}),
        name: params.name,
        directories: params.directories
      })
    })
  }),
  defineMethod({
    name: 'repo.add',
    params: RepoPath,
    handler: async (params, { runtime }) => ({
      repo: await runtime.addRepo(params.path, params.kind)
    })
  }),
  defineMethod({
    name: 'repo.create',
    params: RepoCreate,
    handler: async (params, { runtime }) =>
      runtime.createRepo(params.parentPath, params.name, params.kind)
  }),
  defineMethod({
    name: 'repo.clone',
    params: RepoClone,
    handler: async (params, { runtime }) => ({
      repo: await runtime.cloneRepo(params.url, params.destination)
    })
  }),
  defineMethod({
    name: 'repo.show',
    params: RepoSelector,
    handler: async (params, { runtime }) => ({ repo: await runtime.showRepo(params.repo) })
  }),
  defineMethod({
    name: 'repo.update',
    params: RepoUpdate,
    handler: async (params, { runtime }) => ({
      repo: await runtime.updateRepo(
        params.repo,
        params.updates as Parameters<typeof runtime.updateRepo>[1]
      )
    })
  }),
  defineMethod({
    name: 'repo.rm',
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.removeRepo(params.repo)
  }),
  defineMethod({
    name: 'repo.reorder',
    params: RepoReorder,
    handler: async (params, { runtime }) => runtime.reorderRepos(params.orderedIds)
  }),
  defineMethod({
    name: 'repo.setBaseRef',
    params: RepoSetBaseRef,
    handler: async (params, { runtime }) => ({
      repo: await runtime.setRepoBaseRef(params.repo, params.ref)
    })
  }),
  defineMethod({
    name: 'repo.baseRefDefault',
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.getRepoBaseRefDefault(params.repo)
  }),
  defineMethod({
    name: 'repo.searchRefs',
    params: RepoSearchRefs,
    handler: async (params, { runtime }) =>
      runtime.searchRepoRefs(params.repo, params.query, params.limit)
  }),
  defineMethod({
    name: 'repo.hooks',
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.getRepoHooks(params.repo)
  }),
  defineMethod({
    name: 'repo.hooksCheck',
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.checkRepoHooks(params.repo)
  }),
  defineMethod({
    name: 'repo.setupScriptImports',
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.inspectRepoSetupScriptImports(params.repo)
  }),
  defineMethod({
    name: 'repo.issueCommandRead',
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.readRepoIssueCommand(params.repo)
  }),
  defineMethod({
    name: 'repo.issueCommandWrite',
    params: RepoIssueCommandWrite,
    handler: async (params, { runtime }) =>
      runtime.writeRepoIssueCommand(params.repo, params.content)
  })
]
