import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ExternalLink,
  FolderPlus,
  GitBranchPlus,
  MonitorUp,
  PlugZap,
  Star,
  TerminalSquare
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useAppStore } from '../store'
import { isGitRepoKind } from '../../../shared/repo-kind'
import { ShortcutKeyCombo } from './ShortcutKeyCombo'
import { useShortcutKeys } from '@/hooks/useShortcutLabel'
import logo from '../../../../resources/anthracode_logo.svg'

type ShortcutItem = {
  id: string
  keys: string[]
  action: string
}

type PreflightIssue = {
  id: string
  title: string
  description: string
  fixLabel: string
  fixUrl: string
}

function getPreflightIssues(status: {
  git: { installed: boolean }
  gh: { installed: boolean; authenticated: boolean }
}): PreflightIssue[] {
  const issues: PreflightIssue[] = []

  if (!status.git.installed) {
    issues.push({
      id: 'git',
      title: 'Git is not installed',
      description: 'Git is required for Git projects, source control, and workspace management.',
      fixLabel: 'Install Git',
      fixUrl: 'https://git-scm.com/downloads'
    })
  }

  if (!status.gh.installed) {
    issues.push({
      id: 'gh',
      title: 'GitHub CLI is not installed',
      description:
        'AnthraSpace uses the GitHub CLI (gh) to show pull requests, issues, and checks.',
      fixLabel: 'Install GitHub CLI',
      fixUrl: 'https://cli.github.com'
    })
  } else if (!status.gh.authenticated) {
    issues.push({
      id: 'gh-auth',
      title: 'GitHub CLI is not authenticated',
      description: 'Run "gh auth login" in a terminal to connect your GitHub account.',
      fixLabel: 'Learn more',
      fixUrl: 'https://cli.github.com/manual/gh_auth_login'
    })
  }

  return issues
}

type StarState = 'loading' | 'starred' | 'not-starred' | 'hidden'

function GitHubStarButton({ hasRepos }: { hasRepos: boolean }): React.JSX.Element | null {
  const [state, setState] = useState<StarState>('loading')
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.gh.checkOrcaStarred().then((result) => {
      if (cancelled) {
        return
      }
      if (result === null) {
        setState('hidden')
      } else {
        setState(result ? 'starred' : 'not-starred')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const onDocClick = (e: MouseEvent): void => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen])

  const handleClick = async (): Promise<void> => {
    if (state === 'starred') {
      setMenuOpen((v) => !v)
      return
    }
    if (state !== 'not-starred') {
      return
    }
    setState('starred') // optimistic
    const ok = await window.api.gh.starOrca()
    if (!ok) {
      setState('not-starred')
      return
    }
    // Why: starring from any entry point mutes the threshold-based nag.
    // Without this the background notification could still fire on the next
    // threshold crossing, which would feel like a bug to the user.
    await window.api.starNag.complete()
  }

  // Hide if gh CLI is unavailable, or if the user has already starred and added a repo
  if (state === 'hidden' || (state === 'starred' && hasRepos)) {
    return null
  }

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        className={cn(
          'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[13px] font-medium transition-all duration-300',
          state === 'loading' && 'pointer-events-none opacity-0',
          state === 'not-starred' &&
            'cursor-pointer border-amber-500/60 text-amber-700 hover:border-amber-500/80 hover:bg-amber-400/10 dark:border-amber-400/30 dark:text-amber-300/90 dark:hover:border-amber-400/50 dark:hover:bg-amber-400/[0.08]',
          state === 'starred' &&
            'cursor-pointer border-amber-500/50 bg-amber-400/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/[0.06] dark:text-amber-400/60'
        )}
        onClick={handleClick}
        disabled={state === 'loading'}
      >
        <Star
          className={cn(
            'size-3.5 transition-all duration-300',
            state === 'starred'
              ? 'fill-amber-500/70 text-amber-500/70 dark:fill-amber-400/60 dark:text-amber-400/60'
              : 'text-amber-600 dark:text-amber-400/80'
          )}
        />
        {state === 'starred' ? 'Starred on GitHub' : 'Star on GitHub'}
      </button>
      {state === 'starred' && menuOpen && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-10 min-w-[100px] rounded-md border border-border bg-popover py-1 shadow-md">
          <button
            className="w-full px-3 py-1.5 text-left text-[13px] text-foreground hover:bg-muted"
            onClick={() => {
              setMenuOpen(false)
              setState('hidden')
            }}
          >
            Hide
          </button>
        </div>
      )}
    </div>
  )
}

function PreflightBanner({ issues }: { issues: PreflightIssue[] }): React.JSX.Element {
  return (
    <div className="w-full rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-yellow-500">
        <AlertTriangle className="size-4 shrink-0" />
        <span className="text-sm font-medium">Missing dependencies</span>
      </div>
      <div className="space-y-2.5">
        {issues.map((issue) => (
          <div key={issue.id} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{issue.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{issue.description}</p>
            </div>
            <button
              className="inline-flex items-center gap-1 shrink-0 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
              onClick={() => window.api.shell.openUrl(issue.fixUrl)}
            >
              {issue.fixLabel}
              <ExternalLink className="size-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Landing(): React.JSX.Element {
  const repos = useAppStore((s) => s.repos)
  const openModal = useAppStore((s) => s.openModal)

  const canCreateWorktree = repos.length > 0
  const createTargetLabel =
    canCreateWorktree && repos.every((repo) => isGitRepoKind(repo)) ? 'Worktree' : 'Workspace'

  const [preflightIssues, setPreflightIssues] = useState<PreflightIssue[]>([])

  useEffect(() => {
    let cancelled = false
    const refreshPreflight = (force = false): void => {
      void window.api.preflight.check(force ? { force: true } : undefined).then((status) => {
        if (cancelled) {
          return
        }
        setPreflightIssues(getPreflightIssues(status))
      })
    }

    refreshPreflight()

    // Why: users often install/authenticate gh outside AnthraSpace. Re-check when the
    // window becomes active again so the landing warning clears without relaunch.
    const handleWindowActive = (): void => {
      if (document.visibilityState === 'visible') {
        refreshPreflight(true)
      }
    }

    document.addEventListener('visibilitychange', handleWindowActive)
    window.addEventListener('focus', handleWindowActive)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleWindowActive)
      window.removeEventListener('focus', handleWindowActive)
    }
  }, [])

  useEffect(() => {
    if (preflightIssues.length === 0) {
      return
    }

    // Why: some users complete `gh auth login` without ever leaving the AnthraSpace
    // window. Poll only while a warning is visible so the banner self-clears.
    const intervalId = window.setInterval(() => {
      void window.api.preflight.check({ force: true }).then((status) => {
        setPreflightIssues(getPreflightIssues(status))
      })
    }, 30000)

    return () => window.clearInterval(intervalId)
  }, [preflightIssues.length])

  const createWorktreeKeys = useShortcutKeys('workspace.create')
  const previousWorktreeKeys = useShortcutKeys('worktree.navigateUp')
  const nextWorktreeKeys = useShortcutKeys('worktree.navigateDown')
  const shortcuts = useMemo<ShortcutItem[]>(() => {
    return [
      {
        id: 'create',
        keys: createWorktreeKeys,
        action: `Create ${createTargetLabel.toLowerCase()}`
      },
      { id: 'up', keys: previousWorktreeKeys, action: 'Move up workspace' },
      { id: 'down', keys: nextWorktreeKeys, action: 'Move down workspace' }
    ]
  }, [createTargetLabel, createWorktreeKeys, nextWorktreeKeys, previousWorktreeKeys])

  return (
    <div className="absolute inset-0 overflow-hidden bg-background">
      <div className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-foreground/[0.06] to-transparent" />
      <div className="relative flex min-h-full items-center justify-center px-6 py-10">
        <div className="grid w-full max-w-5xl gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="flex min-w-0 flex-col justify-center gap-6 rounded-2xl border border-border/80 bg-card/70 p-7 shadow-lg shadow-black/20 backdrop-blur">
            <div className="flex items-center gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/80 bg-muted/45 shadow-sm">
                <img src={logo} alt="AnthraSpace logo" className="size-10" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  AnthraSpace
                </p>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                  Start an agent workspace
                </h1>
              </div>
            </div>

            {preflightIssues.length > 0 && <PreflightBanner issues={preflightIssues} />}

            <p className="max-w-xl text-sm leading-6 text-muted-foreground">
              {canCreateWorktree
                ? 'Create or select a workspace, pick an agent provider, and keep the session inside AnthraSpace.'
                : 'Add a project first, then AnthraSpace can create isolated workspaces for your agent sessions.'}
            </p>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border/80 bg-secondary/70 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                onClick={() => openModal('add-repo')}
              >
                <FolderPlus className="size-3.5" />
                Add Project
              </button>

              <button
                className="inline-flex items-center gap-2 rounded-md border border-primary/50 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 enabled:cursor-pointer enabled:hover:bg-primary/90"
                disabled={!canCreateWorktree}
                title={!canCreateWorktree ? 'Add a project first' : undefined}
                onClick={() => openModal('new-workspace-composer', { telemetrySource: 'unknown' })}
              >
                <GitBranchPlus className="size-3.5" />
                Create {createTargetLabel}
              </button>
            </div>

            <div className="grid gap-2 rounded-xl border border-border/70 bg-muted/25 p-3 text-xs text-muted-foreground sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                Isolated worktrees
              </div>
              <div className="flex items-center gap-2">
                <Bot className="size-3.5 text-foreground/80" />
                Provider picker
              </div>
              <div className="flex items-center gap-2">
                <MonitorUp className="size-3.5 text-foreground/80" />
                Native desktop shell
              </div>
            </div>
          </section>

          <aside className="rounded-2xl border border-border/80 bg-card/60 p-5 shadow-lg shadow-black/15 backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Agent runtime
                </p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">Connect providers</h2>
              </div>
              <PlugZap className="size-5 text-muted-foreground" />
            </div>

            <div className="space-y-3">
              {[
                ['AnthraSpace', 'First-class local provider through the AnthraCode CLI.'],
                ['Claude / Codex / Gemini', 'Detected from installed command-line agents.'],
                ['OpenCode and more', 'Launches inside managed PTYs with status hooks.']
              ].map(([title, description]) => (
                <div
                  key={title}
                  className="rounded-xl border border-border/70 bg-background/45 p-3 transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-md border border-border/70 bg-muted/45 p-1.5">
                      <TerminalSquare className="size-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Why: provider execution is still PTY-backed; do not imply a direct
                SDK path until the provider architecture audit proves parity. */}
            <p className="mt-4 rounded-lg border border-border/60 bg-muted/25 px-3 py-2 text-xs leading-5 text-muted-foreground">
              Current production path: CLI agents run in managed terminals. A direct SDK/API path
              should be added only after it can preserve streaming, auth, tools, and session state.
            </p>
          </aside>

          <div className="lg:col-span-2 mx-auto w-full max-w-sm space-y-2">
            {shortcuts.map((shortcut) => (
              <div key={shortcut.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
                <span className="text-sm text-muted-foreground">{shortcut.action}</span>
                <ShortcutKeyCombo
                  keys={shortcut.keys}
                  separatorClassName="mx-0.5 text-[10px] text-muted-foreground"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 left-0 right-0 flex justify-center">
        <GitHubStarButton hasRepos={repos.length > 0} />
      </div>
    </div>
  )
}
