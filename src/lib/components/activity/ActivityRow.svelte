<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { TASK_TYPE_LABELS, type UnifiedActivity } from '$lib/types/activity';
	import { Clapperboard, Tv, ChevronDown, ChevronUp } from 'lucide-svelte';
	import { getMediaLink, canLinkToMedia } from '$lib/utils/media-link.js';
	import { formatBytes } from '$lib/utils/format.js';
	import {
		statusConfig,
		getCompactProgressLabel,
		getStatusLabel,
		getResolutionBadge,
		getActivityCategoryTag,
		formatRelativeTime,
		formatTimestamp,
		getDisplayTime
	} from './activity-display-utils.js';
	import ActivityStatusPopover from './ActivityStatusPopover.svelte';

	interface Props {
		activity: UnifiedActivity;
		compact: boolean;
		selectionMode: boolean;
		isSelected: boolean;
		isSelectable: boolean;
		isExpanded: boolean;
		onToggle: () => void;
		onRowClick?: (activity: UnifiedActivity) => void;
		onToggleSelection: (selected: boolean) => void;
	}

	let {
		activity,
		compact,
		selectionMode,
		isSelected,
		isSelectable,
		isExpanded,
		onToggle,
		onRowClick,
		onToggleSelection
	}: Props = $props();

	const protocolLabels: Record<string, string> = {
		torrent: 'torrent',
		usenet: 'usenet',
		streaming: 'stream'
	};

	const config = $derived(statusConfig[activity.status] || statusConfig.no_results);

	const compactLabel = $derived.by(() => {
		const tag = getActivityCategoryTag(activity);
		const fallbackLabel = config.label;
		return tag
			? `${tag.label} ${getStatusLabel(activity, fallbackLabel)}`
			: getStatusLabel(activity, fallbackLabel);
	});

	const timelineColspan = $derived((compact ? 5 : 10) + (selectionMode ? 1 : 0));

	const hasTimeline = $derived((activity.timeline?.length ?? 0) > 0);

	function handleRowClick() {
		if (onRowClick) {
			onRowClick(activity);
		} else {
			onToggle();
		}
	}

	function handleCheckboxClick(e: MouseEvent) {
		e.stopPropagation();
		onToggleSelection((e.currentTarget as HTMLInputElement).checked);
	}
</script>

<tr class="hover cursor-pointer" onclick={handleRowClick}>
	{#if selectionMode}
		<td class="w-10">
			<input
				type="checkbox"
				class="checkbox checkbox-xs"
				checked={isSelected}
				disabled={!isSelectable}
				aria-label={`Select ${activity.mediaTitle}`}
				onclick={handleCheckboxClick}
			/>
		</td>
	{/if}
	<td class="w-10">
		{#if hasTimeline}
			{#if isExpanded}
				<ChevronUp class="h-4 w-4 text-base-content/50" />
			{:else}
				<ChevronDown class="h-4 w-4 text-base-content/50" />
			{/if}
		{/if}
	</td>

	<td>
		<ActivityStatusPopover {activity} {compactLabel} />
	</td>

	<td>
		{#if canLinkToMedia(activity)}
			<a
				href={getMediaLink(activity)}
				class="flex items-center gap-2 hover:text-primary"
				onclick={(e) => e.stopPropagation()}
			>
				{#if activity.mediaType === 'movie'}
					<Clapperboard class="h-4 w-4 shrink-0" />
				{:else}
					<Tv class="h-4 w-4 shrink-0" />
				{/if}
				<span class="max-w-48 truncate" title={activity.mediaTitle}>
					{activity.mediaTitle}
					{#if activity.mediaYear}
						<span class="text-base-content/60">({activity.mediaYear})</span>
					{/if}
				</span>
			</a>
		{:else}
			<div class="flex items-center gap-2">
				{#if activity.mediaType === 'movie'}
					<Clapperboard class="h-4 w-4 shrink-0" />
				{:else}
					<Tv class="h-4 w-4 shrink-0" />
				{/if}
				<span class="max-w-48 truncate" title={activity.mediaTitle}>
					{activity.mediaTitle}
					{#if activity.mediaYear}
						<span class="text-base-content/60">({activity.mediaYear})</span>
					{/if}
				</span>
			</div>
		{/if}
	</td>

	{#if !compact}
		<td>
			<span class="block max-w-64 truncate text-sm" title={activity.releaseTitle || '-'}>
				{activity.releaseTitle || '-'}
			</span>
		</td>

		<td>
			{#if activity.quality}
				<div class="flex flex-wrap gap-1">
					{#if getResolutionBadge(activity)}
						<span class="badge badge-outline badge-xs">{getResolutionBadge(activity)}</span>
					{/if}
					{#if activity.quality.source}
						<span class="badge badge-outline badge-xs">{activity.quality.source}</span>
					{/if}
					{#if activity.quality.codec}
						<span class="badge badge-outline badge-xs">{activity.quality.codec}</span>
					{/if}
					{#if activity.quality.hdr}
						<span class="badge badge-outline badge-xs">{activity.quality.hdr}</span>
					{/if}
				</div>
			{:else}
				<span class="text-base-content/40">-</span>
			{/if}
		</td>

		<td>
			<span class="text-sm">{activity.releaseGroup || '-'}</span>
		</td>

		<td>
			<span class="text-sm">{formatBytes(activity.size)}</span>
		</td>

		<td>
			{#if activity.activitySource === 'monitoring' && activity.taskType}
				{@const taskLabel = TASK_TYPE_LABELS[activity.taskType]}
				<div class="text-sm">
					<span class="text-base-content/70">{taskLabel ?? activity.taskType}</span>
				</div>
			{:else if activity.indexerName}
				<div class="text-sm">
					<span>{activity.indexerName}</span>
					{#if activity.protocol}
						<span class="text-base-content/50"
							>({protocolLabels[activity.protocol] || activity.protocol})</span
						>
					{/if}
				</div>
			{:else}
				<span class="text-base-content/40">-</span>
			{/if}
		</td>
	{/if}

	<td>
		{#if activity.status === 'downloading' && activity.downloadProgress !== undefined}
			<div class="flex items-center gap-2">
				<progress class="progress w-16 progress-info" value={activity.downloadProgress} max="100"
				></progress>
			</div>
		{:else if getCompactProgressLabel(activity)}
			<span class="max-w-32 truncate text-xs text-base-content/60" title={activity.statusReason}>
				{getCompactProgressLabel(activity)}
			</span>
		{:else}
			<span class="text-sm">{getStatusLabel(activity, config.label)}</span>
		{/if}
	</td>

	<td>
		<span class="text-sm" title={getDisplayTime(activity)}>
			{formatRelativeTime(getDisplayTime(activity))}
		</span>
	</td>
</tr>

{#if isExpanded && hasTimeline}
	<tr class="bg-base-200/50">
		<td colspan={timelineColspan} class="py-3">
			<div class="px-4">
				<div class="mb-2 text-sm font-medium">{m.activity_table_timeline()}</div>
				<div class="flex flex-wrap items-center gap-2 text-xs">
					{#each activity.timeline ?? [] as event, i (event.timestamp + event.type)}
						<span class="flex items-center gap-1 rounded bg-base-300 px-2 py-1">
							<span class="capitalize">{event.type}</span>
							<span class="text-base-content/50">({formatTimestamp(event.timestamp)})</span>
						</span>
						{#if i < (activity.timeline?.length ?? 0) - 1}
							<span class="text-base-content/30">→</span>
						{/if}
					{/each}
				</div>

				{#if activity.importedPath}
					<div class="mt-3">
						<span class="text-xs text-base-content/60">{m.activity_table_importedTo()}</span>
						<span class="font-mono text-xs">{activity.importedPath}</span>
					</div>
				{/if}

				{#if activity.isUpgrade && activity.oldScore !== undefined && activity.newScore !== undefined}
					<div class="mt-2">
						<span class="text-xs text-base-content/60">{m.activity_table_upgrade()}</span>
						<span class="text-xs">{activity.oldScore} → {activity.newScore}</span>
					</div>
				{/if}
			</div>
		</td>
	</tr>
{/if}
