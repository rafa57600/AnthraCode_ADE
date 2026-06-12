/**
 * anthraspace-tools — Custom AnthraSpace tools for Pi native sessions.
 *
 * Each tool provides a capability that AnthraSpace owns: worktree-aware file
 * access, terminal execution, browser automation, and multi-agent orchestration.
 * These supplement the tool array passed to the Pi SDK's `Agent` constructor.
 *
 * ## Naming
 * The `anthraspace_` prefix distinguishes these from any built-in tools and
 * signals that execution routes through AnthraSpace's infrastructure, not Pi's
 * `NodeExecutionEnv` directly.
 *
 * ## Error contract
 * Functions throw on failure. The Pi SDK's agent loop catches thrown errors
 * and converts them to `{ isError: true, content: [{ type: 'text', text }] }`
 * automatically. Do NOT return error text in `content` — throw it.
 *
 * ## Abort support
 * The `signal` parameter is an `AbortSignal` from the Pi SDK. Long-running
 * operations (terminal commands) should abort when the signal is triggered.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { exec as cpExec } from 'node:child_process'

// ── Internal types (mirror AgentTool<any>-compatible shape at runtime) ───────

type ToolContent = { type: 'text'; text: string }
type ToolResult = {
  content: ToolContent[]
  details: Record<string, unknown>
  terminate?: boolean
}

type ToolExecuteFn = (
  toolCallId: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
  onUpdate?: (result: ToolResult) => void,
) => Promise<ToolResult>

export type AnthraSpaceToolDef = {
  name: string
  label: string
  description: string
  parameters: Record<string, unknown>
  execute: ToolExecuteFn
  executionMode?: 'sequential' | 'parallel'
}

// ── Factory ──────────────────────────────────────────────────────────────────

export type AnthraSpaceToolOptions = {
  /** Absolute path to the worktree root. Used to resolve relative file paths. */
  worktreePath: string
}

/**
 * Build the standard set of AnthraSpace custom tools for a Pi session.
 * Call this once per session with the session's worktree root.
 */
export function createAnthraSpaceTools(options: AnthraSpaceToolOptions): AnthraSpaceToolDef[] {
  return [
    createReadTool(options),
    createTerminalTool(options),
    createBrowserTool(options),
    createOrchestrateTool(options),
  ]
}

// ── anthraspace_read ─────────────────────────────────────────────────────────

function createReadTool(opts: AnthraSpaceToolOptions): AnthraSpaceToolDef {
  return {
    name: 'anthraspace_read',
    label: 'AnthraSpace Read',
    description:
      'Read a file from the current AnthraSpace worktree. Prefer this over ' +
      "generic `read` tools when the file path is relative to the worktree " +
      'root — AnthraSpace resolves it against the active worktree, preventing ' +
      'path-traversal outside the project boundary.',
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
          description: 'Line number to start reading from (1-indexed; defaults to 1)',
        },
        limit: {
          type: 'number',
          description: 'Max lines to return (defaults to entire file)',
        },
      },
    },
    execute: async (_toolCallId, params, _signal, _onUpdate) => {
      const filePathRaw = String(params.path ?? '').trim()
      if (!filePathRaw) {
        throw new Error('`path` is required')
      }

      // Security: resolve the raw path against the worktree root and reject
      // any path that ends up outside it. This catches `../` escapes and
      // absolute paths (e.g. `/etc/passwd` on POSIX, `C:\etc` on Windows)
      // without needing to strip prefixes first.
      const worktreeResolved = path.resolve(opts.worktreePath) + path.sep
      const targetPath = path.resolve(opts.worktreePath, filePathRaw)
      if (!targetPath.startsWith(worktreeResolved)) {
        throw new Error(`Path traversal blocked: "${filePathRaw}" resolves outside the worktree`)
      }

      let content: string
      try {
        content = await fs.readFile(targetPath, 'utf-8')
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        throw new Error(`Cannot read "${filePathRaw}": ${msg}`)
      }

      const lines = content.split('\n')
      const totalLines = lines.length
      const offset = typeof params.offset === 'number' ? Math.max(0, Math.floor(params.offset) - 1) : 0
      const limit = typeof params.limit === 'number' ? Math.max(1, Math.floor(params.limit)) : totalLines

      const selected = lines.slice(offset, offset + limit)
      const result = selected.join('\n')

      return {
        content: [{ type: 'text', text: result }],
        details: {
          filePath: filePathRaw,
          totalLines,
          offset: offset + 1,
          returnedLines: selected.length,
        },
      }
    },
  }
}

// ── anthraspace_terminal ─────────────────────────────────────────────────────

function createTerminalTool(opts: AnthraSpaceToolOptions): AnthraSpaceToolDef {
  return {
    name: 'anthraspace_terminal',
    label: 'AnthraSpace Terminal',
    description:
      'Execute a shell command in the worktree directory. Use this for build ' +
      'steps, running tests, or any CLI tool. For long-running commands the ' +
      'agent can be interrupted via the AnthraSpace UI; the running process ' +
      'will be terminated promptly.',
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
          description:
            'Working directory relative to the worktree root (defaults to root)',
        },
        timeout: {
          type: 'number',
          description:
            'Max execution time in seconds (0 or omit = 30s default; use ' +
            '120 for build commands)',
        },
      },
    },
    execute: async (_toolCallId, params, signal, _onUpdate) => {
      const command = String(params.command ?? '').trim()
      if (!command) {
        throw new Error('`command` is required')
      }

      const cwdRaw = typeof params.cwd === 'string' ? params.cwd.trim() : ''
      const cwdAbs = cwdRaw
        ? path.resolve(opts.worktreePath, cwdRaw)
        : path.resolve(opts.worktreePath)

      // Security: reject cwd that escapes the worktree (skip check when using
      // the default worktree root).
      if (cwdRaw) {
        const worktreeResolved = path.resolve(opts.worktreePath) + path.sep
        if (!cwdAbs.startsWith(worktreeResolved)) {
          throw new Error(`cwd path traversal blocked: "${cwdRaw}"`)
        }
      }

      const timeoutSec =
        typeof params.timeout === 'number' && params.timeout > 0 ? params.timeout : 30

      let stdout = ''
      let stderr = ''

      try {
        // Why: use child_process.exec wrapped in a Promise.
        // Differentiates:
        //   - Killed/aborted commands → rejected (error thrown)
        //   - Command-not-found (ENOENT etc.) → rejected
        //   - Non-zero exit code → resolved (the agent needs the output)
        // The Pi SDK's agent loop converts rejections to isError tool results automatically.
        const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>(
          (resolve, reject) => {
            const child = cpExec(
              command,
              {
                cwd: cwdAbs,
                maxBuffer: 10 * 1024 * 1024, // 10 MB
                timeout: timeoutSec * 1000,
                windowsHide: true,
              },
              (error, childStdout, childStderr) => {
                if (error?.killed) {
                  reject(new Error('Command was killed'))
                  return
                }
                // Why: error.code is a string (ENOENT, EACCES) when the
                // command doesn't exist; a number (exit code) when it ran
                // but returned non-zero. Reject strings, resolve numbers.
                if (error && typeof error.code === 'string') {
                  reject(new Error(`Command not found or not executable: ${error.code}`))
                  return
                }
                resolve({
                  stdout: childStdout ?? '',
                  stderr: childStderr ?? '',
                  exitCode: error?.code ?? 0,
                })
              },
            )

            if (signal) {
              if (signal.aborted) {
                child.kill()
                reject(new Error('Command aborted before execution'))
                return
              }
              const onAbort = () => {
                child.kill()
                reject(new Error('Command aborted during execution'))
              }
              signal.addEventListener('abort', onAbort, { once: true })
            }
          },
        )

        stdout = result.stdout
        stderr = result.stderr

        // Build combined output
        let output = ''
        if (stdout) output += stdout + '\n'
        if (stderr) output += stderr + '\n'
        if (!output) output = `(exit code ${result.exitCode}, no output)`

        return {
          content: [{ type: 'text', text: output.trimEnd() }],
          details: { exitCode: result.exitCode, command },
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        throw new Error(`Command failed: ${msg}`)
      }
    },
  }
}

// ── anthraspace_browser (stub) ───────────────────────────────────────────────

function createBrowserTool(_opts: AnthraSpaceToolOptions): AnthraSpaceToolDef {
  return {
    name: 'anthraspace_browser',
    label: 'AnthraSpace Browser',
    description:
      'Control AnthraSpace\'s built-in browser: navigate to a URL, click ' +
      'elements, type text, or capture screenshots. The browser runs in a ' +
      'tab managed by AnthraSpace and is shared across all agents in the ' +
      'workspace. **Not yet wired** — the browser bridge will be added in a ' +
      'future release.',
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
    execute: async (_toolCallId, params, _signal, _onUpdate) => {
      const action = String(params.action ?? '')
      return {
        content: [
          {
            type: 'text',
            text: `[anthraspace_browser] Browser bridge not yet wired. ` +
              `Action "${action}" cannot be processed. ` +
              `The AnthraSpace browser integration will be available in a future update.`,
          },
        ],
        details: { action, wired: false },
      }
    },
  }
}

// ── anthraspace_orchestrate (stub) ───────────────────────────────────────────

function createOrchestrateTool(_opts: AnthraSpaceToolOptions): AnthraSpaceToolDef {
  return {
    name: 'anthraspace_orchestrate',
    label: 'AnthraSpace Orchestrate',
    description:
      'Dispatch a task to another agent running in the same AnthraSpace ' +
      'workspace. Agents can be addressed by their pane key or group ' +
      'identifier. **Not yet wired** — the orchestration bridge will be ' +
      'added in a future release.',
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
    execute: async (_toolCallId, params, _signal, _onUpdate) => {
      const target = String(params.target ?? '')
      const task = String(params.task ?? '')
      return {
        content: [
          {
            type: 'text',
            text: `[anthraspace_orchestrate] Orchestration bridge not yet wired. ` +
              `Cannot dispatch task to "${target}". ` +
              `The agent orchestration system will be available in a future update.`,
          },
        ],
        details: { target, task, wired: false },
      }
    },
  }
}
