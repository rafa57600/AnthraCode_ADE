import { ipcMain } from 'electron'
import { mkdir, readdir, readFile, rename as fsRename, rm, writeFile } from 'fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'path'
import { existsSync } from 'fs'
import type { MarkdownDocument } from '../../shared/types'

/**
 * The subdirectory within a project where sticky documents are stored.
 */
const STICKY_DIR = '.anthraspace/sticky'

/**
 * Resolve an absolute path within the sticky directory for a given project.
 * Performs path-traversal safety checks — returns null if the resolved path
 * escapes the sticky directory.
 */
function safeStickyPath(projectDir: string, filePath: string): string | null {
  const stickyRoot = resolve(projectDir, STICKY_DIR)
  const resolved = resolve(stickyRoot, filePath)
  const relativePath = relative(stickyRoot, resolved)
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return null
  }
  return resolved
}

function normalizeRelativePath(pathValue: string): string {
  return pathValue.replace(/[\\/]+/g, '/')
}

/**
 * Check if a filename has a markdown extension.
 */
function isMarkdownFile(name: string): boolean {
  const ext = extname(name).toLowerCase()
  return ext === '.md' || ext === '.mdx' || ext === '.markdown'
}

/**
 * Ensure the sticky directory for a project exists.
 */
async function ensureStickyDir(projectDir: string): Promise<string> {
  const stickyRoot = resolve(projectDir, STICKY_DIR)
  if (!existsSync(stickyRoot)) {
    await mkdir(stickyRoot, { recursive: true })
  }
  return stickyRoot
}

/**
 * Build a MarkdownDocument from a file path within the sticky directory.
 */
function toMarkdownDocument(projectDir: string, absPath: string): MarkdownDocument {
  const stickyRoot = resolve(projectDir, STICKY_DIR)
  const relPath = normalizeRelativePath(relative(stickyRoot, absPath))
  const name = basename(absPath)
  const ext = extname(name)
  return {
    filePath: absPath,
    relativePath: relPath,
    basename: name,
    name: ext ? name.slice(0, -ext.length) : name
  }
}

export function registerStickyHandlers(): void {
  /**
   * List all sticky markdown documents in the project's sticky directory.
   * Returns empty array if the directory doesn't exist yet.
   */
  ipcMain.handle('sticky:list', async (_event, projectDir: string): Promise<MarkdownDocument[]> => {
    if (!projectDir || !isAbsolute(projectDir)) {
      return []
    }

    const stickyRoot = resolve(projectDir, STICKY_DIR)
    if (!existsSync(stickyRoot)) {
      return []
    }

    const docs: MarkdownDocument[] = []

    async function visitDirectory(dirPath: string): Promise<void> {
      const entries = await readdir(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isSymbolicLink()) {
          continue
        }

        const entryPath = join(dirPath, entry.name)
        if (entry.isDirectory()) {
          await visitDirectory(entryPath)
          continue
        }

        if (entry.isFile() && isMarkdownFile(entry.name)) {
          docs.push(toMarkdownDocument(projectDir, entryPath))
        }
      }
    }

    await visitDirectory(stickyRoot)

    return docs.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  })

  /**
   * Read the content of a sticky document.
   * Returns null if the file doesn't exist or path escapes the sticky directory.
   */
  ipcMain.handle(
    'sticky:read',
    async (_event, projectDir: string, fileName: string): Promise<{ content: string } | null> => {
      if (!projectDir || !isAbsolute(projectDir) || !fileName) {
        return null
      }

      const absPath = safeStickyPath(projectDir, fileName)
      if (!absPath) {
        return null
      }

      try {
        const content = await readFile(absPath, 'utf-8')
        return { content }
      } catch {
        return null
      }
    }
  )

  /**
   * Write (create or update) a sticky document.
   */
  ipcMain.handle(
    'sticky:write',
    async (
      _event,
      projectDir: string,
      fileName: string,
      content: string
    ): Promise<MarkdownDocument | null> => {
      if (!projectDir || !isAbsolute(projectDir) || !fileName) {
        return null
      }

      const stickyRoot = await ensureStickyDir(projectDir)
      const absPath = safeStickyPath(projectDir, fileName)
      if (!absPath) {
        return null
      }

      // Ensure the file has a .md extension
      const finalPath = isMarkdownFile(absPath) ? absPath : `${absPath}.md`
      const safeFinal = safeStickyPath(projectDir, relative(stickyRoot, finalPath))
      if (!safeFinal) {
        return null
      }

      await mkdir(dirname(safeFinal), { recursive: true })
      await writeFile(safeFinal, content, 'utf-8')
      return toMarkdownDocument(projectDir, safeFinal)
    }
  )

  /**
   * Rename a sticky document.
   * Returns the updated MarkdownDocument, or null on failure.
   */
  ipcMain.handle(
    'sticky:rename',
    async (
      _event,
      projectDir: string,
      oldFileName: string,
      newFileName: string
    ): Promise<MarkdownDocument | null> => {
      if (!projectDir || !isAbsolute(projectDir) || !oldFileName || !newFileName) {
        return null
      }

      const oldPath = safeStickyPath(projectDir, oldFileName)
      const newPath = safeStickyPath(projectDir, newFileName)
      if (!oldPath || !newPath) {
        return null
      }

      try {
        await fsRename(oldPath, newPath)
        return toMarkdownDocument(projectDir, newPath)
      } catch {
        return null
      }
    }
  )

  /**
   * Delete a sticky document.
   */
  ipcMain.handle(
    'sticky:delete',
    async (_event, projectDir: string, fileName: string): Promise<boolean> => {
      if (!projectDir || !isAbsolute(projectDir) || !fileName) {
        return false
      }

      const absPath = safeStickyPath(projectDir, fileName)
      if (!absPath) {
        return false
      }

      try {
        await rm(absPath, { force: true })
        return true
      } catch {
        return false
      }
    }
  )
}
