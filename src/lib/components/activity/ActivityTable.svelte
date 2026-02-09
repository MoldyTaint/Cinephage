<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { UnifiedActivity } from '$lib/types/activity';
	import {
		CheckCircle2,
		XCircle,
		AlertCircle,
		Loader2,
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

	interface Props {
		activities: UnifiedActivity[];
		sortField?: string;
		sortDirection?: 'asc' | 'desc';
		onSort?: (field: string) => void;
		onRowClick?: (activity: UnifiedActivity) => void;
		compact?: boolean;
	}

	let {
		activities,
		sortField = 'time',
		sortDirection = 'desc',
		onSort,
		onRowClick,
		compact = false
	}: Props = $props();

	// Track expanded rows
	let expandedRows = new SvelteSet<string>();
	let failedReasonExpandedRows = new SvelteSet<string>();

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

	// Format relative time
	function formatRelativeTime(dateStr: string | null): string {
		if (!dateStr) return '-';
		const date = new Date(dateStr);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;
		return date.toLocaleDateString();
	}

	// Format timestamp for timeline
	function formatTimestamp(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	}

	// Status config
	const statusConfig: Record<
		string,
		{ label: string; variant: string; icon: typeof CheckCircle2 }
	> = {
		imported: { label: 'Imported', variant: 'badge-success', icon: CheckCircle2 },
		streaming: { label: 'Streaming', variant: 'badge-info', icon: CheckCircle2 },
		downloading: { label: 'Downloading', variant: 'badge-info', icon: Loader2 },
		failed: { label: 'Failed', variant: 'badge-error', icon: XCircle },
		rejected: { label: 'Rejected', variant: 'badge-warning', icon: AlertCircle },
		removed: { label: 'Removed', variant: 'badge-ghost', icon: XCircle },
		no_results: { label: 'No Results', variant: 'badge-ghost', icon: Minus },
		searching: { label: 'Searching', variant: 'badge-info', icon: Loader2 }
	};

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

	function getResolutionBadge(activity: UnifiedActivity): string | null {
		const rawResolution = activity.quality?.resolution?.trim();
		if (rawResolution && rawResolution.toLowerCase() !== 'unknown') {
			return rawResolution;
		}

		const isCinephageLibraryStream =
			activity.protocol === 'streaming' &&
			(activity.indexerName?.toLowerCase().includes('cinephage library') ?? false);
		if (isCinephageLibraryStream) {
			return 'Auto';
		}

		return null;
	}
</script>

{#if activities.length === 0}
	<div class="py-12 text-center text-base-content/60">
		<Minus class="mx-auto mb-4 h-12 w-12 opacity-40" />
		<p class="text-lg font-medium">No activity</p>
		<p class="mt-1 text-sm">Download and search activity will appear here</p>
	</div>
{:else}
	<!-- Mobile: Card View -->
	<div class="space-y-3 lg:hidden">
		{#each activities as activity (activity.id)}
			{@const config = statusConfig[activity.status] || statusConfig.no_results}
			{@const StatusIcon = config.icon}
			{@const isExpanded = expandedRows.has(activity.id)}
			{@const isFailedReasonExpanded = failedReasonExpandedRows.has(activity.id)}
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
							{config.label}
						{/if}
					</span>
					<span class="text-xs text-base-content/60" title={activity.startedAt}>
						{formatRelativeTime(activity.startedAt)}
					</span>
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
					{:else if activity.status === 'failed' && activity.statusReason}
						<button
							class="btn gap-1 btn-ghost btn-xs"
							onclick={() => toggleFailedReason(activity.id)}
							aria-label={isFailedReasonExpanded ? 'Hide failure reason' : 'Show failure reason'}
						>
							<MessageSquare class="h-3 w-3" />
							{isFailedReasonExpanded ? 'Hide reason' : 'Reason'}
						</button>
						{#if isFailedReasonExpanded}
							<div class="mt-2 rounded-md bg-base-300/60 p-2 text-xs text-base-content/70">
								{activity.statusReason}
							</div>
						{/if}
					{:else if activity.statusReason && activity.status !== 'failed'}
						<div class="text-xs text-base-content/60">{activity.statusReason}</div>
					{/if}
				</div>

				{#if (activity.timeline?.length ?? 0) > 0}
					<button
						class="mt-2 flex items-center gap-1 text-xs text-base-content/60 hover:text-base-content"
						onclick={() => toggleRow(activity.id)}
					>
						{#if isExpanded}
							<ChevronUp class="h-3 w-3" />
							Hide timeline
						{:else}
							<ChevronDown class="h-3 w-3" />
							Show timeline
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

	<!-- Desktop: Table View -->
	<div class="hidden overflow-x-auto lg:block">
		<table class="table table-sm">
			<thead>
				<tr>
					<th class="w-10"></th>
					<th
						class="cursor-pointer select-none hover:bg-base-200"
						onclick={() => handleSort('status')}
					>
						<span class="flex items-center gap-1">
							Status
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
							Media
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
								Release
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
				{#each activities as activity (activity.id)}
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
									{config.label}
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
								{#if activity.indexerName}
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
							{:else if activity.statusReason && activity.status !== 'failed'}
								<span
									class="max-w-32 truncate text-xs text-base-content/60"
									title={activity.statusReason}
								>
									{activity.statusReason}
								</span>
							{:else}
								<span class="text-sm">{config.label}</span>
							{/if}
						</td>

						<!-- Time -->
						<td>
							<span class="text-sm" title={activity.startedAt}>
								{formatRelativeTime(activity.startedAt)}
							</span>
						</td>
					</tr>

					<!-- Expanded row with timeline -->
					{#if isExpanded && (activity.timeline?.length ?? 0) > 0}
						<tr class="bg-base-200/50">
							<td colspan={compact ? 5 : 10} class="py-3">
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
{/if}
