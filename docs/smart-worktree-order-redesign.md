# Smart worktree order — redesign

## Problem with the current heuristic

The current "smart" sort (`src/renderer/src/components/sidebar/smart-sort.ts`) is a single weighted sum of seven signals:

| Signal             | Weight |
| ------------------ | -----: |
| Running AI job     |    +60 |
| Recent activity    |    +36 (decays over 24h) |
| Needs attention    |    +35 |
| Unread             |    +18 |
| Open terminal      |    +12 |
| Live branch PR     |    +10 |
| Linked issue       |     +6 |

Weighted sums are the classic heuristic failure mode:

- **Not predictable.** Users can't tell why X is above Y; the answer is "because of an arithmetic combination of seven hidden numbers."
- **Fragile under change.** Every new signal forces a re-tune of all existing weights to avoid regressions. The codebase already has comments justifying weight collisions (e.g. why "36" must exceed `18 + 10 + 6 = 34`).
- **Tests pin numerical scores** (`expect(...).toBe(12)`, `>=35`) rather than ordering invariants — refactors are scary.
- **Conflates user activity with agent activity.** "Recent" already exists for user activity. "Smart" should be answering a different question.

## Context: agent status is default-on, and persists across restart

Two upstream changes make hook-reported agent state a reliable primary signal:

1. **Default-on.** The `experimentalAgentDashboard` flag is removed (PR #1538, `5a2a32b6`). Every worktree has a real, hook-reported agent lifecycle from `src/shared/agent-status-types.ts`:

   - `working` / `blocked` / `waiting` / `done`
   - `stateStartedAt` (when the current state began)
   - `interrupted` (`done` was a Ctrl+C)
   - `stateHistory[]` (rolling log of prior states; renderer-only)

2. **Persisted across restart.** The hook server's per-pane status cache (`lastStatusByPaneKey`) is persisted to `userData/agent-hooks/last-status.json` and rehydrated on launch. After relaunch, every pane's last-known `state` and `stateStartedAt` are restored before any new hook event arrives. Smart sort sees the same agent state it saw at quit. **Now merged on `main`** — no longer a sibling-branch dependency.

   Caveat: only the **current** entry is persisted (on-disk shape carries `receivedAt`/`stateStartedAt` alongside the `ParsedAgentStatusPayload`; restored via `AgentStatusIpcPayload` on the IPC, consumed via `setAgentStatus`'s 4th `timing` arg). The renderer's per-pane `stateHistory[]` is rebuilt from live IPC and starts empty after a restart. This affects exactly one case the redesign cares about — see "Cold start after restart" under Edge cases.

This is a much better signal than terminal-title heuristics. The redesign leans on it as the *primary* ordering signal, not one of seven weighted ones.

---

## The design: "Smart" = status-class first, recency-of-attention second

`Smart` orders by two keys: a strict ordinal class derived from the agent's *current* state, and within each class, the timestamp of the last attention event.

### Why two keys, not one

A pure-recency design (single timestamp axis) lets a `done` worktree outrank a `blocked` worktree if the `done` is 30s newer. With 8+ concurrent agents, that's how users miss a permission prompt. The fix is ~5 LOC: add an ordinal class above the timestamp.

This preserves the "one explainable rule" property — "X is above Y because of state class first, then recency" is still a sentence a user can predict and verify — while keeping urgency invariants. `blocked` can never be outranked by `done`. Working agents stop fighting for the top.

### The class

Each worktree resolves to one of four classes based on its agents' current state (most attention-demanding pane wins — see "Multiple panes" below):

| Class | Members | Why |
|------|--------|----|
| 1 — Needs you | `blocked`, `waiting` | Agent is stuck on the user. Highest priority. |
| 2 — Done | `done` (not `interrupted`) | Output is ready to read. |
| 3 — Working | `working` | Agent is mid-step; don't interrupt. |
| 4 — Idle | no live agent state, or stale (`> AGENT_STATUS_STALE_AFTER_MS`), or `done` + `interrupted` | Treat the same as worktrees that never had an agent. |

`interrupted` `done` (user hit Ctrl+C) is treated as idle, not as Class 2 — interrupting was the user's signal that this turn no longer needs attention.

### The within-class timestamp

Within each class, the timestamp that drives recency depends on the class:

- Class 1 / 2: `stateStartedAt` of the **current** entry. This is the moment the agent entered the attention state.
- Class 3 (working): `stateStartedAt` of the **most recent prior** `done`/`blocked`/`waiting` from the renderer's `stateHistory[]`. If history is empty (e.g. fresh after restart), fall back to `stateStartedAt` of the current `working` entry — the agent has been working since then, with no recorded prior attention event. We do not freshness-check history entries — within-class ordering is comparative, so old timestamps cannot leak across class boundaries (class is set by the *current* entry, which IS freshness-checked).
- Class 4 (idle): `effectiveRecentActivity(worktree, now)` — falls back to `lastActivityAt` with the existing `CREATE_GRACE_MS` floor for new worktrees.

We call this resolved timestamp `attentionTimestamp` per worktree.

### The comparator

```
sortBy: 'smart'
  → class asc                          (1 = Needs you, 4 = Idle)
  → attentionTimestamp desc            (within-class recency)
  → effectiveRecentActivity desc       (final tiebreaker for idle worktrees)
  → displayName asc                    (last-resort tiebreaker)
```

Two keys, three tiebreakers.

### What happens to today's seven signals

| Signal                | Today  | New design                                                                                                |
| --------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| Running AI job        | +60    | **Removed from sort.** `working` is Class 3 — below `done` and `blocked`. Still shown as a dot on the card. |
| Recent activity       | +36    | **Last-resort tiebreaker** for idle worktrees. Agent class dominates.                                      |
| Needs attention       | +35    | **This *is* Class 1** (`blocked`/`waiting`) — the top of the sort.                                          |
| Unread                | +18    | **Removed from sort.** Already shown as a badge.                                                            |
| Open terminal         | +12    | **Removed from sort.** Already implied by "Active only" filter.                                             |
| Live branch PR        | +10    | **Removed from sort.** Already shown on the card and groupable via `pr-status`.                             |
| Linked issue          | +6     | **Removed from sort.** Already shown on the card.                                                           |

The card decoration stays — we're not removing visual signals, only their effect on order.

---

## Why this is the right shape

- **One rule, two clauses, both explainable.** "X is above Y because X is in a more attention-demanding class than Y, and within the same class because X's agent demanded attention more recently." A user can predict and verify both clauses from visible state (the dot tells them the class; ordering within class is recency).
- **Urgency invariants hold.** A `blocked` worktree is never outranked by a fresher `done`. A `done` worktree is never outranked by a `working` one. Class is strict ordinal, so visual state and rank position never contradict each other.
- **Aligned with the user's actual job.** When you have eight worktrees with eight agents running, the question you want answered is "which ones need me right now, and in what order did they need me?" Not "which one had the most recent OS-level PTY byte."
- **Working agents stop fighting for the top.** Today, every running agent in a 10-worktree project competes for the top slot via `+60`. Under this design, a working agent sits in Class 3 below all `done`/`blocked` worktrees — it stays out of the way until it needs you, at which point it jumps into Class 1 or 2 with a clear reason.
- **Tests can assert orderings, not numbers.** `expect(after('blocked')).toRankAbove(after('done'))` and `expect(within('done').newer).toRankAbove(within('done').older)` are meaningful invariants. `expect(score).toBe(12)` is not.
- **Lean on the new default-on, persisted-across-restart signal.** Agent state is reliable for every user *and* survives quit/relaunch (per "Context" above). The class layer reads `agentStatusByPaneKey` directly, which is hydrated before sort runs.

### Menu label and tooltip

The sort-menu label stays as **"Smart"** — no rename. We attach a one-line tooltip on the Smart menu item that summarizes the rule for new users: *"Agents that need attention, then most recent activity."* Lives on the Smart row in the sort dropdown; no other UI changes.

## Edge cases

1. **Worktree with no agent ever.** No live entry → Class 4 (idle). Sorts below all classes, then by `effectiveRecentActivity`. Same effective behavior as today's "Recent" within the idle group.
2. **Agent transitions `done` → `working`.** Class flips from 2 to 3. The worktree drops below all `done`/`blocked` worktrees. *Within Class 3*, the prior `done` timestamp from `stateHistory[]` drives rank, so it sits at the top of the working group — i.e., "it's the most recently-relevant working agent." This is intentional: once the user has new work running, the *category* of attention has changed, and the visible dot agrees with the position.
3. **User views the worktree.** Class and timestamp do not change on view. The worktree stays where it was. This is the urgency invariant's UX corollary — see "Rankings change only on objective agent state transitions" under Design principles below: clicking a worktree never re-ranks anything, so users can track positions visually across interactions.
4. **Agent goes `blocked` → `working` → `blocked` quickly.** Each `blocked` transition makes the worktree Class 1 with a fresh `stateStartedAt`. It stays at the top through the back-and-forth, which is correct. The existing `SORT_SETTLE_MS` debounce in `WorktreeList` already coalesces rapid transitions into a single re-sort, so visual flutter from a working↔blocked oscillation is mitigated. Worth measuring during dogfood — if the debounce window proves too short for sub-second hook bursts, lengthen it before adding any class-specific suppression.
5. **Multiple panes per worktree.** Class is the **min** across all panes (most-attention-demanding wins — Class 1 < 2 < 3 < 4). `attentionTimestamp` is the **max** across panes within the resolved class. Any pane that's blocked pulls the whole worktree to Class 1; among Class-1 worktrees, the most-recent `blocked` event ranks first.
6. **Brand-new worktree with no agent yet.** Class 4 (idle). The existing `CREATE_GRACE_MS` floor on `effectiveRecentActivity` keeps it at the top of the idle group during the post-create window. Already covered today.
7. **Stale agent entries.** An entry whose `updatedAt` is older than `AGENT_STATUS_STALE_AFTER_MS` (30 min) is treated as if no live entry exists — the worktree falls to Class 4. Matches existing freshness logic in `isExplicitAgentStatusFresh`.
8. **Cold start after restart.** Hook server hydrates `lastStatusByPaneKey` from disk before binding the listener; the renderer pulls a snapshot when settings + workspace tabs are ready. Before that snapshot arrives, every worktree is Class 4 — Smart momentarily falls back to `effectiveRecentActivity` ordering (the same key the `recent` sort uses), then re-ranks classes 1/2/3 as soon as the snapshot lands. The snapshot restores `state` and `stateStartedAt` per pane, so Classes 1/2 and current-state-driven Class 3 timestamps work normally. The bootstrap delivers N pane entries through N `setAgentStatus` calls (one sortEpoch bump each); the existing `SORT_SETTLE_MS` debounce in `WorktreeList` coalesces them into a single re-sort.

   The very-first-frame case (before any PTY is alive at all) is already handled separately: `sortWorktreesSmart`'s existing `!hasAnyLivePty` cold-start branch falls back to the persisted `sortOrder` snapshot until the first warm sort runs. That branch survives this redesign — the new comparator only takes over once the snapshot has landed. No change needed; flagged here so reviewers don't think U5 ("one-frame collapse to Class 4") is unhandled.

   The one *narrow* gap: `stateHistory[]` is renderer-only, not persisted. After restart, a pane that's *currently* `working` cannot recover its prior `done`/`blocked` timestamp from before quit — Class 3's within-class timestamp falls back to the current `working` `stateStartedAt`. In practice this only matters when (a) the agent was working at quit time *and* (b) had a prior attention event the user wants reflected in rank. The far-more-common cases — `done`/`blocked` at quit, or `working` agent that did its first attention event in this session — are unaffected.

   The sidebar's cold-start branch in `WorktreeList.tsx` uses a latching `sessionHasHadPty` ref (never reverts mid-session) while `sortWorktreesSmart`'s built-in cold-start branch is point-in-time on `!hasAnyLivePty` — if all PTYs close mid-session, the palette can momentarily flip to cold-start ordering while the sidebar does not. Accepted asymmetry; the palette is a transient overlay.
9. **Agents without hooks (aider, custom scripts).** Hook state wins when present; the terminal-title heuristic (`detectAgentStatusFromTitle` in `src/renderer/src/lib/agent-status.ts`) is the **fallback** for panes with no fresh hook entry. Resolution per pane:

   - Fresh hook entry → use it (today's path).
   - No fresh hook entry (`!isExplicitAgentStatusFresh`, including stale entries past `AGENT_STATUS_STALE_AFTER_MS`) **and** a runtime pane title that `detectAgentStatusFromTitle` recognizes → derive class from the title:
     - `'permission'` → Class 1. Timestamp = `now`. Why `now`: the title detector has no `stateStartedAt`; using `now` keeps the worktree at the top of Class 1 until the next re-sort, which matches the user's mental model ("just noticed it needs me").
     - `'working'` → Class 3. Timestamp = the worktree's `lastActivityAt` (best proxy for "when did this agent last do something" — `stateHistory[]` doesn't exist for title-derived state). Why worktree-level: `TerminalTab` has no per-tab `lastActivityAt`; the worktree-level value is sufficient because Class 3 within-class ordering compares across worktrees, not across panes inside one.
     - `'idle'` or `null` → Class 4.
   - Hook state is authoritative whenever fresh: a pane whose hook says `done` but whose title detector says `'working'` stays Class 2. Title-heuristic only fires when hook is missing or stale.

   Tradeoff: the title heuristic is fragile (terminal-title-string matching, gated on PTY liveness via `tabHasLivePty`), but for hookless users it's strictly better than collapsing every aider/custom-script pane to Class 4 and burying live attention prompts under stale `done`s. We accept the fragility because (a) it only feeds the fallback path, (b) hook-equipped agents are unaffected, and (c) the heuristic is the same code that already drives the per-card status dot — there's no new fragile surface, we're just routing existing detection into the comparator.

   **Mixed-population tradeoff:** in workspaces where some panes are hookful and some aren't, a freshly-noticed hookless `'permission'` pane (`ts = now`) will outrank a hookful `blocked` pane whose `stateStartedAt` is older by even a second. We accept this — "just noticed" is the closest stable signal we have for hookless panes, and most users run a single agent type.

## Implementation sketch

### Files touched

Primary:
- `src/renderer/src/components/sidebar/smart-sort.ts` — comparator rewrite, function deletions
- `src/renderer/src/components/sidebar/smart-attention.ts` — **new file**: `SmartClass`, `WorktreeAttention`, `resolveAttention`, `buildAttentionByWorktree`, `mostRecentAttentionInHistory`
- `src/renderer/src/components/sidebar/smart-sort.test.ts` — replace numerical assertions with ordering invariants
- `src/renderer/src/components/sidebar/smart-attention.test.ts` — **new file**: helper-level tests
- `src/renderer/src/components/sidebar/WorktreeList.tsx` — thread `runtimePaneTitlesByTabId` and `ptyIdsByTabId` into the sort path so the title-heuristic fallback (Edge case 9) can fire for hookless panes.
- `src/renderer/src/components/sidebar/visible-worktrees.ts` — same: callers of `sortWorktreesSmart`/`buildWorktreeComparator` must thread the new state.
- `src/renderer/src/components/WorktreeJumpPalette.tsx` — thread `agentStatusByPaneKey`, `runtimePaneTitlesByTabId`, and `ptyIdsByTabId` into the two `sortWorktreesSmart(...)` calls (the typed-query and browser-tabs paths).

No changes:
- `src/shared/agent-status-types.ts` — already provides `AgentStatusEntry`, `AgentStateHistoryEntry.startedAt`, `AgentStateHistoryEntry.interrupted`, `AGENT_STATUS_STALE_AFTER_MS`, `AGENT_STATE_HISTORY_MAX`.
- `src/renderer/src/store/slices/agent-status.ts` — already preserves `interrupted` on `stateHistory` rows (the helper relies on this).
- `src/renderer/src/lib/agent-status.ts` — `isExplicitAgentStatusFresh` and `detectAgentStatusFromTitle` are reused as-is for the heuristic fallback.
- `src/main/agent-hooks/server.ts` — persistence is a separate change on the sibling branch.

### Data model

No new persisted fields on the worktree. Class and `attentionTimestamp` are derived at sort time from `agentStatusByPaneKey` (the renderer slice that already aggregates per-pane explicit status). The slice is hydrated on launch from the persisted hook-server cache (see "Context"), so cold-start sorting reflects pre-quit state once the snapshot arrives.

```ts
type SmartClass = 1 | 2 | 3 | 4   // 1=NeedsYou, 2=Done, 3=Working, 4=Idle

type WorktreeAttention = {
  cls: SmartClass
  attentionTimestamp: number   // 0 when class === 4
}
```

### Per-worktree resolution

For each worktree, walk its panes — preferring fresh hook entries from `agentStatusByPaneKey`, falling back to title-heuristic detection over `runtimePaneTitlesByTabId` for hookless panes (Edge case 9). NaN-safety: `resolveAttention` should treat `Number.isFinite(stateStartedAt) === false` the same as a missing entry — a corrupted timestamp would silently sink the worktree to the bottom of its class because NaN compares false against everything.

```ts
type PaneInput =
  | { kind: 'hook'; entry: AgentStatusEntry }
  // Why: TerminalTab has no per-tab lastActivityAt; worktree-level value is
  // enough since within-class ordering compares across worktrees.
  | { kind: 'title'; status: AgentStatus | null; worktreeLastActivityAt: number }

function resolveAttention(
  panes: PaneInput[],
  now: number
): WorktreeAttention {
  let bestCls: SmartClass = 4
  let bestTs = 0

  for (const pane of panes) {
    let cls: SmartClass
    let ts: number

    if (pane.kind === 'hook') {
      const entry = pane.entry
      if (!isExplicitAgentStatusFresh(entry, now, AGENT_STATUS_STALE_AFTER_MS)) continue
      // Why: defensive guard. NaN/Infinity from a corrupted stateStartedAt would
      // poison comparisons (NaN > anything === false), silently dropping the
      // worktree to the bottom of its class. Treat as missing.
      if (!Number.isFinite(entry.stateStartedAt)) continue

      if (entry.state === 'blocked' || entry.state === 'waiting') {
        cls = 1
        ts = entry.stateStartedAt
      } else if (entry.state === 'done') {
        // Why: an interrupted `done` (user pressed Ctrl+C) is the user signalling
        // "I'm done with this turn". Treat as idle, not as Class 2 attention.
        if (entry.interrupted) continue
        cls = 2
        ts = entry.stateStartedAt
      } else {
        // working
        cls = 3
        // Why: within the working class, sort by the most-recent prior attention
        // event so a worktree that just transitioned done→working stays above one
        // that's been working for an hour. Falls back to current stateStartedAt
        // when stateHistory is empty (e.g. fresh after restart — see Edge case 8).
        const prior = mostRecentAttentionInHistory(entry.stateHistory)
        ts = prior ?? entry.stateStartedAt
      }
    } else {
      // Title-heuristic fallback (no fresh hook entry for this pane). See
      // Edge case 9. Fragility tradeoff lives there; the rule is: hook wins
      // when fresh, title-heuristic fills the gap, no override of fresh hook.
      if (pane.status === 'permission') {
        cls = 1
        // Why now: the title detector exposes no stateStartedAt. Using `now`
        // pins the worktree to the top of Class 1 until a hook event or the
        // next sort, matching the user's "just noticed" mental model.
        ts = now
      } else if (pane.status === 'working') {
        cls = 3
        ts = pane.worktreeLastActivityAt
      } else {
        // 'idle' or null: nothing to assert; pane stays in Class 4.
        continue
      }
    }

    // Why min: smaller class number = higher priority. Any pane in a more
    // attention-demanding class promotes the whole worktree.
    if (cls < bestCls || (cls === bestCls && ts > bestTs)) {
      bestCls = cls
      bestTs = ts
    }
  }

  return { cls: bestCls, attentionTimestamp: bestTs }
}

function mostRecentAttentionInHistory(history: AgentStateHistoryEntry[]): number | null {
  let max = 0
  for (const h of history) {
    // Why this works: `setAgentStatus` in `agent-status.ts` already pushes
    // `interrupted` onto history rows when an interrupted `done` transitions
    // out, so we see it on historical entries the same way as on the current.
    if (h.state === 'done' && h.interrupted) continue
    if (h.state === 'done' || h.state === 'blocked' || h.state === 'waiting') {
      // Why: mirror the current-entry guard. NaN is silently skipped by `>`,
      // but Infinity would pin the worktree at the top of Class 3 forever.
      if (!Number.isFinite(h.startedAt)) continue
      if (h.startedAt > max) max = h.startedAt
    }
  }
  return max > 0 ? max : null
}
```

`stateHistory` is bounded at `AGENT_STATE_HISTORY_MAX = 20` — if an agent ping-pongs through 20+ working/done cycles inside one session, the very-oldest attention event scrolls off and the worktree's Class-3 timestamp will refresh to the next-oldest still in history. Acceptable tradeoff; the alternative is unbounded history per pane.

### Build-once-per-sort optimization

`agentStatusByPaneKey` is keyed by `${tabId}:${paneId}`. Build a `tabId → entries[]` index once per sort (the existing `buildExplicitEntriesByTabId` helper does this), then walk each worktree's tabs and accumulate. The aggregate cost is `O(E + N × T × H)` per sort, where E = total entries, N = worktrees, T = tabs/worktree, H = history length. With H bounded at 20 and typical T ≤ 4, this is comfortably below the existing decorate-sort-undecorate path.

`buildAttentionByWorktree` accepts `runtimePaneTitlesByTabId` and `ptyIdsByTabId` alongside `agentStatusByPaneKey` (matching the pattern in `getWorkingAgentsPerWorktree`/`countWorkingAgents` in `src/renderer/src/lib/agent-status.ts`). For each pane with no fresh hook entry, look up its title and gate on `tabHasLivePty` before running `detectAgentStatusFromTitle` — slept tabs preserve their pane titles under `keepIdentifiers`, so the liveness gate is what stops a stale "✋" title from re-promoting a dead pane to Class 1.

### The comparator

```ts
function buildSmartComparator(
  attentionByWorktree: Map<string, WorktreeAttention>,
  now: number
) {
  return (a: Worktree, b: Worktree) => {
    const aw = attentionByWorktree.get(a.id) ?? IDLE
    const bw = attentionByWorktree.get(b.id) ?? IDLE
    return (
      aw.cls - bw.cls ||                         // 1 < 2 < 3 < 4
      bw.attentionTimestamp - aw.attentionTimestamp ||
      effectiveRecentActivity(b, now) - effectiveRecentActivity(a, now) ||
      a.displayName.localeCompare(b.displayName)
    )
  }
}
const IDLE: WorktreeAttention = { cls: 4, attentionTimestamp: 0 }
```

### Stable rank during interaction

The current implementation uses `precomputedScores` to keep `Array.sort` stable across the comparator's O(N log N) calls. The new design preserves this: build `attentionByWorktree` once before sort and pass it into the comparator. No score-snapshot indirection (`SmartSortOverride`) is needed — the resolved class/timestamp is already a frozen pre-sort decoration.

For the *currently-focused* worktree specifically, we do not freeze its position. If the user's active worktree transitions class while they're interacting, it will move on the next re-sort. This is consistent with today's behavior. If we later find users want "stable rank for the focused tab during a single editing session," it's a separate, bounded change.

### Code to delete

- `computeSmartScore`, `computeSmartScoreFromSignals`
- `hasRecentPRSignal` (caller in smart-sort only; PR cache stays for grouping)
- `SmartSortOverride` and the `smartSortOverrides` parameter — overrides existed to freeze decay-based scores; class/timestamp don't decay between events
- `precomputedScores` parameter (replaced by `attentionByWorktree`)
- `CREATE_GRACE_MS` *override* path stays for `recent`, and is reused as the Class 4 tiebreaker — no behavior change there

### Caller updates

Every caller of `sortWorktreesSmart` (and the smart branch of `buildWorktreeComparator`) MUST thread three store reads: `agentStatusByPaneKey`, `runtimePaneTitlesByTabId`, and `ptyIdsByTabId`. The first carries the primary signal; the other two enable the title-heuristic fallback for hookless agents (Edge case 9). A caller that omits all three collapses every worktree to Class 4; a caller that omits the title-related two silently disables fallback and buries hookless permission prompts.

Callers today (verify before each edit):

- `src/renderer/src/components/sidebar/visible-worktrees.ts:179` — already threads `state.agentStatusByPaneKey`. **Must add** `state.runtimePaneTitlesByTabId` and `state.ptyIdsByTabId`.
- `src/renderer/src/components/sidebar/visible-worktrees.ts:188` — same: already threads agent status, **must add** the two title-fallback inputs.
- `src/renderer/src/components/sidebar/WorktreeList.tsx:652` — uses `buildWorktreeComparator`; verify the parent state read picks up the two new fields and threads them through.
- The two `sortWorktreesSmart(...)` calls in `src/renderer/src/components/WorktreeJumpPalette.tsx` (the typed-query and browser-tabs paths) — updated to pass `agentStatusByPaneKey`, `runtimePaneTitlesByTabId`, and `ptyIdsByTabId` from the store.

Make all three new parameters **non-optional** in the new `sortWorktreesSmart` signature (and on `buildWorktreeComparator`'s smart branch). Why: a forgotten caller fails type-check rather than silently regressing the palette to "all Class 4" or quietly losing the hookless-fallback path.

### Implementation plan (step-by-step)

This section is the implementation handoff. Follow in order; each step lands a coherent, testable change.

**Step 1 — Add the class + attention helpers.**
- New file: `src/renderer/src/components/sidebar/smart-attention.ts`.
- Export `SmartClass = 1 | 2 | 3 | 4`, `WorktreeAttention = { cls: SmartClass; attentionTimestamp: number }`, the constant `IDLE: WorktreeAttention = { cls: 4, attentionTimestamp: 0 }`.
- Implement `resolveAttention(panes, now)` and `mostRecentAttentionInHistory(history)` exactly as in "Per-worktree resolution" above. `resolveAttention` accepts `PaneInput` (hook entry OR title-heuristic input) per pane.
- Unit tests for the helper directly (faster to iterate than going through the full sort): one entry per class, multi-pane min-class/max-timestamp, interrupted-done skip, history-only-interrupted fallback, stale-entry skip, NaN `stateStartedAt` skip, title-heuristic `'permission'`/`'working'`/`'idle'` mapping, hook-overrides-title (fresh hook + matching title doesn't double-promote).

**Step 2 — Build the per-worktree attention map.**
- Add `buildAttentionByWorktree(worktrees, tabsByWorktree, agentStatusByPaneKey, runtimePaneTitlesByTabId, ptyIdsByTabId, now)` to `smart-attention.ts`.
- Reuse the existing `buildExplicitEntriesByTabId` index from `smart-sort.ts` (move it into `smart-attention.ts` if cleaner — it's only used by the smart path).
- Walk each worktree's tabs. For each tab, collect hook entries (keyed `${tabId}:${paneId}`); for tabs/panes with no fresh hook entry, gate on `tabHasLivePty(ptyIdsByTabId, tab.id)` and call `detectAgentStatusFromTitle` over the pane's `runtimePaneTitlesByTabId[tab.id]` map (or `tab.title` if no per-pane titles yet — same fallback shape as `getWorkingAgentsPerWorktree`). Pass the resulting `PaneInput[]` to `resolveAttention`.

**Step 3 — Rewrite the comparator.**
- In `smart-sort.ts`, replace the smart branch of `buildWorktreeComparator` with the class-then-recency comparator from "The comparator" section.
- Replace `precomputedScores` parameter with `attentionByWorktree: Map<string, WorktreeAttention>`.
- Make `agentStatusByPaneKey`, `runtimePaneTitlesByTabId`, and `ptyIdsByTabId` non-optional on this parameter list (TypeScript will surface every caller).
- Delete `SmartSortOverride`, `smartSortOverrides`, `getSmartSortCandidate`, `precomputedScores`, `computeSmartScore`, `computeSmartScoreFromSignals`, `hasRecentPRSignal`. Keep `effectiveRecentActivity` and `CREATE_GRACE_MS` (used by `recent` and Class 4 tiebreaker).

**Step 4 — Rewrite `sortWorktreesSmart`.**
- Build `attentionByWorktree` once via `buildAttentionByWorktree`.
- Pass it into the comparator.
- Keep the existing cold-start branch (`!hasAnyLivePty`) using persisted `sortOrder` as today — see Open Question #3 (Migration) and Edge case 8.

**Step 5 — Update callers.**
- Update both `sortWorktreesSmart(...)` calls in `WorktreeJumpPalette.tsx` (the typed-query and browser-tabs paths) to pass `state.agentStatusByPaneKey`, `state.runtimePaneTitlesByTabId`, and `state.ptyIdsByTabId`.
- Update `WorktreeList.tsx` and `visible-worktrees.ts` to thread the same two title-fallback fields.
- Run `pnpm typecheck` to confirm no other callers slipped through.

**Step 5a — Bump `sortEpoch` on title-fallback-relevant changes.** The title-fallback path now influences ordering (see "Title heuristic stays in sort as the hookless fallback" under Design principles, and Edge case 9), but `setRuntimePaneTitle` in `src/renderer/src/store/slices/terminals.ts` does not currently bump `sortEpoch`. Without this, a hookless agent that transitions to `'permission'` via a title change won't trigger a re-sort until some unrelated event fires. Required: any mutation that changes `runtimePaneTitlesByTabId` (today: `setRuntimePaneTitle`, `clearRuntimePaneTitle`) MUST bump `sortEpoch` whenever the new title's `detectAgentStatusFromTitle` output differs from the previous title's output. This is a behavioral change from today (today's epoch only bumps on hook events + activity events). Suggested coarser approach if the per-title classification check proves awkward: bump unconditionally on title change — cheap, and already debounced by `SORT_SETTLE_MS` in `WorktreeList`.

**Step 6 — Rewrite tests.**
- Replace numerical-score assertions in `smart-sort.test.ts` with the ordering invariants listed in "Tests to rewrite" below.
- Add a new test file `smart-attention.test.ts` for the `resolveAttention` helper.
- Add the palette regression test (covered in "Tests to rewrite").

**Step 7 — Verify and ship.**
- `pnpm typecheck && pnpm test smart-sort smart-attention`.
- Manual smoke: open Orca with several worktrees + agents in different states, switch to Smart sort, verify ordering matches the class table.
- Confirm no new console errors when `agentStatusByPaneKey` is empty (e.g., very early in app startup).

**What this design depends on:**
1. Default-on agent status — **already merged on `main`** (PR #1538).
2. Persistence of `lastStatusByPaneKey` across restart — **also merged on `main`**. `AgentStatusIpcPayload` and `setAgentStatus`'s 4th `timing` arg are present, so Edge case 8's claim about restored timestamps holds at ship time.

### Tests to rewrite

`smart-sort.test.ts` asserts numerical scores in a few places. New tests assert ordering invariants:

- A worktree whose agent is `blocked` ranks above one whose agent is `done`, regardless of which `stateStartedAt` is newer (class invariant).
- A worktree whose agent is `done` ranks above one whose agent is `working` (class invariant).
- Two `blocked` worktrees: the one whose `stateStartedAt` is more recent ranks first.
- A worktree with `state='working'` and a prior `done` in `stateHistory` ranks above another `working` worktree with no history.
- A `working` worktree whose history contains only interrupted-`done` entries falls back to the current `stateStartedAt` (the helper returns null and `??` activates).
- A `working` worktree whose history contains a non-finite (`NaN`/`Infinity`) `startedAt` on an attention entry skips that entry — same guard as the current-entry path; an `Infinity` would otherwise pin the worktree at the top of Class 3.
- `interrupted` `done` worktrees rank in Class 4, not Class 2.
- Stale entries (`updatedAt > AGENT_STATUS_STALE_AFTER_MS` ago) are ignored — worktree falls to Class 4.
- Class 4 ties break on `effectiveRecentActivity`, then `displayName`.
- `working` transitions never promote a worktree above a `blocked` one.
- **Palette caller regression**: `WorktreeJumpPalette` ranks a `blocked` worktree above a `working` one when both flow through `sortWorktreesSmart` with `agentStatusByPaneKey` threaded — pins that the palette path uses class.
- **Title-heuristic fallback**: a pane with no fresh hook entry but a runtime title of `"✋ Gemini CLI"` (or any title `detectAgentStatusFromTitle` maps to `'permission'`) sorts into Class 1 above a hook-driven `done` worktree. Companion test: a `'working'`-titled hookless pane sorts into Class 3 with `attentionTimestamp = worktree.lastActivityAt`. Companion test: a fresh hook entry of `done` plus a title that the detector reads as `'working'` stays Class 2 — hook wins when fresh.
- **Title change bumps `sortEpoch`**: a title change from a `'working'`-classified string to a `'permission'`-classified string bumps `sortEpoch` and triggers a re-sort, so a hookless permission prompt promotes into Class 1 without waiting for an unrelated event.

## Telemetry

Three PostHog events ship with this change to validate the redesign post-launch (Orca project ID 406068):

- **`smart_sort_class_distribution`** — fired from `WorktreeList` after each completed `sortedIds` recomputation, throttled to once per ~30s. Stops firing when `sortBy !== 'smart'` (timer ownership lives with the component, so a sort-selector switch cancels it cleanly). Properties: `class1`, `class2`, `class3`, `class4`, `totalWorktrees`. Lets us see whether real users actually have Class 1/2/3 populated or whether everyone sits in Class 4 (signal that hook coverage is too low and the redesign isn't doing work).
- **`smart_sort_class_1_promotion`** — fired from `WorktreeList` after each `sortedIds` recomputation, suppressing repeat-fires by comparing against a `prevClassByWorktreeId` map keyed by worktree id. Only fires on transitions INTO Class 1 (not on Class 1 → Class 1 noise from transient stale-window flickers). Properties: `cause` ∈ `{ 'blocked', 'waiting', 'title-heuristic' }`. Distinguishes hook-driven promotions from the title-heuristic fallback path so we can tell whether Edge case 9 is carrying weight or whether the heuristic is rarely needed.
- **`smart_to_recent_switch`** — fired when a user switches the sort selector from `smart` to `recent` *after* the redesign ships. A spike post-launch is the cleanest regression signal we have ("users are voting with their feet"). A future inverse event (`recent_to_smart_switch`) would pair with this for net-flow analysis; not shipped in v1 because the abandonment direction is the cleaner regression signal on its own.

Keep payloads small; no per-worktree IDs or paths in event properties.

## Design principles / settled decisions

The Phase A review settled two questions that earlier drafts left open. Recording them here so future iterations don't relitigate them.

### Rankings change only on objective agent state transitions

Class and `attentionTimestamp` move when the *agent* changes state — hook event, transition, or staleness threshold. They do **not** move when the *user* changes view, focuses a worktree, marks unread badges as read, or otherwise interacts. Why: when 8+ worktrees are visible, users build muscle memory for *positions*. If clicking a worktree silently re-ranked the list, the next worktree the user wanted would have shifted underneath them. Whether a worktree is "visited done" or "unvisited done" is a per-user, per-glance concept that belongs on the unread badge, not in the sort comparator. The dot, the badge, and the rank position tell three orthogonal stories — keeping rank tied to objective state is what lets all three coexist.

This means: no view-demote, no activation-demote, no "decay the class once seen." Edge case 3 is the visible consequence. If users later report that the top of the list is stuck on something they already handled, the right fix is on the *badge* (which already records "seen"), not on the sort.

### Title heuristic stays in sort as the hookless fallback

Hooks are the primary signal; the title heuristic (`detectAgentStatusFromTitle`) is the fallback for panes without fresh hook state (Edge case 9 has the full rule). Why kept: dropping it entirely would dump every aider/custom-script user's permission prompts into Class 4, defeating the redesign's main promise for that population. Why limited to fallback: the heuristic is string-matching on terminal titles — fragile under agent updates and locale changes. By gating it on `!isExplicitAgentStatusFresh`, hook-equipped agents are unaffected and the fragility surfaces only where it strictly improves over Class 4.

## Open questions

1. **Should we persist `attentionTimestamp` per worktree?** Recommendation: **no, for v1.** The hook-server cache persistence (sibling branch) covers the practical cold-start case — restart restores per-pane current state. A second persistence layer for worktree-level attention is redundant and adds a migration. Revisit only if users report cross-restart staleness in the `stateHistory`-only edge case (Edge case 8).
2. **What about a user actively typing in a no-agent worktree?** With Class 4 idle worktrees ordered by `effectiveRecentActivity`, an active no-agent worktree ranks at the top of Class 4 (above truly-stale ones) but still below every Class 1/2/3 worktree. For users whose primary workflow is "type in a worktree without an agent," Smart will feel agent-centric. **This is by design** — that's what `recent` is for. We should consider renaming the `lastActivityAt` tiebreaker logic if user feedback suggests confusion, but no change in v1.
3. **Migration.** Existing users with `sortBy: 'smart'` keep that selection — they get the new behavior automatically. The persisted `sortOrder` snapshot (used in cold-start before any PTY is alive) becomes meaningless under the new comparator; we discard it on first warm sort and re-snapshot. First cold start after this lands uses the pre-existing `sortOrder` snapshot until the persisted hook-server cache hydrates and the first warm sort runs (~1 frame after the bootstrap snapshot arrives), then the snapshot is overwritten. Briefly stale-looking ordering on first launch after upgrade is acceptable; no explicit invalidation needed. No user-visible migration needed.
