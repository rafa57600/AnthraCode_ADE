import type { RuntimeClient } from '../runtime-client'
import type {
  BrowserSnapshotResult,
  BrowserTabListResult,
  RuntimeRepoList,
  RuntimeTerminalListResult,
  RuntimeTerminalRead,
  RuntimeWorktreeListResult
} from '../../shared/runtime-types'

type JsonObject = Record<string, unknown>

export type AnthraSpaceMcpTool = {
  name: string
  description: string
  inputSchema: JsonObject
  handler: (args: JsonObject, client: Pick<RuntimeClient, 'call'>) => Promise<unknown>
}

function optionalString(args: JsonObject, key: string): string | undefined {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new Error(`${key} must be a string`)
  return value
}

function requiredString(args: JsonObject, key: string): string {
  const value = optionalString(args, key)
  if (!value) throw new Error(`Missing required ${key}`)
  return value
}

function optionalPositiveInteger(args: JsonObject, key: string): number | undefined {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer`)
  }
  return value
}

const emptyInputSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false
} satisfies JsonObject

export const ANTHRASPACE_MCP_TOOLS: AnthraSpaceMcpTool[] = [
  {
    name: 'anthraspace_workspace_info',
    description: 'Return AnthraSpace workspace and worktree metadata. Read-only.',
    inputSchema: emptyInputSchema,
    handler: async (_args, client) => {
      const [worktreeResult, repoResult] = await Promise.all([
        client.call<RuntimeWorktreeListResult>('worktree.list', { limit: 200 }),
        client.call<RuntimeRepoList>('repo.list')
      ])
      const reposById = new Map(repoResult.result.repos.map((repo) => [repo.id, repo]))
      return {
        app: 'AnthraSpace',
        worktrees: worktreeResult.result.worktrees.map((worktree) => {
          const repo = reposById.get(worktree.repoId)
          return {
            id: worktree.id,
            repoId: worktree.repoId,
            path: worktree.id.split('::').slice(1).join('::'),
            name: worktree.displayName,
            isRemote: typeof repo?.connectionId === 'string' && repo.connectionId.length > 0
          }
        }),
        totalCount: worktreeResult.result.totalCount,
        truncated: worktreeResult.result.truncated
      }
    }
  },
  {
    name: 'anthraspace_terminal_list',
    description: 'List AnthraSpace-managed terminals. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        worktreeId: { type: 'string', description: 'Optional AnthraSpace worktree id selector.' },
        limit: { type: 'integer', minimum: 1, maximum: 500 }
      },
      additionalProperties: false
    },
    handler: async (args, client) => {
      const worktreeId = optionalString(args, 'worktreeId')
      const limit = optionalPositiveInteger(args, 'limit')
      const result = await client.call<RuntimeTerminalListResult>('terminal.list', {
        worktree: worktreeId ? `id:${worktreeId}` : undefined,
        limit
      })
      return {
        terminals: result.result.terminals.map((terminal) => ({
          terminalId: terminal.handle,
          worktreeId: terminal.worktreeId,
          title: terminal.title ?? undefined,
          cwd: terminal.worktreePath,
          isRunning: terminal.connected,
          writable: terminal.writable,
          preview: terminal.preview
        })),
        totalCount: result.result.totalCount,
        truncated: result.result.truncated
      }
    }
  },
  {
    name: 'anthraspace_terminal_read',
    description: 'Read bounded output from an AnthraSpace-managed terminal. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        terminalId: { type: 'string' },
        cursor: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 5000 }
      },
      required: ['terminalId'],
      additionalProperties: false
    },
    handler: async (args, client) => {
      const terminalId = requiredString(args, 'terminalId')
      const cursor = optionalPositiveInteger(args, 'cursor')
      const limit = optionalPositiveInteger(args, 'limit')
      const result = await client.call<{ terminal: RuntimeTerminalRead }>('terminal.read', {
        terminal: terminalId,
        cursor,
        limit
      })
      return {
        terminalId: result.result.terminal.handle,
        status: result.result.terminal.status,
        output: result.result.terminal.tail.join('\n'),
        nextCursor: result.result.terminal.nextCursor,
        truncated: result.result.terminal.truncated,
        limited: result.result.terminal.limited === true,
        returnedLineCount: result.result.terminal.returnedLineCount
      }
    }
  },
  {
    name: 'anthraspace_browser_tabs',
    description: 'List AnthraSpace managed browser tabs. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        worktreeId: { type: 'string', description: 'Optional AnthraSpace worktree id selector.' }
      },
      additionalProperties: false
    },
    handler: async (args, client) => {
      const worktreeId = optionalString(args, 'worktreeId')
      const result = await client.call<BrowserTabListResult>('browser.tabList', {
        worktree: worktreeId ? `id:${worktreeId}` : undefined
      })
      return { tabs: result.result.tabs }
    }
  },
  {
    name: 'anthraspace_browser_snapshot',
    description: 'Return an accessibility snapshot for an AnthraSpace browser tab. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        browserPageId: { type: 'string' },
        worktreeId: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: async (args, client) => {
      const browserPageId = optionalString(args, 'browserPageId')
      const worktreeId = optionalString(args, 'worktreeId')
      const result = await client.call<BrowserSnapshotResult>('browser.snapshot', {
        page: browserPageId,
        worktree: worktreeId ? `id:${worktreeId}` : undefined
      })
      return result.result
    }
  }
]

export function findAnthraSpaceMcpTool(name: string): AnthraSpaceMcpTool | undefined {
  return ANTHRASPACE_MCP_TOOLS.find((tool) => tool.name === name)
}

export function toMcpToolList(): Array<Pick<AnthraSpaceMcpTool, 'name' | 'description' | 'inputSchema'>> {
  return ANTHRASPACE_MCP_TOOLS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema
  }))
}
