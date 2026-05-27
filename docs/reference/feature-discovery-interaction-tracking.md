# Feature Discovery Interaction Tracking

This document defines local feature-interaction state used to decide whether Orca should still teach a feature with a contextual tour or feature tip.

## Decision

Track first meaningful interaction for education-targeted features in `PersistedUIState.featureInteractions`.

Do not upload this state as broad analytics. Product analytics should continue to use bounded telemetry events and downstream product events. Local interaction state answers a different question: "Has this user already found enough of this feature that education would be redundant?"

## Rules

- Add a `FeatureInteractionId` in `src/shared/feature-interactions.ts` before using it.
- Record only the first meaningful interaction.
- Prefer explicit actions over passive visibility.
- Passive visibility is acceptable only when opening the surface is itself the product use, such as opening Tasks.
- Record after persisted UI is hydrated by using `recordFeatureInteraction(...)`; it no-ops before hydration.
- Keep IDs stable. If the meaning changes materially, add a new ID.
- Do not include user text, paths, URLs, repo names, branch names, hostnames, commands, prompts, or tokens in this state.

## Feature Catalog

| Feature | Interaction ID | Record when | Education use |
| --- | --- | --- | --- |
| Review notes to agent | `review-notes` | A diff or markdown review note is added, or review notes are marked sent to an agent. | Suppress or target a future review-notes tour/tip about adding line notes and sending focused feedback back to an agent. |
| Ship with AI | `ai-commit-pr` | AI commit/PR generation is enabled or a commit message / PR draft is generated. | Suppress future education about AI commit/PR generation. No contextual tour is planned for this branch. |
| Floating Workspace | `floating-workspace` | The floating workspace opens, is enabled, or is configured. | Suppress future tips about the global terminal/browser/markdown workspace. No contextual tour is planned for this branch. |
| Quick Commands | `quick-commands` | A terminal quick command is created or edited. | Suppress future tips about saved terminal commands. No contextual tour is planned for this branch. |
| Computer Use | `computer-use` | Computer Use is selected in onboarding, a permission setup is opened, or the skill setup terminal opens. | Suppress future tips once the user has started setup. No contextual tour is planned until there is a better non-settings entry point. |
| Mobile pairing | `mobile-pairing` | Mobile is enabled or a mobile pairing QR/code is generated. | Suppress future mobile-pairing tips. No contextual tour is planned for this branch. |
| Workspace board actions | `workspace-board-actions` | A card/status action, lane configuration, density change, pin drop, or board drag action is used. | Keep the existing workspace-board tour, and avoid repeating deeper board-action education after real use. |
| Automation creation | `automation-created` | A local automation or external Hermes cron is created. | Keep the existing Automations tour, and suppress creation-focused education after the user creates one. |
| Automation run | `automation-run` | A local or external automation run is manually queued. | Keep the existing Automations tour, and suppress run/inspection education after the user queues a run. |
| Resource Manager | `resource-manager` | The Resource Manager status-bar popover is opened, or its status-bar visibility is toggled in Appearance/status-bar controls. | Suppress future tips about CPU, memory, session, daemon, and workspace disk-scan controls after the user has found the manager. |
| Provider usage tracking | `usage-tracking` | Stats & Usage is opened, Claude/Codex/OpenCode usage analytics are enabled, provider usage details are opened from the status bar, Gemini usage/OAuth is configured, or provider usage status-bar toggles are changed. | Suppress future tips about where to find token/rate-limit/usage tracking for Claude, Codex, Gemini, OpenCode, and related providers. |
| Agent Browser Use setup | `agent-browser-use` | Browser Use is selected in onboarding, enabled in settings, its setup terminal opens, or cookies are imported. | Suppress future setup tips once the user has started Browser Use setup. |
| Agent Orchestration setup | `agent-orchestration` | Orchestration is selected in onboarding, enabled in settings, or its setup terminal opens. | Suppress future setup tips once the user has started Orchestration setup. |
| Notifications | `notifications` | Notifications are enabled in onboarding/settings or a test notification is sent. | Suppress future notification setup tips. |

## Existing Contextual Tour Features

The branch already records surface-level interactions for the current contextual tours:

- `workspace-board`: workspace board opened
- `browser`: non-blank browser page viewed
- `tasks`: Tasks page opened
- `automations`: Automations page opened
- `workspace-creation`: workspace creation flow opened

These remain intentionally separate from action-level IDs such as `workspace-board-actions`, `automation-created`, and `automation-run`. Surface-level IDs answer "has the user entered the feature area?" Action-level IDs answer "has the user performed the deeper workflow?"
