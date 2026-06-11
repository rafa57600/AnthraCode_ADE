/**
 * PiAgentHost — native Pi SDK agent lifecycle manager.
 *
 * Manages in-process Pi `Agent` instances (`PiSessionHost`) that replace the
 * subprocess-PTY approach. Each session wraps:
 *   - Pi Agent (conversation state, tool exec, streaming)
 *   - Pi Session (JSONL persistence via InMemorySessionRepo / JsonlRepo)
 *   - NodeExecutionEnv (filesystem + shell for Pi's built-in tools)
 *   - Agent-status bridge (event → Orca's hook pipeline)
 *
 * Keeps the existing `src/main/pi/` overlay/Pty subprocess path as a fallback
 * when the native mode is disabled or the SDK is unavailable.
 */

import {
  Agent,
  type AgentEvent,
  type AgentMessage,
  InMemorySessionRepo,
  type Session,
} from '@earendil-works/pi-agent-core'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'
import { agentHookServer } from '../agent-hooks/server'
import { buildStatusPayload } from './agent-status-bridge'
import type {
  CreatePiSessionParams,
  PiSessionEvent,
  PiSessionEventCallback,
  PiSessionSnapshot,
  PiSessionStatus,
} from './types'

// ── Errors ─────────────────────────────────────────────────────────────────

export class PiHostError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'session_not_found'
      | 'session_busy'
      | 'host_shutdown'
      | 'create_failed'
  ) {
    super(message)
    this.name = 'PiHostError'
  }
}

// ── PiSessionHost ──────────────────────────────────────────────────────────
// Wraps a single Pi Agent + Session + ExecutionEnv for one worktree.

const DEFAULT_SYSTEM_PROMPT =
  'You are a software engineering AI assistant. You have access to a set of tools. Use them to help the user with their coding tasks.'

export class PiSessionHost {
  readonly sessionId: string
  readonly paneKey?: string
  readonly worktreePath: string
  readonly createdAt: number

  private _agent: Agent
  private _piSession: Session
  private _env: NodeExecutionEnv
  private _status: PiSessionStatus = 'idle'
  private _messageCount = 0
  private _lastActivityAt: number
  private _errorMessage?: string
  private _lastPromptText = ''
  private _eventCallbacks: PiSessionEventCallback[] = []
  private _agentEventCallbacks: Array<(event: AgentEvent) => void> = []
  private _destroyed = false
  private _unsubscribe?: () => void

  constructor(
    agent: Agent,
    piSession: Session,
    env: NodeExecutionEnv,
    params: {
      paneKey?: string
      sessionId: string
      worktreePath: string
    }
  ) {
    this._agent = agent
    this._piSession = piSession
    this._env = env
    this.sessionId = params.sessionId
    this.paneKey = params.paneKey
    this.worktreePath = params.worktreePath
    this.createdAt = Date.now()
    this._lastActivityAt = this.createdAt
  }

  // ── Accessors ──────────────────────────────────────────────────────────

  get agent(): Agent {
    return this._agent
  }

  get piSession(): Session {
    return this._piSession
  }

  get env(): NodeExecutionEnv {
    return this._env
  }

  get status(): PiSessionStatus {
    return this._status
  }

  get messageCount(): number {
    return this._messageCount
  }

  get lastActivityAt(): number {
    return this._lastActivityAt
  }

  get errorMessage(): string | undefined {
    return this._errorMessage
  }

  get destroyed(): boolean {
    return this._destroyed
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  /** Subscribe to session-level events. Returns an unsubscribe function. */
  onEvent(cb: PiSessionEventCallback): () => void {
    this._eventCallbacks.push(cb)
    return () => {
      const idx = this._eventCallbacks.indexOf(cb)
      if (idx !== -1) this._eventCallbacks.splice(idx, 1)
    }
  }

  /** Subscribe to raw Pi Agent events for external processing (e.g. hook
   *  server bridging). Returns an unsubscribe function. */
  onAgentEvent(cb: (event: AgentEvent) => void): () => void {
    this._agentEventCallbacks.push(cb)
    return () => {
      const idx = this._agentEventCallbacks.indexOf(cb)
      if (idx !== -1) this._agentEventCallbacks.splice(idx, 1)
    }
  }

  /** Start listening to Pi Agent events. Call once after construction. */
  startListening(): void {
    if (this._unsubscribe) return

    this._unsubscribe = this._agent.subscribe((event) => {
      this._lastActivityAt = Date.now()
      this.handleAgentEvent(event)
    })
  }

  /**
   * Send a prompt to the Pi agent.
   *
   * Returns when the agent has finished processing the prompt (agent_end
   * emitted and all listeners settle). Throws `PiHostError` if the session
   * is busy or destroyed.
   */
  async prompt(input: string | AgentMessage | AgentMessage[]): Promise<void> {
    this.ensureNotDestroyed()

    if (this._status === 'running' || this._status === 'streaming') {
      throw new PiHostError(
        `Session ${this.sessionId} is busy (status: ${this._status})`,
        'session_busy'
      )
    }

    this._status = 'running'
    this._lastPromptText = typeof input === 'string' ? input : ''
    this.emitEvent({
      type: 'status_change',
      status: 'running',
      sessionId: this.sessionId,
    })

    try {
      // Agent.prompt() overloads: string → text prompt, AgentMessage → single msg,
      // AgentMessage[] → batch.
      await (typeof input === 'string'
        ? this._agent.prompt(input)
        : Array.isArray(input)
          ? this._agent.prompt(input as AgentMessage[])
          : this._agent.prompt(input as AgentMessage))

      this._messageCount = this._agent.state.messages.length
      this._status = 'finished'
      this.emitEvent({
        type: 'finished',
        sessionId: this.sessionId,
        messageCount: this._messageCount,
      })
      this.emitEvent({
        type: 'status_change',
        status: 'finished',
        sessionId: this.sessionId,
      })
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this._status = 'error'
      this._errorMessage = error.message
      this.emitEvent({ type: 'error', sessionId: this.sessionId, error })
      this.emitEvent({
        type: 'status_change',
        status: 'error',
        sessionId: this.sessionId,
      })
      throw error
    }
  }

  /** Abort the current run. Best-effort; safe to call when idle. */
  abort(): void {
    if (this._status !== 'running' && this._status !== 'streaming') return

    this._agent.abort()
    this._status = 'interrupted'
    this.emitEvent({
      type: 'status_change',
      status: 'interrupted',
      sessionId: this.sessionId,
    })
  }

  /** Queue a steering message (injected after the current assistant turn). */
  steer(message: AgentMessage): void {
    this.ensureNotDestroyed()
    this._agent.steer(message)
  }

  /** Queue a follow-up message (injected when the agent would otherwise stop). */
  followUp(message: AgentMessage): void {
    this.ensureNotDestroyed()
    this._agent.followUp(message)
  }

  /**
   * Destroy the session: abort running agent, close the execution
   * environment. Idempotent.
   */
  async destroy(): Promise<void> {
    if (this._destroyed) return
    this._destroyed = true

    if (this._status === 'running' || this._status === 'streaming') {
      this._agent.abort()
    }

    this._unsubscribe?.()
    await this._env.cleanup().catch(() => {})
    this._status = 'finished'
    this._eventCallbacks = []
  }

  /** Snapshot for diagnostics / management. */
  snapshot(): PiSessionSnapshot {
    return {
      sessionId: this.sessionId,
      status: this._status,
      paneKey: this.paneKey,
      worktreePath: this.worktreePath,
      createdAt: this.createdAt,
      lastActivityAt: this._lastActivityAt,
      messageCount: this._messageCount,
      errorMessage: this._errorMessage,
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private ensureNotDestroyed(): void {
    if (this._destroyed) {
      throw new PiHostError(
        `Session ${this.sessionId} has been destroyed`,
        'host_shutdown'
      )
    }
  }

  private handleAgentEvent(event: AgentEvent): void {
    // 1. Forward raw event to external subscribers (hook bridge, diagnostics)
    for (const cb of this._agentEventCallbacks) {
      try {
        cb(event)
      } catch {
        // Listener failures must never crash the session
      }
    }

    // 2. Bridge to Orca's agent-status pipeline when a paneKey is set
    if (this.paneKey) {
      const statusPayload = buildStatusPayload(event, this._lastPromptText)
      if (statusPayload) {
        agentHookServer.ingestNative(this.paneKey, statusPayload)
      }
    }

    // 3. Internal state management
    switch (event.type) {
      case 'message_end':
        this._messageCount = this._agent.state.messages.length
        break

      case 'turn_start':
        this._status = 'streaming'
        this.emitEvent({
          type: 'status_change',
          status: 'streaming',
          sessionId: this.sessionId,
        })
        break

      case 'tool_execution_start':
        this.emitEvent({
          type: 'tool_call',
          sessionId: this.sessionId,
          toolName: event.toolName,
          toolInput: event.args,
        })
        break

      case 'tool_execution_end':
        this.emitEvent({
          type: 'tool_result',
          sessionId: this.sessionId,
          toolName: event.toolName,
          isError: event.isError,
        })
        break

      case 'message_update': {
        const ev = event.assistantMessageEvent
        // Broadcast text deltas for real-time UI updates
        if (ev.type === 'text_delta' && ev.delta) {
          this.emitEvent({
            type: 'assistant_message',
            sessionId: this.sessionId,
            text: ev.delta,
          })
        }
        break
      }
    }
  }

  private emitEvent(event: PiSessionEvent): void {
    for (const cb of this._eventCallbacks) {
      try {
        cb(event)
      } catch {
        // Listener failures must never crash the host
      }
    }
  }
}

// ── PiAgentHost ────────────────────────────────────────────────────────────
// Top-level registry for all native Pi sessions in the AnthraSpace process.

export type HostOptions = {
  /** Root directory for JSONL session storage. Defaults to worktreePath per session. */
  sessionsRoot?: string
}

export class PiAgentHost {
  private sessions = new Map<string, PiSessionHost>()
  private _shutdown = false
  private _eventCallbacks: PiSessionEventCallback[] = []
  private _memRepo = new InMemorySessionRepo()

  constructor(readonly options: HostOptions = {}) {}

  get shutdown(): boolean {
    return this._shutdown
  }

  /** Subscribe to all host-level session events. */
  onEvent(cb: PiSessionEventCallback): () => void {
    this._eventCallbacks.push(cb)
    return () => {
      const idx = this._eventCallbacks.indexOf(cb)
      if (idx !== -1) this._eventCallbacks.splice(idx, 1)
    }
  }

  /**
   * Create a new native Pi session.
   *
   * Sets up a Pi `Agent`, `NodeExecutionEnv`, and session store. The session
   * is immediately ready for `prompt()` calls after creation.
   */
  async createSession(params: CreatePiSessionParams): Promise<PiSessionHost> {
    this.ensureNotShutdown()

    const sessionId = params.sessionId ?? crypto.randomUUID()

    try {
      // 1. Execution environment for Pi's built-in tools (read/write/bash)
      const env = new NodeExecutionEnv({
        cwd: params.worktreePath,
        shellEnv: process.env,
      })

      // 2. Pi Agent — uses initialState to set model/systemPrompt/tools
      const agent = new Agent({
        sessionId,
        initialState: {
          systemPrompt: params.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
          model: params.model,
          thinkingLevel: params.thinkingLevel ?? 'off',
          tools: params.tools ?? [],
          messages: [],
        },
        getApiKey: params.apiKey
          ? async () => params.apiKey
          : undefined,
        toolExecution: params.toolExecution ?? 'parallel',
        transport: params.transport,
      })

      // 3. Session store (in-memory for now; JSONL on disk is follow-up)
      const piSession = await this._memRepo.create({ id: sessionId })

      // 4. PiSessionHost wrapper
      const sessionHost = new PiSessionHost(agent, piSession, env, {
        sessionId,
        paneKey: params.paneKey,
        worktreePath: params.worktreePath,
      })

      // 5. Forward session events to host-level subscribers
      sessionHost.onEvent((event) => {
        for (const cb of this._eventCallbacks) {
          try {
            cb(event)
          } catch {
            // Host-level listeners never crash the host
          }
        }
      })

      // 6. Start consuming Pi Agent events
      sessionHost.startListening()

      // 7. Register
      this.sessions.set(sessionId, sessionHost)

      return sessionHost
    } catch (err) {
      throw new PiHostError(
        `Failed to create Pi session: ${err instanceof Error ? err.message : String(err)}`,
        'create_failed'
      )
    }
  }

  /** Get a session by id. */
  getSession(sessionId: string): PiSessionHost | undefined {
    return this.sessions.get(sessionId)
  }

  /** Find a session by its pane key. */
  getSessionByPaneKey(paneKey: string): PiSessionHost | undefined {
    for (const session of this.sessions.values()) {
      if (session.paneKey === paneKey) return session
    }
    return undefined
  }

  /** Destroy a session. Idempotent. */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    await session.destroy()
    this.sessions.delete(sessionId)
  }

  /** Destroy all sessions. Called during host shutdown. */
  async destroyAll(): Promise<void> {
    this._shutdown = true
    await Promise.all(
      Array.from(this.sessions.keys()).map((id) => this.destroySession(id))
    )
  }

  /** Snapshot of all sessions for diagnostics. */
  listSessions(): PiSessionSnapshot[] {
    return Array.from(this.sessions.values()).map((s) => s.snapshot())
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private ensureNotShutdown(): void {
    if (this._shutdown) {
      throw new PiHostError('PiAgentHost has been shut down', 'host_shutdown')
    }
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────
/** Application-wide native Pi agent host instance. */
export const piAgentHost = new PiAgentHost()
