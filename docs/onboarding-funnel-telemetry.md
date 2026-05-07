# Onboarding Funnel Telemetry

## Goal

Identify where new users drop off between launching Orca and getting an agent running, with enough granularity to fix it. Today the funnel is `app_opened → repo_added → workspace_created → agent_started`, which collapses ~10 distinct UI surfaces into 4 visible signals. About 60% of users who add a repo never create a workspace (PostHog funnel: `<insight ID / query name TBD>`, measured `<window TBD>` — citation pending), and we have no data on which of the intermediate surfaces is responsible.

This document proposes the minimum set of events that, together with what already exists, gives the funnel no invisible drop-off points.

## System context

Every existing `track()` call site lives in main. New events that originate in the renderer cross the IPC boundary through a bridge that already ships: preload `telemetryTrack` (`src/preload/index.ts:803-815`) → IPC `telemetry:track` handler (`src/main/ipc/telemetry.ts:102-123`) → existing `track()`, with the typed renderer wrapper at `src/renderer/src/lib/telemetry.ts:50-65`. The main-side handler is the single point where the consent gate, burst-cap, and Zod validator run (`client.ts:256-310`).

```
┌──────────┐  onClick / mount    ┌──────────────────┐  telemetry:track   ┌───────────────────┐  capture()  ┌─────────┐
│ Renderer │ ──────────────────► │ preload bridge   │ ─────────────────► │ main: track()     │ ──────────► │ PostHog │
│ (React)  │                     │ window.api.tele- │                    │  consent + cap +  │             │         │
│          │                     │ metry.track      │                    │  Zod validate     │             │         │
└──────────┘                     └──────────────────┘                    └───────────────────┘             └─────────┘
```

The renderer is untrusted relative to telemetry payloads. Names and properties crossing the bridge are revalidated by the same Zod schema used for in-process emits; malformed entries are dropped silently to match the existing validator behavior.

## Non-goals

- Not adding per-keystroke instrumentation. Composer-form abandonment is captured by "composer opened, no workspace_created."
- Not tracking which agent or repo a user picked at this layer — that lives on `workspace_created` / `agent_started` properties already.
- Not changing the privacy contract. Every new event respects the consent gate at `client.ts:283-286`, attaches no PII, and routes through the same validator.

## The path being measured

For a new user with no repos, the observable journey is:

```
1.  app launches                                                    [client.ts:434, app_opened]
2.  Landing screen                                                  [Landing.tsx]
3.  click "Add Project" → AddRepoDialog opens
4.  pick entry method: Browse / Clone / Remote / Create             [AddRepoDialog.tsx:31, step state]
5.  sub-step (clone/remote/create) succeeds OR errors
6.  AddRepoDialog Setup step shown                                  [AddRepoSetupStep.tsx]
        repo_added fires here                                       [repos.ts:49]
7.  Setup step action: Create worktree / Open existing / Configure / Skip / Back
8.  NewWorkspaceComposer opens                                      [NewWorkspaceComposerCard.tsx]
9.  user fills form, submits
10. worktrees:create IPC succeeds OR errors                         [worktrees.ts:150]
        workspace_created fires on success                          [worktrees.ts:176]
11. terminal opens, agent process spawns
        agent_started fires                                         [pty.ts:1084]
```

Steps 1, 6, 10, 11 emit events today. Steps 2-5, 7-9 are invisible.

## Proposed events

Maximum-value-first. Two events ship now because they each close a question that is currently impossible to answer; the rest are deferred behind a single generic `funnel_step` event so the registry doesn't grow one entry per UI surface. "Load-bearing" means the event closes an invisible-today question; "high"/"medium" calibrate marginal value once the load-bearing pair is live.

### First ship

#### 1. `add_repo_setup_step_action` — **load-bearing**

**Fires:** when the user picks an action from `AddRepoSetupStep` (or backs out via the dialog's "Add another project" arrow). The five actions split across two emit sites:

| Action | Has main-process IPC seam? | Emit site |
|---|---|---|
| `create_worktree` | yes (`worktrees:create`) | main-side, at the IPC handler entry |
| `open_existing` | no (renderer-only `activateAndRevealWorktree`, `AddRepoDialog.tsx:194-200`) | renderer-side `onClick`, via the IPC bridge |
| `configure` | no (opens a renderer-only modal) | renderer-side `onClick`, via the IPC bridge |
| `skip` | no (pure UI dismiss) | renderer-side `onClick`, via the IPC bridge |
| `back` | no (returns to entry-method picker, `AddRepoDialog.tsx:243-251`) | renderer-side `onClick`, via the IPC bridge |

Only `create_worktree` has a main-process seam; the other four are pure-UI transitions and emit from the renderer because there is nowhere else to put them. This is a deliberate departure from "all telemetry lives in main" — requiring a main-side trace for Skip/Configure/Back/open_existing would mean inventing IPC calls that exist only to carry telemetry.

**Properties:** `action: 'create_worktree' | 'configure' | 'skip' | 'open_existing' | 'back'`
**Tells us:** what fraction of users who add a repo immediately bail vs continue to workspace creation. This is almost certainly the biggest drop in the existing `repo_added → workspace_created` step (the ~60% drop cited in Goal). Without this, that drop is a single black box; with it, we can split "user hit Skip" (a UX problem we can fix) from "user opened the composer and abandoned mid-form" (a different UX problem) from "user opened composer and the create call failed" (a bug).
**Strength:** high. The action enum has five discrete values that map 1:1 to affordances on a single screen. No interpretation needed.
**Cost:** ~7 lines across the five call sites. The renderer→main bridge already exists (see "System context") — no new infra.

**Caveat:** folder-mode (non-git) repos auto-close the dialog at `AddRepoDialog.tsx:131-134` and never reach the Setup step, so they emit `repo_added` with no follow-on `add_repo_setup_step_action`. Funnel queries on `repo_added → add_repo_setup_step_action` should expect a legitimate drop here, not a failure to instrument.

#### 2. `workspace_create_failed` — **load-bearing**

**Fires:** when `worktrees:create` throws inside `createLocalWorktree` / `createRemoteWorktree`.
**Properties:** `source: WorkspaceSource`, `error_class: 'git_failed' | 'path_collision' | 'permission_denied' | 'base_ref_missing' | 'unknown'`.
**Tells us:** how many of the missing `workspace_created` events are user abandonment vs system failure. Today, the comment at `worktrees.ts:166-173` explicitly notes that `workspace_created` only fires after the helpers resolve — a thrown helper is silent. That silence is fine for the success-rate denominator on creation, but it leaves the failure rate completely unobservable.
**Strength:** high. Errors thrown by a single function with a known taxonomy. Caveat: if a future refactor adds a new throw site, the event needs to be wired there too — same maintenance burden as `agent_error`.

The `error_class` values are intentionally a separate enum from `agent_error.error_class` (`['binary_not_found', 'unknown']`). Different domain — `agent_error` covers PTY-spawn failures, this covers git/filesystem failures during worktree creation. The schema-evolution comment at `telemetry-events.ts:68-69` warns against speculatively widening enums across domains; merging them would lock both domains to the union forever.

**Cost:** wrap *only* the `await createLocalWorktree(...)` / `await createRemoteWorktree(...)` calls in a try/catch (`worktrees.ts:162-164`), classify the error, fire the event, rethrow. ~10 lines. The pre-validation throws above those calls (`Repo not found`, `Folder mode does not support creating worktrees` at `worktrees.ts:154-159`) are intentionally NOT instrumented — they signal IPC-shape bugs, not the user-visible git/filesystem failures the funnel cares about, and would otherwise bucket into `unknown` and pollute the failure taxonomy.

### The renderer→main bridge

Event #1 is the first *funnel* event to fire from a React `onClick`, but the bridge it rides on already exists and is reused as-is — no new infra:

- **Preload exposure: `window.api.telemetryTrack(name, props)`** at `src/preload/index.ts:803-815`, mapped to the `telemetry:track` IPC channel.
- **Main-side handler at `src/main/ipc/telemetry.ts:102-123`** is a thin shim that narrows `name`/`props` at the boundary then calls the existing `track()`. All three guards — consent gate (`client.ts:283-286`), burst-cap, Zod validator (`client.ts:256-310`) — apply unchanged. The bridge is not a parallel pipeline; it is an entry point into the same one.
- **Typed renderer wrapper at `src/renderer/src/lib/telemetry.ts:50-65`** gives call sites `EventMap`-based type safety while keeping the preload surface deliberately loose (the validator is the single enforcement point at runtime).
- **The renderer is untrusted relative to telemetry payloads.** Names and props are revalidated by the registry's `.strict()` Zod schema; unknown event names and unknown/extra properties are dropped silently, matching how the in-process validator already behaves.

The bridge is also reused for any future renderer-originated event, including the deferred `funnel_step` cases below.

### Deferred to `funnel_step`

Events #3-#6 in earlier drafts each had a distinct event name (`add_repo_method_selected`, `add_repo_failed`, `add_repo_dialog_opened`, `workspace_composer_opened`). Shipping four named events for four UI surfaces grows the registry linearly with the funnel and creates four enum-design decisions we'd have to get right up front. Instead, when any of these prove necessary after observing #1+#2 data, fold them into a single generic event:

```
funnel_step
  funnel:       'onboarding_v1'
  step:         enum  // e.g. 'add_repo_dialog_opened',
                      //      'add_repo_method_selected',
                      //      'add_repo_failed',
                      //      'workspace_composer_opened'
  source?:      enum  // surface-specific, e.g. 'landing' | 'sidebar' | 'composer_no_repo'
  action?:      enum  // surface-specific, e.g. method picked
  error_class?: enum  // surface-specific failure taxonomy
```

Adding a new `step` value is additive-safe per the schema-evolution doctrine in `telemetry-events.ts`. New funnels get a new `funnel` value; the same event carries them.

Sketches of what each deferred case would look like as a `step`:

- `step: 'add_repo_dialog_opened'`, `source: 'landing' | 'sidebar' | 'composer_no_repo'` — splits the longest invisible gap (`app_opened → repo_added`) into "never opened the dialog" vs "opened and abandoned." Diminishing returns once #1+#2 are live.
- `step: 'add_repo_method_selected'`, `action: 'folder_picker' | 'clone_url' | 'drag_drop' | ...` — visibility into which entry methods users *try* before any succeed. The `action` enum must be unified with `repo_added.method` (`'folder_picker' | 'clone_url' | 'drag_drop'` per `telemetry-events.ts:73`) or explicitly extended with documented superset semantics; otherwise the join `repo_added{method=X} / funnel_step{action=X}` silently breaks.
- `step: 'add_repo_failed'`, `action: <method>`, `error_class: 'user_cancelled' | 'clone_network_error' | 'git_init_failed' | ...` — paired with the previous step to compute per-method success rates with cancels broken out from infra errors. The `error_class` design is the load-bearing part; conflating cancels with errors muddies both metrics.
- `step: 'workspace_composer_opened'`, `source: WorkspaceSource` — composer-mid-form abandonment. Mostly redundant with `add_repo_setup_step_action.action='create_worktree'` once #1 ships.

For any "X opened" step (dialog/composer), the firing site is a `useEffect` on a modal's open state, which double-fires under React StrictMode and on remounts. Use a session-scoped dedup analogous to `appOpenedTrackedThisSession` in `client.ts:98` to avoid inflating the numerator.

## What already exists and should not be re-added

- `app_opened` is the session heartbeat. Don't add another.
- `repo_added` already carries `method` and dedupes re-adds (`repos.ts:41-49`).
- `workspace_created` already carries `source` and `from_existing_branch`.
- `agent_started` already carries `agent_kind`, `launch_source`, `request_kind`.

## Properties to keep off these events

In line with the existing schema discipline at `telemetry-events.ts:142-148` (every event uses `.strict()` Zod schemas):

- No file paths, repo URLs, or display names.
- No clone URLs (already excluded from `repo_added`).
- No raw error messages — only an `error_class` enum value. The classifier for `workspace_create_failed` reads `error.message` strings (the throw sites in `worktree-remote.ts` are bare `throw new Error('...')`, some interpolating user-controlled content like branch names) to bucket into the enum, but those strings never cross the wire. Widening `error_class` later requires explicit review of the substring match set, not silent regex expansion.
- No partial form contents (workspace name, branch name, etc.).
- `value_kind` only on settings-style events, never the value itself.

## Rollout

**Phase 1 (this PR): #1 and #2.** Combined cost ~17 lines across the five Setup-step call sites and the `worktrees:create` try/catch. The renderer→main bridge already ships (see "System context"); no new IPC plumbing. Closes the two largest unknowns: Setup-step drop-off and creation failure rate. Both metrics are immediately actionable — Setup-step splits the ~60% drop into UX vs bug; failed-create gives us the failure-rate denominator we lack today.

**Phase 2 (only if Phase 1 data shows residual unknowns): `funnel_step`.** Land the generic event with whichever `step` values the Phase 1 data actually demands, in priority order:
1. `add_repo_dialog_opened` if `app_opened → repo_added` is still a black box.
2. `add_repo_method_selected` + `add_repo_failed` together — `method_selected` without `failed` produces a misleading conversion rate.
3. `workspace_composer_opened` last; mostly redundant with #1.

Defer indefinitely if Phase 1 answers the questions on its own.

## What Phase 1 gives us

```
app_opened                                                      (existing)
  ↓
repo_added                                                      (existing)
  ↓
add_repo_setup_step_action                                      [#1]
  ↓ (action = create_worktree)
workspace_created  ──or──►  workspace_create_failed             (existing / [#2])
  ↓
agent_started                                                   (existing)
```

The two transitions that were previously single black boxes (`repo_added → workspace_created` and "missing `workspace_created` events") now have measurable numerators and denominators. Remaining invisible gaps are the pre-`repo_added` surfaces, which Phase 2 addresses if needed.

## Open questions

- **Should we add a `landing_cta_clicked` step under `funnel_step`?** Only if Phase 1 plus a `step: 'add_repo_dialog_opened'` reveals that most `app_opened` sessions never open the AddRepo dialog. Defer.
