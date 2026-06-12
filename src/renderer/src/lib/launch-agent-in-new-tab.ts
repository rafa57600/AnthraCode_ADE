import { toast } from 'sonner'
import { useAppStore } from '@/store'
import {
  buildAgentDraftLaunchPlan,
  buildAgentStartupPlan,
  type AgentStartupPlan
} from '@/lib/tui-agent-startup'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'
import { reconcileTabOrder } from '@/components/tab-bar/reconcile-order'
import { track, tuiAgentToAgentKind } from '@/lib/telemetry'
import { pasteDraftWhenAgentReady } from '@/lib/agent-paste-draft'
import { TUI_AGENT_CONFIG } from '../../../shared/tui-agent-config'
import { getFreeTestCompatibility } from '../../../shared/free-test-providers'
import { resolvePiModelConfig } from '../../../shared/pi-model-config'
import { makePaneKey } from '../../../shared/stable-pane-id'
import { splitWorktreeIdForFilesystem } from '../../../shared/worktree-id'
import type { TuiAgent } from '../../../shared/types'
import type { LaunchSource } from '../../../shared/telemetry-events'

export type LaunchAgentInNewTabArgs = {
  agent: TuiAgent
  worktreeId: string
  /** The tab group the user clicked from. Keeps split-group launches in the
   *  pane the user initiated from instead of falling through to the active group. */
  groupId?: string
  /** Optional initial prompt. Delivery depends on `promptDelivery` and the
   *  agent's prompt mode. */
  prompt?: string
  /** Force generated prompt text out of the shell launch command. `draft`
   *  leaves it editable; `submit-after-ready` sends it once the TUI is ready. */
  promptDelivery?: 'auto-submit' | 'draft' | 'submit-after-ready'
  /** Telemetry surface that initiated this launch. Defaults to the tab-bar
   *  quick-launch entry point so existing callers stay unchanged. */
  launchSource?: LaunchSource
  /** Called after the prompt is actually delivered to the agent input path. */
  onPromptDelivered?: () => void
}

export type LaunchAgentInNewTabResult = {
  tabId: string
  startupPlan: AgentStartupPlan
  pasteDraftAfterLaunch: boolean
  /** When true, this agent runs in-process (native SDK) instead of a PTY tab.
   *  Callers should skip PTY and terminal-focus operations for these agents. */
  isNativeSdk?: true
} | null

function seedCommandCodeSubmittedPromptStatus(tabId: string, prompt: string): void {
  const state = useAppStore.getState()
  const leafId = state.terminalLayoutsByTabId[tabId]?.activeLeafId
  if (!leafId) {
    return
  }
  try {
    state.setAgentStatus(makePaneKey(tabId, leafId), {
      state: 'working',
      prompt,
      agentType: 'command-code'
    })
  } catch {
    // Best-effort UI seed. Real hooks still own refinement/completion.
  }
}

/**
 * Create a new terminal tab and queue the agent's launch command, optionally
 * with an initial prompt.
 *
 * Why: this is the single entry point for "launch agent X in a new tab" from
 * the tab-bar quick-launch menu and the Source Control "send notes to agent"
 * action. It mirrors the `+` button's path (`createNewTerminalTab`) — createTab,
 * flip `activeTabType` to terminal, and persist the appended tab-bar order —
 * then queues the agent startup through the same `pendingStartupByTabId`
 * channel the new-workspace ("cmd+N") flow uses. TerminalPane consumes the
 * queued command on first mount and the local PTY provider writes it once the
 * shell is ready (see `pty-connection.ts`: startup-command path).
 *
 * Default submission mode follows `promptInjectionMode`: argv/flag agents
 * include the prompt directly in the launch command, while followup-path
 * agents launch empty and receive a post-ready draft paste. Generated contexts
 * can override this with draft or submit-after-ready delivery.
 *
 * Returns `null` when no startup plan can be built — for example, a whitespace-
 * only prompt on the trim-empty branch of `buildAgentStartupPlan`. Callers
 * surface that as a launch failure (see `QuickLaunchButton.runLaunch`).
 */
export function launchAgentInNewTab(args: LaunchAgentInNewTabArgs): LaunchAgentInNewTabResult {
  const {
    agent,
    worktreeId,
    groupId,
    prompt,
    promptDelivery = 'auto-submit',
    launchSource,
    onPromptDelivered
  } = args
  const store = useAppStore.getState()
  const cmdOverrides = store.settings?.agentCmdOverrides ?? {}
  const trimmedPrompt = prompt?.trim() ?? ''
  const hasPrompt = trimmedPrompt.length > 0
  const isFollowupPath = TUI_AGENT_CONFIG[agent].promptInjectionMode === 'stdin-after-start'
  const worktree = Object.values(store.worktreesByRepo ?? {})
    .flat()
    .find((candidate) => candidate.id === worktreeId)
  const repo = worktree ? store.repos?.find((candidate) => candidate.id === worktree.repoId) : null
  const isRemoteWorktree = typeof repo?.connectionId === 'string' && repo.connectionId.length > 0

  // ── Native SDK agents (in-process, no PTY) ──────────────────────────────────
  const shouldUseNativeSdk =
    TUI_AGENT_CONFIG[agent]?.nativeSdk === true &&
    store.settings?.experimentalNativePiSdk === true &&
    !isRemoteWorktree

  if (shouldUseNativeSdk) {
    // Why: extract the real filesystem path from the worktree ID so the native
    // Pi SDK session knows its working directory.  `splitWorktreeIdForFilesystem`
    // handles the `${repoId}::${path}` format (including folder-workspace UUID
    // suffixes).
    const parsedId = splitWorktreeIdForFilesystem(worktreeId)
    const worktreePath = parsedId?.worktreePath ?? ''
    if (!worktreePath) {
      toast.error('Could not determine worktree path for native Pi session.')
      return null
    }
    const paneKey = `pi-native:${agent}:${worktreeId}`
    const freeTestCompatibility = getFreeTestCompatibility({
      enabled: store.settings?.freeTestProvidersEnabled,
      selectedModelId: store.settings?.freeTestProviderModelId,
      target: 'pi-native'
    })
    const selectedPiModel =
      freeTestCompatibility.status === 'supported'
        ? resolvePiModelConfig(freeTestCompatibility.model)
        : null
    const piModel = selectedPiModel ?? resolvePiModelConfig(null)
    if (freeTestCompatibility.status === 'unsupported') {
      toast.message(
        `${freeTestCompatibility.model.label} is not supported by native Pi yet; launching Pi with its default model.`
      )
    }

    // Generate session ID synchronously so the tab has a stable entityId
    // before the async IPC call completes.
    const tempSessionId = `pi-native-${crypto.randomUUID()}`

    // Why: create a native-agent tab so the tab bar shows the Pi session.
    // Without a real tab the session has no visible UI and follow-up prompts
    // would have nowhere to go.  The NativeAgentPane component renders when
    // contentType === 'native-agent'.
    const tab = store.createUnifiedTab(worktreeId, 'native-agent', {
      entityId: tempSessionId,
      label: 'Pi',
      activate: true
    })

    // Why: get a fresh store snapshot after createUnifiedTab mutated state.
    const fresh = useAppStore.getState()

    // Seed the store entry so NativeAgentPane can resolve the sessionId from
    // the tab's entityId before the async createSession returns.
    fresh.setNativePiSession({
      sessionId: tempSessionId,
      worktreeId,
      createdAt: Date.now(),
      snapshot: null
    })

    // Why: persist the tab-bar order with the new native-agent tab appended.
    // Without this, reconcileTabOrder falls back to terminals-first when the
    // stored order is unset, which can jump the new tab to index 0.
    const termIds = (fresh.tabsByWorktree[worktreeId] ?? []).map((t) => t.id)
    const editIds = fresh.openFiles.filter((f) => f.worktreeId === worktreeId).map((f) => f.id)
    const browserIds = (fresh.browserTabsByWorktree?.[worktreeId] ?? []).map((t) => t.id)
    const base = reconcileTabOrder(
      fresh.tabBarOrderByWorktree[worktreeId],
      termIds,
      editIds,
      browserIds
    )
    const order = base.filter((id) => id !== tab.id)
    order.push(tab.id)
    fresh.setTabBarOrder(worktreeId, order)

    fresh.setActiveTabType('native-agent')

    // Create the session asynchronously; the tab shows a "connecting" state
    // until the IPC response arrives.
    void window.api.piNative
      .createSession({
        sessionId: tempSessionId,
        modelProvider: piModel.modelProvider,
        modelName: piModel.modelName,
        worktreePath,
        paneKey
      })
      .then((snapshot) => {
        const sessionId = snapshot.sessionId ?? tempSessionId
        useAppStore.getState().updateNativePiSnapshot(sessionId, snapshot)
        toast.success(
          `Pi agent session started in ${worktreePath.split(/[\\/]/).filter(Boolean).at(-1) ?? worktreePath}.`
        )
        if (hasPrompt) {
          onPromptDelivered?.()
          void window.api.piNative
            .prompt(sessionId, trimmedPrompt)
            .then((nextSnapshot) => {
              useAppStore.getState().updateNativePiSnapshot(sessionId, nextSnapshot)
            })
            .catch((err: Error) => {
              console.error('[pi-native] prompt failed:', err)
              toast.error(`Could not send prompt to Pi: ${err.message}`)
            })
        }
      })
      .catch((err: Error) => {
        console.error('[pi-native] create session failed:', err)
        toast.error(`Could not start Pi agent: ${err.message}`)
      })
    return {
      tabId: tab.id,
      startupPlan: null as unknown as AgentStartupPlan,
      pasteDraftAfterLaunch: false,
      isNativeSdk: true
    }
  }

  // Why: argv/flag agents fold the prompt into the launch command and
  // auto-submit — keeping behavior consistent with the composer/tab-bar `+`
  // mental model, where the prompt is "the first turn the user sent".
  // Followup-path and generated-context launches can deliver a prompt via
  // post-launch bracketed paste; callers decide whether that paste remains a
  // draft or submits after readiness.
  let startupPlan: AgentStartupPlan | null = null
  let pasteDraftAfterLaunch: string | null = null
  let submitPastedPrompt = false
  let forcePasteAfterLaunch = false

  if (hasPrompt && promptDelivery === 'submit-after-ready') {
    // Why: generated multi-line prompts are too large to echo through a shell
    // argv/prefill command. Launch cleanly, then paste+submit inside the TUI.
    startupPlan = buildAgentStartupPlan({
      agent,
      prompt: '',
      cmdOverrides,
      platform: CLIENT_PLATFORM,
      allowEmptyPromptLaunch: true
    })
    pasteDraftAfterLaunch = trimmedPrompt
    submitPastedPrompt = true
    forcePasteAfterLaunch = true
  } else if (hasPrompt && promptDelivery === 'draft') {
    const draftLaunchPlan = buildAgentDraftLaunchPlan({
      agent,
      draft: trimmedPrompt,
      cmdOverrides,
      platform: CLIENT_PLATFORM
    })
    if (draftLaunchPlan) {
      startupPlan = {
        agent: draftLaunchPlan.agent,
        launchCommand: draftLaunchPlan.launchCommand,
        expectedProcess: draftLaunchPlan.expectedProcess,
        followupPrompt: null,
        ...(draftLaunchPlan.env ? { env: draftLaunchPlan.env } : {})
      }
    } else {
      startupPlan = buildAgentStartupPlan({
        agent,
        prompt: '',
        cmdOverrides,
        platform: CLIENT_PLATFORM,
        allowEmptyPromptLaunch: true
      })
      pasteDraftAfterLaunch = trimmedPrompt
    }
  } else if (hasPrompt && isFollowupPath) {
    startupPlan = buildAgentStartupPlan({
      agent,
      prompt: '',
      cmdOverrides,
      platform: CLIENT_PLATFORM,
      allowEmptyPromptLaunch: true
    })
    pasteDraftAfterLaunch = trimmedPrompt
  } else {
    startupPlan = buildAgentStartupPlan({
      agent,
      prompt: hasPrompt ? trimmedPrompt : '',
      cmdOverrides,
      platform: CLIENT_PLATFORM,
      allowEmptyPromptLaunch: !hasPrompt
    })
  }

  if (!startupPlan) {
    return null
  }

  // Why: queue the startup command BEFORE TerminalPane mounts — it captures
  // `pendingStartupByTabId[tabId]` in useState on first render. If the queue
  // lands after mount the agent binary never starts; the user sees a bare shell.
  // Since both calls happen synchronously in the same React batch, the queue
  // is in place by the time the pane commits.
  //
  // The telemetry payload is threaded through the queue → pty-connection →
  // pty-transport → pty:spawn IPC → main, where main fires `agent_started`
  // only after the spawn succeeds. `request_kind: 'new'` because
  // quick-launch always opens a fresh session.
  const tab = store.createTab(worktreeId, groupId)
  store.queueTabStartupCommand(tab.id, {
    command: startupPlan.launchCommand,
    ...(startupPlan.env ? { env: startupPlan.env } : {}),
    ...(agent === 'command-code' && hasPrompt && promptDelivery === 'auto-submit'
      ? { initialAgentStatus: { agent, prompt: trimmedPrompt } }
      : {}),
    telemetry: {
      agent_kind: tuiAgentToAgentKind(agent),
      launch_source: launchSource ?? 'tab_bar_quick_launch',
      request_kind: 'new'
    }
  })

  // Why: schedule the bracketed-paste-after-ready follow-up immediately after
  // the startup command is queued. Fire-and-forget so callers keep their
  // synchronous `{ tabId, startupPlan }` signature. The helper short-circuits
  // for agents with a `draftPromptFlag`, so calling it on the followup path
  // is safe even when the draft was already injected via the native flag.
  if (pasteDraftAfterLaunch !== null) {
    // Why: surface silent paste failures — without onTimeout, a stalled agent
    // readiness wait drops the user's notes with no feedback. Suppress when
    // the user closed the tab or switched worktrees so the toast/telemetry
    // don't fire for user-initiated cancellation (mirrors the 5s launch
    // watchdog in QuickLaunchButton).
    const tabId = tab.id
    void pasteDraftWhenAgentReady({
      tabId,
      content: pasteDraftAfterLaunch,
      agent,
      submit: submitPastedPrompt,
      forcePaste: forcePasteAfterLaunch,
      onTimeout: () => {
        const state = useAppStore.getState()
        const tabsForWorktree = state.tabsByWorktree[worktreeId] ?? []
        const tab = tabsForWorktree.find((t) => t.id === tabId)
        // Why: if the PTY never spawned, QuickLaunch's 5s watchdog already
        // surfaced the launch failure. Don't double-toast for the same root
        // cause. Looking up directly in `worktreeId` (not scanning every
        // worktree) also preserves "still in this worktree" intent.
        if (!tab) {
          return // tab closed by user
        }
        if (tab.ptyId === null) {
          return // launch failed; QuickLaunch handled the user-facing toast
        }
        if (state.activeWorktreeId !== worktreeId) {
          return
        }
        const label = submitPastedPrompt ? 'prompt' : 'notes'
        toast.message(`Your ${label} wasn't sent — paste it once the agent is ready.`)
        track('agent_error', {
          error_class: 'paste_readiness_timeout',
          agent_kind: tuiAgentToAgentKind(agent)
        })
      }
    }).then((delivered) => {
      if (delivered) {
        if (agent === 'command-code' && submitPastedPrompt) {
          // Why: Command Code has no prompt-submit hook; when Orca submits a
          // generated prompt after readiness, seed working at delivery time.
          seedCommandCodeSubmittedPromptStatus(tabId, pasteDraftAfterLaunch)
        }
        onPromptDelivered?.()
      }
    })
  } else if (hasPrompt) {
    onPromptDelivered?.()
  }

  // Why: match the `+` button's `createNewTerminalTab` sequence — without
  // `setActiveTabType('terminal')`, a worktree currently showing an editor
  // file keeps rendering the editor and the new terminal tab stays invisible.
  store.setActiveTabType('terminal')

  // Why: persist the tab-bar order with the new terminal appended. Without
  // this, `reconcileTabOrder` falls back to terminals-first when the stored
  // order is unset, which can jump the new tab to index 0 instead of the end.
  const fresh = useAppStore.getState()
  const termIds = (fresh.tabsByWorktree[worktreeId] ?? []).map((t) => t.id)
  const editorIds = fresh.openFiles.filter((f) => f.worktreeId === worktreeId).map((f) => f.id)
  const browserIds = (fresh.browserTabsByWorktree?.[worktreeId] ?? []).map((t) => t.id)
  const base = reconcileTabOrder(
    fresh.tabBarOrderByWorktree[worktreeId],
    termIds,
    editorIds,
    browserIds
  )
  const order = base.filter((id) => id !== tab.id)
  order.push(tab.id)
  fresh.setTabBarOrder(worktreeId, order)

  return { tabId: tab.id, startupPlan, pasteDraftAfterLaunch: pasteDraftAfterLaunch !== null }
}
