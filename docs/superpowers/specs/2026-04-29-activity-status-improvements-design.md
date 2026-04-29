# Activity Status Improvements

## Problem

The dashboard's Recent History sidebar shows activity entries with bare status labels ("Failed", "Search Error", "Imported") that give no indication of what *kind* of activity it is — subtitle search, media download, upgrade, etc. There is also no way to click on a status to see what actually happened. Additionally, a bug causes episode entries to display as "SundefinedE01" when season data is missing.

## Changes

### 1. Activity Type Tag (`ActivityTypeTag.svelte`)

New shared Svelte component rendering a small prefix badge before the status badge. Derived from `taskType` and `activitySource`:

| Condition | Tag text | Badge style |
|---|---|---|
| `taskType: missingSubtitles or subtitleUpgrade` | Sub | `badge-ghost badge-xs` |
| `taskType: missing, upgrade, cutoffUnmet, cutoff_unmet, new_episode` | Media | `badge-primary badge-xs` |
| `taskType: smartListRefresh` | List | `badge-ghost badge-xs` |
| `taskType: media_move` | Move | `badge-ghost badge-xs` |
| `activitySource: queue or download_history` (no taskType) | Download | `badge-accent badge-xs` |
| Fallback | *(nothing rendered)* | — |

Helper function `getActivityCategoryTag(activity)` added to `activity-display-utils.ts` returning `{ label: string; variant: string } | null`.

### 2. Clickable Status Popover (`ActivityStatusPopover.svelte`)

New shared component wrapping a status badge with a DaisyUI dropdown popover on click. Popover content:

- Activity type label (from TASK_TYPE_LABELS or "Download")
- Status icon + label
- Error/reason (`statusReason`)
- Release title (if available)
- Relative timestamp
- Link to `/activity?tab=history` (optionally filtered)

Uses the same `dropdown-content` pattern as `SubtitlePopover.svelte`. Applied to both the dashboard sidebar and the ActivityTable status column.

### 3. Fix "SundefinedE" Bug

Two methods in `ActivityService.ts` construct `S${seasonNumber}` without guarding against null/undefined:

- `resolveMediaInfo()` (~line 1813): `seasonNumber ?? undefined` → `String(undefined)` = "undefined"
- `resolveMonitoringMediaInfo()` (~line 1889): same pattern

Fix: adopt the same guard from `MediaResolverService.formatEpisodeTitle()` — if season or episode is undefined, fall back to just the series title without the S/E prefix.

### 4. Unify Dashboard statusConfig

The dashboard (`+page.svelte` line 236) duplicates `statusConfig`, `getStatusLabel`, `getCompactProgressLabel`, and `formatRelativeTime` locally. Refactor to import from `activity-display-utils.ts` and use `getStatusLabel()` so the dashboard shows the same enriched labels (e.g. "Subtitle Search Error" instead of generic "Search Error").

## Files

| File | Action |
|---|---|
| `src/lib/components/activity/ActivityTypeTag.svelte` | Create |
| `src/lib/components/activity/ActivityStatusPopover.svelte` | Create |
| `src/lib/components/activity/activity-display-utils.ts` | Add `getActivityCategoryTag()` |
| `src/lib/components/activity/index.ts` | Export new components |
| `src/routes/+page.svelte` | Remove local statusConfig, import shared utils, add type tags + popovers |
| `src/lib/components/activity/ActivityTable.svelte` | Add type tags + popovers to status column |
| `src/lib/server/activity/ActivityService.ts` | Fix Sundefined bug in two methods |
