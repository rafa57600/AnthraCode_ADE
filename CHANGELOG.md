# Changelog

Production-ready changes must be recorded here after implementation and verification.

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
