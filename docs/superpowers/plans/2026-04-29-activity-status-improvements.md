# Activity Status Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add activity type tags and clickable status popovers to the dashboard and activity table, plus fix the "SundefinedE" bug.

**Architecture:** New shared Svelte components (`ActivityTypeTag`, `ActivityStatusPopover`) used by both the dashboard sidebar and the ActivityTable. A new helper function in `activity-display-utils.ts` derives the category tag from `taskType`/`activitySource`. The ActivityService bug fix adopts the existing guard pattern from `MediaResolverService`.

**Tech Stack:** Svelte 5, DaisyUI, TypeScript, lucide-svelte

---

### Task 1: Fix "SundefinedE" bug in ActivityService

**Files:**
- Modify: `src/lib/server/activity/ActivityService.ts:1811-1846` (resolveMediaInfo)
- Modify: `src/lib/server/activity/ActivityService.ts:1880-1896` (resolveMonitoringMediaInfo)

- [ ] **Step 1: Fix resolveMediaInfo — guard seasonNumber in episode title formatting**

In `src/lib/server/activity/ActivityService.ts`, replace the episode title construction block (lines 1819-1822) to guard against undefined seasonNumber:

```typescript
// BEFORE (lines 1819-1822):
const mediaTitle =
    item.episodeIds.length > 1
        ? `${s.title} S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}-E${String(mediaMaps.episodes.get(item.episodeIds[item.episodeIds.length - 1])?.episodeNumber).padStart(2, '0')}`
        : `${s.title} S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;

// AFTER:
const endEp = mediaMaps.episodes.get(item.episodeIds[item.episodeIds.length - 1]);
const mediaTitle =
    seasonNumber !== undefined
        ? item.episodeIds.length > 1
            ? `${s.title} S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}-E${String(endEp?.episodeNumber).padStart(2, '0')}`
            : `${s.title} S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`
        : `${s.title} E${String(episodeNumber).padStart(2, '0')}`;
```

- [ ] **Step 2: Fix resolveMonitoringMediaInfo — guard seasonNumber in episode title formatting**

In `src/lib/server/activity/ActivityService.ts`, replace the mediaTitle construction at line 1889:

```typescript
// BEFORE (line 1889):
mediaTitle: `${s.title} S${String(seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`,

// AFTER:
mediaTitle:
    seasonNumber !== undefined
        ? `${s.title} S${String(seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`
        : `${s.title} E${String(ep.episodeNumber).padStart(2, '0')}`,
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS (no type errors)

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/activity/ActivityService.ts
git commit -m "fix: guard against undefined seasonNumber in episode title formatting"
```

---

### Task 2: Add getActivityCategoryTag helper

**Files:**
- Modify: `src/lib/components/activity/activity-display-utils.ts`

- [ ] **Step 1: Add the helper function**

Append to `src/lib/components/activity/activity-display-utils.ts`:

```typescript
const SUBTITLE_TASK_TYPES = new Set(['missingSubtitles', 'subtitleUpgrade']);

const MEDIA_TASK_TYPES = new Set(['missing', 'upgrade', 'cutoffUnmet', 'cutoff_unmet', 'new_episode']);

export interface ActivityCategoryTag {
	label: string;
	variant: string;
}

export function getActivityCategoryTag(
	activity: Pick<UnifiedActivity, 'taskType' | 'activitySource'>
): ActivityCategoryTag | null {
	if (activity.taskType && SUBTITLE_TASK_TYPES.has(activity.taskType)) {
		return { label: 'Sub', variant: 'badge-ghost badge-xs' };
	}
	if (activity.taskType && MEDIA_TASK_TYPES.has(activity.taskType)) {
		return { label: 'Media', variant: 'badge-primary badge-xs' };
	}
	if (activity.taskType === 'smartListRefresh') {
		return { label: 'List', variant: 'badge-ghost badge-xs' };
	}
	if (activity.taskType === 'media_move') {
		return { label: 'Move', variant: 'badge-ghost badge-xs' };
	}
	if (
		!activity.taskType &&
		(activity.activitySource === 'queue' || activity.activitySource === 'download_history')
	) {
		return { label: 'Download', variant: 'badge-accent badge-xs' };
	}
	return null;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/activity/activity-display-utils.ts
git commit -m "feat: add getActivityCategoryTag helper for activity type tags"
```

---

### Task 3: Create ActivityTypeTag component

**Files:**
- Create: `src/lib/components/activity/ActivityTypeTag.svelte`

- [ ] **Step 1: Create the component**

Create `src/lib/components/activity/ActivityTypeTag.svelte`:

```svelte
<script lang="ts">
	import type { ActivityCategoryTag } from './activity-display-utils.js';

	interface Props {
		tag: ActivityCategoryTag;
	}

	let { tag }: Props = $props();
</script>

<span class="badge {tag.variant} opacity-70">{tag.label}</span>
```

- [ ] **Step 2: Run typecheck**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/activity/ActivityTypeTag.svelte
git commit -m "feat: add ActivityTypeTag component"
```

---

### Task 4: Create ActivityStatusPopover component

**Files:**
- Create: `src/lib/components/activity/ActivityStatusPopover.svelte`

- [ ] **Step 1: Create the component**

Create `src/lib/components/activity/ActivityStatusPopover.svelte`:

```svelte
<script lang="ts">
	import { resolvePath } from '$lib/utils/routing';
	import { TASK_TYPE_LABELS, type UnifiedActivity } from '$lib/types/activity';
	import {
		statusConfig,
		getStatusLabel,
		getActivityCategoryTag,
		formatRelativeTime,
		type ActivityCategoryTag
	} from './activity-display-utils.js';
	import ActivityTypeTag from './ActivityTypeTag.svelte';
	import { ExternalLink } from 'lucide-svelte';

	interface Props {
		activity: UnifiedActivity;
	}

	let { activity }: Props = $props();

	let open = $state(false);

	const categoryTag: ActivityCategoryTag | null = $derived(getActivityCategoryTag(activity));

	const config = $derived(statusConfig[activity.status] || statusConfig.no_results);

	const StatusIcon = $derived(config.icon);

	const typeLabel = $derived(
		activity.taskType
			? TASK_TYPE_LABELS[activity.taskType] ?? 'Unknown'
			: activity.activitySource === 'queue' || activity.activitySource === 'download_history'
				? 'Download'
				: 'Activity'
	);

	function toggle() {
		open = !open;
	}

	function close() {
		open = false;
	}
</script>

<div class="dropdown dropdown-end {open ? 'dropdown-open' : ''}">
	<div
		class="badge gap-1 {config.variant} cursor-pointer"
		tabindex="0"
		role="button"
		onclick={toggle}
		onkeydown={(e) => e.key === 'Enter' && toggle()}
	>
		<StatusIcon
			class="h-3 w-3 {activity.status === 'downloading' || activity.status === 'searching'
				? 'animate-spin'
				: ''}"
		/>
		{#if activity.status === 'downloading' && activity.downloadProgress !== undefined}
			{activity.downloadProgress}%
		{:else}
			{getStatusLabel(activity, config.label)}
		{/if}
	</div>
	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="dropdown-content z-50 w-72 rounded-lg border border-base-300 bg-base-200 p-3 shadow-xl"
			onclick|stopPropagation
		>
			<div class="space-y-2 text-sm">
				<div class="flex items-center gap-2">
					<StatusIcon class="h-4 w-4" />
					<span class="font-medium">{getStatusLabel(activity, config.label)}</span>
					{#if categoryTag}
						<ActivityTypeTag tag={categoryTag} />
					{/if}
				</div>

				<div class="text-base-content/60">
					<div class="text-xs font-medium uppercase tracking-wider mb-1">{typeLabel}</div>
				</div>

				{#if activity.mediaTitle}
					<div>
						<span class="text-base-content/50">Media:</span>
						<span class="ml-1">{activity.mediaTitle}</span>
					</div>
				{/if}

				{#if activity.statusReason}
					<div>
						<span class="text-base-content/50">Reason:</span>
						<span class="ml-1">{activity.statusReason}</span>
					</div>
				{/if}

				{#if activity.releaseTitle}
					<div>
						<span class="text-base-content/50">Release:</span>
						<span class="ml-1 text-xs break-all">{activity.releaseTitle}</span>
					</div>
				{/if}

				<div>
					<span class="text-base-content/50">When:</span>
					<span class="ml-1">{formatRelativeTime(activity.startedAt)}</span>
				</div>

				<div class="pt-1 border-t border-base-300">
					<a
						href={resolvePath('/activity?tab=history')}
						class="link link-primary link-hover text-xs flex items-center gap-1"
						onclick={close}
					>
						View in Activity
						<ExternalLink class="h-3 w-3" />
					</a>
				</div>
			</div>
		</div>
	{/if}
</div>
```

- [ ] **Step 2: Run typecheck**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/activity/ActivityStatusPopover.svelte
git commit -m "feat: add ActivityStatusPopover component"
```

---

### Task 5: Update component barrel export

**Files:**
- Modify: `src/lib/components/activity/index.ts`

- [ ] **Step 1: Add exports**

Replace contents of `src/lib/components/activity/index.ts`:

```typescript
export { default as ActivityTable } from './ActivityTable.svelte';
export { default as ActivityTypeTag } from './ActivityTypeTag.svelte';
export { default as ActivityStatusPopover } from './ActivityStatusPopover.svelte';
export { getActivityCategoryTag, type ActivityCategoryTag } from './activity-display-utils.js';
```

- [ ] **Step 2: Run typecheck**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/activity/index.ts
git commit -m "feat: export new activity components"
```

---

### Task 6: Add type tags and popovers to ActivityTable

**Files:**
- Modify: `src/lib/components/activity/ActivityTable.svelte`

- [ ] **Step 1: Add imports**

In the `<script>` section, add these imports after the existing `activity-display-utils.js` import block (after line 37):

```typescript
import { getActivityCategoryTag } from './activity-display-utils.js';
import ActivityTypeTag from './ActivityTypeTag.svelte';
import ActivityStatusPopover from './ActivityStatusPopover.svelte';
```

- [ ] **Step 2: Replace desktop status cell with popover + type tag**

Replace the status `<td>` block (lines 611-626):

```svelte
<!-- BEFORE: -->
<td>
    <span class="badge gap-1 {config.variant}">
        <StatusIcon ... />
        ...
    </span>
</td>

<!-- AFTER: -->
<td>
    <div class="flex items-center gap-1">
        {@const categoryTag = getActivityCategoryTag(activity)}
        {#if categoryTag}
            <ActivityTypeTag tag={categoryTag} />
        {/if}
        <ActivityStatusPopover {activity} />
    </div>
</td>
```

- [ ] **Step 3: Replace mobile card status badge with popover + type tag**

Replace the mobile card status badge block (lines 259-270):

```svelte
<!-- BEFORE: -->
<span class="badge gap-1 {config.variant}">
    <StatusIcon ... />
    ...
</span>

<!-- AFTER: -->
<div class="flex items-center gap-1">
    {@const categoryTag = getActivityCategoryTag(activity)}
    {#if categoryTag}
        <ActivityTypeTag tag={categoryTag} />
    {/if}
    <ActivityStatusPopover {activity} />
</div>
```

- [ ] **Step 4: Run typecheck**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/activity/ActivityTable.svelte
git commit -m "feat: add activity type tags and status popovers to ActivityTable"
```

---

### Task 7: Refactor dashboard sidebar to use shared utils and add tags + popovers

**Files:**
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Add imports for shared utils and new components**

Add after the existing import block (after line 33):

```typescript
import {
	statusConfig as sharedStatusConfig,
	getStatusLabel,
	getCompactProgressLabel as sharedGetCompactProgressLabel,
	formatRelativeTime as sharedFormatRelativeTime,
	getActivityCategoryTag
} from '$lib/components/activity/activity-display-utils.js';
import ActivityTypeTag from '$lib/components/activity/ActivityTypeTag.svelte';
import ActivityStatusPopover from '$lib/components/activity/ActivityStatusPopover.svelte';
```

- [ ] **Step 2: Remove local statusConfig and duplicated helper functions**

Delete the local `statusConfig` object (lines 236-249), the local `getCompactProgressLabel` function (lines 265-279), and the local `formatRelativeTime` function (lines 213-227). Keep the `formatDate`, `getMediaLink`, `canLinkToMedia`, and `formatBytes` functions as they are dashboard-specific.

Replace references to the deleted locals with the imported versions:
- `statusConfig` → `sharedStatusConfig`
- `getCompactProgressLabel` → `sharedGetCompactProgressLabel`
- `formatRelativeTime` → `sharedFormatRelativeTime`

Or, since the imports shadow the removed locals, rename the imports to match the original names:

```typescript
import {
	statusConfig,
	getStatusLabel,
	getCompactProgressLabel,
	formatRelativeTime,
	getActivityCategoryTag
} from '$lib/components/activity/activity-display-utils.js';
```

- [ ] **Step 3: Update the dashboard table rows to use type tags and popovers**

Replace the status badge `<td>` in the dashboard table (lines 980-993):

```svelte
<!-- BEFORE: -->
<td>
    <span class="badge gap-1 {config.variant} badge-xs">
        <StatusIcon
            class="h-3 w-3 {activity.status === 'downloading' ||
            activity.status === 'searching'
                ? 'animate-spin'
                : ''}"
        />
        {#if activity.status === 'downloading' && activity.downloadProgress !== undefined}
            {activity.downloadProgress}%
        {:else}
            {config.label}
        {/if}
    </span>
</td>

<!-- AFTER: -->
<td>
    <div class="flex items-center gap-1">
        {@const categoryTag = getActivityCategoryTag(activity)}
        {#if categoryTag}
            <ActivityTypeTag tag={categoryTag} />
        {/if}
        <ActivityStatusPopover {activity} />
    </div>
</td>
```

Also update the progress column to use the shared `getStatusLabel` where it currently shows `config.label` (line 1038):

```svelte
<!-- BEFORE (line 1038): -->
<span class="text-xs text-base-content/50">{config.label}</span>

<!-- AFTER: -->
<span class="text-xs text-base-content/50">{getStatusLabel(activity, config.label)}</span>
```

- [ ] **Step 4: Remove now-unused lucide icon imports**

Remove any lucide icons from the dashboard imports that are no longer used directly (they're used via the shared statusConfig now). The icons that can be removed from `+page.svelte`: `AlertCircle`, `PauseCircle`, `XCircle`, `Minus`, `Loader2` — but verify each is not used elsewhere in the dashboard before removing. Keep `Clapperboard`, `Tv`, `Activity`, `Clock`, `ArrowRight`, `Download`, `Upload`, `CheckCircle`, `Search`, `Plus`, `FileQuestion`, `Calendar`, `TrendingUp`, `Compass`, `Wifi`, `ListTodo`, `HardDrive` as they are used in other dashboard sections.

- [ ] **Step 5: Run typecheck**

Run: `npm run check`
Expected: PASS

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: PASS (fix any unused import issues)

- [ ] **Step 7: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: add activity type tags and status popovers to dashboard sidebar"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full typecheck**

Run: `npm run check`
Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds
