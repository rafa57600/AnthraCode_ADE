import { describe, expect, it, vi } from 'vitest'
import { handleAnthraSpaceMcpRequest } from './stdio-server'
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

describe('AnthraSpace MCP stdio request handling', () => {
  it('initializes with tools capability', async () => {
    const response = await handleAnthraSpaceMcpRequest(
      { jsonrpc: '2.0', id: 1, method: 'initialize' },
      clientWith(() => ({}))
    )

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: { capabilities: { tools: {} }, serverInfo: { name: 'anthraspace' } }
    })
  })

  it('lists only the read-only Phase 2 tools', async () => {
    const response = await handleAnthraSpaceMcpRequest(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      clientWith(() => ({}))
    )

    const tools = (response?.result as { tools: Array<{ name: string }> }).tools
    expect(tools.map((tool) => tool.name)).toEqual([
      'anthraspace_workspace_info',
      'anthraspace_terminal_list',
      'anthraspace_terminal_read',
      'anthraspace_browser_tabs',
      'anthraspace_browser_snapshot'
    ])
  })

  it('wraps mocked runtime results as MCP text content blocks', async () => {
    const client = clientWith((method) => {
      expect(method).toBe('terminal.list')
      return { terminals: [], totalCount: 0, truncated: false }
    })

    const response = await handleAnthraSpaceMcpRequest(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'anthraspace_terminal_list', arguments: {} }
      },
      client
    )

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 3,
      result: { content: [{ type: 'text' }] }
    })
    expect(client.call).toHaveBeenCalledWith('terminal.list', {
      worktree: undefined,
      limit: undefined
    })
  })

  it('returns invalid params for schema-level input failures', async () => {
    const response = await handleAnthraSpaceMcpRequest(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'anthraspace_terminal_read', arguments: {} }
      },
      clientWith(() => ({}))
    )

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 4,
      error: { code: -32602, message: 'Missing required terminalId' }
    })
  })

  it('surfaces runtime auth/connectivity failures as internal MCP errors', async () => {
    const response = await handleAnthraSpaceMcpRequest(
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'anthraspace_terminal_list', arguments: {} }
      },
      clientWith(() => {
        throw new Error('Runtime authentication failed')
      })
    )

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 5,
      error: { code: -32603, message: 'Runtime authentication failed' }
    })
  })
})
