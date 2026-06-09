# Changelog

Production-ready changes must be recorded here after implementation and verification.

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
