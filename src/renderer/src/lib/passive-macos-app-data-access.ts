import type { OpenFile, RightSidebarTab } from '@/store/slices/editor'

const MAC_APP_DATA_SEGMENT_RE = /(^|\/)Library\/(Containers|Group Containers)\//

function getUserAgent(userAgent?: string): string {
  if (userAgent !== undefined) {
    return userAgent
  }
  return typeof navigator === 'undefined' ? '' : navigator.userAgent
}

export function isMacAppDataPath(path: string | null | undefined, userAgent?: string): boolean {
  if (!path || !getUserAgent(userAgent).includes('Mac')) {
    return false
  }
  return MAC_APP_DATA_SEGMENT_RE.test(path.replace(/\\/g, '/'))
}

export function shouldPollActiveGitStatus(args: {
  activeWorktreeId: string | null
  worktreePath: string | null
  rightSidebarOpen: boolean
  rightSidebarTab: RightSidebarTab
  openFiles: OpenFile[]
  userAgent?: string
}): boolean {
  if (!args.activeWorktreeId || !args.worktreePath) {
    return false
  }
  if (
    args.rightSidebarOpen &&
    (args.rightSidebarTab === 'source-control' ||
      args.rightSidebarTab === 'explorer' ||
      args.rightSidebarTab === 'checks')
  ) {
    return true
  }
  if (args.openFiles.some((file) => file.worktreeId === args.activeWorktreeId)) {
    return true
  }
  // Why: macOS app-container paths can trigger the "data from other apps"
  // prompt. Keep terminal-only workspace switching from passively probing them.
  return !isMacAppDataPath(args.worktreePath, args.userAgent)
}

export function shouldAutoCreateInitialTerminalForWorktreePath(
  worktreePath: string | null | undefined,
  userAgent?: string
): boolean {
  // Why: auto-created terminals spawn a shell with cwd at the worktree root.
  // For macOS app data folders that hidden cwd probe is enough to raise TCC.
  return !isMacAppDataPath(worktreePath, userAgent)
}
