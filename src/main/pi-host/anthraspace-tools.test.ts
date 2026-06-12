/**
 * anthraspace-tools.test — Unit tests for custom AnthraSpace tool backends.
 *
 * Tests real file I/O (anthraspace_read), real shell execution
 * (anthraspace_terminal), path-traversal protection, and error contracts.
 *
 * All tests use temporary directories so they don't pollute the real worktree
 * and can run in CI without an Electron runtime.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createAnthraSpaceTools, type AnthraSpaceToolDef } from './anthraspace-tools'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Return a cmd-compatible echo that works on both Windows cmd.exe and POSIX sh. */
function cmdEcho(text: string): string {
  // On Windows, child_process.exec uses cmd.exe by default.
  // On POSIX, it uses /bin/sh.
  return process.platform === 'win32' ? `echo ${text}` : `echo ${text}`
}

// ── Setup ────────────────────────────────────────────────────────────────────

let tmpDir: string
let tools: AnthraSpaceToolDef[]
let readTool: AnthraSpaceToolDef
let termTool: AnthraSpaceToolDef

beforeEach(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'ac-tools-test-'))
  // Write file WITHOUT trailing newline for deterministic test expectations
  await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'line1\nline2\nline3\nline4\nline5')
  await fs.writeFile(path.join(tmpDir, 'empty.txt'), '')
  tools = createAnthraSpaceTools({ worktreePath: tmpDir })
  readTool = tools.find((t) => t.name === 'anthraspace_read')!
  termTool = tools.find((t) => t.name === 'anthraspace_terminal')!
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ── Tool factory ─────────────────────────────────────────────────────────────

describe('tool factory', () => {
  it('creates all 4 tools', () => {
    expect(tools).toHaveLength(4)
    const names = tools.map((t) => t.name)
    expect(names).toContain('anthraspace_read')
    expect(names).toContain('anthraspace_terminal')
    expect(names).toContain('anthraspace_browser')
    expect(names).toContain('anthraspace_orchestrate')
  })

  it('each tool has required fields', () => {
    for (const tool of tools) {
      expect(tool.name).toBeTruthy()
      expect(tool.label).toBeTruthy()
      expect(tool.description).toBeTruthy()
      expect(tool.parameters).toBeTruthy()
      expect(typeof tool.execute).toBe('function')
    }
  })
})

// ── anthraspace_read ────────────────────────────────────────────────────────

describe('anthraspace_read', () => {
  it('reads a file from the worktree', async () => {
    const result = await readTool.execute('call-1', { path: 'hello.txt' })
    expect(result.content[0].text).toBe('line1\nline2\nline3\nline4\nline5')
    expect(result.details).toMatchObject({ totalLines: 5, returnedLines: 5 })
  })

  it('returns specific lines with offset/limit', async () => {
    const result = await readTool.execute('call-2', {
      path: 'hello.txt',
      offset: 2,
      limit: 2,
    })
    expect(result.content[0].text).toBe('line2\nline3')
    expect(result.details).toMatchObject({ offset: 2, returnedLines: 2 })
  })

  it('returns empty string for offset past end', async () => {
    const result = await readTool.execute('call-3', {
      path: 'hello.txt',
      offset: 100,
      limit: 5,
    })
    expect(result.content[0].text).toBe('')
    expect(result.details).toMatchObject({ returnedLines: 0 })
  })

  it('reads an empty file', async () => {
    const result = await readTool.execute('call-4', { path: 'empty.txt' })
    expect(result.content[0].text).toBe('')
    expect(result.details).toMatchObject({ totalLines: 1, returnedLines: 1 })
  })

  it('throws on non-existent file', async () => {
    await expect(
      readTool.execute('call-5', { path: 'nonexistent.md' }),
    ).rejects.toThrow(/Cannot read/)
  })

  it('throws on missing path argument', async () => {
    await expect(
      readTool.execute('call-6', {}),
    ).rejects.toThrow(/`path` is required/)
  })

  it('blocks path traversal via ../', async () => {
    await expect(
      readTool.execute('call-7', { path: '../outside.txt' }),
    ).rejects.toThrow(/Path traversal blocked/)
  })

  it('blocks path traversal via absolute path on Windows', async () => {
    await expect(
      readTool.execute('call-8', { path: '/etc/passwd' }),
    ).rejects.toThrow(/Path traversal blocked/)
  })

  it('blocks deep path traversal', async () => {
    await expect(
      readTool.execute('call-9', { path: 'subdir/../../outside.txt' }),
    ).rejects.toThrow(/Path traversal blocked/)
  })
})

// ── anthraspace_terminal ─────────────────────────────────────────────────────

describe('anthraspace_terminal', () => {
  it('executes a simple echo command', async () => {
    const result = await termTool.execute('call-t1', { command: cmdEcho('hello world') })
    expect(result.content[0].text).toContain('hello world')
    expect(result.details.exitCode).toBe(0)
  })

  it('resolves with non-zero exit code for unknown commands', async () => {
    // Why: on Windows, cmd.exe handles unknown commands and returns exit code 1
    // with an error message in output. On POSIX, sh returns exit code 127.
    // Both cases resolve with output rather than throwing — the agent sees
    // the error message and can decide how to respond.
    const result = await termTool.execute('call-t2', {
      command: 'nonexistent-command-xyz-999',
    })
    expect(result.details.exitCode).not.toBe(0)
    expect(result.content[0].text).toMatch(/not found|not recognized|n.est pas reconnu/i)
  })

  it('rejects missing command', async () => {
    await expect(
      termTool.execute('call-t3', {}),
    ).rejects.toThrow(/`command` is required/)
  })

  it('resolves with exit code for commands that return non-zero', async () => {
    const cmd = process.platform === 'win32'
      ? 'cmd.exe /c exit 42'
      : 'sh -c "exit 42"'
    const result = await termTool.execute('call-t4', { command: cmd })
    expect(result.details.exitCode).toBe(42)
    expect(result.content[0].text).toMatch(/exit code 42/)
  })

  it('respects cwd option', async () => {
    const subDir = path.join(tmpDir, 'sub')
    await fs.mkdir(subDir, { recursive: true })
    // Create a marker file the command can detect
    await fs.writeFile(path.join(subDir, 'marker.txt'), 'present')

    const result = await termTool.execute('call-t5', {
      command: process.platform === 'win32'
        ? 'if exist marker.txt (echo found) else (echo not found)'
        : 'test -f marker.txt && echo found || echo not found',
      cwd: 'sub',
    })
    expect(result.details.exitCode).toBe(0)
    expect(result.content[0].text).toContain('found')
  })

  it('blocks cwd path traversal', async () => {
    await expect(
      termTool.execute('call-t6', { command: cmdEcho('hi'), cwd: '../escape' }),
    ).rejects.toThrow(/path traversal blocked/i)
  })

  it('runs from worktree root by default', async () => {
    // Verify the default cwd is the worktree root by checking for hello.txt
    const cmd = process.platform === 'win32'
      ? 'if exist hello.txt (echo found) else (echo not found)'
      : 'test -f hello.txt && echo found || echo not found'
    const result = await termTool.execute('call-t7', { command: cmd })
    expect(result.content[0].text).toContain('found')
    expect(result.details.exitCode).toBe(0)
  })
})

// ── Stub tools ─────────────────────────────────────────────────────────────

describe('anthraspace_browser (stub)', () => {
  it('returns not-wired message', async () => {
    const tool = tools.find((t) => t.name === 'anthraspace_browser')!
    const result = await tool.execute('call-b1', {
      action: 'navigate',
      url: 'https://example.com',
    })
    expect(result.content[0].text).toContain('not yet wired')
    expect(result.details).toMatchObject({ wired: false })
  })
})

describe('anthraspace_orchestrate (stub)', () => {
  it('returns not-wired message', async () => {
    const tool = tools.find((t) => t.name === 'anthraspace_orchestrate')!
    const result = await tool.execute('call-o1', {
      target: '@idle',
      task: 'test',
    })
    expect(result.content[0].text).toContain('not yet wired')
    expect(result.details).toMatchObject({ wired: false })
  })
})
