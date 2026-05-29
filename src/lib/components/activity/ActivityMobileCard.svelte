<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { isImportFailedActivity, type UnifiedActivity } from '$lib/types/activity';
	import {
		Pause,
		Play,
		RotateCcw,
		Trash2,
		MessageSquare,
		Clapperboard,
		Tv,
		ChevronDown,
		ChevronUp
	} from 'lucide-svelte';
	import { getMediaLink, canLinkToMedia } from '$lib/utils/media-link.js';
	import { formatBytes } from '$lib/utils/format.js';
	import {
		statusConfig,
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
		isFailedReasonExpanded: boolean;
		isQueueActionLoading: boolean;
		onToggle: () => void;
		onToggleFailedReason: () => void;
		onQueueAction: (action: 'pause' | 'resume' | 'remove' | 'retry') => Promise<void>;
		onToggleSelection: (selected: boolean) => void;
	}

	let {
		activity,
		compact,
		selectionMode,
		isSelected,
		isSelectable,
		isExpanded,
		isFailedReasonExpanded,
		isQueueActionLoading,
		onToggle,
		onToggleFailedReason,
		onQueueAction,
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
</script>

<div class="rounded-xl bg-base-200 p-4">
	<div class="flex items-start justify-between gap-2">
		<ActivityStatusPopover {activity} {compactLabel} />
		<div class="flex items-center gap-2">
			<span class="text-xs text-base-content/60" title={getDisplayTime(activity)}>
				{formatRelativeTime(getDisplayTime(activity))}
			</span>
			{#if selectionMode}
				<input
					type="checkbox"
					class="checkbox checkbox-xs"
					checked={isSelected}
					disabled={!isSelectable}
					aria-label={`Select ${activity.mediaTitle}`}
					onclick={(e) => {
						e.stopPropagation();
						onToggleSelection((e.currentTarget as HTMLInputElement).checked);
					}}
				/>
			{/if}
		</div>
	</div>

	<div class="mt-2">
		{#if canLinkToMedia(activity)}
			<a href={getMediaLink(activity)} class="flex items-center gap-2 hover:text-primary">
				{#if activity.mediaType === 'movie'}
					<Clapperboard class="h-4 w-4 shrink-0" />
				{:else}
					<Tv class="h-4 w-4 shrink-0" />
				{/if}
				<span class="min-w-0 flex-1 truncate" title={activity.mediaTitle}>
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
				<span class="min-w-0 flex-1 truncate" title={activity.mediaTitle}>
					{activity.mediaTitle}
					{#if activity.mediaYear}
						<span class="text-base-content/60">({activity.mediaYear})</span>
					{/if}
				</span>
			</div>
		{/if}
		{#if activity.releaseTitle}
			<div class="mt-1 line-clamp-2 text-xs text-base-content/60" title={activity.releaseTitle}>
				{activity.releaseTitle}
			</div>
		{/if}
	</div>

	{#if !compact}
		<div class="mt-2 flex flex-wrap items-center gap-1">
			{#if getResolutionBadge(activity)}
				<span class="badge badge-outline badge-xs">{getResolutionBadge(activity)}</span>
			{/if}
			{#if activity.quality?.source}
				<span class="badge badge-outline badge-xs">{activity.quality.source}</span>
			{/if}
			{#if activity.quality?.codec}
				<span class="badge badge-outline badge-xs">{activity.quality.codec}</span>
			{/if}
			{#if activity.quality?.hdr}
				<span class="badge badge-outline badge-xs">{activity.quality.hdr}</span>
			{/if}
		</div>
		<div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-base-content/60">
			<span>{formatBytes(activity.size) || '-'}</span>
			<span class="text-base-content/40">•</span>
			<span>{activity.releaseGroup || '-'}</span>
			{#if activity.indexerName}
				<span class="text-base-content/40">•</span>
				<span>
					{activity.indexerName}
					{#if activity.protocol}
						<span class="text-base-content/50">
							({protocolLabels[activity.protocol] || activity.protocol})
						</span>
					{/if}
				</span>
			{/if}
		</div>
	{/if}

	<div class="mt-2">
		{#if activity.status === 'downloading' && activity.downloadProgress !== undefined}
			<progress class="progress w-full progress-info" value={activity.downloadProgress} max="100"
			></progress>
		{:else if (activity.status === 'failed' || activity.status === 'search_error') && activity.statusReason}
			<button
				class="btn gap-1 btn-ghost btn-xs"
				onclick={onToggleFailedReason}
				aria-label={isFailedReasonExpanded
					? m.activity_table_hideReason()
					: m.activity_table_showReason()}
			>
				<MessageSquare class="h-3 w-3" />
				{isFailedReasonExpanded ? m.activity_table_hideReason() : m.activity_table_reason()}
			</button>
			{#if isFailedReasonExpanded}
				<div class="mt-2 rounded-md bg-base-300/60 p-2 text-xs text-base-content/70">
					{activity.statusReason}
				</div>
			{/if}
		{:else if activity.statusReason}
			<div class="text-xs text-base-content/60">{activity.statusReason}</div>
		{/if}
	</div>

	{#if activity.queueItemId}
		<div class="mt-3 flex flex-wrap gap-2">
			{#if activity.status === 'downloading' || activity.status === 'seeding'}
				<button
					class="btn btn-ghost btn-xs"
					onclick={() => onQueueAction('pause')}
					disabled={isQueueActionLoading}
				>
					<Pause class="h-3.5 w-3.5" />
					{m.action_pause()}
				</button>
			{:else if activity.status === 'paused'}
				<button
					class="btn btn-ghost btn-xs"
					onclick={() => onQueueAction('resume')}
					disabled={isQueueActionLoading}
				>
					<Play class="h-3.5 w-3.5" />
					{m.action_resume()}
				</button>
			{/if}

			{#if activity.status === 'failed'}
				<button
					class="btn btn-ghost btn-xs"
					onclick={() => onQueueAction('retry')}
					disabled={isQueueActionLoading}
				>
					<RotateCcw class="h-3.5 w-3.5" />
					{isImportFailedActivity(activity) ? m.activity_detail_retryImport() : m.common_retry()}
				</button>
			{/if}

			<button
				class="btn btn-ghost btn-xs btn-error"
				onclick={() => onQueueAction('remove')}
				disabled={isQueueActionLoading}
			>
				<Trash2 class="h-3.5 w-3.5" />
				{m.action_remove()}
			</button>
		</div>
	{/if}

	{#if (activity.timeline?.length ?? 0) > 0}
		<button
			class="mt-2 flex items-center gap-1 text-xs text-base-content/60 hover:text-base-content"
			onclick={onToggle}
		>
			{#if isExpanded}
				<ChevronUp class="h-3 w-3" />
				{m.activity_table_hideTimeline()}
			{:else}
				<ChevronDown class="h-3 w-3" />
				{m.activity_table_showTimeline()}
			{/if}
		</button>
	{/if}

	{#if isExpanded && (activity.timeline?.length ?? 0) > 0}
		<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
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
	{/if}
</div>
