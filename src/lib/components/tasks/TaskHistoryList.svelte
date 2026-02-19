<script lang="ts">
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import {
		CheckCircle,
		XCircle,
		Clock,
		AlertCircle,
		ChevronDown,
		ChevronRight,
		Film,
		Tv,
		Download,
		Search,
		AlertTriangle,
		Ban
	} from 'lucide-svelte';
	import type { TaskHistoryEntry } from '$lib/types/task';

	interface ActivityItem {
		id: string;
		taskType: string;
		status: string;
		releasesFound: number;
		releaseGrabbed: string | null;
		isUpgrade: boolean;
		oldScore: number | null;
		newScore: number | null;
		errorMessage: string | null;
		executedAt: string;
		mediaType: 'movie' | 'episode' | 'unknown';
		mediaTitle: string;
		mediaId: string | null;
		seasonNumber: number | null;
		episodeNumber: number | null;
		seriesTitle: string | null;
	}

	interface Props {
		history: TaskHistoryEntry[];
		loading?: boolean;
		showActivity?: boolean;
	}

	let { history, loading = false, showActivity = true }: Props = $props();

	// Track which entries are expanded
	let expandedEntries = new SvelteSet<string>();

	// Track loading state for each entry's activity
	let activityLoading = new SvelteSet<string>();

	// Cache loaded activity
	let activityCache = new SvelteMap<string, ActivityItem[]>();

	/**
	 * Toggle activity expansion for an entry
	 */
	async function toggleActivity(entryId: string) {
		if (expandedEntries.has(entryId)) {
			expandedEntries.delete(entryId);
		} else {
			expandedEntries.add(entryId);

			// Load activity if not cached
			if (!activityCache.has(entryId)) {
				await loadActivity(entryId);
			}
		}
	}

	/**
	 * Load activity for an entry
	 */
	async function loadActivity(entryId: string) {
		activityLoading.add(entryId);

		try {
			const response = await fetch(`/api/tasks/history/${entryId}/activity`);
			if (response.ok) {
				const data = await response.json();
				activityCache.set(entryId, data.activity ?? []);
			}
		} catch (error) {
			console.error('Failed to load activity:', error);
		} finally {
			activityLoading.delete(entryId);
		}
	}

	/**
	 * Format time ago
	 */
	function formatTimeAgo(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		return `${diffDays}d ago`;
	}

	/**
	 * Format duration
	 */
	function formatDuration(startedAt: string, completedAt: string | null): string {
		if (!completedAt) return '—';
		const start = new Date(startedAt).getTime();
		const end = new Date(completedAt).getTime();
		const durationMs = end - start;
		const seconds = Math.floor(durationMs / 1000);

		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}m ${remainingSeconds}s`;
	}

	/**
	 * Format results summary
	 */
	function formatResults(results: Record<string, unknown> | null): string {
		if (!results) return '';

		const summarySource =
			typeof results.result === 'object' && results.result !== null
				? (results.result as Record<string, unknown>)
				: results;

		const parts: string[] = [];

		// Monitoring task results
		if (typeof summarySource.itemsProcessed === 'number') {
			parts.push(`${summarySource.itemsProcessed} processed`);
		}
		if (typeof summarySource.itemsGrabbed === 'number' && summarySource.itemsGrabbed > 0) {
			parts.push(`${summarySource.itemsGrabbed} grabbed`);
		}

		// STRM update results
		if (typeof summarySource.updatedFiles === 'number') {
			parts.push(`${summarySource.updatedFiles}/${summarySource.totalFiles ?? 0} files updated`);
		}
		// STRM reprobe results
		if (typeof summarySource.updated === 'number') {
			parts.push(`${summarySource.updated}/${summarySource.total ?? 0} files updated`);
		}
		if (
			typeof summarySource.probeFallbackUsed === 'number' &&
			summarySource.probeFallbackUsed > 0
		) {
			parts.push(`${summarySource.probeFallbackUsed} fallback`);
		}
		if (typeof summarySource.failed === 'number' && summarySource.failed > 0) {
			parts.push(`${summarySource.failed} failed`);
		}
		if (typeof summarySource.skipped === 'number' && summarySource.skipped > 0) {
			parts.push(`${summarySource.skipped} skipped`);
		}

		// Library scan results
		if (typeof summarySource.filesScanned === 'number') {
			parts.push(`${summarySource.filesScanned} scanned`);
		}
		if (typeof summarySource.filesAdded === 'number' && summarySource.filesAdded > 0) {
			parts.push(`${summarySource.filesAdded} added`);
		}
		if (typeof summarySource.filesUpdated === 'number' && summarySource.filesUpdated > 0) {
			parts.push(`${summarySource.filesUpdated} updated`);
		}
		if (typeof summarySource.filesRemoved === 'number' && summarySource.filesRemoved > 0) {
			parts.push(`${summarySource.filesRemoved} removed`);
		}
		if (typeof summarySource.unmatchedFiles === 'number' && summarySource.unmatchedFiles > 0) {
			parts.push(`${summarySource.unmatchedFiles} unmatched`);
		}

		// Errors count
		if (typeof summarySource.errors === 'number' && summarySource.errors > 0) {
			parts.push(`${summarySource.errors} errors`);
		}
		if (Array.isArray(summarySource.errors) && summarySource.errors.length > 0) {
			parts.push(`${summarySource.errors.length} errors`);
		}

		return parts.join(', ');
	}

	/**
	 * Format episode title
	 */
	function formatEpisodeTitle(item: ActivityItem): string {
		if (item.seriesTitle && item.seasonNumber !== null && item.episodeNumber !== null) {
			return `${item.seriesTitle} - S${String(item.seasonNumber).padStart(2, '0')}E${String(item.episodeNumber).padStart(2, '0')}`;
		}
		if (item.seriesTitle && item.seasonNumber !== null) {
			return `${item.seriesTitle} - Season ${item.seasonNumber}`;
		}
		return item.mediaTitle;
	}

	/**
	 * Get status color for activity item
	 */
	function getStatusClass(status: string): string {
		switch (status) {
			case 'grabbed':
				return 'text-success';
			case 'found':
				return 'text-info';
			case 'error':
				return 'text-error';
			case 'no_results':
				return 'text-base-content/50';
			default:
				return 'text-base-content/70';
		}
	}

	/**
	 * Check if entry has activity to show
	 */
	function hasActivity(entry: TaskHistoryEntry): boolean {
		if (!showActivity) return false;
		// Show activity for all monitoring tasks that record per-item activity
		const taskId = entry.taskId;
		const monitoringTasks = [
			'missing',
			'upgrade',
			'newEpisode',
			'cutoffUnmet',
			'missingSubtitles',
			'subtitleUpgrade'
		];
		return monitoringTasks.includes(taskId);
	}
</script>

{#if loading}
	<div class="flex items-center justify-center py-4">
		<span class="loading loading-sm loading-spinner"></span>
		<span class="ml-2 text-sm text-base-content/60">Loading history...</span>
	</div>
{:else if history.length === 0}
	<div class="py-4 text-center text-sm text-base-content/60">No execution history yet</div>
{:else}
	<div class="space-y-2">
		{#each history as entry (entry.id)}
			{@const isExpanded = expandedEntries.has(entry.id)}
			{@const isLoadingActivity = activityLoading.has(entry.id)}
			{@const activity = activityCache.get(entry.id) ?? []}
			{@const canExpand = hasActivity(entry)}

			<div class="rounded-lg bg-base-100">
				<!-- Main Row -->
				<button
					type="button"
					class="flex w-full items-start gap-3 px-3 py-2 text-left text-sm {canExpand
						? 'cursor-pointer hover:bg-base-200/50'
						: 'cursor-default'}"
					onclick={() => canExpand && toggleActivity(entry.id)}
					disabled={!canExpand}
				>
					<!-- Expand Icon (only for expandable entries) -->
					{#if canExpand}
						<div class="mt-0.5 flex-shrink-0">
							{#if isExpanded}
								<ChevronDown class="h-4 w-4 text-base-content/50" />
							{:else}
								<ChevronRight class="h-4 w-4 text-base-content/50" />
							{/if}
						</div>
					{/if}

					<!-- Status Icon -->
					<div class="mt-0.5 flex-shrink-0">
						{#if entry.status === 'completed'}
							<CheckCircle class="h-4 w-4 text-success" />
						{:else if entry.status === 'failed'}
							<XCircle class="h-4 w-4 text-error" />
						{:else if entry.status === 'running'}
							<Clock class="h-4 w-4 text-warning" />
						{:else if entry.status === 'cancelled'}
							<Ban class="h-4 w-4 text-warning" />
						{:else}
							<AlertCircle class="h-4 w-4 text-base-content/50" />
						{/if}
					</div>

					<!-- Details -->
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
							<!-- Time -->
							<span class="text-base-content/70">{formatTimeAgo(entry.startedAt)}</span>

							<!-- Duration -->
							{#if entry.completedAt}
								<span class="text-base-content/50">
									{formatDuration(entry.startedAt, entry.completedAt)}
								</span>
							{/if}
						</div>

						<!-- Results Summary -->
						{#if entry.status === 'completed' && entry.results}
							{@const summary = formatResults(entry.results)}
							{#if summary}
								<div class="mt-0.5 text-xs text-base-content/60">{summary}</div>
							{/if}
						{/if}

						<!-- Error Messages -->
						{#if entry.status === 'failed' && entry.errors && entry.errors.length > 0}
							<div class="mt-1 text-xs text-error">
								{entry.errors[0]}
							</div>
						{/if}
					</div>
				</button>

				<!-- Activity Details (Expanded) -->
				{#if isExpanded && canExpand}
					<div class="border-t border-base-300 px-3 py-2">
						{#if isLoadingActivity}
							<div class="flex items-center justify-center py-2">
								<span class="loading loading-xs loading-spinner"></span>
								<span class="ml-2 text-xs text-base-content/60">Loading activity...</span>
							</div>
						{:else if activity.length === 0}
							<div class="py-2 text-center text-xs text-base-content/60">
								No detailed activity recorded
							</div>
						{:else}
							<div class="space-y-1.5">
								{#each activity as item (item.id)}
									<div class="flex items-start gap-2 rounded bg-base-200/50 px-2 py-1.5 text-xs">
										<!-- Media Type Icon -->
										<div class="mt-0.5 flex-shrink-0">
											{#if item.mediaType === 'movie'}
												<Film class="h-3.5 w-3.5 text-base-content/50" />
											{:else if item.mediaType === 'episode'}
												<Tv class="h-3.5 w-3.5 text-base-content/50" />
											{:else}
												<Search class="h-3.5 w-3.5 text-base-content/50" />
											{/if}
										</div>

										<!-- Content -->
										<div class="min-w-0 flex-1">
											<!-- Title -->
											<div class="truncate font-medium">
												{#if item.mediaType === 'episode'}
													{formatEpisodeTitle(item)}
												{:else}
													{item.mediaTitle}
												{/if}
											</div>

											<!-- Status and Details -->
											<div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
												<!-- Status Badge -->
												<span class={getStatusClass(item.status)}>
													{#if item.status === 'grabbed'}
														grabbed
													{:else if item.status === 'found'}
														{item.releasesFound} found
													{:else if item.status === 'no_results'}
														no results
													{:else if item.status === 'error'}
														error
													{:else}
														{item.status}
													{/if}
												</span>

												<!-- Upgrade indicator -->
												{#if item.isUpgrade}
													<span class="text-warning">
														upgrade {item.oldScore ?? '?'} → {item.newScore ?? '?'}
													</span>
												{/if}

												<!-- Grabbed Release -->
												{#if item.releaseGrabbed}
													<span
														class="max-w-[200px] truncate text-base-content/50"
														title={item.releaseGrabbed}
													>
														{item.releaseGrabbed}
													</span>
												{/if}
											</div>

											<!-- Error Message -->
											{#if item.errorMessage}
												<div class="mt-0.5 text-error">{item.errorMessage}</div>
											{/if}
										</div>

										<!-- Action Icon -->
										<div class="flex-shrink-0">
											{#if item.status === 'grabbed'}
												<Download class="h-3.5 w-3.5 text-success" />
											{:else if item.status === 'error'}
												<AlertTriangle class="h-3.5 w-3.5 text-error" />
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
