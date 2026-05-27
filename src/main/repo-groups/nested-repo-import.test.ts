import { describe, expect, it } from 'vitest'
import { createNestedRepoGroupResolver } from './nested-repo-import'
import type { RepoGroup } from '../../shared/types'

describe('createNestedRepoGroupResolver', () => {
  it('creates a root group plus intermediate directory groups for nested repos', () => {
    const groups: RepoGroup[] = []
    const resolver = createNestedRepoGroupResolver({
      parentPath: '/workspace',
      groupName: 'workspace',
      mode: 'group',
      createGroup: (input) => {
        const group: RepoGroup = {
          id: `group-${groups.length}`,
          name: input.name,
          parentPath: input.parentPath ?? null,
          parentGroupId: input.parentGroupId ?? null,
          createdFrom: input.createdFrom,
          tabOrder: groups.length,
          isCollapsed: false,
          color: null,
          createdAt: 1,
          updatedAt: 1
        }
        groups.push(group)
        return group
      }
    })

    const direct = resolver.getGroupForRepo('/workspace/gateway-api')
    const nested = resolver.getGroupForRepo('/workspace/services/payments/api')
    const sibling = resolver.getGroupForRepo('/workspace/services/payments/worker')

    expect(direct?.name).toBe('workspace')
    expect(nested?.name).toBe('payments')
    expect(sibling?.id).toBe(nested?.id)
    expect(groups.map((group) => [group.name, group.parentGroupId])).toEqual([
      ['workspace', null],
      ['services', 'group-0'],
      ['payments', 'group-1']
    ])
    expect(resolver.getRootGroup()?.id).toBe('group-0')
  })

  it('does not create groups for separate imports', () => {
    const resolver = createNestedRepoGroupResolver({
      parentPath: '/workspace',
      groupName: 'workspace',
      mode: 'separate',
      createGroup: () => {
        throw new Error('should not create a group')
      }
    })

    expect(resolver.getGroupForRepo('/workspace/services/api')).toBeUndefined()
    expect(resolver.getCreatedGroups()).toEqual([])
  })
})
