import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const LOCK_DIR = path.join(os.tmpdir(), 'orca-e2e-electron-launch.lock')
const OWNER_FILE = path.join(LOCK_DIR, 'owner')
const STALE_LOCK_MS = 180_000

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms)
    timeout.unref?.()
  })
}

function removeStaleLock(): void {
  try {
    if (!existsSync(LOCK_DIR)) {
      return
    }
    const ageMs = Date.now() - statSync(LOCK_DIR).mtimeMs
    if (ageMs > STALE_LOCK_MS) {
      rmSync(LOCK_DIR, { recursive: true, force: true })
    }
  } catch {
    // Another worker may be acquiring or releasing the lock at the same time.
  }
}

async function acquireElectronLaunchLock(): Promise<() => void> {
  const owner = `${process.pid}:${randomUUID()}`

  while (true) {
    try {
      mkdirSync(LOCK_DIR)
      writeFileSync(OWNER_FILE, owner)
      return () => {
        try {
          if (readFileSync(OWNER_FILE, 'utf8') === owner) {
            rmSync(LOCK_DIR, { recursive: true, force: true })
          }
        } catch {
          // Lock already released or taken over after a stale-lock cleanup.
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
      removeStaleLock()
      await delay(250)
    }
  }
}

export async function withElectronLaunchLock<T>(operation: () => Promise<T>): Promise<T> {
  const release = await acquireElectronLaunchLock()
  try {
    return await operation()
  } finally {
    release()
  }
}
