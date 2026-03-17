<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { resolvePath } from '$lib/utils/routing';
	import { createSSE } from '$lib/sse';
	import ActivityTable from '$lib/components/activity/ActivityTable.svelte';
	import ActivityDetailModal from '$lib/components/activity/ActivityDetailModal.svelte';
	import ActivityFilters from '$lib/components/activity/ActivityFilters.svelte';
	import ActiveFilters from '$lib/components/activity/ActiveFilters.svelte';
	import QueueStatsCards from '$lib/components/activity/QueueStatsCards.svelte';
	import { ConfirmationModal } from '$lib/components/ui/modal';
	import {
		isActiveActivity,
		type UnifiedActivity,
		type ActivityFilters as FiltersType,
		type ActivityStatus,
		type ActivitySummary
	} from '$lib/types/activity';
	import type { ActivityStreamEvents } from '$lib/types/sse/events/activity-events.js';
	import { Activity, Loader2, Wifi, WifiOff } from 'lucide-svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import {
		ACTIVITY_REFRESH_MIN_INTERVAL_MS,
		type ActivityTab,
		type HistoryConfirmAction,
		type ActiveBulkAction,
		type QueueCardStats,
		type QueueCardStatusFilter
	} from './activity-constants.js';
	import {
		createDefaultFilters,
		normalizeFiltersForTab,
		isHistoryActivity,
		isQueueActivityId,
		shouldSyncSelectedActivity,
		normalizeActivityStatus,
		normalizeActivity,
		sortActivitiesList,
		parseQueueStats,
		createDefaultQueueCardStats,
		buildActivityApiQueryString,
		buildFilterQueryString,
		matchesActivityFilters,
		getQueueActionErrorMessage
	} from './activity-utils.js';

	let { data } = $props();

	// Local state for activities (for SSE updates)
	// Initialize directly from server data so the first render already has correct content.
	// The $effect below re-syncs on subsequent data changes (navigation / tab switch).
	function getInitialTab(): ActivityTab {
		return data.tab === 'active' ? 'active' : 'history';
	}

	function getInitialFilters(): FiltersType {
		return data.filters ? { ...data.filters } : createDefaultFilters();
	}

	let activities = $state<UnifiedActivity[]>([]);
	let total = $state(0);
	let hasMore = $state(false);
	// Track how many items were loaded from the server (excluding SSE additions)
	// so loadMore() uses the correct offset.
	let loadedOffset = $state(0);
	let selectionMode = $state(false);
	let selectedHistoryIds = new SvelteSet<string>();
	let activeSelectionMode = $state(false);
	let selectedActiveIds = new SvelteSet<string>();
	let canManageHistory = $state(false);
	let retentionDays = $state(90);
	let settingsLoading = $state(true);
	let saveRetentionLoading = $state(false);
	let purgeOlderLoading = $state(false);
	let purgeAllLoading = $state(false);
	let deleteSelectedLoading = $state(false);
	let historyConfirmOpen = $state(false);
	let historyConfirmAction = $state<HistoryConfirmAction | null>(null);
	let activeConfirmOpen = $state(false);
	let activeConfirmAction = $state<ActiveBulkAction | null>(null);
	let activeBulkLoading = $state(false);

	// Filter state - initialize from server data
	let filters = $state<FiltersType>(createDefaultFilters());
	let activeTabFilters = $state<FiltersType>(createDefaultFilters());
	let historyTabFilters = $state<FiltersType>(createDefaultFilters());
	let activityTab = $state<ActivityTab>('history');

	// Sort state
	let sortField = $state('time');
	let sortDirection = $state<'asc' | 'desc'>('desc');

	// Loading states
	let isLoading = $state(false);
	let isLoadingMore = $state(false);

	let refreshInFlight = $state(false);
	let lastActivityRefreshAt = 0;
	let activityRequestToken = 0;

	let queueStats = $state<QueueCardStats>(createDefaultQueueCardStats());

	function getFiltersForTab(tab: ActivityTab): FiltersType {
		return tab === 'active' ? activeTabFilters : historyTabFilters;
	}

	function setFiltersForTab(tab: ActivityTab, nextFilters: FiltersType): void {
		if (tab === 'active') {
			activeTabFilters = { ...nextFilters };
			return;
		}
		historyTabFilters = { ...nextFilters };
	}

	function isActiveQueueActivity(activity: UnifiedActivity): boolean {
		return isActiveActivity(activity) && Boolean(activity.queueItemId);
	}

	function toggleSelectionMode(): void {
		selectionMode = !selectionMode;
		if (!selectionMode) {
			selectedHistoryIds.clear();
		}
	}

	function handleToggleSelection(activityId: string, selected: boolean): void {
		if (selected) {
			selectedHistoryIds.add(activityId);
		} else {
			selectedHistoryIds.delete(activityId);
		}
	}

	function handleToggleSelectionAll(activityIds: string[], selected: boolean): void {
		if (selected) {
			for (const id of activityIds) {
				selectedHistoryIds.add(id);
			}
			return;
		}

		for (const id of activityIds) {
			selectedHistoryIds.delete(id);
		}
	}

	function toggleActiveSelectionMode(): void {
		activeSelectionMode = !activeSelectionMode;
		if (!activeSelectionMode) {
			selectedActiveIds.clear();
		}
	}

	function handleToggleActiveSelection(activityId: string, selected: boolean): void {
		if (selected) {
			selectedActiveIds.add(activityId);
		} else {
			selectedActiveIds.delete(activityId);
		}
	}

	function handleToggleActiveSelectionAll(activityIds: string[], selected: boolean): void {
		if (selected) {
			for (const id of activityIds) {
				selectedActiveIds.add(id);
			}
			return;
		}

		for (const id of activityIds) {
			selectedActiveIds.delete(id);
		}
	}

	function reconcileSelectedHistoryIds(sourceActivities: UnifiedActivity[]): void {
		const validIds = new Set(
			sourceActivities
				.filter((a) => isHistoryActivity(a) && selectedHistoryIds.has(a.id))
				.map((a) => a.id)
		);
		if (validIds.size === selectedHistoryIds.size) return;
		selectedHistoryIds.clear();
		for (const id of validIds) selectedHistoryIds.add(id);
	}

	function reconcileSelectedActiveIds(sourceActivities: UnifiedActivity[]): void {
		const validIds = new Set(
			sourceActivities
				.filter((a) => isActiveQueueActivity(a) && selectedActiveIds.has(a.id))
				.map((a) => a.id)
		);
		if (validIds.size === selectedActiveIds.size) return;
		selectedActiveIds.clear();
		for (const id of validIds) selectedActiveIds.add(id);
	}

	function getSelectedQueueIdsByStatus(statuses: ActivityStatus[]): string[] {
		const queueIds: string[] = [];

		for (const activity of activities) {
			if (!selectedActiveIds.has(activity.id)) continue;
			if (!isActiveQueueActivity(activity) || !activity.queueItemId) continue;
			if (!statuses.includes(activity.status)) continue;
			if (!queueIds.includes(activity.queueItemId)) {
				queueIds.push(activity.queueItemId);
			}
		}

		return queueIds;
	}

	const selectedPausableQueueIds = $derived.by(() =>
		getSelectedQueueIdsByStatus(['downloading', 'seeding'])
	);
	const selectedPausedQueueIds = $derived.by(() => getSelectedQueueIdsByStatus(['paused']));
	const selectedFailedQueueIds = $derived.by(() => getSelectedQueueIdsByStatus(['failed']));
	const selectableHistoryIds = $derived.by(() =>
		filteredActivities
			.filter((activity) => isHistoryActivity(activity))
			.map((activity) => activity.id)
	);
	const selectableActiveIds = $derived.by(() =>
		filteredActivities
			.filter((activity) => isActiveQueueActivity(activity))
			.map((activity) => activity.id)
	);
	const allHistorySelectableSelected = $derived.by(
		() =>
			selectableHistoryIds.length > 0 &&
			selectableHistoryIds.every((id) => selectedHistoryIds.has(id))
	);
	const allActiveSelectableSelected = $derived.by(
		() =>
			selectableActiveIds.length > 0 && selectableActiveIds.every((id) => selectedActiveIds.has(id))
	);

	function getActiveBulkActionQueueIds(action: ActiveBulkAction): string[] {
		switch (action) {
			case 'pause':
				return selectedPausableQueueIds;
			case 'resume':
				return selectedPausedQueueIds;
			case 'retry_failed':
			case 'remove_failed':
				return selectedFailedQueueIds;
		}
	}

	function applyQueueCardFilter(status: QueueCardStatusFilter): void {
		if (activityTab !== 'active') return;
		const currentStatus = filters.status ?? 'all';
		if (currentStatus === status) return;
		applyFilters({ ...filters, status }, 'active');
	}

	function syncActivityUrl(nextFilters: FiltersType, tab: ActivityTab): void {
		if (typeof window === 'undefined') return;
		const queryString = buildFilterQueryString(nextFilters, tab);
		const nextUrl = resolvePath(`/activity${queryString ? `?${queryString}` : ''}`);
		window.history.replaceState(window.history.state, '', nextUrl);
	}

	function applyActivityResult(
		payload: {
			activities?: UnifiedActivity[];
			total?: number;
			hasMore?: boolean;
			summary?: Partial<ActivitySummary> | null;
		},
		options: { append?: boolean } = {}
	): void {
		const { append = false } = options;
		const nextActivities = Array.isArray(payload.activities) ? payload.activities : [];

		activities = append ? [...activities, ...nextActivities] : nextActivities;
		loadedOffset = activities.length;
		total = typeof payload.total === 'number' ? payload.total : total;
		hasMore = typeof payload.hasMore === 'boolean' ? payload.hasMore : false;
		if (!append) {
			queueStats = parseQueueStats((payload.summary ?? null) as Partial<ActivitySummary> | null);
		}
	}

	async function fetchActivityData(
		nextFilters: FiltersType,
		tab: ActivityTab,
		options: { offset?: number; append?: boolean; updateUrl?: boolean; force?: boolean } = {}
	): Promise<void> {
		const { offset = 0, append = false, updateUrl = false, force = false } = options;
		const normalizedFilters = normalizeFiltersForTab(nextFilters, tab);
		const requestToken = ++activityRequestToken;
		const previousActivities = append ? activities : [...activities];
		const previousHasMore = hasMore;

		if (!append) {
			activities = [];
			hasMore = false;
		}

		if (append) {
			isLoadingMore = true;
		} else {
			isLoading = true;
		}

		try {
			const queryString = buildActivityApiQueryString(normalizedFilters, tab, {
				limit: 50,
				offset
			});
			const response = await fetch(resolvePath(`/api/activity?${queryString}`));
			if (!response.ok) {
				throw new Error('Failed to load activity');
			}

			const payload = await response.json();
			if (requestToken !== activityRequestToken) return;
			if (!payload?.success) {
				throw new Error(
					typeof payload?.error === 'string' ? payload.error : 'Failed to load activity'
				);
			}

			filters = normalizedFilters;
			activityTab = tab;
			setFiltersForTab(tab, normalizedFilters);
			applyActivityResult(payload, { append });

			if (!append && updateUrl) {
				syncActivityUrl(normalizedFilters, tab);
			}

			if (!append && force) {
				lastActivityRefreshAt = Date.now();
			}
		} catch (error) {
			if (!append) {
				activities = previousActivities ?? activities;
				hasMore = previousHasMore;
			}
			throw error;
		} finally {
			if (requestToken === activityRequestToken) {
				isLoading = false;
				isLoadingMore = false;
			}
		}
	}

	// ── Derived sorted view (server handles filtering; client handles sort) ──
	const filteredActivities = $derived.by(() => {
		const field = sortField;
		const direction = sortDirection;
		return sortActivitiesList(activities, field, direction);
	});

	// Derived inline stats (replaces inline template computations)
	const hasDownloading = $derived(
		activityTab === 'active' && filteredActivities.some((a) => a.status === 'downloading')
	);
	const downloadingCount = $derived(
		hasDownloading ? filteredActivities.filter((a) => a.status === 'downloading').length : 0
	);

	function removeStaleQueueLinkedRows(queueActivity: UnifiedActivity): number {
		if (!isQueueActivityId(queueActivity.id) || !queueActivity.queueItemId) {
			return 0;
		}

		const staleRowIds = new Set(
			activities
				.filter(
					(activity) =>
						activity.id !== queueActivity.id &&
						!isQueueActivityId(activity.id) &&
						activity.queueItemId === queueActivity.queueItemId
				)
				.map((activity) => activity.id)
		);

		if (staleRowIds.size === 0) {
			return 0;
		}

		activities = activities.filter((activity) => !staleRowIds.has(activity.id));

		if (
			selectedActivity &&
			selectedActivity.queueItemId === queueActivity.queueItemId &&
			staleRowIds.has(selectedActivity.id)
		) {
			selectedActivity = queueActivity;
		}

		return staleRowIds.size;
	}

	function upsertActivity(activity: Partial<UnifiedActivity>): void {
		const normalized = normalizeActivity(activity);
		if (!normalized) return;
		const inScope = matchesActivityFilters(normalized, filters, activityTab);

		const existingIndex = activities.findIndex((a) => a.id === normalized.id);

		// If the item already exists, update in place
		if (existingIndex >= 0) {
			if (!inScope) {
				const removed = activities[existingIndex];
				activities = activities.filter((entry) => entry.id !== removed.id);
				total = Math.max(0, total - 1);
				if (selectedActivity && shouldSyncSelectedActivity(selectedActivity, normalized)) {
					selectedActivity = null;
					isModalOpen = false;
				}
				return;
			}

			const existing = activities[existingIndex];
			Object.assign(existing, normalized);
			const removedDuplicates = removeStaleQueueLinkedRows(existing);
			if (
				selectedActivity &&
				selectedActivity !== existing &&
				shouldSyncSelectedActivity(selectedActivity, existing)
			) {
				selectedActivity = existing;
			}
			if (removedDuplicates > 0) {
				total = Math.max(0, total - removedDuplicates);
			}
			// Trigger reactivity by reassigning (no sort needed -- $derived handles it)
			activities = activities;
			return;
		}

		// New item: check if it belongs in the current tab scope at all
		if (!inScope) {
			if (selectedActivity && shouldSyncSelectedActivity(selectedActivity, normalized)) {
				selectedActivity = { ...selectedActivity, ...normalized };
			}
			return;
		}

		// Add new item (no sort needed -- $derived handles it)
		activities = [normalized, ...activities];
		const removedDuplicates = removeStaleQueueLinkedRows(normalized);
		total = Math.max(0, total + 1 - removedDuplicates);
	}

	// Detail modal state
	let selectedActivity = $state<UnifiedActivity | null>(null);
	let isModalOpen = $state(false);

	// Update activities when data changes (navigation / tab switch / filter change)
	$effect(() => {
		const nextTab = getInitialTab();
		const initialFilters = getInitialFilters();
		activityTab = nextTab;
		activeTabFilters = nextTab === 'active' ? { ...initialFilters } : createDefaultFilters();
		historyTabFilters = nextTab === 'history' ? { ...initialFilters } : createDefaultFilters();
		// Store unsorted master list; $derived filteredActivities handles sort
		activities = data.activities;
		total = data.total;
		hasMore = data.hasMore;
		loadedOffset = data.activities.length;
		queueStats = parseQueueStats((data.summary ?? null) as Partial<ActivitySummary> | null);
		filters = initialFilters;
		setFiltersForTab(nextTab, initialFilters);
		// Reconcile selections against the new data (untracked to avoid circular deps)
		untrack(() => {
			reconcileSelectedHistoryIds(data.activities);
			reconcileSelectedActiveIds(data.activities);
		});
	});

	$effect(() => {
		// Only reconcile when selection mode is active to avoid unnecessary work
		// Read activities to trigger on data changes, but untrack the mutations
		const currentActivities = activities;
		if (selectionMode && selectedHistoryIds.size > 0) {
			untrack(() => reconcileSelectedHistoryIds(currentActivities));
		}
		if (activeSelectionMode && selectedActiveIds.size > 0) {
			untrack(() => reconcileSelectedActiveIds(currentActivities));
		}
	});

	$effect(() => {
		const currentSelected = selectedActivity;
		if (!isModalOpen || !currentSelected) return;

		const linkedById = activities.find((activity) => activity.id === currentSelected.id);
		const linkedByQueueId = currentSelected.queueItemId
			? activities.filter((activity) => activity.queueItemId === currentSelected.queueItemId)
			: [];
		const preferredByQueueId =
			linkedByQueueId.find((activity) => isQueueActivityId(activity.id)) || linkedByQueueId[0];
		const linkedActivity = linkedById || preferredByQueueId;

		if (
			linkedActivity &&
			linkedActivity !== currentSelected &&
			shouldSyncSelectedActivity(currentSelected, linkedActivity)
		) {
			selectedActivity = linkedActivity;
		}
	});

	$effect(() => {
		if (activityTab !== 'history' && (selectionMode || selectedHistoryIds.size > 0)) {
			selectionMode = false;
			selectedHistoryIds.clear();
		}
		if (activityTab !== 'active' && (activeSelectionMode || selectedActiveIds.size > 0)) {
			activeSelectionMode = false;
			selectedActiveIds.clear();
		}
		if (activityTab !== 'active' && activeConfirmOpen && !activeBulkLoading) {
			activeConfirmOpen = false;
			activeConfirmAction = null;
		}
	});

	// ── Batched SSE progress updates ────────────────────────────────────
	let pendingProgressUpdates = new SvelteMap<
		string,
		{ progress: UnifiedActivity['downloadProgress']; status?: string }
	>();
	let progressFlushFrame: ReturnType<typeof requestAnimationFrame> | null = null;

	function flushProgressUpdates(): void {
		progressFlushFrame = null;
		if (pendingProgressUpdates.size === 0) return;

		const updates = pendingProgressUpdates;
		pendingProgressUpdates = new SvelteMap();

		for (const activity of activities) {
			const update = updates.get(activity.id);
			if (!update) continue;
			activity.downloadProgress = update.progress;
			if (update.status) {
				activity.status = normalizeActivityStatus(update.status);
			}
		}

		// Sync selected activity if affected
		if (selectedActivity) {
			const selUpdate = updates.get(selectedActivity.id);
			const queueItemId = selectedActivity.queueItemId;
			if (selUpdate) {
				selectedActivity.downloadProgress = selUpdate.progress;
				if (selUpdate.status) {
					selectedActivity.status = normalizeActivityStatus(selUpdate.status);
				}
				selectedActivity = { ...selectedActivity };
			} else if (queueItemId) {
				// Check by queueItemId
				for (const [id, upd] of updates) {
					const qId = id.startsWith('queue-') ? id.slice('queue-'.length) : undefined;
					if (qId === queueItemId) {
						selectedActivity.downloadProgress = upd.progress;
						if (upd.status) {
							selectedActivity.status = normalizeActivityStatus(upd.status);
						}
						selectedActivity = { ...selectedActivity };
						break;
					}
				}
			}
		}

		// Svelte 5 deep reactivity tracks individual property mutations on
		// $state arrays, so the template updates for downloadProgress/status
		// without needing to reassign the whole array.  Skipping the
		// `activities = activities` pattern here avoids triggering a full
		// $derived sort recomputation on every progress tick.
	}

	// SSE Connection - internally handles browser/SSR
	const sse = createSSE<ActivityStreamEvents>(
		resolvePath('/api/activity/stream'),
		{
			'activity:new': (newActivity) => {
				upsertActivity(newActivity);
			},
			'activity:seed': (seedActivities) => {
				for (const activity of seedActivities) {
					upsertActivity(activity);
				}
			},
			'activity:updated': (updated) => {
				upsertActivity(updated);
			},
			'activity:progress': (data) => {
				// Batch progress updates and flush on next animation frame
				pendingProgressUpdates.set(data.id, {
					progress: data.progress,
					status: data.status
				});
				if (progressFlushFrame === null) {
					progressFlushFrame = requestAnimationFrame(flushProgressUpdates);
				}
			},
			'activity:refresh': () => {
				void refreshActivityData({ force: true });
			}
		},
		{
			maxRetries: Infinity
		}
	);

	async function refreshActivityData(options: { force?: boolean } = {}): Promise<void> {
		const { force = false } = options;
		if (refreshInFlight) return;
		const now = Date.now();
		if (!force && now - lastActivityRefreshAt < ACTIVITY_REFRESH_MIN_INTERVAL_MS) {
			return;
		}

		refreshInFlight = true;
		try {
			await fetchActivityData(filters, activityTab, { force });
		} finally {
			refreshInFlight = false;
			lastActivityRefreshAt = Date.now();
		}
	}

	async function loadHistorySettings(): Promise<void> {
		settingsLoading = true;
		try {
			const response = await fetch('/api/activity/settings');
			if (response.status === 401 || response.status === 403) {
				canManageHistory = false;
				return;
			}
			if (!response.ok) {
				throw new Error('Failed to load history settings');
			}

			const payload = await response.json();
			if (payload.success && typeof payload.retentionDays === 'number') {
				retentionDays = payload.retentionDays;
			}
			canManageHistory = true;
		} catch (error) {
			toasts.error('Failed to load history settings', {
				description: error instanceof Error ? error.message : 'Failed to load history settings'
			});
			canManageHistory = false;
		} finally {
			settingsLoading = false;
		}
	}

	onMount(() => {
		if (activityTab === 'history') {
			void loadHistorySettings();
		}

		const handleFocus = () => {
			if (!sse.isConnected) {
				void refreshActivityData();
			}
		};

		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible' && !sse.isConnected) {
				void refreshActivityData();
			}
		};

		const handlePageShow = () => {
			void refreshActivityData();
		};

		window.addEventListener('focus', handleFocus);
		document.addEventListener('visibilitychange', handleVisibilityChange);
		window.addEventListener('pageshow', handlePageShow);

		return () => {
			if (progressFlushFrame !== null) {
				cancelAnimationFrame(progressFlushFrame);
				progressFlushFrame = null;
			}
			window.removeEventListener('focus', handleFocus);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('pageshow', handlePageShow);
		};
	});

	$effect(() => {
		if (activityTab === 'history' && settingsLoading && !canManageHistory) {
			void loadHistorySettings();
		}
	});

	async function saveRetention(): Promise<void> {
		if (!canManageHistory || saveRetentionLoading) return;

		saveRetentionLoading = true;
		try {
			const response = await fetch('/api/activity/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ retentionDays })
			});
			if (response.status === 401 || response.status === 403) {
				canManageHistory = false;
				throw new Error('Admin access is required');
			}

			const payload = await response.json().catch(() => ({}));
			if (!response.ok || !payload.success) {
				throw new Error(
					typeof payload.error === 'string' ? payload.error : 'Failed to save retention setting'
				);
			}

			retentionDays = payload.retentionDays ?? retentionDays;
			toasts.success(`Retention updated to ${retentionDays} day${retentionDays === 1 ? '' : 's'}`);
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to save retention setting');
		} finally {
			saveRetentionLoading = false;
		}
	}

	const historyConfirmTitle = $derived.by((): string => {
		switch (historyConfirmAction) {
			case 'purge_all':
				return 'Purge All Activity History';
			case 'purge_older_than_retention':
				return 'Purge Older Activity History';
			case 'delete_selected':
				return 'Delete Selected History';
			default:
				return 'Confirm Action';
		}
	});

	const historyConfirmMessage = $derived.by((): string => {
		switch (historyConfirmAction) {
			case 'purge_all':
				return 'Permanently delete all activity history? This cannot be undone.';
			case 'purge_older_than_retention':
				return `Delete activity history older than ${retentionDays} days? This cannot be undone.`;
			case 'delete_selected':
				return `Delete ${selectedHistoryIds.size} selected history row${selectedHistoryIds.size === 1 ? '' : 's'}? This cannot be undone.`;
			default:
				return '';
		}
	});

	const historyConfirmLabel = $derived.by((): string => {
		switch (historyConfirmAction) {
			case 'purge_all':
				return 'Purge All';
			case 'purge_older_than_retention':
				return 'Purge Older';
			case 'delete_selected':
				return 'Delete Selected';
			default:
				return 'Confirm';
		}
	});

	const historyConfirmLoading = $derived.by((): boolean => {
		switch (historyConfirmAction) {
			case 'purge_all':
				return purgeAllLoading;
			case 'purge_older_than_retention':
				return purgeOlderLoading;
			case 'delete_selected':
				return deleteSelectedLoading;
			default:
				return false;
		}
	});

	const activeConfirmTargetCount = $derived.by(() =>
		activeConfirmAction ? getActiveBulkActionQueueIds(activeConfirmAction).length : 0
	);

	const activeConfirmSkippedCount = $derived.by(() =>
		Math.max(0, selectedActiveIds.size - activeConfirmTargetCount)
	);

	const activeConfirmTitle = $derived.by((): string => {
		switch (activeConfirmAction) {
			case 'pause':
				return 'Pause Selected Downloads';
			case 'resume':
				return 'Resume Selected Downloads';
			case 'retry_failed':
				return 'Retry Failed Downloads';
			case 'remove_failed':
				return 'Remove Failed Downloads';
			default:
				return 'Confirm Action';
		}
	});

	const activeConfirmMessage = $derived.by((): string => {
		const targetCount = activeConfirmTargetCount;
		const targetLabel = `${targetCount} queue item${targetCount === 1 ? '' : 's'}`;
		const skippedSuffix =
			activeConfirmSkippedCount > 0
				? ` ${activeConfirmSkippedCount} selected queue item${activeConfirmSkippedCount === 1 ? '' : 's'} does not match this action and will be skipped.`
				: '';

		switch (activeConfirmAction) {
			case 'pause':
				return `Pause ${targetLabel}?${skippedSuffix}`;
			case 'resume':
				return `Resume ${targetLabel}?${skippedSuffix}`;
			case 'retry_failed':
				return `Retry ${targetLabel}? Completed-client failures retry import first; other failures re-download.${skippedSuffix}`;
			case 'remove_failed':
				return `Remove ${targetLabel} from the queue? This cannot be undone.${skippedSuffix}`;
			default:
				return '';
		}
	});

	const activeConfirmLabel = $derived.by((): string => {
		switch (activeConfirmAction) {
			case 'pause':
				return 'Pause Selected';
			case 'resume':
				return 'Resume Selected';
			case 'retry_failed':
				return 'Retry Failed';
			case 'remove_failed':
				return 'Remove Failed';
			default:
				return 'Confirm';
		}
	});

	const activeConfirmVariant = $derived.by((): 'error' | 'warning' | 'primary' => {
		switch (activeConfirmAction) {
			case 'remove_failed':
				return 'error';
			case 'retry_failed':
				return 'warning';
			default:
				return 'primary';
		}
	});

	function openHistoryConfirm(action: HistoryConfirmAction): void {
		if (!canManageHistory) return;
		if (action === 'purge_all' && (settingsLoading || purgeAllLoading)) return;
		if (action === 'purge_older_than_retention' && (settingsLoading || purgeOlderLoading)) return;
		if (action === 'delete_selected' && (deleteSelectedLoading || selectedHistoryIds.size === 0))
			return;

		historyConfirmAction = action;
		historyConfirmOpen = true;
	}

	function closeHistoryConfirm(): void {
		if (historyConfirmLoading) return;
		historyConfirmOpen = false;
		historyConfirmAction = null;
	}

	async function handleHistoryConfirm(): Promise<void> {
		if (!historyConfirmAction || historyConfirmLoading) return;

		if (historyConfirmAction === 'purge_all') {
			await purgeHistory('all');
		} else if (historyConfirmAction === 'purge_older_than_retention') {
			await purgeHistory('older_than_retention');
		} else {
			await deleteSelectedHistory();
		}

		historyConfirmOpen = false;
		historyConfirmAction = null;
	}

	async function purgeHistory(action: 'older_than_retention' | 'all'): Promise<void> {
		if (!canManageHistory) return;
		if (action === 'older_than_retention' && purgeOlderLoading) return;
		if (action === 'all' && purgeAllLoading) return;

		if (action === 'all') {
			purgeAllLoading = true;
		} else {
			purgeOlderLoading = true;
		}

		try {
			const response = await fetch('/api/activity/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action })
			});
			if (response.status === 401 || response.status === 403) {
				canManageHistory = false;
				throw new Error('Admin access is required');
			}

			const payload = await response.json().catch(() => ({}));
			if (!response.ok || !payload.success) {
				throw new Error(
					typeof payload.error === 'string' ? payload.error : 'Failed to purge activity entries'
				);
			}

			const totalDeleted =
				typeof payload.totalDeleted === 'number'
					? payload.totalDeleted
					: (payload.deletedDownloadHistory ?? 0) + (payload.deletedMonitoringHistory ?? 0);
			toasts.success(
				`Deleted ${totalDeleted} activity ${totalDeleted === 1 ? 'entry' : 'entries'}`
			);
			selectedHistoryIds.clear();
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to purge activity entries');
			return;
		}

		try {
			await refreshActivityData({ force: true });
		} catch (_error) {
			toasts.info('Purge completed. Activity list will refresh shortly.');
		} finally {
			purgeOlderLoading = false;
			purgeAllLoading = false;
		}
	}

	async function deleteSelectedHistory(): Promise<void> {
		if (!canManageHistory || deleteSelectedLoading || selectedHistoryIds.size === 0) return;

		deleteSelectedLoading = true;
		try {
			const response = await fetch('/api/activity', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ activityIds: [...selectedHistoryIds] })
			});
			if (response.status === 401 || response.status === 403) {
				canManageHistory = false;
				throw new Error('Admin access is required');
			}

			const payload = await response.json().catch(() => ({}));
			if (!response.ok || !payload.success) {
				throw new Error(
					typeof payload.error === 'string'
						? payload.error
						: 'Failed to delete selected activity entries'
				);
			}

			const totalDeleted =
				typeof payload.totalDeleted === 'number'
					? payload.totalDeleted
					: (payload.deletedDownloadHistory ?? 0) + (payload.deletedMonitoringHistory ?? 0);
			const skippedQueue = typeof payload.skippedQueue === 'number' ? payload.skippedQueue : 0;
			const skippedRetryableFailed =
				typeof payload.skippedRetryableFailed === 'number' ? payload.skippedRetryableFailed : 0;

			toasts.success(
				`Deleted ${totalDeleted} activity ${totalDeleted === 1 ? 'entry' : 'entries'}`
			);
			if (skippedQueue > 0) {
				toasts.info(
					`${skippedQueue} active download ${skippedQueue === 1 ? 'item was' : 'items were'} skipped (use queue actions to remove them)`
				);
			}
			if (skippedRetryableFailed > 0) {
				toasts.info(
					`${skippedRetryableFailed} failed activity ${skippedRetryableFailed === 1 ? 'entry was' : 'entries were'} kept because retry is still available`
				);
			}

			selectedHistoryIds.clear();
		} catch (error) {
			toasts.error(
				error instanceof Error ? error.message : 'Failed to delete selected activity entries'
			);
			return;
		}

		try {
			await refreshActivityData({ force: true });
		} catch (_error) {
			toasts.info('Delete completed. Activity list will refresh shortly.');
		} finally {
			deleteSelectedLoading = false;
		}
	}

	function openActiveConfirm(action: ActiveBulkAction): void {
		if (activityTab !== 'active' || !activeSelectionMode || activeBulkLoading) return;
		if (getActiveBulkActionQueueIds(action).length === 0) return;

		activeConfirmAction = action;
		activeConfirmOpen = true;
	}

	function closeActiveConfirm(): void {
		if (activeBulkLoading) return;
		activeConfirmOpen = false;
		activeConfirmAction = null;
	}

	async function handleActiveConfirm(): Promise<void> {
		if (!activeConfirmAction || activeBulkLoading) return;

		await executeActiveBulkAction(activeConfirmAction);
		activeConfirmOpen = false;
		activeConfirmAction = null;
	}

	async function executeActiveBulkAction(action: ActiveBulkAction): Promise<void> {
		const queueIds = getActiveBulkActionQueueIds(action);
		if (queueIds.length === 0) return;

		activeBulkLoading = true;
		let successCount = 0;
		let failedCount = 0;
		let firstFailureMessage: string | null = null;

		const runForQueueId =
			action === 'pause'
				? (queueId: string) => runQueueAction(queueId, 'pause')
				: action === 'resume'
					? (queueId: string) => runQueueAction(queueId, 'resume')
					: action === 'retry_failed'
						? (queueId: string) => retryQueueItem(queueId, { refresh: false })
						: (queueId: string) =>
								removeQueueItem(queueId, {
									refresh: false,
									closeDetailModal: false,
									removeFromClient: false
								});

		for (const queueId of queueIds) {
			try {
				await runForQueueId(queueId);
				successCount += 1;
			} catch (error) {
				failedCount += 1;
				if (!firstFailureMessage) {
					firstFailureMessage =
						error instanceof Error ? error.message : 'One or more actions failed';
				}
			}
		}

		try {
			if (successCount > 0 && (action === 'retry_failed' || action === 'remove_failed')) {
				await refreshActivityData({ force: true });
			}
		} catch (_error) {
			toasts.info('Queue action completed. Activity list will refresh shortly.');
		} finally {
			activeBulkLoading = false;
		}

		const actionPastTense =
			action === 'pause'
				? 'Paused'
				: action === 'resume'
					? 'Resumed'
					: action === 'retry_failed'
						? 'Retried'
						: 'Removed';
		const actionVerb =
			action === 'pause'
				? 'pause'
				: action === 'resume'
					? 'resume'
					: action === 'retry_failed'
						? 'retry'
						: 'remove';

		if (successCount > 0) {
			toasts.success(`${actionPastTense} ${successCount} download${successCount === 1 ? '' : 's'}`);
		}
		if (failedCount > 0) {
			const suffix = firstFailureMessage ? ` First error: ${firstFailureMessage}` : '';
			toasts.error(
				`Failed to ${actionVerb} ${failedCount} download${failedCount === 1 ? '' : 's'}.${suffix}`
			);
		}

		if (action === 'retry_failed' || action === 'remove_failed') {
			selectedActiveIds.clear();
		}
	}

	// Apply filters by fetching activity data directly and syncing the URL.
	async function applyFilters(newFilters: FiltersType, tab: ActivityTab = activityTab) {
		const normalizedFilters = normalizeFiltersForTab(newFilters, tab);
		try {
			await fetchActivityData(normalizedFilters, tab, { updateUrl: true });
		} catch (_error) {
			toasts.error('Failed to update activity filters');
		} finally {
			// handled by fetchActivityData
		}
	}

	async function switchTab(tab: ActivityTab): Promise<void> {
		if (tab === activityTab) return;

		const tabFilters = normalizeFiltersForTab(getFiltersForTab(tab), tab);
		try {
			await fetchActivityData(tabFilters, tab, { updateUrl: true });
		} catch (_error) {
			toasts.error('Failed to switch activity tab');
		} finally {
			// handled by fetchActivityData
		}
	}

	// Remove a specific filter
	function removeFilter(key: keyof FiltersType) {
		const newFilters = { ...filters };
		if (key === 'status' || key === 'mediaType' || key === 'protocol') {
			newFilters[key] = 'all';
		} else {
			delete newFilters[key];
		}
		applyFilters(newFilters);
	}

	// Clear all filters
	function clearAllFilters() {
		applyFilters({
			status: 'all',
			mediaType: 'all',
			protocol: 'all'
		});
	}

	// Handle sort (just update state; $derived filteredActivities recomputes)
	function handleSort(field: string) {
		if (sortField === field) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortField = field;
			sortDirection = 'desc';
		}
	}

	// Load more
	async function loadMore() {
		if (isLoadingMore || !hasMore) return;

		try {
			await fetchActivityData(filters, activityTab, { offset: loadedOffset, append: true });
		} catch (_error) {
			toasts.error('Failed to load more activity');
		}
	}

	// Open detail modal
	function openDetailModal(activity: UnifiedActivity) {
		selectedActivity = activity;
		isModalOpen = true;
	}

	function closeModal() {
		isModalOpen = false;
	}

	function applyQueueStatusLocally(id: string, status: ActivityStatus, statusReason?: string) {
		let changed = false;
		for (const activity of activities) {
			if (activity.queueItemId === id) {
				activity.status = status;
				if (statusReason !== undefined) {
					activity.statusReason = statusReason;
				}
				changed = true;
			}
		}
		if (changed) {
			activities = activities;
		}
		if (selectedActivity?.queueItemId === id) {
			selectedActivity.status = status;
			if (statusReason !== undefined) {
				selectedActivity.statusReason = statusReason;
			}
			selectedActivity = { ...selectedActivity };
		}
	}

	async function runQueueAction(id: string, action: 'pause' | 'resume') {
		const response = await fetch(`/api/queue/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action })
		});
		if (!response.ok) {
			const message = await getQueueActionErrorMessage(response, `Failed to ${action}`);
			throw new Error(message);
		}
		applyQueueStatusLocally(id, action === 'pause' ? 'paused' : 'downloading');
	}

	async function removeQueueItem(
		id: string,
		options: { refresh?: boolean; closeDetailModal?: boolean; removeFromClient?: boolean } = {}
	): Promise<void> {
		const { refresh = true, closeDetailModal = true, removeFromClient = true } = options;
		const query = removeFromClient ? '' : '?removeFromClient=false';
		const response = await fetch(`/api/queue/${id}${query}`, { method: 'DELETE' });
		if (!response.ok) {
			const message = await getQueueActionErrorMessage(response, 'Failed to remove');
			throw new Error(message);
		}

		if (refresh) {
			await refreshActivityData({ force: true });
		}
		if (closeDetailModal) {
			closeModal();
		}
	}

	async function retryQueueItem(id: string, options: { refresh?: boolean } = {}): Promise<void> {
		const { refresh = true } = options;
		const response = await fetch(`/api/queue/${id}/retry`, { method: 'POST' });
		if (!response.ok) {
			const message = await getQueueActionErrorMessage(response, 'Failed to retry');
			throw new Error(message);
		}

		const payload = await response.json().catch(() => null);
		const retryMode = typeof payload?.retryMode === 'string' ? payload.retryMode : 'download';
		const importStatus = typeof payload?.importStatus === 'string' ? payload.importStatus : null;
		if (retryMode === 'import') {
			const reason =
				importStatus === 'pending_retry'
					? 'Waiting for download path before import retry'
					: 'Import retry in progress';
			applyQueueStatusLocally(id, 'downloading', reason);
		} else {
			applyQueueStatusLocally(id, 'downloading');
		}

		if (refresh && retryMode !== 'import') {
			await refreshActivityData({ force: true });
		}
	}

	// Queue actions
	async function handlePause(id: string) {
		await runQueueAction(id, 'pause');
	}

	async function handleResume(id: string) {
		await runQueueAction(id, 'resume');
	}

	async function handleRemove(id: string) {
		await removeQueueItem(id);
	}

	async function handleRetry(id: string) {
		await retryQueueItem(id);
	}
</script>

<svelte:head>
	<title>Activity - Cinephage</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="flex items-center gap-2 text-2xl font-bold">
				<Activity class="h-8 w-8" />
				Activity
			</h1>
			<p class="text-base-content/70">Download and search history</p>
		</div>
		<!-- Connection Status -->
		<div class="hidden lg:block">
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

	<div class="tabs-boxed tabs w-fit">
		<button
			class="tab {activityTab === 'active' ? 'tab-active' : ''}"
			onclick={() => switchTab('active')}
		>
			Active Downloads
		</button>
		<button
			class="tab {activityTab === 'history' ? 'tab-active' : ''}"
			onclick={() => switchTab('history')}
		>
			History
		</button>
	</div>

	{#if activityTab === 'active'}
		<QueueStatsCards
			stats={queueStats}
			activeFilter={(filters.status ?? 'all') as QueueCardStatusFilter}
			onFilterSelect={applyQueueCardFilter}
		/>
	{/if}

	<!-- Unified Toolbar -->
	<ActivityFilters
		{filters}
		filterOptions={data.filterOptions}
		statusContext={activityTab}
		onFiltersChange={applyFilters}
		onClearFilters={clearAllFilters}
		showActiveFilters={true}
		showHistoryControls={canManageHistory && activityTab === 'history'}
	>
		{#snippet activeFiltersContent()}
			<ActiveFilters
				{filters}
				downloadClients={data.filterOptions.downloadClients}
				onFilterRemove={removeFilter}
				onClearAll={clearAllFilters}
			/>
			{#if activityTab === 'active'}
				<div class="mt-3 flex flex-wrap items-center gap-2">
					<span class="text-sm font-bold tracking-wide text-base-content/70"
						>Queue Bulk Actions</span
					>
					<div class="divider m-0 divider-horizontal h-6"></div>
					<button class="btn btn-ghost btn-xs" onclick={toggleActiveSelectionMode}>
						{activeSelectionMode ? 'Exit Selection' : 'Select Rows'}
					</button>

					{#if activeSelectionMode}
						<span class="text-xs text-base-content/60">{selectedActiveIds.size} selected</span>
						<button
							class="btn btn-ghost btn-xs"
							onclick={() =>
								handleToggleActiveSelectionAll(selectableActiveIds, !allActiveSelectableSelected)}
							disabled={activeBulkLoading || selectableActiveIds.length === 0}
						>
							{allActiveSelectableSelected
								? `Deselect All (${selectableActiveIds.length})`
								: `Select All (${selectableActiveIds.length})`}
						</button>
						<button
							class="btn btn-xs"
							onclick={() => openActiveConfirm('pause')}
							disabled={activeBulkLoading || selectedPausableQueueIds.length === 0}
						>
							Pause ({selectedPausableQueueIds.length})
						</button>
						<button
							class="btn btn-xs"
							onclick={() => openActiveConfirm('resume')}
							disabled={activeBulkLoading || selectedPausedQueueIds.length === 0}
						>
							Resume ({selectedPausedQueueIds.length})
						</button>
						<button
							class="btn btn-xs btn-warning"
							onclick={() => openActiveConfirm('retry_failed')}
							disabled={activeBulkLoading || selectedFailedQueueIds.length === 0}
						>
							Retry Failed ({selectedFailedQueueIds.length})
						</button>
						<button
							class="btn btn-xs btn-error"
							onclick={() => openActiveConfirm('remove_failed')}
							disabled={activeBulkLoading || selectedFailedQueueIds.length === 0}
						>
							Remove Failed ({selectedFailedQueueIds.length})
						</button>
						<div class="ml-auto"></div>
						<button
							class="btn btn-ghost btn-xs"
							onclick={() => {
								selectedActiveIds.clear();
							}}
							disabled={activeBulkLoading || selectedActiveIds.size === 0}
						>
							Clear Selection
						</button>
					{:else}
						<span class="text-xs text-base-content/60">
							Select queue rows to bulk pause, resume, retry failed, or remove failed downloads.
						</span>
					{/if}
				</div>
			{/if}
		{/snippet}

		{#snippet historyControlsContent()}
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-sm font-bold tracking-wide text-base-content/70">History Management</span>
				<div class="divider m-0 divider-horizontal h-6"></div>
				<label class="flex items-center gap-2 text-sm">
					<span class="text-base-content/70">Retention:</span>
					<select
						class="select-bordered select select-xs"
						bind:value={retentionDays}
						disabled={settingsLoading}
					>
						<option value={7}>7 days</option>
						<option value={14}>14 days</option>
						<option value={30}>30 days</option>
						<option value={60}>60 days</option>
						<option value={90}>90 days</option>
					</select>
				</label>
				<div class="divider m-0 divider-horizontal h-6"></div>
				<button
					class="btn btn-xs"
					onclick={saveRetention}
					disabled={settingsLoading || saveRetentionLoading}
				>
					{#if saveRetentionLoading}
						<Loader2 class="h-3 w-3 animate-spin" />
					{/if}
					Save
				</button>
				<button
					class="btn btn-xs"
					onclick={() => openHistoryConfirm('purge_older_than_retention')}
					disabled={settingsLoading || purgeOlderLoading}
				>
					{#if purgeOlderLoading}
						<Loader2 class="h-3 w-3 animate-spin" />
					{/if}
					Purge Older
				</button>
				<button class="btn btn-ghost btn-xs" onclick={toggleSelectionMode}>
					{selectionMode ? 'Exit Selection' : 'Select Rows'}
				</button>
				{#if selectionMode}
					<button
						class="btn btn-ghost btn-xs"
						onclick={() =>
							handleToggleSelectionAll(selectableHistoryIds, !allHistorySelectableSelected)}
						disabled={deleteSelectedLoading || selectableHistoryIds.length === 0}
					>
						{allHistorySelectableSelected
							? `Deselect All (${selectableHistoryIds.length})`
							: `Select All (${selectableHistoryIds.length})`}
					</button>
					<button
						class="btn btn-xs btn-error"
						onclick={() => openHistoryConfirm('delete_selected')}
						disabled={deleteSelectedLoading || selectedHistoryIds.size === 0}
					>
						{#if deleteSelectedLoading}
							<Loader2 class="h-3 w-3 animate-spin" />
						{/if}
						Delete Selected ({selectedHistoryIds.size})
					</button>
				{/if}
				<div class="ml-auto"></div>
				<button
					class="btn btn-xs btn-error"
					onclick={() => openHistoryConfirm('purge_all')}
					disabled={settingsLoading || purgeAllLoading}
				>
					{#if purgeAllLoading}
						<Loader2 class="h-3 w-3 animate-spin" />
					{/if}
					Purge All
				</button>
			</div>
		{/snippet}
	</ActivityFilters>

	<!-- Activity Stats -->
	<div class="flex items-center gap-4 text-sm text-base-content/70">
		<span>{total} {activityTab === 'active' ? 'active downloads' : 'history activities'}</span>
		{#if hasDownloading}
			<span class="badge gap-1 badge-info">
				<Loader2 class="h-3 w-3 animate-spin" />
				{downloadingCount} downloading
			</span>
		{/if}
	</div>

	<!-- Activity Table -->
	{#if isLoading && filteredActivities.length === 0}
		<div class="flex items-center justify-center py-12">
			<Loader2 class="h-8 w-8 animate-spin" />
		</div>
	{:else}
		<ActivityTable
			activities={filteredActivities}
			{sortField}
			{sortDirection}
			selectionMode={activityTab === 'history' ? selectionMode : activeSelectionMode}
			selectedIds={activityTab === 'history' ? selectedHistoryIds : selectedActiveIds}
			isSelectable={activityTab === 'history' ? isHistoryActivity : isActiveQueueActivity}
			onSort={handleSort}
			onRowClick={openDetailModal}
			onPause={handlePause}
			onResume={handleResume}
			onRemove={handleRemove}
			onRetry={handleRetry}
			onToggleSelection={activityTab === 'history'
				? handleToggleSelection
				: handleToggleActiveSelection}
			onToggleSelectionAll={activityTab === 'history'
				? handleToggleSelectionAll
				: handleToggleActiveSelectionAll}
			{hasMore}
			{isLoadingMore}
			onLoadMore={loadMore}
		/>
	{/if}
</div>

<ConfirmationModal
	open={historyConfirmOpen}
	title={historyConfirmTitle}
	message={historyConfirmMessage}
	confirmLabel={historyConfirmLabel}
	confirmVariant="error"
	loading={historyConfirmLoading}
	onConfirm={handleHistoryConfirm}
	onCancel={closeHistoryConfirm}
/>

<ConfirmationModal
	open={activeConfirmOpen}
	title={activeConfirmTitle}
	message={activeConfirmMessage}
	confirmLabel={activeConfirmLabel}
	confirmVariant={activeConfirmVariant}
	loading={activeBulkLoading}
	onConfirm={handleActiveConfirm}
	onCancel={closeActiveConfirm}
/>

<!-- Detail Modal -->

{#if selectedActivity}
	<ActivityDetailModal
		open={isModalOpen}
		activity={selectedActivity}
		onClose={closeModal}
		onPause={handlePause}
		onResume={handleResume}
		onRemove={handleRemove}
		onRetry={handleRetry}
	/>
{/if}
