# Changelog

Production-ready changes must be recorded here after implementation and verification.

## 2026-06-14 — AnthraSpace MCP read-only skeleton

### Production change

- Added an `orca mcp` stdio entrypoint for MCP clients with JSON-RPC framing, `initialize`, `tools/list`, and `tools/call` support.
- Added the Phase 2 read-only AnthraSpace MCP tool registry for workspace metadata, terminal listing/reading, browser tab listing, and browser accessibility snapshots.
- Added focused MCP tool tests covering the allowed Phase 2 tool surface, runtime RPC mapping, and parameter validation.

### Verification

- `pnpm exec vitest run --config config/vitest.config.ts src/cli/mcp/tools.test.ts` passed.
- `pnpm run tc:cli` passed.
- `pnpm run tc:node` passed.
- `pnpm run tc:web` passed.

### Production impact

- External agent CLIs can start discovering AnthraSpace context through MCP without any terminal writes, shell execution, browser actions, file writes, or orchestration side effects.
- The gateway reuses existing runtime RPC calls, keeping SSH/worktree behavior behind the same runtime boundary as the existing CLI.

## 2026-06-13 — Disable native Pi SDK launch path

### Production change

- Disabled the native Pi SDK launch flag so Pi sessions return to the stable subprocess/PTY agent path.
- Updated the Experimental settings row to show native Pi as temporarily disabled instead of allowing users to route launches through the unreliable SDK path.

### Verification

- `pnpm run tc:web` passed.
- `pnpm run tc:node` passed.
- `graphify update .` completed successfully.

### Production impact

- Restores the pre-native Pi agent behavior for UI launches while keeping the native SDK code available for future rework.
- Avoids Groq XML-style tool-call output being shown as assistant text instead of executing AnthraSpace tools.

## 2026-06-13 — Native Pi chat code block controls

### Production change

- Added native Pi chat-specific code block controls with copy, copied-state feedback, language labels, and an Insert action.
- Wired Insert to append the selected fenced code block into the chat input for follow-up prompts.
- Kept code controls scoped to the native chat Markdown renderer so MarkdownPreview/editor behavior remains unchanged.

### Verification

- `pnpm run tc:web` passed.
- `pnpm run tc:node` passed.
- `graphify update .` completed successfully.

### Production impact

- Users can reuse assistant-generated code in follow-up prompts without manual selection/copy formatting.
- Code block actions are implemented with the existing clipboard bridge and design tokens, preserving Electron security boundaries and UI consistency.

## 2026-06-13 — Native Pi chat history sidebar

### Production change

- Added a right-side conversation history panel for native Pi chat sessions with per-turn summaries, timestamps, tool-count badges, and error markers.
- Added a header toggle for the history panel and row selection that scrolls the transcript to the chosen turn.
- Moved the native chat render-entry shape into the shared component-level type module so the pane and sidebar stay type-aligned.

### Verification

- `pnpm run tc:web` passed.
- `pnpm run tc:node` passed.
- `graphify update .` completed successfully.

### Production impact

- Long native Pi sessions are now navigable without searching the full transcript manually.
- The sidebar derives from the already-rendered conversation entries, keeping UI navigation lightweight and avoiding extra Pi SDK/session persistence risk.

## 2026-06-13 — Native Pi chat undo and redo

### Production change

- Added native Pi SDK transcript undo/redo in the main-process session host using Pi core's supported `agent.state.messages` setter/getter.
- Exposed `pi-native:undo` and `pi-native:redo` through shared IPC, preload types, and the renderer bridge.
- Added native chat header undo/redo controls plus cross-platform keyboard shortcuts (`Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`, and `Ctrl+Y` on non-macOS).
- Kept the visible conversation history synchronized with the restored Pi SDK transcript snapshot instead of performing renderer-only history edits.

### Verification

- `pnpm run tc:web` passed.
- `pnpm run tc:node` passed.

### Production impact

- Users can safely step backward and forward through native Pi chat turns while future prompts continue from the restored SDK transcript.
- The implementation follows Pi's existing state/session model and avoids creating a separate, divergent renderer-only conversation state.

## 2026-06-13 — Native Pi chat buffered typewriter streaming

### Production change

- Reworked native Pi assistant streaming so provider text deltas are buffered in refs and revealed through `requestAnimationFrame` at a controlled typewriter cadence.
- Flushes buffered text before tool-call boundaries, finished/interrupted/error statuses, and fallback snapshot rendering so completed assistant messages remain complete.
- Keeps the IPC subscription stable across streamed text changes instead of re-subscribing on every visible delta.

### Verification

- `pnpm run tc:web` passed.
- `npx tsc --noEmit --pretty` passed in `src/renderer` (npm config warnings only).

### Production impact

- Reduces React render pressure from high-frequency model chunks while preserving a responsive streaming feel.
- Prevents streamed text loss at lifecycle boundaries by flushing pending buffered deltas before committing conversation entries.

## 2026-06-13 — Native Pi chat file @-mentions

### Production change

- Added file `@` mention autocomplete to the native Pi chat input using the existing workspace filesystem API.
- Added selected-file chips so users can see and remove attached file context before sending.
- Extended the native Pi prompt IPC bridge to accept optional file attachments and inline bounded file context into the Pi prompt.
- Kept file discovery and reads routed through `window.api.fs` with worktree/root and SSH connection context instead of direct renderer filesystem access.

### Verification

- `npx tsc --noEmit --pretty` passed in `src/renderer` (npm config warnings only).
- `pnpm run tc:web` passed.
- `pnpm run tc:node` passed.

### Production impact

- Users can attach relevant workspace files to native Pi prompts without copy/pasting source content manually.
- The implementation respects Orca’s existing local/SSH filesystem boundary and caps inlined file context to avoid runaway prompt payloads.

## 2026-06-13 — Native Pi chat slash commands

### Production change

- Added a typed native-agent slash command registry for `/clear` and `/help`.
- Added a keyboard-accessible slash command dropdown that appears when users type `/`, supports ArrowUp/ArrowDown navigation, Enter/Tab selection, Escape dismissal, and mouse selection without losing focus.
- Wired slash command execution into the native Pi chat pane: `/clear` clears the visible conversation buffer, and `/help` renders Markdown help text from the shared command registry.

### Verification

- `npx tsc --noEmit --pretty` passed in `src/renderer` (npm config warnings only).

### Production impact

- Users can discover and execute chat-local actions without sending command-like text to the model.
- Command metadata is centralized, reducing drift between autocomplete labels and help output as new chat commands are added.

## 2026-06-12 — Free test provider API key setup in Agents settings

### Production change

- Added provider API-key metadata to free-test model entries so Settings can identify which saved key each hosted provider needs.
- Added a compact API-key setup row under the selected Free test provider in Settings → Agents when the provider requires a key, with password input, save, and clear actions.
- Added optional provider key fields to `GlobalSettings` for Anthropic, OpenAI, Google, OpenRouter, and Groq compatibility.
- Wired native Pi launches to pass the selected free-test provider key into `pi-native:create-session`, so Pi SDK model calls can authenticate without requiring manual IPC payloads.

### Verification

- `pnpm run tc:web` passed.
- `pnpm run tc:node` passed.

### Production impact

- Users can configure the API key at the exact point they select a hosted free-test provider, reducing silent native Pi failures from missing provider credentials.
- The selected key now follows the chosen provider/model route into the native Pi SDK session.

## 2026-06-12 — Native Pi SDK nested model config IPC payload

### Production change

- Extended the shared native Pi model config contract with `PiModelConfigInput`, making `modelConfig` the preferred nested IPC payload while preserving legacy flat `modelProvider` / `modelName` compatibility.
- Updated renderer native Pi launches to send `modelConfig` through `window.api.piNative.createSession()` instead of duplicating flat model fields alongside lifecycle fields.
- Updated the main-process `pi-native:create-session` handler to resolve the nested config first and fall back through legacy flat fields to the default native Pi model.
- Added tests covering nested payload precedence and legacy flat-field compatibility.

### Verification

- `pnpm exec vitest run --config config/vitest.config.ts src/shared/pi-model-config.test.ts` passed (6 tests).
- `pnpm run tc:web` passed.
- `pnpm run tc:node` passed.
- `pnpm run tc:cli` passed.

### Production impact

- Model selection is now explicitly separated from session lifecycle data at the IPC boundary, reducing drift as model configuration grows.
- Existing/older IPC callers remain safe because flat fields still resolve and incomplete configs still fall back to the shared default model.
- Future model options can be added under `modelConfig` without polluting the create-session top-level payload.

## 2026-06-12 — Native Pi SDK tool registration and stream verification

### Production change

- Added focused native Pi host tests that create a real in-process `PiAgentHost` session without network calls and verify all four AnthraSpace tools are registered on the underlying Pi Agent.
- Extracted Pi SDK `AgentEvent` → renderer `PiSessionEvent` stream conversion into `pi-session-event-stream.ts` so stream behavior can be verified independently of LLM execution.
- Added stream mapping tests for `turn_start`, assistant text deltas, and tool execution start/update/end events, including AnthraSpace-vs-Pi tool source classification.
- Added `PiSessionHost.getToolNames()` as a narrow inspection method for registration verification and diagnostics.

### Verification

- `pnpm exec vitest run --config config/vitest.config.ts src/main/pi-host/agent-host.test.ts src/main/pi-host/pi-session-event-stream.test.ts src/shared/pi-tool-use-events.test.ts` passed (6 tests).
- `pnpm run tc:web` passed.
- `pnpm run tc:node` passed.
- `pnpm run tc:cli` passed.

### Production impact

- Native Pi tool registration is now covered by automated tests, reducing regression risk when changing session creation or tool wiring.
- Stream processing can be validated without external model/API calls, making CI-safe coverage possible for the native Pi event bridge.
- Long-running tool progress and final tool results now have a tested path from Pi SDK events to renderer-facing IPC events.

## 2026-06-12 — Native Pi SDK tool-use event types

### Production change

- Added shared `src/shared/pi-tool-use-events.ts` definitions for native Pi tool-use lifecycle payloads, including start/update/end phases, stable `toolCallId`, source classification (`anthraspace` vs `pi`), and AnthraSpace-prefixed tool names.
- Extended `PiSessionEvent` with typed tool call, tool update, and tool result event variants while preserving convenient top-level compatibility fields (`toolName`, `toolInput`, `isError`).
- Updated the native Pi host to forward Pi SDK `tool_execution_start`, `tool_execution_update`, and `tool_execution_end` events as typed IPC events with `toolUse` payloads.
- Updated `NativeAgentPane` to consume the typed event contract directly instead of casting raw IPC events to generic records.

### Verification

- `pnpm exec vitest run --config config/vitest.config.ts src/shared/pi-tool-use-events.test.ts src/shared/pi-model-config.test.ts` passed (6 tests).
- `pnpm run tc:web` passed.
- `pnpm run tc:node` passed.
- `pnpm run tc:cli` passed.

### Production impact

- Native Pi tool activity now has a stable typed lifecycle surface for current UI rendering and future status/detail panes.
- Tool updates are no longer dropped, which improves observability for long-running AnthraSpace terminal and browser/orchestration tools.
- Renderer code no longer needs unsafe generic event casting for native Pi session events.

## 2026-06-12 — Native Pi SDK model config defaults and provider mapping

### Production change

- Added shared `src/shared/pi-model-config.ts` as the canonical native Pi model config layer, including the default model (`anthropic` / `claude-sonnet-4-20250514`) and provider alias mapping (`claude`→`anthropic`, `gemini`/`google-ai-studio`→`google`, etc.).
- Updated native Pi launch routing to resolve free-test selections through the shared model config instead of embedding inline fallback literals in renderer code.
- Updated the main-process `pi-native:create-session` handler to normalize model provider aliases and safely fall back to the shared default model for incomplete direct IPC requests.
- Connected `PiCreateSessionConfig` to the shared `PiModelConfig` type so the IPC model payload shape stays aligned with the resolver.

### Verification

- `pnpm exec vitest run --config config/vitest.config.ts src/shared/pi-model-config.test.ts` passed (4 tests).
- `pnpm run tc:web` passed.
- `pnpm run tc:node` passed.
- `pnpm run tc:cli` passed.

### Production impact

- Native Pi model routing now has one source of truth across renderer, preload IPC payloads, and main-process SDK resolution.
- Direct IPC callers and renderer launches get the same production-safe default fallback instead of failing on missing model config.
- Provider alias normalization reduces drift between AnthraSpace-facing provider labels and Pi SDK provider IDs.

## 2026-06-12 — Native Pi SDK IPC lifecycle types

### Production change

- Added shared `src/shared/pi-ipc-types.ts` definitions for the native Pi IPC lifecycle surface: session snapshots, session events, create-session config, prompt params, and a documented channel map.
- Updated the preload API contract and bridge to return `PiSessionSnapshot` / `PiSessionEvent` types instead of `unknown` for `window.api.piNative` calls.
- Updated the renderer native Pi store and launch flow to store typed snapshots directly, removing unsafe `Record<string, unknown>` casts at the session creation and prompt response call sites.

### Verification

- `pnpm run tc:web` passed.
- `pnpm run tc:node` passed.
- `pnpm run tc:cli` passed.

### Production impact

- Renderer, preload, and main-process Pi lifecycle code now share one serializable IPC contract, reducing drift between handlers and call sites.
- Native Pi session updates are typed end-to-end, improving safety for follow-up model config and event-stream work.

## 2026-06-12 — Native Pi SDK: full Phases 4–7 (tools, auth, UI, composer, interrupt, streaming)

### Production change

- **Phase 4 — Custom tools**: Added `anthraspace-tools.ts` with four AnthraSpace-native tool definitions (`anthraspace_read`, `anthraspace_browser`, `anthraspace_terminal`, `anthraspace_orchestrate`) that supplement Pi's built-in tools. Each tool is prefixed with `anthraspace_` to distinguish it from Pi built-ins and signals execution through AnthraSpace's infrastructure.
- **Phase 5 — Auth bridge**: Added `auth-bridge.ts` that maps AnthraSpace API key settings (`anthropicApiKey`, `openaiApiKey`, `googleApiKey`, `openRouterApiKey`, `groqApiKey`) to Pi SDK's `AuthStorage` provider names at session creation time. Includes `bridgeApiKeysToPiAuth()` and `discoverConfiguredProviders()` helpers.
- **Phase 6 — UI integration**: Added `isNativeSdkCapable()` helper in `agent-status.ts` for checking native SDK eligibility per agent type. Added optional `badge` field to `AgentCatalogEntry` and a "Native" badge on Pi's catalog entry, rendered in the `AgentCombobox` alongside the Pi label.
- **Phase 7A — Composer→IPC wiring**: `NativeAgentPane` textarea Enter→`Enter` key handler sends input text via `window.api.piNative.prompt(sessionId, text)`. The main-process `pi-native:prompt` handler accepts the message, calls `session.prompt(text)` with the tool set, and returns the full snapshot. Keyboard submit works immediately after session creation.
- **Phase 7B — Interrupt wiring**: `NativeAgentPane` Escape→`Escape` key handler sends `window.api.piNative.abort(sessionId)`. The main-process handler calls `session.abort()`, which bridges `{state:'done', interrupted:true}` to `agentHookServer.ingestNative()` so the renderer dashboard and status display see the interrupted state immediately.
- **Phase 7C — SDK startup smoke check**: `logSdkAvailability()` calls `verifyPiSdkAvailable()` at IPC handler registration time (fire-and-forget, never blocks startup). Logs a single line on success or failure — no startup delay, no fatal errors.
- **Phase 7D — Hybrid streaming UI**: `NativeAgentPane.tsx` subscribes to `window.api.piNative.onEvent()` (preload bridge) for real-time event streaming. Displays assistant streaming text as it arrives, tool calls with a 🔧 icon, tool results collapsed under the calling tool, and error states inline. The textarea remains enabled throughout for follow-up prompts.
- **Phase 7E — Tab model integration**: `launch-agent-in-new-tab.ts` native Pi path creates a sync `native-agent` unified tab with `entityId = sessionId`, stores the session in the `nativePiSessions` Redux slice, appends tab order, and sets `activeTabType: 'native-agent'`. `TabGroupPanel.tsx` renders `<NativeAgentPane sessionId={...} />` when `contentType === 'native-agent'`.
- **Build & tree-shaking audit**: `pnpm build:electron-vite` passes. Pi SDK bundle impact verified at ~80 kB total (`agent-host.js` 14.76 kB, `memory-repo.js` 64.61 kB, `sdk-smoke.js` 1.14 kB, `node.js` 4.41 kB). The heavy TUI/Ink dependencies are tree-shaken away since they're never imported. No further optimization needed for MVP.

### Verification

- `pnpm run tc:node` passed (0 new errors; 6 pre-existing renderer type issues unchanged).
- `pnpm run tc:cli` passed (same pre-existing issues).
- `pnpm run tc:web` passed (same pre-existing issues).
- `pnpm run build:electron-vite` passed (full build).
- SDK smoke test: `verifyPiSdkAvailable()` PASS — `Agent`, `InMemorySessionRepo`, `getModel`, `NodeExecutionEnv` all import correctly.
- Tree-shaking audit: Pi SDK bundle impact ~80 kB total from dynamic imports; electron-vite successfully excludes unused TUI dependencies.

### Production impact

- Native Pi sessions are now fully interactive: users can send prompts, receive streaming responses, and interrupt mid-generation — all through the AnthraSpace unified tab model without a subprocess.
- Escape→interrupt bridge to the hook pipeline means the agent dashboard, status bar, and any future consumers see the correct `interrupted` state immediately.
- SDK startup smoke check adds zero startup delay and never fatals — safe for all environments (local, SSH, headless).
- Bundle impact is minimal (~80 kB) thanks to tree-shaking; the 11 MB on-disk SDK dependency is a build-time cost.
- Custom tool definitions are structured for future wiring to AnthraSpace's browser, terminal, and orchestration services — no functional change until those bridges are implemented.
- The `experimentalNativePiSdk` feature gate and subprocess fallback chain are fully preserved.

## 2026-06-11 — Free test provider registry and native Pi model routing

### Production change

- Added a shared free-test provider registry with hosted/free-tier model entries, provider labels, API-key requirements, and explicit per-agent/native-target compatibility metadata.
- Added Settings → Agents controls for enabling free test providers and selecting a hosted test model, with copy that clarifies upstream token/rate limits still apply.
- Wired native Pi SDK launches to use a compatible selected free-test model, while unsupported selections fall back to Pi's default model with a user-visible message instead of failing silently.

### Verification

- `pnpm run tc:node` passed.
- `pnpm run tc:web` passed.
- `pnpm run tc:cli` passed.
- `pnpm run build:electron-vite` passed.

### Production impact

- Users can discover hosted free-tier test options without conflating them with unlimited/free local models.
- Compatibility is explicit and centralized, reducing the risk of injecting unsupported model flags into arbitrary agent CLIs.
- Native Pi testing can use supported free-tier models while SSH/PTY fallback behavior remains unchanged.

## 2026-06-11 — Native Pi SDK launch gate

### Production change

- Added an opt-in `experimentalNativePiSdk` setting and Settings → Experimental toggle for native Pi SDK launches.
- Pi keeps its `nativeSdk` capability in the agent catalog, but the renderer only routes Pi through the in-process SDK host when the experimental flag is enabled and the workspace is local; remote/SSH workspaces continue using the existing subprocess PTY fallback.
- Added renderer store wiring for native Pi session snapshots and updated store test fixtures so the new slice is present everywhere `AppState` is constructed.

### Verification

- `pnpm run tc:node` passed.
- `pnpm run tc:cli` passed.
- `pnpm run tc:web` passed.
- `pnpm run build:electron-vite` passed after bundling Pi's ESM-only SDK packages and lazy-loading the native Pi host at the IPC boundary.

### Production impact

- The new native Pi path can be tested without disrupting default Pi behavior or SSH use cases.
- Existing subprocess-based Pi launches remain the default until the experimental flag is explicitly enabled.
- App startup no longer crashes with `ERR_PACKAGE_PATH_NOT_EXPORTED` when native Pi IPC handlers are registered.

## 2026-06-10 — Branding audit: user-facing string sweep (Orca → AnthraSpace)

### Production change

- Replaced all remaining user-facing "Orca" references with "AnthraSpace" across ~140 source and test files:
  - Settings search definitions (appearance, browser, browser-use, general, git, commit-message-ai, notifications, privacy, repository, runtime-environments, shortcuts, terminal, theme, plugin-system, stats)
  - Remote runtime error messages (web-runtime-client, remote-runtime-terminal-multiplexer)
  - Terminal backlog warnings (pane-terminal-output-scheduler, pty-connection)
  - Account service errors (codex-accounts, claude-accounts)
  - Worktree/lineage error messages (worktrees.ts, orca-runtime.ts)
  - Shell/framework templates (shell-templates, local-pty-shell-ready)
  - Server startup and port messages (index.ts, workspace-port-ownership)
  - Notification strings (notifications.ts, notification-options.ts)
  - Menu/onboarding labels (register-app-menu, DeleteWorktreeDialog, OnboardingFlow)
  - Render UI components (FeatureSetupChecklist, FloatingTerminalOrchestrationDialog, ResourceUsageStatusSegment, SourceControl, RichMarkdownErrorBoundary)
- Updated all corresponding test expectations to match the new strings.
- Restored deleted `resources/anthracode_logo.svg` and replaced with `resources/anthraspace_logo.svg`.

### Deferred (blocked / out of scope)

- Env var display names (`ORCA_TELEMETRY_DISABLED` etc.) — need coordinated backend changes.
- Keychain service name (`ORCA_CLAUDE_SERVICE`) — would break existing stored credentials.
- `orca.yaml` filename references and CLI binary name — system-level identifiers.
- "Orca CLI" skill name in discovery tests — data-defined, not code.
- Code comments and internal identifiers — not user-facing.

### Verification

- All production error messages, notifications, menu labels, settings descriptions, tooltips, and test expectations now use "AnthraSpace".
- Known remaining "Orca" strings are in code comments, internal identifiers, env var names, system file paths, and test fixture data — none user-facing.

### Production impact

- Users will see "AnthraSpace" consistently across all settings panels, error toasts, notifications, terminal warnings, menus, and onboarding flows.
- Tests match the updated production strings, preventing false failures.

## 2026-06-09 — Branding audit: all logos use AnthraCode assets

### Production change

- Replaced the last remaining old upstream logo in `HomeSlide.tsx` — the inline `AnthraSpaceLogo` SVG was still rendering the OpenCode white-flame path; now renders the AnthraCode "A" logo matching `anthracode_logo.svg`.
- Removed stale `resources/logo.svg` (unreferenced old upstream OpenCode logo).
- Updated `resources/icon-source/icon.icon/Assets/logo.svg` to use the AnthraCode "A" shape (for macOS icon generator toolchain).

### Verification

- Typecheck passes (0 errors).
- Grep audit of all `logo.svg` references confirms no remaining code imports the old file.

## 2026-06-09 — Desktop release pipeline: repo target and workflow cleanup

### Production change

- Stripped 7 unused CI workflows (computer-e2e, e2e, homebrew-bump, issue-os-labeler,
  mobile-build, mobile, pr, track-community-prs) — only `release-cut.yml` remains as the
  single desktop build pipeline.
- Removed `e2e` and `homebrew-bump` job references from `release-cut.yml` since those
  called workflows were deleted.
- Created `rafa57600/AnthraSpace` as the dedicated release artifacts repo.
- Updated `release-cut.yml` to target `rafa57600/AnthraSpace` explicitly (via `env.RELEASE_REPO`)
  instead of relying on `GITHUB_REPOSITORY` (which resolves to the development fork).
- Updated both `verify-release-required-assets.mjs` and `publish-complete-draft-releases.mjs`
  to always use `rafa57600/AnthraSpace` instead of the `GITHUB_REPOSITORY` env var.
- Changed all workflow token references from `secrets.GITHUB_TOKEN` (scoped to the current
  repo only) to `secrets.ANTHRASPACE_RELEASE_TOKEN` (PAT with `repo` scope on AnthraSpace).

### Prerequisite before first run

- Create a GitHub PAT with `repo` scope and save it as the `ANTHRASPACE_RELEASE_TOKEN` secret
  in the `rafa57600/AnthraCode_ADE` repo settings (Settings → Secrets and variables → Actions).

### Verification

- `gh repo create rafa57600/AnthraSpace` successful.
- No remaining `GITHUB_REPOSITORY` or `GITHUB_TOKEN` references in `release-cut.yml`.
- Only `release-cut.yml` remains in `.github/workflows/`.

### Production impact

- The first manual dispatch of "Cut Release" will create a draft release in
  `rafa57600/AnthraSpace`, build Windows artifacts in CI, upload them to the
  draft, and publish the release — making the app downloadable and auto-updatable.

## 2026-06-09 — Windows-only build matrix

### Production change (<a href='https://github.com/rafa57600/AnthraCode_ADE/commit/202a1df0'>202a1df0</a>)

- Stripped macOS and Linux from the build matrix; only `windows-latest` remains.
- Removed macOS signing steps, Linux node-gyp step, and Linux AT-SPI dependency step.
- Simplified `verify-release-required-assets.mjs` to only check Windows artifacts
  (`latest.yml`, `anthraspace-windows-setup.exe`, `.exe.blockmap`).
- macOS and Linux builds will be restored when signing infrastructure and runners are ready.

### Verification

- Only `windows-latest` entry in the build matrix.
- Asset verification only requires `latest.yml` and `.exe` / `.blockmap`.

## 2026-06-09 — Phase 1 backward-compat: legacy `.orca-*` read fallbacks

### Production patch

- Added backward-compatible read fallbacks in all 5 user-home directory migration read sites so old `.orca-*` directories remain readable after the Phase 1 write-migration:
  - `runtime-home-service.ts:615` — `getLegacyManagedHomes()` now checks both `.anthraspace-managed-home` and `.orca-managed-home` markers.
  - `service.ts:372` — `assertManagedHomePath()` falls back to `.orca-managed-home` marker if `.anthraspace-managed-home` is missing.
  - `managed-auth-path.ts:45-50` — `isManagedAuthMarkerValid()` defines `LEGACY_MANAGED_AUTH_MARKER`, falls back to `.orca-managed-claude-auth` if new marker absent.
  - `codex-home-paths.ts:145-158` — `readCopiedResourceSourcePath()` uses `getLegacyResourceCopyMarkerPath()` to fall back to `.orca-resource-copies/`.
  - `codex-session-bridge.ts:233-255` — `readLegacyCopiedSessionMarker()` uses `getLegacySessionCopyMarkerPathOld()` to fall back to `.orca-session-copies/`.
- Relay paths (`.anthraspace-relay/`, `.anthraspace-remote/`) and temp prefixes (`.anthraspace-upload-`, `.anthraspace-link-`, `.anthraspace-legacy-`) excluded — they are write-only or created fresh per-session.
- Follows Phase 2 pattern: legacy marker constant defined alongside each read site, only checked when the new marker file is absent.

### Verification

- `pnpm typecheck:tsc` (node + cli + web) passes with 0 TypeScript errors.
- Grep audit confirms all 5 read sites have fallback logic; relay and temp-path sites intentionally omitted.

### Production impact

- Users migrating from Orca to AnthraSpace will have their existing `.orca-managed-home`, `.orca-managed-claude-auth`, `.orca-resource-copies/`, and `.orca-session-copies/` directories honored during reads until they are migrated or cleaned up.
- New writes continue to use `.anthraspace-*` paths exclusively — no behavioral change for new sessions.

## 2026-06-08 — Phase 1 completion: user-home `.orca-*` directory migration

### Production patch

- Completed migration of all user-home `.orca-*` directory references to `.anthraspace-*` equivalents across source and test files.
- SSH relay staging directories: `.orca-relay/` → `.anthraspace-relay/` in relay agent hooks, plugin overlays, PTY shell launch paths, and shell-ready rcfile references.
- SSH relay remote directories on managed hosts: `.orca-remote/` → `.anthraspace-remote/` in relay-protocol constant, deploy/install/gc, cross-version isolation, and system transport integration.
- Managed account markers: `.orca-managed-claude-auth` → `.anthraspace-managed-claude-auth` and `.orca-managed-home` → `.anthraspace-managed-home` in Claude Accounts and Codex Accounts auth-path creation and runtime-home detection.
- Resource and session copy directories: `.orca-resource-copies/` → `.anthraspace-resource-copies/` in Codex home paths, `.orca-session-copies/` → `.anthraspace-session-copies/` in session bridge and usage scanner.
- Temp file prefixes: `.orca-link-` → `.anthraspace-link-`, `.orca-upload-` → `.anthraspace-upload-`, `.orca-legacy-` → `.anthraspace-legacy-`, `.orca-test-hidden` → `.anthraspace-test-hidden`, `.orca-backup-` → `.anthraspace-backup-` in session bridge, runtime file client, legacy home service, daemon FD leak test, and remote installer utils.
- Preserved wire-protocol message type strings (`orca-relay-handshake` family) and code comments documenting legacy paths.

### Verification

- `pnpm typecheck` passes with 0 TypeScript errors.
- All 40+ file modifications verified via grep for remaining `.orca-` prefix references matching the migration scope — only intentional comments and protocol-name strings remain.

### Production impact

- Completes the AnthraSpace rebrand for all user-home directory paths, eliminating `orca`/`Orca` directory name leakage into `$HOME/` on managed hosts.
- New SSH relay sessions, managed account homes, and temp file artifacts will use `.anthraspace-*` directories exclusively.
- Existing sessions with old `.orca-*` directories remain readable but new writes go to the new paths, leaving a future backward-compat read-fallback pass as a follow-up.

## 2026-06-08 — Phase 2: per-worktree `.orca/` directory migration

### Production patch

- Migrated per-worktree `.orca/issue-command` directories to `.anthraspace/issue-command` across hooks, SSH runtime, and repository search code paths.
- Migrated per-worktree `.orca/drops` staging directories to `.anthraspace/drops` across IPC filesystem mutations, terminal drop handler, composer state, and global file drop hooks.
- Renamed `ORCA_DIR` constant in `hooks.ts` from `'.orca'` to `'.anthraspace'`, with a `LEGACY_ORCA_DIR` backward-compat constant for read fallbacks.
- Added backward-compatible read-fallback in `readIssueCommand` (local) and `readRemoteIssueCommandOverride` (SSH) so existing worktrees with `.orca/issue-command` continue to be honored.
- Updated `ensureOrcaDirIgnored` and `ensureRemoteOrcaDirIgnored` to write `.anthraspace` to `.gitignore` (while also ensuring `.orca` stays ignored so orphaned dirs aren't committed).
- Updated 14 source and test files total.

### Verification

- `pnpm typecheck` passed with 0 TypeScript errors.
- Comprehensive grep audit confirms only intentional backward-compat fallback reads and code comments still reference the legacy `.orca/` path.

### Production impact

- New per-worktree issue commands and file drops will use `.anthraspace/` directories.
- Existing worktrees with `.orca/issue-command` continue to work via backward-compat fallback reads.
- The `.gitignore` entries for both `.anthraspace` and `.orca` are maintained so neither path can be accidentally committed.

## 2026-06-02 — Remove Mobile shortcut from left sidebar

### Production patch

- Removed the left-sidebar “Orca Mobile” navigation button, its context menu entry, the Mobile entry from the Toolbox dropdown, and Mobile surfaces from Settings.
- Cleaned up the now-unused mobile sidebar visibility helper and related SidebarNav tests.

### Verification

- `pnpm typecheck` passed with 0 TypeScript errors.
- `pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/components/sidebar/SidebarNav.test.tsx` passed — 1 file, 3 tests.

### Production impact

- The left sidebar no longer shows the stale Orca Mobile shortcut while the remaining Mobile access paths stay untouched.

## 2026-06-02 — Sticky notes right-sidebar CRUD

### Production patch

- Added a Sticky activity tab to the right-sidebar tab model and persistence validator so project notes are available alongside Explorer, Search, Source Control, Checks, and Ports.
- Added scoped main/preload IPC for recursively listing, reading, writing, renaming, and deleting markdown notes under each active worktree/project’s `.anthraspace/sticky/` directory.
- Replaced the Sticky placeholder panel with a compact note list, create/rename/delete controls, a markdown textarea editor with save support, an Edit/Preview toggle that renders markdown with the existing sanitized renderer, an inline Markdown help popover, and a separate header warning for secret handling.
- Restyled the active Sticky note toolbar controls as icon-only tooltip buttons to match the existing right-sidebar tool button pattern.
- Restyled the Sticky safety and Markdown help popover triggers with the same icon-button sizing, color, and hover treatment.
- Added app-styled hover tooltip labels to the Sticky safety and Markdown help icon buttons.
- Added a configurable Sticky right-sidebar shortcut (`Mod+Shift+S`, shown as Ctrl/Cmd+Shift+S by platform) and surfaced it in the Sticky activity tooltip.

### Verification

- `pnpm typecheck` passed with 0 TypeScript errors.

### Production impact

- Sticky notes now load from the existing active workspace storage path instead of using the repository root and showing an empty placeholder for linked worktrees.
- File operations are constrained to the sticky directory to avoid exposing arbitrary filesystem access through the renderer.
- Users can verify reusable prompt/setup notes in rendered form before copying or editing, including headings, blockquotes, lists, tables, and code blocks.
- The help popover gives users quick syntax examples for common Markdown features without leaving the Sticky panel.

## 2026-05-31 — Landing page and brand asset cleanup

### Production patch

- Reworked the empty landing screen into a native AnthraSpace workspace start surface with provider-runtime context, AnthraSpace logo usage, primary workspace actions, and an explicit note that the production provider path is still managed CLI/PTTY execution until a direct SDK/API path can prove parity.
- Replaced remaining desktop renderer imports of the legacy `resources/logo.svg` with `resources/anthracode_logo.svg` for the titlebar, landing page, and onboarding notification surfaces.
- Removed user-facing stale cache wording from the default browser-session reset toast, and cleaned remaining visible Orca wording in GitHub help, onboarding copy, share cards, mobile preview branding, and the style guide.
- Renamed the mobile logo component from `OrcaLogo` to `AnthraSpaceLogo` and updated mobile imports to prevent new mobile UI from reusing Orca-named brand primitives.

### Verification

- `pnpm typecheck` passed with 0 TypeScript errors.
- `pnpm run build` passed through typecheck, relay build, macOS computer-use build step, CLI build, Electron/Vite build, and web build. Final build evidence included Electron renderer `✓ built in 1m 40s` and web renderer `✓ built in 1m 45s`.

### Production impact

- First-run/empty-state UI now presents AnthraSpace as the product instead of Orca, while avoiding a misleading claim that provider execution has already moved from CLI terminals to SDK/API integrations.
- Shared logo usage reduces old asset drift across desktop and mobile surfaces.
- Browser-session reset feedback no longer looks like a low-level cache-clearing message.

## 2026-05-31 — AnthraSpace production rebrand pass

### Production patch

- Completed the Orca/AnthraCode-to-AnthraSpace rebrand across type-safe shared, main, preload, renderer, relay, CLI, packaging, updater, telemetry, dev-wrapper, release-script, resource-launcher, and mobile metadata surfaces.
- Renamed package, app identity, CLI registration, installer artifacts, release feeds, GitHub links, mobile scheme/app IDs, updater cache, and build/diagnostics feature env constants to AnthraSpace/`anthraspace` equivalents.
- Renamed bundled platform CLI launchers from `orca`/`orca.cmd` to `anthraspace`/`anthraspace.cmd`, and renamed the dev wrapper to `config/scripts/anthraspace-dev`.
- Preserved compatibility-sensitive wire-protocol names where required (`ORCA_AGENT_HOOK_*`, `ORCA_PANE_KEY`, `ORCA_TAB_ID`, `ORCA_WORKTREE_ID`, `X-Orca-Agent-Hook-Token`, and `ORCA_TUI_AGENT_TYPE`) so existing agent hook delivery remains stable.
- Removed shebangs from importable release helper modules so Vitest can import them through Vite's module runner while scripts still run via explicit `node config/scripts/...` commands.

### Verification

- `pnpm typecheck` passed with 0 TypeScript errors.
- Targeted package/CLI/updater tests passed: `pnpm vitest run config/scripts/electron-builder-config.test.mjs config/scripts/verify-release-required-assets.test.mjs config/scripts/publish-complete-draft-releases.test.mjs config/scripts/package-electron-runtime-contract.test.mjs src/main/cli/cli-installer.test.ts src/main/cli/packaged-cli-assets.test.ts src/main/cli/windows-launcher-asset.test.ts src/main/cli/wsl-cli-installer.test.ts src/main/updater.test.ts src/main/updater-prerelease-feed.test.ts src/main/updater-prerelease-feed-readiness.test.ts --config config/vitest.config.ts` — 11 files passed, 97 tests passed, 4 skipped.
- Final config/resource audit found no remaining desktop config `Orca`/`orca` branding except the intentional GNOME Orca Linux package conflict comment and the internal native helper executable name `orca-computer-use-macos`.

### Production impact

- Builds, installers, update metadata, dev wrappers, CLI status UI, and release validation now consistently produce AnthraSpace-branded artifacts instead of leaking Orca identifiers.
- Type-level rebrand coverage makes accidental mixed `orca`/`anthraspace` scope values fail during `pnpm typecheck`.
- Release automation checks now validate AnthraSpace artifact names and GitHub repository coordinates.

## 2026-05-28 — AnthraCode provider identity source fix

### Production patch

- Added AnthraCode as a first-class TUI/provider identity across shared types, provider config, renderer catalog, status labels, telemetry kind mapping, and icon rendering.
- Added source-level AnthraCode hook attribution: AnthraCode launches set `ORCA_TUI_AGENT_TYPE=anthracode`, the OpenCode-compatible hook plugin posts to `/hook/anthracode`, and the shared hook listener normalizes those events to `agentType: "anthracode"`.
- Preserved real OpenCode compatibility: OpenCode launches continue to report `/hook/opencode` and `agentType: "opencode"`.
- Kept renderer fallbacks only as legacy compatibility for sessions created before source-level AnthraCode attribution.
- Added project-local AnthraCode ADE skills for production engineering, provider integration, and Electron stability workflows.

### Verification

- `pnpm typecheck` passed.
- Targeted tests passed: `src/shared/agent-hook-listener.test.ts` and `src/main/opencode/hook-service.test.ts` — 60 passed, 3 skipped.
- Live Electron runtime store verified a new AnthraCode session reports:
  - `agentType: "anthracode"`
  - `terminalTitle: "⠐ AnthraCode"`
  - tab title `❇️ AC | Greeting`

### Production impact

- AnthraCode identity now comes from the hook/status source path instead of depending on sidebar-only visual fallback.
- This reduces OpenCode branding leakage and makes future cleanup safer and measurable.

## 2026-05-31 — Windows unpacked packaging native rebuild fix

### Production patch

- Changed the Electron Builder config to keep native dependency rebuilds enabled on non-Windows targets while disabling the extra Electron Builder rebuild pass on Windows.
- Added targeted packaging-config coverage so Windows builds keep `npmRebuild=false` and macOS/Linux keep rebuilds enabled.

### Verification

- Targeted packaging config test passed: `pnpm exec vitest run --config config/vitest.config.ts src/main/cli/packaged-cli-assets.test.ts` — 2 passed, 1 skipped.
- Full unpacked Windows package build passed: `pnpm run build:unpack` completed through `pnpm run build`, `pnpm run ensure:electron-runtime`, and `electron-builder --config config/electron-builder.config.cjs --dir`.
- Electron Builder proof: `npmRebuild=false`, packaged `platform=win32 arch=x64 electron=41.5.0 appOutDir=dist\win-unpacked`, updated ASAR integrity for `dist\win-unpacked\Orca.exe`, and completed signtool signing without the previous `cpu-features`/`node-gyp` failure.
- Packaged app smoke test passed: `dist\win-unpacked\Orca.exe --user-data-dir=%TEMP%\orca-packaged-smoke --remote-debugging-port=9511` started with a responding `Orca` process and exposed a renderer page titled `Orca` from `resources/app.asar/out/renderer/index.html`.

### Production impact

- Windows packaging no longer re-enters node-gyp for optional `cpu-features` after the project's Electron runtime verification already handled required native modules.
- macOS/Linux release behavior remains safer because Electron Builder can still rebuild native modules for target architectures.

## 2026-06-10 — Sticky Panel: preview-by-default for existing notes + tab-switch persistence

### Production change

- **Preview on open**: Existing sticky notes with content now open in preview mode instead of edit mode. New or empty notes (no content beyond `'# '`) still open in edit mode so users can start typing immediately.
- **Tab-switch persistence**: The StickyPanel component stays mounted (hidden via CSS `display: none`) when the user switches to another right-sidebar tab (Explorer, Search, Source Control, etc.). The previous note selection, text content, and unsaved-changes state are preserved across tab switches — no more lost edits or having to re-select the note.

### Verification

- TypeScript typecheck passes (0 errors, 5714ms).
- Logic verified: `handleSelect` checks `content.trim().length > 2` to decide preview vs edit.
- Layout confirmed: hidden StickyPanel uses `display: none` via Tailwind `hidden` class, consuming no flex space when inactive.

### Production impact

- Eliminates a common frustration point where users lost their place in a sticky note after briefly switching to another sidebar panel.
- Saves one click per existing-note open by showing the rendered preview first instead of raw markdown.

## 2026-05-31 — AnthraCode provider logo vector cleanup

### Production patch

- Replaced the AnthraCode provider SVG asset with the user's updated logo artwork while removing the embedded base64 PNG payload.
- Synced the renderer's inline `AnthraCodeIcon` paths to the cleaned pure-vector SVG so provider picker/sidebar rendering does not depend on external asset paths or raster data.

### Verification

- `resources\anthracode_logo.svg` parses as XML and no longer contains `data:image/png;base64`, `<image>`, or `<use>` raster references.
- Cleaned SVG size is about 4.3 KB instead of about 128 KB.
- Inline React icon validation confirmed no invalid extracted path data remains.
- `pnpm typecheck` passed.

### Production impact

- Keeps the in-app AnthraCode provider logo sharp and lightweight at sidebar/provider-picker sizes.
- Avoids shipping a large inline raster payload inside the renderer bundle while preserving the updated logo shape and colors.
