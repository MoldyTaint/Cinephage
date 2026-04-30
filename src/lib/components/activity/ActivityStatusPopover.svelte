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
		compactLabel?: string;
	}

	let { activity, compactLabel }: Props = $props();

	let open = $state(false);

	const categoryTag: ActivityCategoryTag | null = $derived(getActivityCategoryTag(activity));

	const config = $derived(statusConfig[activity.status] || statusConfig.no_results);

	const StatusIcon = $derived(config.icon);

	const typeLabel = $derived(
		activity.taskType
			? (TASK_TYPE_LABELS[activity.taskType] ?? 'Unknown')
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
		{:else if compactLabel}
			{compactLabel}
		{:else}
			{getStatusLabel(activity, config.label)}
		{/if}
	</div>
	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="dropdown-content z-50 w-72 rounded-lg border border-base-300 bg-base-200 p-3 shadow-xl"
			onclick={(e) => e.stopPropagation()}
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
					<div class="mb-1 text-xs font-medium tracking-wider uppercase">{typeLabel}</div>
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

				<div class="border-t border-base-300 pt-1">
					<a
						href={resolvePath('/activity?tab=history')}
						class="flex link items-center gap-1 text-xs link-primary link-hover"
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
