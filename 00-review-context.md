# Review Context

## Branch Info

- Base: origin/main (b5d2b288 — branch is at HEAD of main, all changes are uncommitted)
- Current: brennanb2025/posthog-checkin
- All "diff" is uncommitted changes (no commits yet on top of main)

## Changed Files Summary

- M src/main/ipc/worktrees.ts
- M src/renderer/src/components/sidebar/AddRepoDialog.tsx
- M src/shared/telemetry-events.test.ts
- M src/shared/telemetry-events.ts
- A docs/onboarding-funnel-telemetry.md (untracked)
- A src/main/ipc/worktree-create-error-class.ts (untracked)
- A src/main/ipc/worktree-create-error-class.test.ts (untracked)

## Changed Line Ranges (PR Scope)

<!-- In scope: issues on these lines OR caused by these changes. Out of scope: unrelated pre-existing issues -->

| File | Changed Lines |
|------|---------------|
| src/main/ipc/worktrees.ts | 43 (added import), 162-189 (added try/catch + telemetry), 198 (removed line) |
| src/renderer/src/components/sidebar/AddRepoDialog.tsx | 14 (import), 197, 215, 224-232 (handleSetupStepBack), 258 (onClick rebind), 412 (skip onClick) |
| src/shared/telemetry-events.ts | 76-102 (new schemas), 217-231 (event schemas), 249, 251 (registry entries) |
| src/shared/telemetry-events.test.ts | 109-162 (new test blocks) |
| src/main/ipc/worktree-create-error-class.ts | ALL (new file, 1-44) |
| src/main/ipc/worktree-create-error-class.test.ts | ALL (new file, 1-51) |
| docs/onboarding-funnel-telemetry.md | ALL (new file) |

## Review Standards Reference

- Follow /review-code standards
- Focus on: correctness, security, performance, maintainability
- Priority levels: Critical > High > Medium > Low

## File Categories

### Backend/IPC
- src/main/ipc/worktrees.ts
- src/main/ipc/worktree-create-error-class.ts
- src/main/ipc/worktree-create-error-class.test.ts

### Frontend/UI
- src/renderer/src/components/sidebar/AddRepoDialog.tsx

### Utility/Common
- src/shared/telemetry-events.ts
- src/shared/telemetry-events.test.ts

### Docs (skipped from code review; reviewed only as context)
- docs/onboarding-funnel-telemetry.md

## Skipped Issues (Do Not Re-validate)

- worktree-create-error-class.ts:17-20 | Low | Hypothetical Buffer-stderr handling. Current throws all use bare Error('...') without .stderr; existing code does not need this defensive code per "don't add validation for scenarios that can't happen". | Buffer stderr handling missing
- worktrees.ts:168 | Low | Optional comment about future single-caller assumption. Not a correctness issue. | Comment about future caller of worktrees:create
- AddRepoDialog.tsx:411-414 | Low | Inline arrow onSkip is purely consistency nit; no functional impact. | Inline onSkip arrow not memoized
- AddRepoDialog.tsx:411-414, :197, :215, :228-231 | Low | Double-click guards: track is fire-and-forget; button unmounts on close; impact bounded; precedent (appOpenedTrackedThisSession) is only for useEffect-driven emits. | Skip/Open/Configure/Back double-click guards
- telemetry-events.test.ts:115 | Low | Test loop type (use addRepoSetupStepActionSchema.options); maintainability nit only — test still runtime-fails on typo. | Test loop should use schema.options
- telemetry-events.test.ts:137-165 | Low | Missing source enum rejection test; redundant with workspace_created coverage of same schema. | Missing source enum test
- telemetry-events.ts:87 | Low | Unused export AddRepoSetupStepAction; consistent with peer-type exports (RepoMethod, OptInVia). No fix needed per agent. | Unused type export
- worktrees.ts:168 | Low | Optional comment about emit placement vs pre-validation throws. | Optional emit-placement comment

## Issues Validated as False Positive

- worktrees.ts:182 (Codex): track() in catch wrapping concern. track() does not throw — `validate()` returns a result object, posthog.capture is internally guarded, all early-returns inside track() prevent throws. Existing pattern across the codebase wraps no track() call. FP.

## Issues to Fix (Phase 3)

1. **High** worktree-create-error-class.ts:18-43 — Case-sensitivity gap: `text.includes('worktree')` is lowercase but real throw site at worktree-remote.ts:203,441 is `'Worktree created but not found in listing'` (capital W). Found by: Claude (×2). Fix: lowercase-normalize the text once before substring checks.

2. **Medium** worktree-create-error-class.ts:40 — Overly broad `'git '` and `'worktree'` substrings cause SSH relay errors (worktree-remote.ts:190, "The SSH relay has not registered the worktree path yet") to bucket into `git_failed` instead of `unknown`. Found by: Claude (×2). Fix: replace broad anchors with specific markers (`'fatal:'`, `'git worktree'`, `'created but not found'`, `'no git provider'`).

3. **Medium** worktree-create-error-class.test.ts:1-4 — Header comment over-promises: claims to "fixture the actual throw sites" but only covers 3 of ~10 throw sites in worktree-remote.ts. Found by: Claude. Fix: adjust the comment to honestly describe spot-coverage of load-bearing throws.

## Iteration State

Current iteration: 1
Last completed phase: Validation
Files fixed this iteration: []
