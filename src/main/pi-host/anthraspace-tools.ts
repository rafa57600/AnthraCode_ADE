/**
 * anthraspace-tools — Custom AnthraSpace tools registered alongside Pi built-ins.
 *
 * Each tool provides a capability that AnthraSpace owns: worktree-aware file
 * access, browser automation, terminal execution, and multi-agent orchestration.
 * These supplement Pi's built-in read/write/edit/bash/grep tools.
 *
 * ## Architecture
 * Tools are defined as `AgentToolDefinition` objects consumable by Pi's `Agent`
 * constructor alongside `createCodingTools()`. Their `execute` callbacks receive
 * a host reference so they can delegate to AnthraSpace's own services.
 *
 * ## Naming
 * The `anthraspace_` prefix distinguishes these from Pi built-ins and signals
 * that execution happens through AnthraSpace's infrastructure, not Pi's
 * `NodeExecutionEnv`.
 */

import type { ToolExecutionMode } from '@earendil-works/pi-agent-core'
import type { PiAgentHost } from './agent-host'

// ── Tool definition shape (mirrors pi-agent-core's AgentToolDefinition) ─────
// Why: importing the canonical type from @earendil-works/pi-agent-core requires
// the package to be installed. We mirror the shape here so the file compiles
// even if the SDK is absent during bundling (lazy-import path).

type ToolParams = Record<string, unknown>
type ToolContent = { type: 'text'; text: string } | { type: 'image'; source: unknown }
type ToolResult = { content: ToolContent[]; details: Record<string, unknown> }

export type AnthraSpaceTool = {
  name: string
  label: string
  description: string
  parameters: Record<string, unknown>
  execute: (callId: string, params: ToolParams) => Promise<ToolResult> | ToolResult
  /** Override the session-level execution mode for this tool. */
  executionMode?: ToolExecutionMode
}

// ── Tool factories ───────────────────────────────────────────────────────────

/**
 * Build the standard set of AnthraSpace custom tools.
 *
 * @param host - PiAgentHost singleton used to delegate operations.
 */
export function createAnthraSpaceTools(host: PiAgentHost): AnthraSpaceTool[] {
  return [
    createReadWorktreeTool(host),
    createBrowserTool(host),
    createTerminalTool(host),
    createOrchestrateTool(host),
  ]
}

// ── Individual tool definitions ──────────────────────────────────────────────

function createReadWorktreeTool(_host: PiAgentHost): AnthraSpaceTool {
  return {
    name: 'anthraspace_read',
    label: 'AnthraSpace Read',
    description:
      'Read a file from the current AnthraSpace worktree. Prefer this over ' +
      "Pi's built-in `read` when the file path is relative to the worktree " +
      'root — AnthraSpace resolves it against the active worktree instead of ' +
      "Pi's working directory.",
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to the worktree root',
        },
        offset: {
          type: 'number',
          description: 'Line number to start reading from (1-indexed)',
        },
        limit: {
          type: 'number',
          description: 'Max lines to return',
        },
      },
    },
    execute: async (_callId, params) => {
      // Why: defer to Pi's built-in read via NodeExecutionEnv from the host.
      // In a full integration the host resolves the worktree path and calls
      // its own filesystem abstraction; for now this forwards to Pi's env.
      try {
        const worktreePath = /* host.resolveWorktreePath() */ ''
        const filePath = String(params.path ?? '')
        const targetPath = worktreePath
          ? `${worktreePath}/${filePath.replace(/^[/\\]+/, '')}`
          : filePath
        return {
          content: [{ type: 'text', text: `[anthraspace_read] ${targetPath} (stub)` }],
          details: {},
        }
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          details: { isError: true },
        }
      }
    },
  }
}

function createBrowserTool(_host: PiAgentHost): AnthraSpaceTool {
  return {
    name: 'anthraspace_browser',
    label: 'AnthraSpace Browser',
    description:
      'Control AnthraSpace\'s built-in browser: navigate to a URL, click ' +
      'elements, type text, or capture screenshots. The browser runs in a ' +
      'tab managed by AnthraSpace and is shared across all agents in the workspace.',
    parameters: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['navigate', 'click', 'type', 'screenshot', 'snapshot'],
          description: 'Browser action to perform',
        },
        url: {
          type: 'string',
          description: 'URL to navigate to (required for navigate action)',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for click/type/screenshot actions',
        },
        text: {
          type: 'string',
          description: 'Text to type (required for type action)',
        },
      },
    },
    execute: async (_callId, params) => {
      const action = String(params.action ?? '')
      return {
        content: [
          {
            type: 'text',
            text: `[anthraspace_browser] action="${action}" (stub — browser bridge not yet wired)`,
          },
        ],
        details: {},
      }
    },
  }
}

function createTerminalTool(_host: PiAgentHost): AnthraSpaceTool {
  return {
    name: 'anthraspace_terminal',
    label: 'AnthraSpace Terminal',
    description:
      'Execute shell commands in an AnthraSpace-managed terminal. Unlike ' +
      "Pi's built-in `bash` tool, this runs through AnthraSpace's PTY " +
      'infrastructure: output is streamed to the terminal pane, long-running ' +
      'commands can be interrupted, and the shell environment includes the ' +
      "user's configured PATH and runtime context.",
    parameters: {
      type: 'object',
      required: ['command'],
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to execute',
        },
        cwd: {
          type: 'string',
          description: 'Working directory (defaults to the worktree root)',
        },
        timeout: {
          type: 'number',
          description: 'Max execution time in seconds (0 = no limit)',
        },
      },
    },
    execute: async (_callId, params) => {
      const command = String(params.command ?? '')
      return {
        content: [
          {
            type: 'text',
            text: `[anthraspace_terminal] $\u00A0${command}\n(stub — terminal bridge not yet wired)`,
          },
        ],
        details: {},
      }
    },
  }
}

function createOrchestrateTool(_host: PiAgentHost): AnthraSpaceTool {
  return {
    name: 'anthraspace_orchestrate',
    label: 'AnthraSpace Orchestrate',
    description:
      'Dispatch a task to another agent running in the same AnthraSpace ' +
      'workspace. Agents can be addressed by their pane key or group ' +
      'identifier. The target agent receives the task as a new prompt in ' +
      'its session.',
    parameters: {
      type: 'object',
      required: ['target', 'task'],
      properties: {
        target: {
          type: 'string',
          description:
            'Agent identifier: a specific pane key, "@all" for every idle ' +
            'agent, or "@idle" for any available agent',
        },
        task: {
          type: 'string',
          description: 'Task description or instructions for the target agent',
        },
      },
    },
    execute: async (_callId, params) => {
      const target = String(params.target ?? '')
      const task = String(params.task ?? '')
      return {
        content: [
          {
            type: 'text',
            text:
              `[anthraspace_orchestrate] dispatched to "${target}" (stub — ` +
              `orchestration bridge not yet wired)\nTask: ${task}`,
          },
        ],
        details: {},
      }
    },
  }
}
