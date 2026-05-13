# Window-wide UI lag during agent activity (clicks, typing, scroll)

## Symptom

While an agent (most prominently Codex) is mid-turn, every interaction
in the Orca window stalls for ~750 ms. Clicks, focus changes,
scrolling, and keystroke echo all delay together. The renderer
console emits chains like:

```
[Violation] 'pointerdown' handler took 758ms
[Violation] 'focusin' handler took 196ms
[Violation] 'setTimeout' handler took 347ms
[Violation] Handling of 'wheel' input event was delayed for 325ms
   due to main thread being busy.
```

The lag is binary — sub-1 ms when the window is quiet, ~750 ms once
the agent starts a turn — and is workspace-shaped: workspaces with
many accumulated terminal tabs feel slower because the cost scales
with `tabsByWorktree` / `terminalLayoutsByTabId` /
`runtimePaneTitlesByTabId` total entry count.

The simplest reproduction is *not* typing. It is clicking. With a
Codex agent in `working` state, every mouse-down on any surface in
the window pays the full cost.

## Root cause

`src/renderer/src/App.tsx:435-459` registers a Zustand subscriber
that calls `getRuntimeMobileSessionSyncKey(state)` whenever any of
ten "mobile-relevant" fields changes by reference. The previous
implementation of that function at
`src/renderer/src/runtime/sync-runtime-graph.ts:96` did:

```ts
return JSON.stringify({
  // … per-tab projections …
  terminalLayoutsByTabId: state.terminalLayoutsByTabId,
  runtimePaneTitlesByTabId: state.runtimePaneTitlesByTabId,
  // …
})
```

Both `terminalLayoutsByTabId` and `runtimePaneTitlesByTabId` are
maps that accumulate over the lifetime of the workspace — one entry
per terminal tab the user has ever opened. In a workspace with
hundreds of accumulated tabs the serialized blob is large enough
that `JSON.stringify` of it took **~190 ms per call** in the
captured trace.

Worse, the subscriber fires **multiple times per click**:

1. xterm `focus` event → store mutation A
2. `setActivePane` → `onActivePaneChange` → `updateTabTitle` →
   reallocates `tabsByWorktree` (mutation B)
3. associated focus / blur fanout → mutations C, D

Each mutation passes the relevant-fields gate (because
`tabsByWorktree` reallocated) and pays for one full key build. A
captured DevTools Performance trace at workspace size ~409 worktrees
showed:

| metric | value |
|---|---|
| longtasks during a 148 s "test" turn | 141 |
| total blocked main-thread time | 57.6 s |
| max longtask | 773 ms |
| per-pointerdown self-time inside `getRuntimeMobileSessionSyncKey` | ~95 % |
| key builds per pointerdown | 4 |

Total-time stack of every long pointerdown:

```
└ pointerdown
↑ dispatchEventForPluginEventSystem
↑ setState (zustand commit)
↑ subscribe callback
↑ getRuntimeMobileSessionSyncKey
↑ JSON.stringify(terminalLayoutsByTabId + runtimePaneTitlesByTabId + …)
```

## Why the older "ruled out" hypothesis was wrong

The earlier version of this doc proposed Hypothesis A: per-status-ping
fanout in `setAgentStatus` was driving the cost. A synthetic CDP
repro that drove `setAgentStatus` directly produced **zero
longtasks** at 10× realistic ping rates. The hypothesis was correctly
discarded — that path is genuinely cheap.

What the synthetic repro missed is that the dominant subscriber is
*not* on `agentStatusEpoch` at all. It is on the
`tabsByWorktree`/`activeTabId`/etc. axis, fired by user input.
Status pings don't touch those fields. Clicks, focus events, and
title syncs do. The real-world repro ("send `test` to Codex, click
anywhere") fires the click handler that hits the slow path; the
synthetic repro never simulated a click.

The session-write debounce shipped in
`bf1e925a perf(session): gate session-write subscriber on relevant
field changes` (#1720) is correct and has the same shape as the fix
needed here, but it gates a *different* subscriber. That earlier
work is why this doc's title still talks about "typing lag" — the
typing-pane symptom was downstream of the same kind of
window-wide main-thread saturation, not a typing-specific problem.

## What was ruled out

Per a prior subagent investigation, all of the following remain
correctly excluded:

- **Hidden background panes still rendering** —
  `pane-terminal-output-scheduler.ts:155-187` gates background-pane
  writes through `MAX_WRITES_PER_DRAIN = 2`.
- **Periodic buffer serialization** — `App.tsx:459-469` documents
  why the 3-min interval was removed. `pty-buffer-serializer.ts`
  runs only on demand from main.
- **xterm renderer choice** — `pane-webgl-renderer.ts:72` uses
  `WebglAddon` for typical content.
- **Bell detector / OSC52 / link handlers** — single linear pass,
  no allocation; OSC 52 only fires from xterm's OSC dispatch.
- **TerminalPane unmount-on-switch** — panes keep mounting under a
  `hidden` class; xterm instances persist (intended).
- **Direct React `setState` in `onData`** —
  `pty-connection.ts:609 dataCallback` does no `setState`.
- **Per-status-ping store fanout** — refuted by the synthetic CDP
  repro at line cohort tagged "Hypothesis A" in earlier revisions
  of this doc. Zero longtasks under 10× realistic agent traffic.

## Reproduction

### In a packaged build (the only env that reproduces)

`window.__store` is gated on `import.meta.env.DEV ||
e2eConfig.exposeStore` (`src/renderer/src/store/index.ts:59`), so
the rich console probe with `agentStatusEpoch` subscription only
works in dev or with `VITE_EXPOSE_STORE`. In any prod renderer
console, the longtask probe alone is enough:

```js
window.__lagProbe = { lt: [], t0: performance.now() }
new PerformanceObserver(l => l.getEntries().forEach(e => e.duration > 50 &&
  window.__lagProbe.lt.push({ t: Math.round(e.startTime - window.__lagProbe.t0), d: Math.round(e.duration), name: e.name })))
  .observe({ entryTypes: ['longtask'] })
```

Then send `test` to a Codex agent, wait for the reply, and:

```js
const p = window.__lagProbe
JSON.stringify({
  elapsedMs: Math.round(performance.now() - p.t0),
  longtasks: p.lt.length,
  longtaskMax: p.lt.reduce((a, b) => Math.max(a, b.d), 0),
  longtaskTotal: p.lt.reduce((a, b) => a + b.d, 0),
  topLongtasks: [...p.lt].sort((a, b) => b.d - a.d).slice(0, 10)
}, null, 2)
```

In a workspace with hundreds of tabs accumulated this returns
~100+ longtasks with `longtaskMax > 700ms`.

### What the dev build reproduces

The dev build does **not** reproduce the lag. `src/renderer/src/store/index.ts:60`
exposes `window.__store` only in dev, but the lag scales with
accumulated tab state, which a freshly-launched dev workspace does
not have. A 4-pane / 2-tab dev session showed zero longtasks during
the same Codex "test" flow, while a packaged build with 409
worktrees showed 141 longtasks totaling 57.6 s of blocked main
thread over a 148 s capture.

The disambiguator is therefore **prod with accumulated state**, not
dev. The synthetic CDP repro that drives `setAgentStatus` directly
does not reproduce because the relevant cost is on the click /
focus path, not the status-ping path.

### Profiling step

DevTools → Performance → Record → send `test` to Codex → stop after
the reply renders → save trace → bottom-up by total time.

If the top entries are inside `getRuntimeMobileSessionSyncKey` with
`JSON.stringify` of large maps as the leaf, the path is the one
captured here.

## Fix

Two-part fix in this branch:

1. `getRuntimeMobileSessionSyncKey` no longer stringifies the large
   accumulating maps. It returns a structured object that compares
   `terminalLayoutsByTabId` and `runtimePaneTitlesByTabId` by
   reference. Those maps reallocate on real changes (split / pane
   added / pane title updated) and remain reference-stable
   otherwise, so reference equality is sufficient. Smaller derived
   shapes (`tabsByWorktree` projection, `openFiles` projection,
   `editorDrafts` hashes) are still pre-serialized once per call.

2. The relevant-fields gate at `App.tsx:438-450` now also bails
   when both `terminalLayoutsByTabId` and
   `runtimePaneTitlesByTabId` are reference-stable. This catches
   the layout-only mutators (`setTabLayout`, `setPaneRuntimeTitle`,
   etc.) that previously fell through to a full key build, and
   keeps the gate a strict superset of "any input field could have
   changed?" — every field consumed by
   `getRuntimeMobileSessionSyncKey` is now reference-checked here,
   so when the gate passes, the key is guaranteed identical without
   needing to materialize one. The dominant click path
   (`updateTabTitle` reallocating `tabsByWorktree`) still falls
   through, but the key build it triggers now only stringifies
   small projected shapes — no stringify of accumulated layout or
   pane-title state.

`runtimeMobileSessionSyncKeysEqual` is the new comparator. It does
field-by-field reference equality plus three string compares for the
projected fields. Constant-time when nothing has changed.

## Ruled-out alternatives

- **Drop the key check entirely.** Tempting (the microtask debounce
  in `scheduleRuntimeGraphSync` already coalesces bursts), but
  changes IPC semantics: every mutation that passes the gate would
  ship a window-graph sync to main, not just ones whose mobile
  projection actually changed. The current code's intent is correct
  — the key check is supposed to suppress no-op syncs. Just don't
  pay 750 ms to compute it.
- **Replace `JSON.stringify` with `stableHashString`.** Same O(N)
  walk over the same maps, smaller constant factor. Reference
  equality on the maps is strictly cheaper for the steady state and
  shapes the same correctness as today.
- **Move the subscriber off `App.tsx`.** Doesn't change the cost
  per call; only changes who pays. The subscriber must run somewhere.

## File references

- `src/renderer/src/runtime/sync-runtime-graph.ts:96`
  (`getRuntimeMobileSessionSyncKey`,
  `runtimeMobileSessionSyncKeysEqual`)
- `src/renderer/src/App.tsx:435-459`
  (subscriber registration; relevant-fields gate)
- `src/renderer/src/runtime/sync-runtime-graph.test.ts`
  (key/comparator regression tests)
- `src/renderer/src/store/index.ts:59` (why `window.__store` is
  unavailable in prod by default)
