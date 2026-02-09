<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolvePath } from '$lib/utils/routing';
	import { createSSE } from '$lib/sse';
	import { mobileSSEStatus } from '$lib/sse/mobileStatus.svelte';
	import ActivityTable from '$lib/components/activity/ActivityTable.svelte';
	import ActivityDetailModal from '$lib/components/activity/ActivityDetailModal.svelte';
	import ActivityFilters from '$lib/components/activity/ActivityFilters.svelte';
	import ActiveFilters from '$lib/components/activity/ActiveFilters.svelte';
	import type {
		UnifiedActivity,
		ActivityDetails,
		ActivityFilters as FiltersType,
		ActivityStatus
	} from '$lib/types/activity';
	import { Activity, Loader2, Wifi, WifiOff } from 'lucide-svelte';

	let { data } = $props();

	// Local state for activities (for SSE updates)
	let activities = $state<UnifiedActivity[]>([]);
	let total = $state(0);

	// Filter state - initialize from URL/data
	let filters = $state<FiltersType>({
		status: 'all',
		mediaType: 'all',
		protocol: 'all'
	});

	// Sort state
	let sortField = $state('time');
	let sortDirection = $state<'asc' | 'desc'>('desc');

	// Loading states
	let isLoading = $state(false);
	let isLoadingMore = $state(false);

	let hasInitialized = $state(false);

	function normalizeActivityStatus(status: unknown): ActivityStatus {
		switch (status) {
			case 'imported':
			case 'streaming':
			case 'downloading':
			case 'failed':
			case 'rejected':
			case 'removed':
			case 'no_results':
			case 'searching':
				return status;
			default:
				return 'downloading';
		}
	}

	function normalizeActivity(activity: Partial<UnifiedActivity>): UnifiedActivity | null {
		if (!activity.id) return null;

		return {
			id: activity.id,
			mediaType: activity.mediaType === 'episode' ? 'episode' : 'movie',
			mediaId: activity.mediaId ?? '',
			mediaTitle: activity.mediaTitle ?? 'Unknown',
			mediaYear: activity.mediaYear ?? null,
			seriesId: activity.seriesId,
			seriesTitle: activity.seriesTitle,
			seasonNumber: activity.seasonNumber,
			episodeNumber: activity.episodeNumber,
			episodeIds: activity.episodeIds,
			releaseTitle: activity.releaseTitle ?? null,
			quality: activity.quality ?? null,
			releaseGroup: activity.releaseGroup ?? null,
			size: activity.size ?? null,
			indexerId: activity.indexerId ?? null,
			indexerName: activity.indexerName ?? null,
			protocol: activity.protocol ?? null,
			downloadClientId: activity.downloadClientId ?? null,
			downloadClientName: activity.downloadClientName ?? null,
			status: normalizeActivityStatus(activity.status),
			statusReason: activity.statusReason,
			downloadProgress: activity.downloadProgress,
			isUpgrade: activity.isUpgrade ?? false,
			oldScore: activity.oldScore,
			newScore: activity.newScore,
			timeline: Array.isArray(activity.timeline) ? activity.timeline : [],
			startedAt: activity.startedAt ?? new Date().toISOString(),
			completedAt: activity.completedAt ?? null,
			queueItemId: activity.queueItemId,
			downloadHistoryId: activity.downloadHistoryId,
			monitoringHistoryId: activity.monitoringHistoryId,
			importedPath: activity.importedPath
		};
	}

	function matchesLiveFilters(activity: UnifiedActivity): boolean {
		// Status
		if (filters.status && filters.status !== 'all') {
			if (filters.status === 'success') {
				if (activity.status !== 'imported' && activity.status !== 'streaming') return false;
			} else if (activity.status !== filters.status) {
				return false;
			}
		}

		// Media type
		if (filters.mediaType === 'movie' && activity.mediaType !== 'movie') return false;
		if (filters.mediaType === 'tv' && activity.mediaType !== 'episode') return false;

		// Search
		if (filters.search) {
			const needle = filters.search.toLowerCase();
			const matches =
				activity.mediaTitle.toLowerCase().includes(needle) ||
				activity.releaseTitle?.toLowerCase().includes(needle) ||
				activity.seriesTitle?.toLowerCase().includes(needle) ||
				activity.releaseGroup?.toLowerCase().includes(needle) ||
				activity.indexerName?.toLowerCase().includes(needle);
			if (!matches) return false;
		}

		// Protocol
		if (filters.protocol && filters.protocol !== 'all' && activity.protocol !== filters.protocol) {
			return false;
		}

		// Download client
		if (filters.downloadClientId && activity.downloadClientId !== filters.downloadClientId) {
			return false;
		}

		// Indexer
		if (filters.indexer && activity.indexerName?.toLowerCase() !== filters.indexer.toLowerCase()) {
			return false;
		}

		// Release group
		if (
			filters.releaseGroup &&
			!activity.releaseGroup?.toLowerCase().includes(filters.releaseGroup.toLowerCase())
		) {
			return false;
		}

		// Resolution
		if (
			filters.resolution &&
			activity.quality?.resolution?.toLowerCase() !== filters.resolution.toLowerCase()
		) {
			return false;
		}

		// Upgrade flag
		if (filters.isUpgrade !== undefined && activity.isUpgrade !== filters.isUpgrade) return false;

		// Date range
		if (filters.startDate) {
			const startTime = new Date(filters.startDate).getTime();
			if (new Date(activity.startedAt).getTime() < startTime) return false;
		}
		if (filters.endDate) {
			const endTime = new Date(filters.endDate).getTime();
			if (new Date(activity.startedAt).getTime() > endTime) return false;
		}

		return true;
	}

	function upsertActivity(activity: Partial<UnifiedActivity>): void {
		const normalized = normalizeActivity(activity);
		if (!normalized) return;

		const existingIndex = activities.findIndex((a) => a.id === normalized.id);
		const matchesFilters = matchesLiveFilters(normalized);

		if (!matchesFilters) {
			if (existingIndex >= 0) {
				activities = activities.filter((a) => a.id !== normalized.id);
				total = Math.max(0, total - 1);
			}
			return;
		}

		if (existingIndex >= 0) {
			activities[existingIndex] = { ...activities[existingIndex], ...normalized };
			return;
		}

		activities = [normalized, ...activities];
		total += 1;
	}

	// Detail modal state
	let selectedActivity = $state<UnifiedActivity | null>(null);
	let activityDetails = $state<ActivityDetails | null>(null);
	let detailsLoading = $state(false);
	let isModalOpen = $state(false);

	// Update activities when data changes (navigation)
	$effect(() => {
		activities = data.activities;
		total = data.total;
		if (!hasInitialized && data.filters) {
			filters = { ...data.filters };
			hasInitialized = true;
		}
	});

	// SSE Connection - internally handles browser/SSR
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const sse = createSSE<Record<string, any>>(resolvePath('/api/activity/stream'), {
		'activity:new': (newActivity: Partial<UnifiedActivity>) => {
			upsertActivity(newActivity);
		},
		'activity:updated': (updated: Partial<UnifiedActivity>) => {
			upsertActivity(updated);
		},
		'activity:progress': (data: { id: string; progress: number; status?: string }) => {
			let removed = false;
			activities = activities.flatMap((a) => {
				if (a.id !== data.id) return [a];

				const updated = {
					...a,
					downloadProgress: data.progress,
					status: data.status ? normalizeActivityStatus(data.status) : a.status
				};

				if (!matchesLiveFilters(updated)) {
					removed = true;
					return [];
				}

				return [updated];
			});

			if (removed) {
				total = Math.max(0, total - 1);
			}
		}
	});

	const MOBILE_SSE_SOURCE = 'activity';

	$effect(() => {
		mobileSSEStatus.publish(MOBILE_SSE_SOURCE, sse.status);
		return () => {
			mobileSSEStatus.clear(MOBILE_SSE_SOURCE);
		};
	});

	// Apply filters via URL navigation
	async function applyFilters(newFilters: FiltersType) {
		filters = newFilters;
		isLoading = true;

		const params = new SvelteURLSearchParams();
		if (filters.status !== 'all') params.set('status', filters.status!);
		if (filters.mediaType !== 'all') params.set('mediaType', filters.mediaType!);
		if (filters.search) params.set('search', filters.search);
		if (filters.protocol !== 'all') params.set('protocol', filters.protocol!);
		if (filters.indexer) params.set('indexer', filters.indexer);
		if (filters.releaseGroup) params.set('releaseGroup', filters.releaseGroup);
		if (filters.resolution) params.set('resolution', filters.resolution);
		if (filters.isUpgrade) params.set('isUpgrade', 'true');
		if (filters.includeNoResults) params.set('includeNoResults', 'true');
		if (filters.downloadClientId) params.set('downloadClientId', filters.downloadClientId);
		if (filters.startDate) params.set('startDate', filters.startDate);
		if (filters.endDate) params.set('endDate', filters.endDate);

		const queryString = params.toString();
		await goto(resolvePath(`/activity${queryString ? `?${queryString}` : ''}`), {
			keepFocus: true
		});
		isLoading = false;
	}

	// Remove a specific filter
	async function removeFilter(key: keyof FiltersType) {
		const newFilters = { ...filters };
		if (key === 'status' || key === 'mediaType' || key === 'protocol') {
			newFilters[key] = 'all';
		} else {
			delete newFilters[key];
		}
		await applyFilters(newFilters);
	}

	// Clear all filters
	async function clearAllFilters() {
		await applyFilters({
			status: 'all',
			mediaType: 'all',
			protocol: 'all'
		});
	}

	// Handle sort
	function handleSort(field: string) {
		if (sortField === field) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortField = field;
			sortDirection = 'desc';
		}

		// Sort locally
		activities = [...activities].sort((a, b) => {
			let aVal: string | number | null = null;
			let bVal: string | number | null = null;

			switch (field) {
				case 'time':
					aVal = a.startedAt;
					bVal = b.startedAt;
					break;
				case 'media':
					aVal = a.mediaTitle.toLowerCase();
					bVal = b.mediaTitle.toLowerCase();
					break;
				case 'size':
					aVal = a.size || 0;
					bVal = b.size || 0;
					break;
				case 'status':
					aVal = a.status;
					bVal = b.status;
					break;
				case 'release':
					aVal = a.releaseTitle?.toLowerCase() || '';
					bVal = b.releaseTitle?.toLowerCase() || '';
					break;
			}

			if (aVal === null || bVal === null) return 0;
			if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
			if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
			return 0;
		});
	}

	// Load more
	async function loadMore() {
		if (isLoadingMore || !data.hasMore) return;
		isLoadingMore = true;

		try {
			const apiUrl = new URL('/api/activity', window.location.origin);
			apiUrl.searchParams.set('limit', '50');
			apiUrl.searchParams.set('offset', String(activities.length));
			if (filters.status !== 'all') apiUrl.searchParams.set('status', filters.status!);
			if (filters.mediaType !== 'all') apiUrl.searchParams.set('mediaType', filters.mediaType!);
			if (filters.search) apiUrl.searchParams.set('search', filters.search);
			if (filters.protocol !== 'all') apiUrl.searchParams.set('protocol', filters.protocol!);
			if (filters.indexer) apiUrl.searchParams.set('indexer', filters.indexer);
			if (filters.releaseGroup) apiUrl.searchParams.set('releaseGroup', filters.releaseGroup);
			if (filters.resolution) apiUrl.searchParams.set('resolution', filters.resolution);
			if (filters.isUpgrade) apiUrl.searchParams.set('isUpgrade', 'true');
			if (filters.includeNoResults) apiUrl.searchParams.set('includeNoResults', 'true');
			if (filters.downloadClientId)
				apiUrl.searchParams.set('downloadClientId', filters.downloadClientId);
			if (filters.startDate) apiUrl.searchParams.set('startDate', filters.startDate);
			if (filters.endDate) apiUrl.searchParams.set('endDate', filters.endDate);

			const response = await fetch(apiUrl.toString());
			const result = await response.json();

			if (result.success && result.activities) {
				activities = [...activities, ...result.activities];
			}
		} catch (error) {
			console.error('Failed to load more:', error);
		} finally {
			isLoadingMore = false;
		}
	}

	// Open detail modal
	async function openDetailModal(activity: UnifiedActivity) {
		selectedActivity = activity;
		isModalOpen = true;
		detailsLoading = true;
		activityDetails = null;

		// Fetch activity details
		try {
			const response = await fetch(`/api/activity/${activity.id}/details`);
			if (response.ok) {
				const data = await response.json();
				activityDetails = data.details;
			}
		} catch (error) {
			console.error('Failed to fetch activity details:', error);
		}

		detailsLoading = false;
	}

	function closeModal() {
		isModalOpen = false;
		selectedActivity = null;
		activityDetails = null;
	}

	// Queue actions
	async function handlePause(id: string) {
		const response = await fetch(`/api/queue/${id}/pause`, { method: 'POST' });
		if (!response.ok) throw new Error('Failed to pause');
		await invalidateAll();
	}

	async function handleResume(id: string) {
		const response = await fetch(`/api/queue/${id}/resume`, { method: 'POST' });
		if (!response.ok) throw new Error('Failed to resume');
		await invalidateAll();
	}

	async function handleRemove(id: string) {
		const response = await fetch(`/api/queue/${id}`, { method: 'DELETE' });
		if (!response.ok) throw new Error('Failed to remove');
		await invalidateAll();
		closeModal();
	}

	async function handleRetry(id: string) {
		const response = await fetch(`/api/queue/${id}/retry`, { method: 'POST' });
		if (!response.ok) throw new Error('Failed to retry');
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>Activity - Cinephage</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="flex items-center gap-2 text-3xl font-bold">
				<Activity class="h-8 w-8" />
				Activity
			</h1>
			<p class="text-base-content/70">Download and search history</p>
		</div>
		<!-- Connection Status -->
		<div class="hidden sm:block">
			{#if sse.isConnected}
				<span class="badge gap-1 badge-success">
					<Wifi class="h-3 w-3" />
					Live
				</span>
			{:else if sse.status === 'connecting' || sse.status === 'error'}
				<span class="badge gap-1 {sse.status === 'error' ? 'badge-error' : 'badge-warning'}">
					<Loader2 class="h-3 w-3 animate-spin" />
					{sse.status === 'error' ? 'Reconnecting...' : 'Connecting...'}
				</span>
			{:else}
				<span class="badge gap-1 badge-ghost">
					<WifiOff class="h-3 w-3" />
					Disconnected
				</span>
			{/if}
		</div>
	</div>

	<!-- Filters Component -->
	<ActivityFilters
		{filters}
		filterOptions={data.filterOptions}
		onFiltersChange={applyFilters}
		onClearFilters={clearAllFilters}
	/>

	<!-- Active Filters Display -->
	<ActiveFilters
		{filters}
		downloadClients={data.filterOptions.downloadClients}
		onFilterRemove={removeFilter}
		onClearAll={clearAllFilters}
	/>

	<!-- Activity Stats -->
	<div class="flex items-center gap-4 text-sm text-base-content/70">
		<span>{total} activities</span>
		{#if activities.some((a) => a.status === 'downloading')}
			<span class="badge gap-1 badge-info">
				<Loader2 class="h-3 w-3 animate-spin" />
				{activities.filter((a) => a.status === 'downloading').length} downloading
			</span>
		{/if}
	</div>

	<!-- Activity Table -->
	{#if isLoading && activities.length === 0}
		<div class="flex items-center justify-center py-12">
			<Loader2 class="h-8 w-8 animate-spin" />
		</div>
	{:else}
		<ActivityTable
			{activities}
			{sortField}
			{sortDirection}
			onSort={handleSort}
			onRowClick={openDetailModal}
		/>

		<!-- Load More -->
		{#if data.hasMore}
			<div class="flex justify-center py-4">
				<button class="btn btn-ghost" onclick={loadMore} disabled={isLoadingMore}>
					{#if isLoadingMore}
						<Loader2 class="h-4 w-4 animate-spin" />
					{/if}
					Load More
				</button>
			</div>
		{/if}
	{/if}
</div>

<!-- Detail Modal -->
{#if isModalOpen && selectedActivity}
	<ActivityDetailModal
		activity={selectedActivity}
		details={activityDetails}
		loading={detailsLoading}
		onClose={closeModal}
		onPause={handlePause}
		onResume={handleResume}
		onRemove={handleRemove}
		onRetry={handleRetry}
	/>
{/if}
