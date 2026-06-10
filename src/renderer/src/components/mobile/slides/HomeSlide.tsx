import { ClaudeIcon, OpenAIIcon } from '../../status-bar/icons'
import { cn } from '../../../lib/utils'

export function HomeSlide({ tapping }: { tapping: boolean }): React.JSX.Element {
  return (
    <div className="mp-device-screen">
      <div className="mp-app-topbar">
        <div className="mp-app-brand">
          <AnthraSpaceLogo />
          <span className="mp-app-brand-name">AnthraSpace</span>
        </div>
        <button type="button" className="mp-icon-button" aria-label="Settings">
          <SettingsIcon />
        </button>
      </div>

      <div className="mp-scroll-region">
        <div className="mp-greeting">
          <div className="mp-greeting-title">Welcome back</div>
        </div>

        <div className="mp-stat-row">
          <Stat value="1,284" label="Agents spawned" />
          <Stat value="142h" label="Agent time" />
          <Stat value="96" label="PRs created" />
        </div>

        <div className="mp-section-label">Desktops</div>
        <div className={cn('mp-host-card', tapping && 'is-tapping')}>
          <div className="mp-host-icon">
            <DesktopIcon />
          </div>
          <div className="mp-host-main">
            <div className="mp-host-name">MacBook Pro</div>
            <div className="mp-host-meta">
              <span className="mp-status-dot is-green" />
              <span>Connected · 40 worktrees · 5 active</span>
            </div>
          </div>
          <div className="mp-chevron-right">
            <ChevronIcon />
          </div>
        </div>
        <div className="mp-host-card">
          <div className="mp-host-icon is-dim">
            <DesktopIcon />
          </div>
          <div className="mp-host-main">
            <div className="mp-host-name is-dim">M1 Mini · home</div>
            <div className="mp-host-meta">
              <span className="mp-status-dot is-muted" />
              <span>Disconnected</span>
            </div>
          </div>
          <div className="mp-chevron-right">
            <ChevronIcon />
          </div>
        </div>

        <div className="mp-section-label" style={{ marginTop: 14 }}>
          Resume
        </div>
        <div className="mp-resume-card">
          <div className="mp-resume-icon">
            <ResumeIcon />
          </div>
          <div className="mp-host-main">
            <div className="mp-resume-title">feat/mobile-page</div>
            <div className="mp-resume-sub">
              <span className="mp-repo-dot" style={{ background: '#3b82f6' }} />
              <span>anthraspace&nbsp;&nbsp;·&nbsp;&nbsp;feat/mobile-page</span>
            </div>
          </div>
          <div className="mp-chevron-right">
            <ChevronIcon />
          </div>
        </div>

        <div className="mp-section-label" style={{ marginTop: 10 }}>
          Tasks
        </div>
        <div className="mp-task-home-card">
          <div className="mp-task-home-icon">
            <ListTodoIcon />
          </div>
          <div className="mp-host-main">
            <div className="mp-task-home-title">Tasks</div>
            <div className="mp-task-home-subtitle">GitHub · Linear</div>
          </div>
          <div className="mp-task-home-providers" aria-label="GitHub and Linear">
            <div className="mp-task-home-provider-button">
              <GithubIcon />
            </div>
            <div className="mp-task-home-provider-button">
              <LinearIcon />
            </div>
          </div>
          <div className="mp-chevron-right">
            <ChevronIcon />
          </div>
        </div>

        <div className="mp-section-label" style={{ marginTop: 14 }}>
          Quick Actions
        </div>
        <div className="mp-quick-actions">
          <div className="mp-quick-action">
            <div className="mp-quick-action-icon">
              <QrSmallIcon />
            </div>
            <div className="mp-quick-action-label">Pair Desktop</div>
          </div>
          <div className="mp-quick-action">
            <div className="mp-quick-action-icon">
              <PlusIcon />
            </div>
            <div className="mp-quick-action-label">New Workspace</div>
          </div>
        </div>

        <div className="mp-section-label" style={{ marginTop: 14 }}>
          Account usage
        </div>
        <div className="mp-accounts-card">
          <AccountRow
            icon={<ClaudeIcon size={18} />}
            email="claude@stably.ai"
            sessionPct={42}
            weekPct={18}
          />
          <AccountRow
            icon={<OpenAIIcon size={18} />}
            email="codex@stably.ai"
            sessionPct={67}
            weekPct={31}
          />
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }): React.JSX.Element {
  return (
    <div className="mp-stat-card">
      <div className="mp-stat-value">{value}</div>
      <div className="mp-stat-label">{label}</div>
    </div>
  )
}

function AccountRow({
  icon,
  email,
  sessionPct,
  weekPct
}: {
  icon: React.ReactNode
  email: string
  sessionPct: number
  weekPct: number
}): React.JSX.Element {
  return (
    <div className="mp-accounts-row">
      <div className="mp-accounts-icon">{icon}</div>
      <div className="mp-accounts-info">
        <div className="mp-accounts-email">{email}</div>
        <div className="mp-accounts-bars">
          <UsageBar label="5h" pct={sessionPct} />
          <UsageBar label="7d" pct={weekPct} />
        </div>
      </div>
    </div>
  )
}

function UsageBar({ label, pct }: { label: string; pct: number }): React.JSX.Element {
  return (
    <div className="mp-usage-bar">
      <div className="mp-usage-bar-label">{label}</div>
      <div className="mp-usage-bar-track">
        <div className="mp-usage-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function AnthraSpaceLogo(): React.JSX.Element {
  return (
    <svg className="mp-anthraspace-logo" viewBox="0 0 1254 1254" fill="currentColor" aria-hidden>
      <path d="M385.82 137.28c137.96-1.95 276.59 1.14 414.6-0.25 22.36-0.22 45.19-0.22 67.55 0.15 0 21.36-0.04 42.75 0.16 64.11 0.08 9.44 1.35 19.19 1.18 28.55 6.83-0.11 12.32-1.91 18.72 3.75 3.88 3.43 37.17 2.03 43.03 2l-0.06 89.63c9.73 0.11 29.63-0.23 38.66 0.7 5 1.22 14.84 0.93 20.31 0.96-0.18 6.17-0.57 12.4 0.03 18.52l10.87 0.26 0.01 710.91-35.29 0.07-0.08 30.22-168.02 0.1c0.63-21.18 0.28-43.36 0.24-64.62l-36.68 0.13c-1.43-92.2-0.19-187.63-0.18-280.19-31.82-0.77-66.18-0.17-98.17-0.16l-170.26 0.16c-0.13 93.04 0.8 187.31-0.22 280.18l-26.26-0.05-0.02 33.96c-3.22 0.58-4.15 0.55-7.01 2.29-4.79 7.19-3.26 19.11-3.21 28.12l-167.95 0.16c-0.23-10.01-0.07-20.3-0.04-30.34q-17.83 0.09-35.67-0.01l0.06-508.13v-143.84c0-8.35-0.54-52.2 0.45-58.12 3.7-2.01 4.46-1.23 9.35-1.23v-18.75c5.72 0.02 14.56 0.51 19.83-0.69 13.45-0.62 26.91-0.41 40.38-0.36q0.13-45.26-0.26-90.51c8.76 0.07 41.85 2.16 47.61-2.58 4.41-3.62 8.8-2.59 15.28-2.46 0.58-30.53-0.14-62.56 1.06-92.64z" />
      <path d="m477.33 326.68l298.29 0.09c0.84 56.9 0.45 116.72 0.14 173.74-3.8 0.09-11.34 0.51-14.77-0.14-26.25-1.45-67.24-0.1-94.31-0.12l-174.42 0.11c-5.25 0.16-9.67 0.26-14.96 0.07z" />
    </svg>
  )
}

function SettingsIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

function DesktopIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  )
}

function ChevronIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function ResumeIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="m4 17 6-6-6-6" />
      <path d="M12 19h8" />
    </svg>
  )
}

function ListTodoIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="3" y="5" width="6" height="6" rx="1" />
      <path d="m3 17 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </svg>
  )
}

function GithubIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  )
}

function LinearIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" aria-hidden>
      <path d="M1.225 61.523c-.187-.738.708-1.235 1.246-.697l36.703 36.703c.538.538.041 1.433-.697 1.246C20.6 94.16 5.84 79.4 1.225 61.523ZM.002 46.811a.997.997 0 0 0 .291.749l52.147 52.147a.998.998 0 0 0 .749.291 50.328 50.328 0 0 0 9.235-1.119c.667-.149.904-.972.422-1.454L1.575 37.154c-.482-.482-1.305-.245-1.454.422A50.328 50.328 0 0 0 .002 46.81Zm4.528-18.34a.998.998 0 0 0 .195 1.144l64.66 64.66a.998.998 0 0 0 1.144.195 50.45 50.45 0 0 0 5.913-3.46.999.999 0 0 0 .14-1.518L9.51 22.418a.999.999 0 0 0-1.518.14 50.45 50.45 0 0 0-3.46 5.913Zm10.435-13.075a.999.999 0 0 0 .002 1.41l68.226 68.226a.999.999 0 0 0 1.41.002c19.292-19.477 19.234-50.97-.176-70.378-19.410-19.410-50.901-19.468-70.378-.176-1.061 1.044.916 1.916.916 1.916Z" />
    </svg>
  )
}

function QrSmallIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="3" height="3" />
      <rect x="18" y="14" width="3" height="3" />
      <rect x="14" y="18" width="3" height="3" />
      <rect x="18" y="18" width="3" height="3" />
    </svg>
  )
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}
