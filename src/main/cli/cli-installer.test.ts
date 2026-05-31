import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => tmpdir(),
    getAppPath: () => tmpdir()
  }
}))

import { CliInstaller } from './cli-installer'

async function makeFixture(): Promise<{
  root: string
  userDataPath: string
  appPath: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'anthraspace-cli-installer-'))
  const userDataPath = join(root, 'userData')
  const appPath = join(root, 'app')
  const cliEntryPath = join(appPath, 'out', 'cli', 'index.js')
  await mkdir(join(appPath, 'out', 'cli'), { recursive: true })
  await writeFile(cliEntryPath, 'console.log("anthraspace")\n', 'utf8')
  return { root, userDataPath, appPath }
}

describe('CliInstaller', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Why: this test creates Unix symlinks and shell scripts that only apply on macOS.
  it.skipIf(process.platform === 'win32')(
    'creates a dev launcher and installs a macOS symlink in the requested path',
    async () => {
      const fixture = await makeFixture()
      const installPath = join(fixture.root, 'bin', 'anthraspace')
      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: false,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/AnthraSpace.app/Contents/MacOS/AnthraSpace',
        appPath: fixture.appPath,
        commandPathOverride: installPath,
        processPathEnv: join(fixture.root, 'bin')
      })

      const initial = await installer.getStatus()
      expect(initial.state).toBe('not_installed')
      expect(initial.launcherPath).toContain(join('userData', 'cli', 'bin', 'anthraspace'))

      const installed = await installer.install()
      expect(installed.state).toBe('installed')
      expect(installed.pathConfigured).toBe(true)

      const launcherContent = await readFile(installed.launcherPath as string, 'utf8')
      expect(launcherContent).toContain('ELECTRON_RUN_AS_NODE=1')
      expect(launcherContent).toContain(join(fixture.appPath, 'out', 'cli', 'index.js'))

      const removed = await installer.remove()
      expect(removed.state).toBe('not_installed')
    }
  )

  // Why: this test creates Unix symlinks and shell scripts that only apply on Linux.
  it.skipIf(process.platform === 'win32')(
    'creates a linux symlink under the requested path and warns when PATH is missing',
    async () => {
      const fixture = await makeFixture()
      const installPath = join(fixture.root, '.local', 'bin', 'anthraspace')
      const installer = new CliInstaller({
        platform: 'linux',
        isPackaged: false,
        userDataPath: fixture.userDataPath,
        execPath: '/opt/AnthraSpace/anthraspace',
        appPath: fixture.appPath,
        commandPathOverride: installPath,
        processPathEnv: '/usr/bin'
      })

      const installed = await installer.install()
      expect(installed.state).toBe('installed')
      expect(installed.pathConfigured).toBe(false)
      expect(installed.detail).toContain('.local')

      const launcherContent = await readFile(installed.launcherPath as string, 'utf8')
      expect(launcherContent).toContain('ELECTRON_RUN_AS_NODE=1')

      const removed = await installer.remove()
      expect(removed.state).toBe('not_installed')
    }
  )

  it('creates a windows wrapper and updates the user PATH', async () => {
    const fixture = await makeFixture()
    const installPath = join(fixture.root, 'Programs', 'AnthraSpace', 'bin', 'anthraspace.cmd')
    let userPath = 'C:\\Windows\\System32'
    const installer = new CliInstaller({
      platform: 'win32',
      isPackaged: false,
      userDataPath: fixture.userDataPath,
      execPath: 'C:\\Users\\me\\AppData\\Local\\AnthraSpace\\AnthraSpace.exe',
      appPath: fixture.appPath,
      commandPathOverride: installPath,
      userPathReader: async () => userPath,
      userPathWriter: async (value) => {
        userPath = value
      }
    })

    const installed = await installer.install()
    expect(installed.state).toBe('installed')
    expect(installed.pathConfigured).toBe(true)
    expect(userPath).toContain(join(fixture.root, 'Programs', 'AnthraSpace', 'bin'))

    const wrapperContent = await readFile(installPath, 'utf8')
    expect(wrapperContent).toContain('ORCA_LAUNCHER=')
    expect(wrapperContent).toContain('anthraspace.cmd')

    const removed = await installer.remove()
    expect(removed.state).toBe('not_installed')
    expect(userPath).not.toContain(join(fixture.root, 'Programs', 'AnthraSpace', 'bin'))
  })

  // Why: this test creates a Unix symlink to /tmp/not-anthraspace, which only applies on macOS/Linux.
  it.skipIf(process.platform === 'win32')(
    'reports stale when a different symlink already exists',
    async () => {
      const fixture = await makeFixture()
      const installPath = join(fixture.root, 'bin', 'anthraspace')
      await mkdir(join(fixture.root, 'bin'), { recursive: true })
      await symlink('/tmp/not-anthraspace', installPath)

      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: false,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/AnthraSpace.app/Contents/MacOS/AnthraSpace',
        appPath: fixture.appPath,
        commandPathOverride: installPath
      })

      await expect(installer.getStatus()).resolves.toMatchObject({
        state: 'stale',
        supported: true
      })
    }
  )
})
