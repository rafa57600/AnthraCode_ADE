import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { tmpdir } from 'node:os'
import type { Model } from '@earendil-works/pi-ai'
import { PiAgentHost } from './agent-host'
import { createAnthraSpaceTools } from './anthraspace-tools'

const TEST_MODEL = {
  id: 'test-model',
  name: 'Test Model',
  api: 'anthropic-messages',
  provider: 'anthropic',
  baseUrl: 'https://example.invalid',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 100_000,
  maxTokens: 4096
} as Model<any>

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'ac-pi-host-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('PiAgentHost native session registration', () => {
  it('registers AnthraSpace tools on the underlying Pi Agent session', async () => {
    const host = new PiAgentHost()
    const session = await host.createSession({
      sessionId: 'session-tools-test',
      worktreePath: tmpDir,
      model: TEST_MODEL,
      tools: createAnthraSpaceTools({ worktreePath: tmpDir }) as any
    })

    expect(session.getToolNames()).toEqual([
      'anthraspace_read',
      'anthraspace_terminal',
      'anthraspace_browser',
      'anthraspace_orchestrate'
    ])

    await host.destroySession('session-tools-test')
  })
})
