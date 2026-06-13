# AnthraSpace MCP Gateway

## Goal

Expose AnthraSpace as a controlled MCP tool provider so external agent CLIs
(Claude, Codex, Gemini, Pi, OpenCode, and future agents) can use AnthraSpace's
workspace, terminal, browser, and orchestration capabilities without being
rewritten as native in-process agents.

The gateway must be production-first: small tool surface, explicit permissions,
observable actions, local/SSH compatibility, and no hidden process control.

## Non-goals

- Replacing existing terminal/PTY agent launches.
- Making every agent use AnthraSpace-native SDK sessions.
- Granting unrestricted filesystem, shell, browser, or process access.
- Building a broad tool catalog before read-only MCP connectivity is proven.

## Architecture

```text
External agent CLI
  -> MCP stdio server: anthraspace mcp
  -> authenticated local AnthraSpace RPC bridge
  -> existing AnthraSpace main-process services
  -> terminals, browser, filesystem, worktrees, orchestration
```

### Components

1. **MCP stdio server**
   - Launched by agent MCP config.
   - Owns MCP protocol parsing and tool schema registration.
   - Does not directly manipulate Electron renderer state.

2. **AnthraSpace local RPC bridge**
   - Runs inside the already-open AnthraSpace app.
   - Exposes narrow authenticated endpoints for MCP tools.
   - Reuses the agent-hook server's pattern: random token, localhost-only, and a
     runtime endpoint file for long-lived terminals that need reconnect info.

3. **Tool adapters**
   - Thin wrappers around existing main-process services.
   - Must keep behavior behind service boundaries instead of reaching into UI
     components or global maps ad hoc.

## Connection and authentication

### Startup

MCP clients use this config shape:

```json
{
  "mcpServers": {
    "anthraspace": {
      "command": "anthraspace",
      "args": ["mcp"]
    }
  }
}
```

During `anthraspace mcp` startup:

1. Read AnthraSpace runtime endpoint metadata from the user-data runtime dir.
2. Validate that the endpoint is localhost or a platform-local pipe.
3. Authenticate with the runtime token.
4. Fail closed with a clear MCP error if AnthraSpace is not running.

### Security requirements

- Runtime token must be random, per app run, and not logged.
- Endpoint metadata file must use restricted permissions where the platform
  supports it.
- Remote/SSH worktrees must route through existing AnthraSpace SSH filesystem and
  terminal abstractions; the MCP process must not assume local filesystem access.
- Tool calls must be auditable in the UI before write-capable tools are enabled.

## Permission model

MCP tools are grouped by risk level.

### Level 0 — read-only, enabled first

Allowed without per-call approval when MCP is enabled:

- workspace metadata
- terminal list/read
- browser tab list/snapshot
- file list/read inside an approved worktree root

### Level 1 — user-visible actions

Requires the user to enable MCP actions in Settings, then logs each action:

- create terminal
- write to an AnthraSpace-managed terminal
- open browser URL
- browser click/fill
- run bounded shell commands

### Level 2 — mutating workspace state

Requires explicit approval policy before implementation:

- file write
- git operations
- process stop/kill
- orchestrating other agents

### Hard blocks

Never allow through MCP:

- blanket process killing by image name (`node`, `bun`, etc.)
- reading known credential files unless the user explicitly grants a scoped path
- filesystem access outside declared worktree roots
- shell commands with no timeout/terminal ownership
- hidden background dev-server launches through the one-shot shell tool

## Initial tool set

Phase 2 implements read-only tools only.

### `anthraspace_workspace_info`

Returns active workspace context.

Input:

```ts
{}
```

Output:

```ts
{
  app: "AnthraSpace"
  worktrees: Array<{
    id: string
    repoId: string
    path: string
    name: string
    isRemote: boolean
  }>
  activeWorktreeId?: string
}
```

### `anthraspace_terminal_list`

Lists AnthraSpace-managed terminals.

Input:

```ts
{ worktreeId?: string }
```

Output:

```ts
{
  terminals: Array<{
    terminalId: string
    worktreeId: string
    title?: string
    cwd?: string
    isRunning: boolean
  }>
}
```

### `anthraspace_terminal_read`

Reads buffered output from an AnthraSpace-managed terminal.

Input:

```ts
{
  terminalId: string
  offset?: number
  limit?: number
}
```

Output:

```ts
{
  terminalId: string
  output: string
  nextOffset: number
  truncated: boolean
}
```

### `anthraspace_browser_tabs`

Lists AnthraSpace browser tabs/pages.

Input:

```ts
{ worktreeId?: string }
```

Output:

```ts
{
  tabs: Array<{
    browserPageId: string
    worktreeId?: string
    title?: string
    url?: string
    active: boolean
  }>
}
```

### `anthraspace_browser_snapshot`

Returns an accessibility/tree snapshot using the existing browser automation
bridge.

Input:

```ts
{
  browserPageId?: string
  worktreeId?: string
}
```

Output:

```ts
{
  browserPageId: string
  snapshot: string
}
```

## Later tool set

Only add these after Phase 2 is working and covered by tests.

### Controlled terminal/action tools

- `anthraspace_terminal_create`
- `anthraspace_terminal_write`
- `anthraspace_bash`

Rules:

- Long-running commands must go through terminal create/write, not one-shot bash.
- One-shot bash must have timeout and output caps.
- Stop/kill must target AnthraSpace terminal IDs or known PIDs only.

### Browser action tools

- `anthraspace_browser_open`
- `anthraspace_browser_click`
- `anthraspace_browser_fill`
- `anthraspace_browser_screenshot`

Rules:

- Actions must be visible in the managed browser.
- Browser actions must serialize per page to avoid racing snapshots/clicks.

### File tools

- `anthraspace_file_list`
- `anthraspace_file_read`
- `anthraspace_file_write`

Rules:

- Resolve paths relative to a worktree root by default.
- Reject traversal outside the root after normalization/realpath where possible.
- Preserve SSH use case through existing connection-aware filesystem APIs.

## Implementation phases

### Phase 1 — design and contracts

- Land this document.
- Confirm tool names, schemas, and permission boundaries.
- No runtime behavior changes.

### Phase 2 — read-only MCP skeleton

- Add MCP server entrypoint and tool registry.
- Add local authenticated RPC bridge read-only endpoints.
- Implement:
  - `anthraspace_workspace_info`
  - `anthraspace_terminal_list`
  - `anthraspace_terminal_read`
  - `anthraspace_browser_tabs`
  - `anthraspace_browser_snapshot`

### Phase 3 — tests and agent config UX

- Add unit tests for tool schemas and RPC auth failures.
- Add an integration smoke test that starts the MCP server against a mocked RPC
  bridge.
- Add Settings UI to show/copy MCP config snippets.

### Phase 4 — controlled actions

- Add settings-gated action tools.
- Add UI audit log entries for each action.
- Add terminal create/write and browser open/click/fill.

### Phase 5 — file and orchestration tools

- Add file list/read/write with local + SSH coverage.
- Add agent orchestration only after action permissions are proven.

## Test plan

### Unit tests

- Tool schema validation rejects missing/invalid fields.
- Permission policy maps tools to the correct risk level.
- RPC client rejects missing token, wrong token, and non-local endpoints.
- Path-scoping helpers reject traversal for file tools.

### Integration tests

- MCP initialize/list_tools returns only enabled tools.
- Read-only tools call a mocked AnthraSpace bridge and return MCP content blocks.
- AnthraSpace-not-running returns a clear MCP error.

### Manual verification

1. Start AnthraSpace dev app.
2. Configure an external agent with the AnthraSpace MCP server.
3. Ask the agent to list AnthraSpace tools.
4. Ask for workspace info.
5. Ask for terminal list/read.
6. Ask for browser tabs/snapshot.
7. Confirm no write/action tool is available in Phase 2.

## Production readiness gates

Do not move to write/action tools until all are true:

- MCP server has auth and local-endpoint validation.
- Read-only tools work with at least one external MCP client.
- Tool calls are bounded and cannot return unbounded output.
- SSH worktree behavior is explicitly tested or disabled with a clear error.
- Settings UI makes MCP enabled/disabled state visible to the user.
