import { execFileSync } from 'child_process'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { mkdtemp } from 'fs/promises'
import os from 'os'
import path from 'path'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import type { ElectronApplication } from '@stablyai/playwright-test'

const tempRoots: string[] = []

async function createNestedRepoFixture(): Promise<{
  parentPath: string
  repoPaths: string[]
  groupName: string
}> {
  const parentPath = await mkdtemp(path.join(os.tmpdir(), 'orca-e2e-folder-setup-'))
  tempRoots.push(parentPath)
  const repoNames = ['api-service', 'web-client']
  const repoPaths = repoNames.map((name) => path.join(parentPath, name))

  for (const repoPath of repoPaths) {
    mkdirSync(repoPath, { recursive: true })
    execFileSync('git', ['init'], { cwd: repoPath, stdio: 'pipe' })
    execFileSync('git', ['config', 'user.email', 'e2e@test.local'], {
      cwd: repoPath,
      stdio: 'pipe'
    })
    execFileSync('git', ['config', 'user.name', 'E2E Test'], { cwd: repoPath, stdio: 'pipe' })
    writeFileSync(path.join(repoPath, 'README.md'), `# ${path.basename(repoPath)}\n`)
    execFileSync('git', ['add', 'README.md'], { cwd: repoPath, stdio: 'pipe' })
    execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: repoPath, stdio: 'pipe' })
  }

  return {
    parentPath,
    repoPaths,
    groupName: path.basename(parentPath)
  }
}

test.afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

async function chooseFolderInNativeDialog(
  electronApp: ElectronApplication,
  folderPath: string
): Promise<void> {
  await electronApp.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [selectedPath],
      bookmarks: []
    })
  }, folderPath)
}

test.describe('Folder setup', () => {
  test('imports nested repositories from the add-project dialog as a repo group', async ({
    electronApp,
    orcaPage
  }) => {
    await waitForSessionReady(orcaPage)
    const fixture = await createNestedRepoFixture()
    await chooseFolderInNativeDialog(electronApp, fixture.parentPath)

    await orcaPage
      .getByRole('button', { name: /Add Project/i })
      .first()
      .click()
    const dialog = orcaPage.getByRole('dialog', { name: /Add a project/i })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /Browse folder/i }).click()

    const importDialog = orcaPage.getByRole('dialog', { name: /Import repositories/i })
    await expect(importDialog.getByRole('heading', { name: /Import repositories/i })).toBeVisible()
    await expect(importDialog.getByText('api-service', { exact: true })).toBeVisible()
    await expect(importDialog.getByText('web-client', { exact: true })).toBeVisible()
    await expect(importDialog.getByRole('button', { name: /Group selected/i })).toBeEnabled()
    await importDialog.getByRole('button', { name: /Group selected/i }).click()

    await expect
      .poll(
        () =>
          orcaPage.evaluate((args) => {
            const state = window.__store?.getState()
            if (!state) {
              return null
            }
            const importedRepos = state.repos
              .filter((repo) => args.repoPaths.includes(repo.path))
              .sort((left, right) => left.displayName.localeCompare(right.displayName))
            const group = state.repoGroups.find((entry) => entry.parentPath === args.parentPath)
            return {
              groupName: group?.name ?? null,
              repoNames: importedRepos.map((repo) => repo.displayName),
              reposInCreatedGroup:
                group !== undefined && importedRepos.every((repo) => repo.repoGroupId === group.id),
              repoGroupOrders: importedRepos.map((repo) => repo.repoGroupOrder ?? null)
            }
          }, fixture),
        {
          timeout: 20_000,
          message: 'nested repos were not imported into a repo group'
        }
      )
      .toEqual({
        groupName: fixture.groupName,
        repoNames: ['api-service', 'web-client'],
        reposInCreatedGroup: true,
        repoGroupOrders: [0, 1]
      })

    await orcaPage.evaluate(() => {
      const state = window.__store?.getState()
      state?.closeModal()
      state?.setGroupBy('repo')
    })
    await expect(orcaPage.getByText(fixture.groupName)).toBeVisible()
  })
})
