<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import * as m from '$lib/paraglide/messages.js';
	import {
		isImportFailedActivity,
		TASK_TYPE_LABELS,
		type UnifiedActivity
	} from '$lib/types/activity';
	import {
		Loader2,
		Pause,
		Play,
		RotateCcw,
		Trash2,
		MessageSquare,
		Minus,
		Clapperboard,
		Tv,
		ChevronDown,
		ChevronUp,
		ArrowUpDown,
		ArrowUp,
		ArrowDown
	} from 'lucide-svelte';
	import { resolvePath } from '$lib/utils/routing';
	import { formatBytes } from '$lib/utils/format';
	import { toasts } from '$lib/stores/toast.svelte';
	import { createProgressiveRenderer } from '$lib/utils/progressive-render.svelte.js';
	import {
		statusConfig,
		getCompactProgressLabel,
		getStatusLabel,
		formatRelativeTime,
		formatTimestamp,
		getDisplayTime,
		getResolutionBadge
	} from './activity-display-utils.js';

	interface Props {
		activities: UnifiedActivity[];
		sortField?: string;
		sortDirection?: 'asc' | 'desc';
		onSort?: (field: string) => void;
		onRowClick?: (activity: UnifiedActivity) => void;
		onPause?: (id: string) => Promise<void>;
		onResume?: (id: string) => Promise<void>;
		onRemove?: (id: string) => Promise<void>;
		onRetry?: (id: string) => Promise<void>;
		compact?: boolean;
		selectionMode?: boolean;
		selectedIds?: Set<string>;
		isSelectable?: (activity: UnifiedActivity) => boolean;
		onToggleSelection?: (activityId: string, selected: boolean) => void;
		onToggleSelectionAll?: (activityIds: string[], selected: boolean) => void;
		hasMore?: boolean;
		isLoadingMore?: boolean;
		onLoadMore?: () => void;
	}

	let {
		activities,
		sortField = 'time',
		sortDirection = 'desc',
		onSort,
		onRowClick,
		onPause,
		onResume,
		onRemove,
		onRetry,
		compact = false,
		selectionMode = false,
		selectedIds = new Set<string>(),
		isSelectable = () => false,
		onToggleSelection,
		onToggleSelectionAll,
		hasMore = false,
		isLoadingMore = false,
		onLoadMore
	}: Props = $props();

	// Progressive renderer: only mount DOM nodes for a visible slice + buffer.
	// When the sentinel becomes visible and we've exhausted the client-side
	// items, trigger server-side pagination via onLoadMore.
	const renderer = createProgressiveRenderer(() => activities, { batchSize: 24 });

	// When the progressive renderer has shown everything but the server has
	// more data, automatically request the next page.
	$effect(() => {
		if (!renderer.hasMore && hasMore && !isLoadingMore) {
			onLoadMore?.();
		}
	});

	// Responsive: only render mobile OR desktop view, not both
	let isMobile = $state(false);
	$effect(() => {
		if (typeof window === 'undefined') return;

		const mq = window.matchMedia('(max-width: 1023px)');
		isMobile = mq.matches;
		const handler = (e: MediaQueryListEvent) => {
			isMobile = e.matches;
		};
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});

	// Track expanded rows
	let expandedRows = new SvelteSet<string>();
	let failedReasonExpandedRows = new SvelteSet<string>();
	let queueActionLoadingRows = new SvelteSet<string>();
	let selectAllCheckbox = $state<HTMLInputElement | null>(null);

	const selectableIds = $derived.by(() =>
		selectionMode
			? activities.filter((activity) => isSelectable(activity)).map((activity) => activity.id)
			: []
	);
	const allSelectableSelected = $derived.by(
		() => selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id))
	);
	const someSelectableSelected = $derived.by(
		() => selectableIds.some((id) => selectedIds.has(id)) && !allSelectableSelected
	);

	$effect(() => {
		if (selectAllCheckbox) {
			selectAllCheckbox.indeterminate = someSelectableSelected;
		}
	});

	function toggleRow(id: string) {
		if (expandedRows.has(id)) {
			expandedRows.delete(id);
		} else {
			expandedRows.add(id);
		}
	}

	function toggleFailedReason(id: string) {
		if (failedReasonExpandedRows.has(id)) {
			failedReasonExpandedRows.delete(id);
		} else {
			failedReasonExpandedRows.add(id);
		}
	}

	// Get media link
	function getMediaLink(activity: UnifiedActivity): string {
		if (activity.mediaType === 'movie') {
			return resolvePath(`/library/movie/${activity.mediaId}`);
		}
		// For episodes, link to the series
		return resolvePath(`/library/tv/${activity.seriesId || activity.mediaId}`);
	}

	function canLinkToMedia(activity: UnifiedActivity): boolean {
		// Removed items should remain readable in history but should not deep-link to deleted media.
		if (activity.status === 'removed') return false;
		if (activity.mediaType === 'movie') return Boolean(activity.mediaId);
		return Boolean(activity.seriesId || activity.mediaId);
	}

	// Protocol labels
	const protocolLabels: Record<string, string> = {
		torrent: 'torrent',
		usenet: 'usenet',
		streaming: 'stream'
	};

	// Handle sort click
	function handleSort(field: string) {
		if (onSort) {
			onSort(field);
		}
	}

	// Get sort icon
	function getSortIcon(field: string) {
		if (sortField !== field) return ArrowUpDown;
		return sortDirection === 'asc' ? ArrowUp : ArrowDown;
	}

	async function runQueueAction(
		activity: UnifiedActivity,
		action: 'pause' | 'resume' | 'remove' | 'retry'
	): Promise<void> {
		if (!activity.queueItemId) return;
		if (queueActionLoadingRows.has(activity.id)) return;

		const handler =
			action === 'pause'
				? onPause
				: action === 'resume'
					? onResume
					: action === 'remove'
						? onRemove
						: onRetry;
		if (!handler) return;

		queueActionLoadingRows.add(activity.id);
		try {
			await handler(activity.queueItemId);
			if (action === 'pause') toasts.success(m.activity_detail_downloadPaused());
			if (action === 'resume') toasts.success(m.activity_detail_downloadResumed());
			if (action === 'remove') toasts.success(m.activity_detail_downloadRemoved());
			if (action === 'retry') {
				toasts.success(
					activity.status === 'failed' && isImportFailedActivity(activity)
						? m.activity_detail_importRetryInitiated()
						: m.activity_detail_downloadRetryInitiated()
				);
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : m.activity_table_failedToAction({ action });
			toasts.error(message);
		} finally {
			queueActionLoadingRows.delete(activity.id);
		}
	}

	function isRowSelected(activityId: string): boolean {
		return selectedIds.has(activityId);
	}

	function toggleSelection(activity: UnifiedActivity, selected: boolean): void {
		if (!selectionMode || !isSelectable(activity)) {
			return;
		}
		onToggleSelection?.(activity.id, selected);
	}

	function toggleSelectionAll(selected: boolean): void {
		if (!selectionMode || selectableIds.length === 0) {
			return;
		}
		onToggleSelectionAll?.(selectableIds, selected);
	}
</script>

{#if activities.length === 0}
	<div class="py-12 text-center text-base-content/60">
		<Minus class="mx-auto mb-4 h-12 w-12 opacity-40" />
		<p class="text-lg font-medium">{m.activity_table_noActivity()}</p>
		<p class="mt-1 text-sm">{m.activity_table_noActivityHint()}</p>
	</div>
{:else if isMobile}
	<!-- Mobile: Card View -->
	<div class="space-y-3">
		{#each renderer.visible as activity (activity.id)}
			{@const config = statusConfig[activity.status] || statusConfig.no_results}
			{@const StatusIcon = config.icon}
			{@const isExpanded = expandedRows.has(activity.id)}
			{@const isFailedReasonExpanded = failedReasonExpandedRows.has(activity.id)}
			{@const isQueueActionLoading = queueActionLoadingRows.has(activity.id)}
			<div class="rounded-xl bg-base-200 p-4">
				<div class="flex items-start justify-between gap-2">
					<span class="badge gap-1 {config.variant}">
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
					</span>
					<div class="flex items-center gap-2">
						<span class="text-xs text-base-content/60" title={getDisplayTime(activity)}>
							{formatRelativeTime(getDisplayTime(activity))}
						</span>
						{#if selectionMode}
							<input
								type="checkbox"
								class="checkbox checkbox-xs"
								checked={isRowSelected(activity.id)}
								disabled={!isSelectable(activity)}
								aria-label={`Select ${activity.mediaTitle}`}
								onclick={(e) => {
									e.stopPropagation();
									toggleSelection(activity, (e.currentTarget as HTMLInputElement).checked);
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
						<div
							class="mt-1 line-clamp-2 text-xs text-base-content/60"
							title={activity.releaseTitle}
						>
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
						<progress
							class="progress w-full progress-info"
							value={activity.downloadProgress}
							max="100"
						></progress>
					{:else if (activity.status === 'failed' || activity.status === 'search_error') && activity.statusReason}
						<button
							class="btn gap-1 btn-ghost btn-xs"
							onclick={() => toggleFailedReason(activity.id)}
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
								onclick={() => runQueueAction(activity, 'pause')}
								disabled={isQueueActionLoading}
							>
								<Pause class="h-3.5 w-3.5" />
								{m.action_pause()}
							</button>
						{:else if activity.status === 'paused'}
							<button
								class="btn btn-ghost btn-xs"
								onclick={() => runQueueAction(activity, 'resume')}
								disabled={isQueueActionLoading}
							>
								<Play class="h-3.5 w-3.5" />
								{m.action_resume()}
							</button>
						{/if}

						{#if activity.status === 'failed'}
							<button
								class="btn btn-ghost btn-xs"
								onclick={() => runQueueAction(activity, 'retry')}
								disabled={isQueueActionLoading}
							>
								<RotateCcw class="h-3.5 w-3.5" />
								{isImportFailedActivity(activity)
									? m.activity_detail_retryImport()
									: m.common_retry()}
							</button>
						{/if}

						<button
							class="btn btn-ghost btn-xs btn-error"
							onclick={() => runQueueAction(activity, 'remove')}
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
						onclick={() => toggleRow(activity.id)}
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
		{/each}
	</div>

	<!-- Progressive render sentinel + server load-more -->
	{#if renderer.hasMore || hasMore}
		<div bind:this={renderer.sentinel} class="flex justify-center py-4">
			{#if isLoadingMore}
				<Loader2 class="h-5 w-5 animate-spin text-base-content/40" />
			{/if}
		</div>
	{/if}
{:else}
	<!-- Desktop: Table View -->
	<div class="overflow-x-auto">
		<table class="table table-sm">
			<thead>
				<tr>
					{#if selectionMode}
						<th class="w-10">
							{#if selectableIds.length > 0}
								<input
									bind:this={selectAllCheckbox}
									type="checkbox"
									class="checkbox checkbox-xs"
									checked={allSelectableSelected}
									aria-label={m.activity_table_selectAllVisible()}
									onclick={(e) => {
										e.stopPropagation();
										toggleSelectionAll(!allSelectableSelected);
									}}
								/>
							{/if}
						</th>
					{/if}
					<th class="w-10"></th>
					<th
						class="cursor-pointer select-none hover:bg-base-200"
						onclick={() => handleSort('status')}
					>
						<span class="flex items-center gap-1">
							{m.common_status()}
							{#if onSort}
								{@const Icon = getSortIcon('status')}
								<Icon class="h-3 w-3 opacity-50" />
							{/if}
						</span>
					</th>
					<th
						class="cursor-pointer select-none hover:bg-base-200"
						onclick={() => handleSort('media')}
					>
						<span class="flex items-center gap-1">
							{m.activity_table_media()}
							{#if onSort}
								{@const Icon = getSortIcon('media')}
								<Icon class="h-3 w-3 opacity-50" />
							{/if}
						</span>
					</th>
					{#if !compact}
						<th
							class="cursor-pointer select-none hover:bg-base-200"
							onclick={() => handleSort('release')}
						>
							<span class="flex items-center gap-1">
								{m.activity_table_release()}
								{#if onSort}
									{@const Icon = getSortIcon('release')}
									<Icon class="h-3 w-3 opacity-50" />
								{/if}
							</span>
						</th>
						<th>Quality</th>
						<th>Group</th>
						<th
							class="cursor-pointer select-none hover:bg-base-200"
							onclick={() => handleSort('size')}
						>
							<span class="flex items-center gap-1">
								Size
								{#if onSort}
									{@const Icon = getSortIcon('size')}
									<Icon class="h-3 w-3 opacity-50" />
								{/if}
							</span>
						</th>
						<th>Source</th>
					{/if}
					<th>Progress</th>
					<th
						class="cursor-pointer select-none hover:bg-base-200"
						onclick={() => handleSort('time')}
					>
						<span class="flex items-center gap-1">
							Time
							{#if onSort}
								{@const Icon = getSortIcon('time')}
								<Icon class="h-3 w-3 opacity-50" />
							{/if}
						</span>
					</th>
				</tr>
			</thead>
			<tbody>
				{#each renderer.visible as activity (activity.id)}
					{@const config = statusConfig[activity.status] || statusConfig.no_results}
					{@const StatusIcon = config.icon}
					{@const isExpanded = expandedRows.has(activity.id)}
					<tr
						class="hover cursor-pointer"
						onclick={() => {
							if (onRowClick) {
								onRowClick(activity);
							} else {
								toggleRow(activity.id);
							}
						}}
					>
						{#if selectionMode}
							<td class="w-10">
								<input
									type="checkbox"
									class="checkbox checkbox-xs"
									checked={isRowSelected(activity.id)}
									disabled={!isSelectable(activity)}
									aria-label={`Select ${activity.mediaTitle}`}
									onclick={(e) => {
										e.stopPropagation();
										toggleSelection(activity, (e.currentTarget as HTMLInputElement).checked);
									}}
								/>
							</td>
						{/if}
						<!-- Expand indicator -->
						<td class="w-10">
							{#if (activity.timeline?.length ?? 0) > 0}
								{#if isExpanded}
									<ChevronUp class="h-4 w-4 text-base-content/50" />
								{:else}
									<ChevronDown class="h-4 w-4 text-base-content/50" />
								{/if}
							{/if}
						</td>

						<!-- Status -->
						<td>
							<span class="badge gap-1 {config.variant}">
								<StatusIcon
									class="h-3 w-3 {activity.status === 'downloading' ||
									activity.status === 'searching'
										? 'animate-spin'
										: ''}"
								/>
								{#if activity.status === 'downloading' && activity.downloadProgress !== undefined}
									{activity.downloadProgress}%
								{:else}
									{getStatusLabel(activity, config.label)}
								{/if}
							</span>
						</td>

						<!-- Media -->
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
							<!-- Release -->
							<td>
								<span class="block max-w-64 truncate text-sm" title={activity.releaseTitle || '-'}>
									{activity.releaseTitle || '-'}
								</span>
							</td>

							<!-- Quality -->
							<td>
								{#if activity.quality}
									<div class="flex flex-wrap gap-1">
										{#if getResolutionBadge(activity)}
											<span class="badge badge-outline badge-xs"
												>{getResolutionBadge(activity)}</span
											>
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

							<!-- Group -->
							<td>
								<span class="text-sm">{activity.releaseGroup || '-'}</span>
							</td>

							<!-- Size -->
							<td>
								<span class="text-sm">{formatBytes(activity.size)}</span>
							</td>

							<!-- Source -->
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

						<!-- Progress -->
						<td>
							{#if activity.status === 'downloading' && activity.downloadProgress !== undefined}
								<div class="flex items-center gap-2">
									<progress
										class="progress w-16 progress-info"
										value={activity.downloadProgress}
										max="100"
									></progress>
								</div>
							{:else if getCompactProgressLabel(activity)}
								<span
									class="max-w-32 truncate text-xs text-base-content/60"
									title={activity.statusReason}
								>
									{getCompactProgressLabel(activity)}
								</span>
							{:else}
								<span class="text-sm">{getStatusLabel(activity, config.label)}</span>
							{/if}
						</td>

						<!-- Time -->
						<td>
							<span class="text-sm" title={getDisplayTime(activity)}>
								{formatRelativeTime(getDisplayTime(activity))}
							</span>
						</td>
					</tr>

					<!-- Expanded row with timeline -->
					{#if isExpanded && (activity.timeline?.length ?? 0) > 0}
						<tr class="bg-base-200/50">
							<td colspan={(compact ? 5 : 10) + (selectionMode ? 1 : 0)} class="py-3">
								<div class="px-4">
									<div class="mb-2 text-sm font-medium">Timeline</div>
									<div class="flex flex-wrap items-center gap-2 text-xs">
										{#each activity.timeline ?? [] as event, i (event.timestamp + event.type)}
											<span class="flex items-center gap-1 rounded bg-base-300 px-2 py-1">
												<span class="capitalize">{event.type}</span>
												<span class="text-base-content/50"
													>({formatTimestamp(event.timestamp)})</span
												>
											</span>
											{#if i < (activity.timeline?.length ?? 0) - 1}
												<span class="text-base-content/30">→</span>
											{/if}
										{/each}
									</div>

									{#if activity.importedPath}
										<div class="mt-3">
											<span class="text-xs text-base-content/60">Imported to: </span>
											<span class="font-mono text-xs">{activity.importedPath}</span>
										</div>
									{/if}

									{#if activity.isUpgrade && activity.oldScore !== undefined && activity.newScore !== undefined}
										<div class="mt-2">
											<span class="text-xs text-base-content/60">Upgrade: </span>
											<span class="text-xs">{activity.oldScore} → {activity.newScore}</span>
										</div>
									{/if}
								</div>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Progressive render sentinel + server load-more -->
	{#if renderer.hasMore || hasMore}
		<div bind:this={renderer.sentinel} class="flex justify-center py-4">
			{#if isLoadingMore}
				<Loader2 class="h-5 w-5 animate-spin text-base-content/40" />
			{/if}
		</div>
	{/if}
{/if}
