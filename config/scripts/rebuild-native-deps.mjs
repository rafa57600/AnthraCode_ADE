#!/usr/bin/env node
/**
 * Why this script exists:
 *
 * The standard `electron-builder install-app-deps` uses @electron/rebuild
 * internally but does not expose the `ignoreModules` option (as of
 * electron-builder 26.x).  On Windows dev machines that lack the full
 * Visual C++ / Python build toolchain, `cpu-features@0.0.10` (an optional
 * performance dependency of `ssh2`) fails to build with node-gyp because
 * `buildcheck.gypi` is missing from the tarball.  This causes the entire
 * postinstall step to fail and prevents `pnpm install` from completing.
 *
 * This script replaces `electron-builder install-app-deps` in the postinstall
 * lifecycle.  It calls @electron/rebuild's JS API directly so that we can pass
 * `ignoreModules: ['cpu-features']` on Windows.  Skipping cpu-features is
 * safe: ssh2 detects the missing native module and falls back to pure-JS CPU
 * feature detection automatically.
 *
 * On macOS and Linux the full rebuild (including cpu-features) runs as usual.
 */

import { rebuild } from '@electron/rebuild'
import { execFileSync, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, globSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { platform as osPlatform } from 'node:os'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const projectDir = process.cwd()
const electronVersion = JSON.parse(
  readFileSync(resolve(projectDir, 'node_modules/electron/package.json'), 'utf8')
).version

const ignoreModules = process.platform === 'win32' ? ['cpu-features'] : []

if (ignoreModules.length > 0) {
  console.log(`[rebuild] Skipping modules on Windows: ${ignoreModules.join(', ')}`)
}

// Why: @electron/rebuild's default module walker doesn't reliably find native
// modules inside pnpm's .pnpm/ store. Passing an explicit list of modules to
// rebuild via `onlyModules` ensures they're recompiled against Electron's Node
// ABI regardless of the package manager's store layout.
const NATIVE_MODULES = ['better-sqlite3', 'node-pty', 'cpu-features']
const onlyModules = NATIVE_MODULES.filter((m) => !ignoreModules.includes(m))
const forceRebuild = process.env.ORCA_FORCE_NATIVE_REBUILD === '1'

ensureElectronPackageInstalled()

if (!forceRebuild) {
  // Why: Windows cannot unlink a loaded .node DLL, so avoid @electron/rebuild
  // when the current install already works with Electron's ABI.
  const probe = probeElectronNativeModules(onlyModules)
  if (probe.ok) {
    console.log('[rebuild] Native modules already load in Electron; skipping rebuild.')
    process.exit(0)
  }
  console.log('[rebuild] Native modules do not load in Electron; rebuilding.')
  if (probe.stderr.trim()) {
    console.log(probe.stderr.trim())
  }
} else {
  console.log('[rebuild] ORCA_FORCE_NATIVE_REBUILD=1 set; forcing native rebuild.')
}

// Why: cpu-features ships without `buildcheck.gypi`; its own `install` script
// generates it by running `node buildcheck.js > buildcheck.gypi` before
// node-gyp. @electron/rebuild with `force: true` invokes node-gyp directly
// and bypasses that install hook, so if the file is missing (fresh install,
// store prune, or a prior failed run) node-gyp aborts with
// "buildcheck.gypi not found". Regenerate it here before rebuilding.
if (!ignoreModules.includes('cpu-features')) {
  const cpuFeatureDirs = globSync('node_modules/.pnpm/cpu-features@*/node_modules/cpu-features', {
    cwd: projectDir
  })
  for (const relDir of cpuFeatureDirs) {
    const dir = resolve(projectDir, relDir)
    const gypiPath = resolve(dir, 'buildcheck.gypi')
    if (existsSync(gypiPath)) {
      continue
    }
    try {
      const out = execFileSync(process.execPath, ['buildcheck.js'], {
        cwd: dir,
        encoding: 'utf8'
      })
      writeFileSync(gypiPath, out)
      console.log(`[rebuild] Generated ${relDir}/buildcheck.gypi`)
    } catch (/** @type {any} */ err) {
      console.error(`[rebuild] Failed to generate ${relDir}/buildcheck.gypi:`, err?.message ?? err)
      process.exit(1)
    }
  }
}

try {
  await rebuild({
    buildPath: projectDir,
    electronVersion,
    ignoreModules,
    onlyModules,
    // Why: without force, @electron/rebuild skips modules it considers
    // "already built" — even when they were compiled for the wrong ABI
    // (e.g., system Node instead of Electron's embedded Node). This is
    // common after pnpm install, which compiles native modules for system
    // Node before postinstall runs this script.
    force: true
  })
} catch (/** @type {any} */ err) {
  console.error('[rebuild] Native module rebuild failed:', err?.message ?? err)
  if (isWindowsNativeLockError(err)) {
    console.error(
      '[rebuild] A Windows process appears to be using a native .node file. ' +
        'Close running AnthraSpace/Electron/dev processes for this worktree, then rerun `pnpm install` ' +
        'or `pnpm run rebuild:electron`.'
    )
    if (isPostinstall() && process.env.ORCA_STRICT_NATIVE_REBUILD !== '1') {
      console.error(
        '[rebuild] Continuing postinstall because the failure is a Windows file lock. ' +
          'The next dev/start command will re-check native modules.'
      )
      process.exit(0)
    }
  }
  process.exit(1)
}

function ensureElectronPackageInstalled() {
  try {
    require('electron')
    return
  } catch (/** @type {any} */ err) {
    if (!isElectronPackageInstallError(err)) {
      throw err
    }
  }

  const electronPackageDir = resolve(projectDir, 'node_modules/electron')

  // Why: CI has observed Electron's postinstall exiting cleanly with only
  // locales/ extracted but no electron.exe (path.txt missing). If the dist/
  // directory already exists with partial content, electron/install.js may
  // consider the download complete and skip re-extraction. Remove it so
  // the install script always starts from a clean slate.
  removePartialElectronDist(electronPackageDir)

  // Why: Electron binary download from GitHub release assets occasionally
  // fails transiently on CI runners (504s, partial extraction). Retry
  // internally with a delay so we don't rely solely on the outer
  // nick-fields/retry wrapper (which wraps both this script and
  // electron-builder, wasting time on retries that can't make progress).
  const MAX_INSTALL_ATTEMPTS = 3
  const RETRY_DELAY_MS = 10_000
  let lastInstallErr

  for (let attempt = 1; attempt <= MAX_INSTALL_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      // Clean any partial leftovers from the prior failed attempt.
      removePartialElectronDist(electronPackageDir)
      console.log(`[rebuild] Electron install attempt ${attempt} of ${MAX_INSTALL_ATTEMPTS} (waiting ${RETRY_DELAY_MS}ms)...`)
      sleepSync(RETRY_DELAY_MS)
    } else {
      console.log('[rebuild] Electron package binary is missing; rerunning Electron install.')
    }

    // Why: @electron/get caches downloaded ZIPs in the directory
    // specified by `electron_config_cache` env var (lowercase; used by
    // electron/install.js line 46). The actions/cache@v4 step restores
    // C:\Users\runneradmin\AppData\Local\electron\Cache between runs,
    // which may contain a corrupted/partial ZIP from a prior failed
    // download. Even when we clean node_modules/electron/dist/,
    // install.js re-extracts the cached partial ZIP and gets only
    // locales/. Using a fresh temp dir per attempt and setting
    // force_no_cache=true bypasses all stale caches.
    const freshCacheDir = mkdtempSync(
      resolve(require('node:os').tmpdir(), 'electron-cache-retry-')
    )
    try {
      execFileSync(process.execPath, [require.resolve('electron/install.js')], {
        cwd: projectDir,
        env: {
          ...process.env,
          ELECTRON_SKIP_BINARY_DOWNLOAD: '',
          electron_config_cache: freshCacheDir,
          force_no_cache: 'true'
        },
        stdio: 'inherit'
      })
    } catch (/** @type {any} */ err) {
      lastInstallErr = err
      console.warn(`[rebuild] Electron install attempt ${attempt} failed: ${err?.message ?? err}`)
      logElectronInstallDiagnostics()
      continue
    }

    // Check if the install actually succeeded.
    try {
      require('electron')
      console.log('[rebuild] Electron install succeeded.')
      return // success
    } catch (/** @type {any} */ checkErr) {
      lastInstallErr = checkErr
      console.warn(`[rebuild] Electron install attempt ${attempt} ran but binary is still missing.`)
      logElectronInstallDiagnostics()
      // Try repairing path.txt in case the binary exists but path.txt is missing.
      if (repairElectronPathFile()) {
        try {
          require('electron')
          console.log('[rebuild] Electron binary found after repairing path.txt.')
          return // success after repair
        } catch (/** @type {any} */ repairCheckErr) {
          lastInstallErr = repairCheckErr
        }
      }
      continue
    }
  }

  // All attempts exhausted.
  console.error(
    '[rebuild] Electron package is still unavailable after',
    MAX_INSTALL_ATTEMPTS,
    'install attempts:',
    lastInstallErr?.message ?? lastInstallErr
  )
  logElectronInstallDiagnostics()
  if (continuePostinstallWithoutElectron()) {
    process.exit(0)
  }
  process.exit(1)
}

function removePartialElectronDist(electronPackageDir) {
  const distDir = resolve(electronPackageDir, 'dist')
  try {
    if (existsSync(distDir)) {
      // Why: fs.rmSync with recursive handles both files and directories.
      rmSync(distDir, { recursive: true, force: true })
      console.log('[rebuild] Removed partial electron dist directory for clean retry.')
    }
  } catch (/** @type {any} */ err) {
    console.warn('[rebuild] Could not remove partial electron dist:', err?.message ?? err)
  }
}

function sleepSync(ms) {
  // Why: keep it synchronous so the retry loop doesn't need async/await.
  // Electron install is I/O-bound, not CPU-bound, so a busy-wait is fine
  // for a build-time retry delay.
  const start = Date.now()
  while (Date.now() - start < ms) {
    // busy-wait
  }
}

function continuePostinstallWithoutElectron() {
  if (!isPostinstall() || process.env.ORCA_STRICT_ELECTRON_INSTALL === '1') {
    return false
  }
  console.error(
    '[rebuild] Continuing postinstall because Electron binary installation failed. ' +
      'Electron-consuming package scripts and release jobs run ' +
      'config/scripts/ensure-native-runtime.mjs --runtime=electron before launching Electron.'
  )
  return true
}

function repairElectronPathFile() {
  const electronPackageDir = resolve(projectDir, 'node_modules/electron')
  const platformPath = getElectronPlatformPath()
  const electronPath = process.env.ELECTRON_OVERRIDE_DIST_PATH
    ? resolve(process.env.ELECTRON_OVERRIDE_DIST_PATH, platformPath)
    : resolve(electronPackageDir, 'dist', platformPath)
  if (!existsSync(electronPath)) {
    return false
  }

  // Why: Electron's install script has exited successfully in CI after
  // extraction without leaving path.txt. The package main only needs this file
  // to point at the already-extracted executable.
  writeFileSync(resolve(electronPackageDir, 'path.txt'), platformPath)
  console.log(`[rebuild] Repaired Electron path.txt -> ${platformPath}`)
  return true
}

function logElectronInstallDiagnostics() {
  const electronPackageDir = resolve(projectDir, 'node_modules/electron')
  const electronDistDir = resolve(electronPackageDir, 'dist')
  const pathFile = resolve(electronPackageDir, 'path.txt')
  console.error('[rebuild] Electron install diagnostics:')
  console.error(`  packageDir=${electronPackageDir} exists=${existsSync(electronPackageDir)}`)
  console.error(`  distDir=${electronDistDir} exists=${existsSync(electronDistDir)}`)
  console.error(`  pathFile=${pathFile} exists=${existsSync(pathFile)}`)
  if (existsSync(electronDistDir)) {
    console.error(`  distEntries=${safeReaddir(electronDistDir).join(', ')}`)
  }
}

function safeReaddir(targetPath) {
  try {
    return readdirSync(targetPath).slice(0, 20)
  } catch {
    return []
  }
}

function getElectronPlatformPath() {
  const targetPlatform = process.env.npm_config_platform || osPlatform()
  switch (targetPlatform) {
    case 'mas':
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron'
    case 'freebsd':
    case 'openbsd':
    case 'linux':
      return 'electron'
    case 'win32':
      return 'electron.exe'
    default:
      throw new Error(`Electron builds are not available on platform: ${targetPlatform}`)
  }
}

function probeElectronNativeModules(moduleNames) {
  let electronExecutable
  try {
    electronExecutable = require('electron')
  } catch (error) {
    return { ok: false, status: null, stderr: formatError(error) }
  }

  const probeSource = `
const { createRequire } = require('node:module')
const { release } = require('node:os')
const { resolve } = require('node:path')
const projectRequire = createRequire(resolve(process.cwd(), 'package.json'))
const moduleNames = ${JSON.stringify(moduleNames)}
const failures = []

for (const moduleName of moduleNames) {
  try {
    loadNativeModule(moduleName)
  } catch (error) {
    failures.push(moduleName + ': ' + formatError(error))
  }
}

if (failures.length > 0) {
  console.error(failures.join('\\n'))
  process.exit(1)
}

function loadNativeModule(moduleName) {
  if (moduleName === 'better-sqlite3') {
    const Database = projectRequire(moduleName)
    const db = new Database(':memory:')
    db.close()
    return
  }
  if (moduleName === 'node-pty') {
    projectRequire('node-pty')
    const { loadNativeModule } = projectRequire('node-pty/lib/utils')
    loadNativeModule(getNodePtyNativeModuleName())
    return
  }
  projectRequire(moduleName)
}

function getNodePtyNativeModuleName() {
  if (process.platform !== 'win32') {
    return 'pty'
  }
  const match = /(\\d+)\\.(\\d+)\\.(\\d+)/g.exec(release())
  const buildNumber = match && match.length === 4 ? Number.parseInt(match[3], 10) : 0
  return buildNumber >= 18309 ? 'conpty' : 'pty'
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error)
}
`

  const result = spawnSync(electronExecutable, ['-e', probeSource], {
    cwd: projectDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1'
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })

  return {
    ok: result.status === 0,
    status: result.status,
    stderr: [result.stderr, result.stdout, result.error ? formatError(result.error) : '']
      .filter(Boolean)
      .join('\n')
  }
}

function isWindowsNativeLockError(error) {
  if (process.platform !== 'win32') {
    return false
  }
  const text = [error?.message, error?.stack, error?.stdout, error?.stderr]
    .filter(Boolean)
    .join('\n')
  return /(?:EPERM|operation not permitted)[\s\S]*(?:unlink|\.node|conpty\.node|pty\.node)/i.test(
    text
  )
}

function isPostinstall() {
  return process.env.npm_lifecycle_event === 'postinstall'
}

function isElectronPackageInstallError(error) {
  return /Electron failed to install correctly/i.test(formatError(error))
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error)
}
