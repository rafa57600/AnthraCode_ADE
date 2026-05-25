import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestStore } from './store-test-helpers'
import type { Repo, RepoGroup } from '../../../../shared/types'
import {
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from '../../runtime/runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from '../../runtime/runtime-rpc-client'

const remoteRepo: Repo = {
  id: 'remote-repo',
  path: '/remote',
  displayName: 'Remote',
  badgeColor: '#111',
  addedAt: 2
}

const repoGroup: RepoGroup = {
  id: 'group-1',
  name: 'Platform',
  parentPath: null,
  createdFrom: 'manual',
  tabOrder: 0,
  isCollapsed: false,
  color: null,
  createdAt: 1,
  updatedAt: 1
}

const reposList = vi.fn()
const repoGroupsList = vi.fn()
const repoGroupsCreate = vi.fn()
const repoGroupsDelete = vi.fn()
const repoGroupsMoveRepo = vi.fn()
const repoGroupsImportNested = vi.fn()
const runtimeEnvironmentCall = vi.fn()
const runtimeEnvironmentTransportCall = vi.fn()

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  reposList.mockReset()
  repoGroupsList.mockReset()
  repoGroupsCreate.mockReset()
  repoGroupsDelete.mockReset()
  repoGroupsMoveRepo.mockReset()
  repoGroupsImportNested.mockReset()
  runtimeEnvironmentCall.mockReset()
  runtimeEnvironmentTransportCall.mockReset()
  runtimeEnvironmentTransportCall.mockImplementation((args: RuntimeEnvironmentCallRequest) => {
    return createCompatibleRuntimeStatusResponseIfNeeded(args) ?? runtimeEnvironmentCall(args)
  })
  vi.stubGlobal('window', {
    api: {
      repos: {
        list: reposList
      },
      repoGroups: {
        list: repoGroupsList,
        create: repoGroupsCreate,
        delete: repoGroupsDelete,
        moveRepo: repoGroupsMoveRepo,
        importNested: repoGroupsImportNested
      },
      runtimeEnvironments: { call: runtimeEnvironmentTransportCall }
    }
  })
})

describe('repo group store routing', () => {
  it('creates local repo groups without contacting the runtime transport', async () => {
    repoGroupsCreate.mockResolvedValue(repoGroup)
    const store = createTestStore()

    await expect(store.getState().createRepoGroup('Platform')).resolves.toEqual(repoGroup)

    expect(store.getState().repoGroups).toEqual([repoGroup])
    expect(repoGroupsCreate).toHaveBeenCalledWith({
      name: 'Platform',
      createdFrom: 'manual'
    })
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })

  it('refreshes local repos and groups after importing nested repos', async () => {
    const importedRepo: Repo = {
      ...remoteRepo,
      id: 'local-imported',
      path: '/platform/api',
      repoGroupId: repoGroup.id,
      repoGroupOrder: 0
    }
    const result = {
      group: repoGroup,
      repos: [{ path: importedRepo.path, repoId: importedRepo.id, status: 'imported' as const }],
      importedCount: 1,
      alreadyKnownCount: 0,
      failedCount: 0
    }
    repoGroupsImportNested.mockResolvedValue(result)
    repoGroupsList.mockResolvedValue([repoGroup])
    reposList.mockResolvedValue([importedRepo])
    const store = createTestStore()

    await expect(
      store.getState().importNestedRepos({
        parentPath: '/platform',
        groupName: 'Platform',
        repoPaths: [importedRepo.path],
        mode: 'group'
      })
    ).resolves.toEqual(result)

    expect(repoGroupsImportNested).toHaveBeenCalledWith({
      parentPath: '/platform',
      groupName: 'Platform',
      repoPaths: [importedRepo.path],
      mode: 'group'
    })
    expect(repoGroupsList).toHaveBeenCalled()
    expect(reposList).toHaveBeenCalled()
    expect(store.getState().repoGroups).toEqual([repoGroup])
    expect(store.getState().repos).toEqual([importedRepo])
  })

  it('moves local repos to a group using the preload repoId contract', async () => {
    const movedRepo = { ...remoteRepo, repoGroupId: repoGroup.id, repoGroupOrder: 3 }
    repoGroupsMoveRepo.mockResolvedValue(movedRepo)
    const store = createTestStore()
    store.setState({ repos: [remoteRepo], repoGroups: [repoGroup] })

    await expect(store.getState().moveRepoToGroup(remoteRepo.id, repoGroup.id, 3)).resolves.toBe(
      true
    )

    expect(repoGroupsMoveRepo).toHaveBeenCalledWith({
      repoId: remoteRepo.id,
      groupId: repoGroup.id,
      order: 3
    })
    expect(store.getState().repos).toEqual([movedRepo])
  })

  it('uses the remote delete response shape before mutating local state', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-delete-group',
      ok: true,
      result: { deleted: false },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const groupedRepo = { ...remoteRepo, repoGroupId: repoGroup.id }
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      repoGroups: [repoGroup],
      repos: [groupedRepo]
    })

    await expect(store.getState().deleteRepoGroup(repoGroup.id)).resolves.toBe(false)

    expect(store.getState().repoGroups).toEqual([repoGroup])
    expect(store.getState().repos).toEqual([groupedRepo])
    expect(runtimeEnvironmentCall).toHaveBeenCalledWith({
      selector: 'env-1',
      method: 'repoGroup.delete',
      params: { groupId: repoGroup.id },
      timeoutMs: 15_000
    })
    expect(repoGroupsDelete).not.toHaveBeenCalled()
  })
})
