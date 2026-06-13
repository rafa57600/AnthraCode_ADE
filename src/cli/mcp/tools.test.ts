import { describe, expect, it, vi } from 'vitest'
import { ANTHRASPACE_MCP_TOOLS, findAnthraSpaceMcpTool, toMcpToolList } from './tools'
import type { RuntimeClient } from '../runtime-client'
import type { RuntimeRpcSuccess } from '../runtime/types'

function clientWith(handler: (method: string, params?: unknown) => unknown) {
  const call = vi.fn(
    async <TResult>(method: string, params?: unknown): Promise<RuntimeRpcSuccess<TResult>> => ({
      id: '1',
      ok: true as const,
      result: handler(method, params) as TResult,
      _meta: { runtimeId: 'runtime-test' }
    })
  )
  return { call } as Pick<RuntimeClient, 'call'> & { call: typeof call }
}

describe('AnthraSpace MCP tools', () => {
  it('registers the Phase 2 read-only tool set', () => {
    expect(toMcpToolList().map((tool) => tool.name)).toEqual([
      'anthraspace_workspace_info',
      'anthraspace_terminal_list',
      'anthraspace_terminal_read',
      'anthraspace_browser_tabs',
      'anthraspace_browser_snapshot'
    ])
    expect(ANTHRASPACE_MCP_TOOLS.every((tool) => tool.inputSchema.type === 'object')).toBe(true)
  })

  it('maps workspace info from runtime worktrees and repos', async () => {
    const client = clientWith((method) => {
      if (method === 'worktree.list') {
        return {
          worktrees: [
            { id: 'repo-1::/tmp/app', repoId: 'repo-1', displayName: 'app' },
            { id: 'repo-2::/srv/remote', repoId: 'repo-2', displayName: 'remote' }
          ],
          totalCount: 2,
          truncated: false
        }
      }
      if (method === 'repo.list') {
        return {
          repos: [
            { id: 'repo-1', path: '/tmp/app', displayName: 'app' },
            { id: 'repo-2', path: '/srv/remote', displayName: 'remote', connectionId: 'ssh-1' }
          ]
        }
      }
      throw new Error(`unexpected method ${method}`)
    })

    const result = await findAnthraSpaceMcpTool('anthraspace_workspace_info')?.handler({}, client)

    expect(result).toMatchObject({
      app: 'AnthraSpace',
      worktrees: [
        { id: 'repo-1::/tmp/app', path: '/tmp/app', isRemote: false },
        { id: 'repo-2::/srv/remote', path: '/srv/remote', isRemote: true }
      ]
    })
  })

  it('rejects terminal_read without a terminal id', async () => {
    const client = clientWith(() => ({}))

    await expect(
      findAnthraSpaceMcpTool('anthraspace_terminal_read')?.handler({}, client)
    ).rejects.toThrow('Missing required terminalId')
  })

  it('maps browser snapshot target fields to runtime RPC params', async () => {
    const client = clientWith(() => ({
      browserPageId: 'page-1',
      snapshot: 'tree',
      refs: [],
      url: 'https://example.com',
      title: 'Example'
    }))

    const result = await findAnthraSpaceMcpTool('anthraspace_browser_snapshot')?.handler(
      { browserPageId: 'page-1', worktreeId: 'wt-1' },
      client
    )

    expect(client.call).toHaveBeenCalledWith('browser.snapshot', {
      page: 'page-1',
      worktree: 'id:wt-1'
    })
    expect(result).toMatchObject({ browserPageId: 'page-1', snapshot: 'tree' })
  })
})
