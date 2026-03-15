<script lang="ts">
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import {
		RefreshCw,
		Loader2,
		FolderOpen,
		Tv,
		Search,
		Download,
		Copy,
		Check,
		Wifi,
		WifiOff,
		Image
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	// Receive data from server load function (includes streaming API key)
	let { data }: { data: PageData } = $props();
	import {
		ChannelLineupTable,
		ChannelEditModal,
		ChannelCategoryManagerModal,
		ChannelBulkActionBar,
		ChannelBulkCleanNamesModal,
		ChannelRemoveModal,
		ChannelBrowserModal,
		EpgSourcePickerModal,
		ChannelScheduleModal
	} from '$lib/components/livetv';
	import type {
		BulkApplyCleanNamesResult,
		ChannelLineupItemWithDetails,
		ChannelCategory,
		BulkApplyCleanNamesRequest,
		ChannelCleanNamePreview,
		UpdateChannelRequest
	} from '$lib/types/livetv';
	import { onMount } from 'svelte';
	import { createSSE } from '$lib/sse';
	import { resolvePath } from '$lib/utils/routing';
	import { copyToClipboard as copyTextToClipboard } from '$lib/utils/clipboard';
	import { toasts } from '$lib/stores/toast.svelte';
	import type {
		ChannelStreamEvents,
		NowNextEntry
	} from '$lib/types/sse/events/livetv-channel-events.js';
	import type { LogoDownloadProgress } from '$lib/server/logos/LogoDownloadService';
	import { normalizeLiveTvChannelName } from '$lib/livetv/channel-name-normalizer';

	type LiveTvPageData = PageData & {
		lineup?: ChannelLineupItemWithDetails[];
		categories?: ChannelCategory[];
		lineupChannelIds?: string[];
		epgNowNext?: Record<string, NowNextEntry>;
	};
	function getLiveTvPageData(): LiveTvPageData {
		return data as LiveTvPageData;
	}

	// Data state
	let lineup = $state<ChannelLineupItemWithDetails[]>(
		$state.snapshot(getLiveTvPageData().lineup ?? [])
	);
	let categories = $state<ChannelCategory[]>($state.snapshot(getLiveTvPageData().categories ?? []));
	let loading = $state(false);
	let refreshing = $state(false);
	let error = $state<string | null>(null);

	// Selection state
	let selectedIds = new SvelteSet<string>();

	// Expanded categories state (accordion behavior, all collapsed by default)
	let expandedCategories = new SvelteSet<string | null>();

	// Drag state
	let draggedItemId = $state<string | null>(null);
	let dragOverCategoryId = $state<string | null>(null);
	let isDragging = $state(false);

	// Modal state
	let editModalOpen = $state(false);
	let editingChannel = $state<ChannelLineupItemWithDetails | null>(null);
	let editModalSaving = $state(false);
	let editModalError = $state<string | null>(null);
	let editModalRef:
		| { refreshBackups: () => void; setEpgSourceChannelId: (id: string | null) => void }
		| undefined = $state(undefined);

	let categoryModalOpen = $state(false);

	// Browser modal state
	let browserModalOpen = $state(false);
	let lineupChannelIds = new SvelteSet<string>();

	// Backup browser state
	let browserMode = $state<'add-to-lineup' | 'select-backup'>('add-to-lineup');
	let backupLineupItemId = $state<string | undefined>(undefined);
	let backupExcludeChannelId = $state<string | undefined>(undefined);

	// Export state
	let exportDropdownOpen = $state(false);
	let copiedField = $state<'m3u' | 'epg' | null>(null);

	// EPG source picker modal state
	let epgSourcePickerOpen = $state(false);
	let epgSourcePickerExcludeChannelId = $state<string | undefined>(undefined);

	// Schedule modal state
	let scheduleModalChannel = $state<ChannelLineupItemWithDetails | null>(null);

	// Bulk action state
	let bulkActionLoading = $state(false);
	let bulkAction = $state<'category' | 'clean-names' | 'remove' | null>(null);
	let removeModalOpen = $state(false);
	let removeModalMode = $state<'single' | 'bulk' | null>(null);
	let removeModalChannel = $state<ChannelLineupItemWithDetails | null>(null);
	let bulkCleanNamesModalOpen = $state(false);

	// EPG state (now/next programs)
	let epgData = new SvelteMap<string, NowNextEntry>();
	let channelSearch = $state('');

	// Logo library state
	let logoDownloaded = $state(false);
	let logoCount = $state(0);
	let loadingLogos = $state(false);
	let downloadingLogos = $state(false);
	let logoDownloadProgress = $state<LogoDownloadProgress | null>(null);
	let logoDownloadEventSource: ReturnType<typeof createSSE> | null = $state(null);

	function syncLineupChannelIds(ids: string[]) {
		lineupChannelIds.clear();
		for (const id of ids) {
			lineupChannelIds.add(id);
		}
	}

	function applyLiveTvSnapshot(payload: {
		lineup: ChannelLineupItemWithDetails[];
		categories: ChannelCategory[];
		lineupChannelIds: string[];
		epgNowNext: Record<string, NowNextEntry>;
	}) {
		lineup = payload.lineup || [];
		categories = payload.categories || [];
		syncLineupChannelIds(payload.lineupChannelIds || []);
		updateEpgData(payload.epgNowNext || {});
		loading = false;
	}

	$effect(() => {
		const pageData = data as LiveTvPageData;
		applyLiveTvSnapshot({
			lineup: pageData.lineup ?? [],
			categories: pageData.categories ?? [],
			lineupChannelIds: pageData.lineupChannelIds ?? [],
			epgNowNext: pageData.epgNowNext ?? {}
		});
	});

	onMount(() => {
		loadLogoStatus();
	});

	async function loadLogoStatus() {
		loadingLogos = true;
		try {
			const res = await fetch('/api/logos/status');
			if (res.ok) {
				const data = await res.json();
				if (data.success) {
					logoDownloaded = data.data.downloaded;
					logoCount = data.data.count;
				}
			}
		} catch {
			// Silently fail - logos are optional
		} finally {
			loadingLogos = false;
		}
	}

	async function downloadLogos() {
		// Prevent multiple simultaneous downloads
		if (downloadingLogos) return;

		downloadingLogos = true;
		logoDownloadProgress = null;

		try {
			const res = await fetch('/api/logos/download', { method: 'POST' });
			const data = await res.json();

			if (data.success) {
				if (data.data?.downloaded) {
					// Already downloaded
					logoDownloaded = true;
					logoCount = data.data.count;
					downloadingLogos = false;
					toasts.success('Logos already available');
				} else {
					// Start SSE connection
					connectToLogoDownloadStream();
				}
			} else {
				console.error('Server error:', data.error);
				downloadingLogos = false;
			}
		} catch (err) {
			console.error('Download error:', err);
			downloadingLogos = false;
		}
	}

	function connectToLogoDownloadStream() {
		// Close any existing connection
		if (logoDownloadEventSource) {
			logoDownloadEventSource.close();
		}

		logoDownloadEventSource = createSSE<{
			'logos:status': LogoDownloadProgress;
			'logos:started': LogoDownloadProgress;
			'logos:progress': LogoDownloadProgress;
			'logos:completed': LogoDownloadProgress;
			'logos:error': LogoDownloadProgress;
		}>('/api/logos/download/stream', {
			'logos:status': (payload) => {
				logoDownloadProgress = payload;
				if (payload.status === 'completed') {
					logoDownloaded = true;
					downloadingLogos = false;
					logoCount = payload.downloaded;
					logoDownloadEventSource?.close();
					logoDownloadEventSource = null;
					void loadLogoStatus();
				}
			},
			'logos:started': (payload) => {
				logoDownloadProgress = payload;
			},
			'logos:progress': (payload) => {
				logoDownloadProgress = payload;
			},
			'logos:completed': (payload) => {
				logoDownloadProgress = payload;
				logoDownloaded = true;
				downloadingLogos = false;
				logoCount = payload.downloaded;
				logoDownloadEventSource?.close();
				logoDownloadEventSource = null;
				toasts.success(`Downloaded ${payload.downloaded} logos`);
				void loadLogoStatus();
			},
			'logos:error': (payload) => {
				logoDownloadProgress = payload;
				downloadingLogos = false;
				logoDownloadEventSource?.close();
				logoDownloadEventSource = null;
				toasts.error(payload.error || 'Download failed');
			},
			error: () => {
				if (logoDownloadEventSource) {
					downloadingLogos = false;
					logoDownloadEventSource.close();
					logoDownloadEventSource = null;
				}
			}
		});
	}

	// SSE Connection - internally handles browser/SSR
	const sse = createSSE<ChannelStreamEvents>(resolvePath('/api/livetv/channels/stream'), {
		'livetv:sync': (payload) => {
			applyLiveTvSnapshot(payload);
		},
		'lineup:updated': (payload) => {
			lineup = payload.lineup || [];
			syncLineupChannelIds(payload.lineupChannelIds || []);
		},
		'categories:updated': (payload) => {
			categories = payload.categories || [];
		},
		'epg:nowNext': (payload) => {
			updateEpgData(payload.channels || {});
		},
		'channels:syncStarted': () => {},
		'channels:syncCompleted': () => {},
		'channels:syncFailed': () => {}
	});

	async function fetchEpgData() {
		try {
			const res = await fetch('/api/livetv/epg/now');
			if (!res.ok) return;
			const response = await res.json();
			if (response.channels) {
				updateEpgData(response.channels);
			}
		} catch {
			// Silent failure - EPG is not critical
		}
	}

	async function loadData() {
		loading = true;
		error = null;

		try {
			const [lineupRes, categoriesRes] = await Promise.all([
				fetch('/api/livetv/lineup'),
				fetch('/api/livetv/channel-categories')
			]);

			if (!lineupRes.ok) {
				throw new Error('Failed to load lineup');
			}
			if (!categoriesRes.ok) {
				throw new Error('Failed to load categories');
			}

			const lineupData = await lineupRes.json();
			const categoriesData = await categoriesRes.json();

			lineup = lineupData.lineup || [];
			syncLineupChannelIds(lineupData.lineupChannelIds || []);
			categories = categoriesData.categories || [];
			await fetchEpgData();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load data';
		} finally {
			loading = false;
		}
	}

	const normalizedSearch = $derived(channelSearch.trim().toLowerCase());
	const filteredLineup = $derived(
		normalizedSearch
			? lineup.filter((item) => {
					const name = item.displayName.toLowerCase();
					const channelName = item.channel.name.toLowerCase();
					return name.includes(normalizedSearch) || channelName.includes(normalizedSearch);
				})
			: lineup
	);

	// Derived: Group channels by category
	const groupedChannels = $derived.by(() => {
		const groups = new SvelteMap<string | null, ChannelLineupItemWithDetails[]>();

		// Initialize with all categories (even empty ones)
		for (const cat of categories) {
			groups.set(cat.id, []);
		}
		groups.set(null, []); // Uncategorized

		// Populate groups
		for (const item of filteredLineup) {
			const catId = item.categoryId;
			const existing = groups.get(catId);
			if (existing) {
				existing.push(item);
			} else {
				// Category doesn't exist, put in uncategorized
				const uncategorized = groups.get(null);
				if (uncategorized) {
					uncategorized.push(item);
				}
			}
		}

		return groups;
	});

	// Derived: Ordered categories for display
	const orderedCategories = $derived([...categories].sort((a, b) => a.position - b.position));

	// Derived: Selection helpers
	const selectedCount = $derived(selectedIds.size);
	const selectedCategoryIds = $derived.by(() => {
		const ids = new SvelteSet<string | null>();
		for (const item of lineup) {
			if (selectedIds.has(item.id)) {
				ids.add(item.categoryId ?? null);
			}
		}
		return ids;
	});
	const removeModalCount = $derived(
		removeModalMode === 'single' ? (removeModalChannel ? 1 : 0) : selectedIds.size
	);
	const selectedCleanNameSummary = $derived.by(() => {
		const previews: ChannelCleanNamePreview[] = [];
		let skippedExistingCustom = 0;
		let skippedUnchanged = 0;

		for (const item of lineup) {
			if (!selectedIds.has(item.id)) {
				continue;
			}

			if (item.customName?.trim()) {
				skippedExistingCustom++;
				continue;
			}

			const currentName = item.channel.name.trim();
			const cleanedName = normalizeLiveTvChannelName(currentName, item.providerType).trim();

			if (!cleanedName || cleanedName === currentName) {
				skippedUnchanged++;
				continue;
			}

			previews.push({
				itemId: item.id,
				channelNumber: item.channelNumber ?? item.position,
				accountName: item.accountName,
				providerType: item.providerType,
				currentName,
				cleanedName
			});
		}

		return {
			previews,
			skippedExistingCustom,
			skippedUnchanged
		};
	});
	const selectedCleanNameCount = $derived(selectedCleanNameSummary.previews.length);
	const removeModalChannelName = $derived(
		removeModalMode === 'single' ? (removeModalChannel?.displayName ?? null) : null
	);

	function buildCleanNameToast(result: BulkApplyCleanNamesResult): string {
		const parts: string[] = [];

		parts.push(
			`Applied cleaned names to ${result.updated} channel${result.updated === 1 ? '' : 's'}`
		);

		if (result.skippedExistingCustom > 0) {
			parts.push(
				`${result.skippedExistingCustom} already had custom name${result.skippedExistingCustom === 1 ? '' : 's'}`
			);
		}

		if (result.skippedUnchanged > 0) {
			parts.push(
				`${result.skippedUnchanged} already looked clean${result.skippedUnchanged === 1 ? '' : 's'}`
			);
		}

		return parts.join(' - ');
	}

	function openBulkCleanNamesModal() {
		if (selectedIds.size === 0) return;

		bulkCleanNamesModalOpen = true;
	}

	function closeBulkCleanNamesModal(force = false) {
		if (!force && bulkActionLoading && bulkAction === 'clean-names') return;
		bulkCleanNamesModalOpen = false;
	}

	function updateEpgData(epgNowNext: Record<string, NowNextEntry>) {
		epgData.clear();
		for (const [channelId, entry] of Object.entries(epgNowNext)) {
			epgData.set(channelId, entry as NowNextEntry);
		}
	}

	async function refreshData() {
		refreshing = true;
		error = null;
		try {
			await loadData();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to refresh Live TV data';
		}
		refreshing = false;
	}

	// Selection handlers
	function handleSelect(id: string, selected: boolean) {
		if (selected) {
			selectedIds.add(id);
		} else {
			selectedIds.delete(id);
		}
	}

	function handleSelectAll(categoryId: string | null, selected: boolean) {
		const channelsInCategory = groupedChannels.get(categoryId) || [];

		for (const channel of channelsInCategory) {
			if (selected) {
				selectedIds.add(channel.id);
			} else {
				selectedIds.delete(channel.id);
			}
		}
	}

	function clearSelection() {
		selectedIds.clear();
	}

	// Expand/collapse handlers
	function handleToggleExpand(categoryId: string | null) {
		if (expandedCategories.has(categoryId)) {
			// Close current category when clicking it again
			expandedCategories.clear();
		} else {
			// Accordion behavior: only one open at a time
			expandedCategories.clear();
			expandedCategories.add(categoryId);
		}
	}

	// Drag handlers
	function handleDragStart(e: DragEvent, itemId: string) {
		draggedItemId = itemId;
		isDragging = true;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', itemId);
		}
	}

	function handleDragOverCategory(e: DragEvent, categoryId: string | null) {
		if (!isDragging) return;
		e.preventDefault();
		dragOverCategoryId = categoryId;
	}

	function handleDragLeaveCategory() {
		dragOverCategoryId = null;
	}

	async function handleDropOnCategory(e: DragEvent, categoryId: string | null) {
		e.preventDefault();
		if (!draggedItemId) return;

		const item = lineup.find((i) => i.id === draggedItemId);
		if (item && item.categoryId !== categoryId) {
			// Update category
			try {
				const response = await fetch(`/api/livetv/lineup/${draggedItemId}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ categoryId })
				});

				if (!response.ok) {
					throw new Error('Failed to update channel category');
				}

				await loadData();
			} catch (e) {
				console.error('Failed to update category:', e);
			}
		}

		resetDragState();
	}

	async function handleReorder(categoryId: string | null, itemIds: string[]) {
		// Get all items in order, with this category's items replaced
		const allItemIds: string[] = [];

		for (const cat of orderedCategories) {
			const items = groupedChannels.get(cat.id) || [];
			if (cat.id === categoryId) {
				allItemIds.push(...itemIds);
			} else {
				allItemIds.push(...items.map((i) => i.id));
			}
		}

		// Add uncategorized
		const uncategorized = groupedChannels.get(null) || [];
		if (categoryId === null) {
			allItemIds.push(...itemIds);
		} else {
			allItemIds.push(...uncategorized.map((i) => i.id));
		}

		try {
			const response = await fetch('/api/livetv/lineup/reorder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ itemIds: allItemIds })
			});

			if (!response.ok) {
				throw new Error('Failed to reorder channels');
			}

			await loadData();
		} catch (e) {
			console.error('Failed to reorder:', e);
		}
	}

	function handleDragEnd() {
		resetDragState();
	}

	function resetDragState() {
		draggedItemId = null;
		dragOverCategoryId = null;
		isDragging = false;
	}

	// Edit modal handlers
	function handleEdit(item: ChannelLineupItemWithDetails) {
		editingChannel = item;
		editModalError = null;
		editModalOpen = true;
	}

	function closeEditModal() {
		editModalOpen = false;
		editingChannel = null;
		editModalError = null;
	}

	// Schedule modal handler
	function handleShowSchedule(channel: ChannelLineupItemWithDetails) {
		scheduleModalChannel = channel;
	}

	function handleEditDelete() {
		if (!editingChannel) return;
		const item = editingChannel;
		closeEditModal();
		openSingleRemoveModal(item);
	}

	async function handleEditSave(id: string, data: UpdateChannelRequest) {
		editModalSaving = true;
		editModalError = null;

		try {
			const response = await fetch(`/api/livetv/lineup/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to save channel');
			}

			await loadData();
			closeEditModal();
		} catch (e) {
			editModalError = e instanceof Error ? e.message : 'Failed to save channel';
		} finally {
			editModalSaving = false;
		}
	}

	function openSingleRemoveModal(item: ChannelLineupItemWithDetails) {
		removeModalMode = 'single';
		removeModalChannel = item;
		removeModalOpen = true;
	}

	function openBulkRemoveModal() {
		if (selectedIds.size === 0) return;
		removeModalMode = 'bulk';
		removeModalChannel = null;
		removeModalOpen = true;
	}

	function closeRemoveModal(force = false) {
		if (!force && bulkActionLoading && bulkAction === 'remove') return;
		removeModalOpen = false;
		removeModalMode = null;
		removeModalChannel = null;
	}

	// Remove handler (single row action)
	function handleRemove(item: ChannelLineupItemWithDetails) {
		openSingleRemoveModal(item);
	}

	async function confirmRemove() {
		if (!removeModalMode) return;
		const removeMode = removeModalMode;
		const singleChannel = removeModalChannel;
		const bulkItemIds = removeMode === 'bulk' ? Array.from(selectedIds) : [];
		if (removeMode === 'bulk' && bulkItemIds.length === 0) {
			closeRemoveModal(true);
			return;
		}

		bulkActionLoading = true;
		bulkAction = 'remove';
		closeRemoveModal(true);

		try {
			if (removeMode === 'single' && singleChannel) {
				const response = await fetch(`/api/livetv/lineup/${singleChannel.id}`, {
					method: 'DELETE'
				});

				if (!response.ok) {
					throw new Error('Failed to remove channel');
				}

				// Remove from selection if selected
				if (selectedIds.has(singleChannel.id)) {
					selectedIds.delete(singleChannel.id);
				}
			} else {
				const response = await fetch('/api/livetv/lineup/remove', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						itemIds: bulkItemIds
					})
				});

				if (!response.ok) {
					throw new Error('Failed to remove channels');
				}

				clearSelection();
			}

			await loadData();
		} catch (e) {
			console.error('Failed to remove channel(s):', e);
		} finally {
			bulkActionLoading = false;
			bulkAction = null;
		}
	}

	// Inline edit handler
	async function handleInlineEdit(
		id: string,
		field: 'channelNumber' | 'customName',
		value: number | string | null
	): Promise<boolean> {
		try {
			const data: Partial<UpdateChannelRequest> = { [field]: value };
			const response = await fetch(`/api/livetv/lineup/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!response.ok) {
				console.error('Inline edit failed');
				return false;
			}

			await loadData();
			return true;
		} catch (e) {
			console.error('Inline edit error:', e);
			return false;
		}
	}

	// Category modal handlers
	function openCategoryModal() {
		categoryModalOpen = true;
	}

	function closeCategoryModal() {
		categoryModalOpen = false;
	}

	async function handleCategoryChange() {
		await loadData();
	}

	// Bulk action handlers
	async function handleBulkSetCategory(categoryId: string | null) {
		if (selectedIds.size === 0) return;
		const selectedCountAtAction = selectedIds.size;

		bulkActionLoading = true;
		bulkAction = 'category';

		try {
			const response = await fetch('/api/livetv/lineup/bulk-category', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					itemIds: Array.from(selectedIds),
					categoryId
				})
			});

			if (!response.ok) {
				const result = await response.json().catch(() => null);
				throw new Error(result?.error || 'Failed to update categories');
			}

			await loadData();
			clearSelection();
			toasts.success(
				`Updated category for ${selectedCountAtAction} channel${selectedCountAtAction === 1 ? '' : 's'}`
			);
		} catch (e) {
			console.error('Failed to bulk update categories:', e);
			toasts.error(e instanceof Error ? e.message : 'Failed to update categories');
		} finally {
			bulkActionLoading = false;
			bulkAction = null;
		}
	}

	async function handleBulkApplyCleanNames() {
		if (selectedIds.size === 0) return;

		bulkActionLoading = true;
		bulkAction = 'clean-names';

		try {
			const payload: BulkApplyCleanNamesRequest = {
				itemIds: Array.from(selectedIds)
			};

			const response = await fetch('/api/livetv/lineup/bulk-clean-names', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const result = (await response.json().catch(() => null)) as BulkApplyCleanNamesResult | null;
			if (!response.ok) {
				throw new Error(
					(result as { error?: string } | null)?.error || 'Failed to apply cleaned names'
				);
			}

			await loadData();
			clearSelection();
			closeBulkCleanNamesModal(true);

			if (result && result.updated > 0) {
				toasts.success(buildCleanNameToast(result));
			} else {
				toasts.success('No cleaned names were applied');
			}
		} catch (e) {
			console.error('Failed to bulk apply cleaned names:', e);
			toasts.error(e instanceof Error ? e.message : 'Failed to apply cleaned names');
		} finally {
			bulkActionLoading = false;
			bulkAction = null;
		}
	}

	function handleBulkRemove() {
		openBulkRemoveModal();
	}

	// Backup browser handlers
	function openBackupBrowser(lineupItemId: string, excludeChannelId: string) {
		browserMode = 'select-backup';
		backupLineupItemId = lineupItemId;
		backupExcludeChannelId = excludeChannelId;
		browserModalOpen = true;
	}

	function handleBackupSelected(_accountId: string, _channelId: string) {
		editModalRef?.refreshBackups();
	}

	function closeBrowserModal() {
		browserModalOpen = false;
		// Reset to default mode
		browserMode = 'add-to-lineup';
		backupLineupItemId = undefined;
		backupExcludeChannelId = undefined;
	}

	function openChannelBrowser() {
		browserMode = 'add-to-lineup';
		backupLineupItemId = undefined;
		backupExcludeChannelId = undefined;
		browserModalOpen = true;
	}

	// EPG source picker handlers
	function openEpgSourcePicker(channelId: string) {
		epgSourcePickerExcludeChannelId = channelId;
		epgSourcePickerOpen = true;
	}

	function closeEpgSourcePicker() {
		epgSourcePickerOpen = false;
		epgSourcePickerExcludeChannelId = undefined;
	}

	function handleEpgSourceSelected(channelId: string, _channel: unknown) {
		editModalRef?.setEpgSourceChannelId(channelId);
		closeEpgSourcePicker();
	}

	// Export functions
	function getBaseUrl(): string {
		return window.location.origin;
	}

	function getM3uUrl(): string {
		const baseUrl = `${getBaseUrl()}/api/livetv/playlist.m3u`;
		// Include streaming API key if available for authentication
		if (data.streamingApiKey) {
			return `${baseUrl}?api_key=${encodeURIComponent(data.streamingApiKey)}`;
		}
		return baseUrl;
	}

	function getEpgUrl(): string {
		const baseUrl = `${getBaseUrl()}/api/livetv/epg.xml`;
		// Include streaming API key if available for authentication
		if (data.streamingApiKey) {
			return `${baseUrl}?api_key=${encodeURIComponent(data.streamingApiKey)}`;
		}
		return baseUrl;
	}

	async function copyToClipboard(type: 'm3u' | 'epg') {
		const url = type === 'm3u' ? getM3uUrl() : getEpgUrl();
		const copied = await copyTextToClipboard(url);
		if (copied) {
			copiedField = type;
			setTimeout(() => {
				copiedField = null;
			}, 2000);
		} else {
			toasts.error('Failed to copy URL');
		}
	}

	function toggleExportDropdown() {
		exportDropdownOpen = !exportDropdownOpen;
	}

	function closeExportDropdown() {
		exportDropdownOpen = false;
	}
</script>

<svelte:head>
	<title>Channels - Live TV - Cinephage</title>
	<meta
		name="description"
		content="Manage your Live TV channel lineup, categories, EPG mappings, and export feeds."
	/>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold">Channels</h1>
			<p class="mt-1 text-base-content/60">Organize your channel lineup</p>
		</div>
		<div class="flex flex-wrap items-center gap-2 sm:flex-nowrap">
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
			<button
				class="btn btn-ghost btn-sm"
				onclick={refreshData}
				disabled={loading || refreshing}
				title="Refresh"
			>
				{#if refreshing}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<RefreshCw class="h-4 w-4" />
					Refresh
				{/if}
			</button>
			<button class="btn btn-ghost btn-sm" onclick={openCategoryModal}>
				<FolderOpen class="h-4 w-4" />
				Categories
			</button>
			{#if logoDownloaded}
				<button class="btn gap-1 btn-ghost btn-sm" disabled={loadingLogos}>
					{#if loadingLogos}
						<Loader2 class="h-4 w-4 animate-spin" />
					{:else}
						<Image class="h-4 w-4" />
					{/if}
					Logos
					{#if logoCount > 0}
						<span class="badge badge-ghost badge-xs">{logoCount}</span>
					{/if}
				</button>
			{:else if downloadingLogos && logoDownloadProgress}
				<!-- Progress Bar -->
				<div class="flex w-48 items-center gap-2">
					<div class="h-2 flex-1 rounded-full bg-base-300">
						<div
							class="h-full rounded-full bg-primary transition-all duration-300"
							style="width: {logoDownloadProgress.total > 0
								? (logoDownloadProgress.downloaded / logoDownloadProgress.total) * 100
								: 0}%"
						></div>
					</div>
					<span class="text-xs text-base-content/70">
						{logoDownloadProgress.downloaded}/{logoDownloadProgress.total}
					</span>
				</div>
			{:else}
				<button
					class="btn gap-1 btn-sm btn-primary"
					onclick={downloadLogos}
					disabled={downloadingLogos}
					title="Download channel logos"
				>
					{#if downloadingLogos}
						<Loader2 class="h-4 w-4 animate-spin" />
						Starting...
					{:else}
						<Download class="h-4 w-4" />
						Get Logos
					{/if}
				</button>
			{/if}
			<!-- Export Dropdown -->
			<div class="relative">
				<button
					class="btn btn-ghost btn-sm"
					onclick={toggleExportDropdown}
					disabled={lineup.length === 0}
					aria-expanded={exportDropdownOpen}
					aria-haspopup="menu"
				>
					<Download class="h-4 w-4" />
					Export
				</button>
				{#if exportDropdownOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="fixed inset-0 z-40"
						onclick={closeExportDropdown}
						onkeydown={(e) => e.key === 'Escape' && closeExportDropdown()}
					></div>
					<div
						class="pointer-events-auto absolute left-1/2 z-50 mt-1
							w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 rounded-box bg-base-200 p-4
							shadow-lg sm:right-0 sm:left-auto sm:w-80 sm:max-w-none
							sm:translate-x-0"
					>
						<div class="space-y-4">
							<div class="text-sm font-medium">Playlist URLs for Plex/Jellyfin/Emby</div>

							<!-- M3U URL -->
							<div class="space-y-1">
								<div class="text-xs font-medium text-base-content/70">M3U Playlist</div>
								<div class="flex gap-2">
									<input
										type="text"
										readonly
										value={getM3uUrl()}
										class="input-bordered input input-sm flex-1 font-mono text-xs"
									/>
									<button
										class="btn btn-ghost btn-sm"
										onclick={(e) => {
											e.stopPropagation();
											copyToClipboard('m3u');
										}}
										title="Copy M3U URL"
									>
										{#if copiedField === 'm3u'}
											<Check class="h-4 w-4 text-success" />
										{:else}
											<Copy class="h-4 w-4" />
										{/if}
									</button>
								</div>
							</div>

							<!-- EPG URL -->
							<div class="space-y-1">
								<div class="text-xs font-medium text-base-content/70">XMLTV EPG Guide</div>
								<div class="flex gap-2">
									<input
										type="text"
										readonly
										value={getEpgUrl()}
										class="input-bordered input input-sm flex-1 font-mono text-xs"
									/>
									<button
										class="btn btn-ghost btn-sm"
										onclick={(e) => {
											e.stopPropagation();
											copyToClipboard('epg');
										}}
										title="Copy EPG URL"
									>
										{#if copiedField === 'epg'}
											<Check class="h-4 w-4 text-success" />
										{:else}
											<Copy class="h-4 w-4" />
										{/if}
									</button>
								</div>
							</div>

							<div class="text-xs text-base-content/50">
								Add these URLs to your media server's Live TV/DVR settings.
							</div>
						</div>
					</div>
				{/if}
			</div>
			<button class="btn w-full btn-sm btn-primary sm:w-auto" onclick={openChannelBrowser}>
				<Search class="h-4 w-4" />
				Browse Channels
			</button>
		</div>
	</div>

	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<div class="relative w-full sm:max-w-sm">
			<Search
				class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-base-content/40"
			/>
			<input
				type="text"
				placeholder="Search channels..."
				class="input input-sm w-full rounded-full border-base-content/20 bg-base-200/60 pr-4 pl-9 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none"
				bind:value={channelSearch}
			/>
		</div>
		{#if channelSearch}
			<div class="text-sm text-base-content/60">
				Showing {filteredLineup.length} of {lineup.length}
			</div>
		{/if}
	</div>

	<!-- Content -->
	{#if loading}
		<div class="flex items-center justify-center py-12">
			<Loader2 class="h-8 w-8 animate-spin text-primary" />
		</div>
	{:else if error}
		<div class="alert alert-error">
			<span>{error}</span>
			<button class="btn btn-ghost btn-sm" onclick={loadData}>Retry</button>
		</div>
	{:else if lineup.length === 0}
		<div class="flex flex-col items-center justify-center py-12 text-base-content/50">
			<Tv class="mb-4 h-12 w-12" />
			<p class="text-lg font-medium">No channels in your lineup</p>
			<p class="text-sm">Add channels from your accounts to build your lineup</p>
			<a href="/livetv/accounts" class="btn mt-4 btn-primary">Manage Accounts</a>
		</div>
	{:else}
		<ChannelLineupTable
			{lineup}
			{categories}
			{groupedChannels}
			{orderedCategories}
			{selectedIds}
			{expandedCategories}
			{draggedItemId}
			{dragOverCategoryId}
			{isDragging}
			{epgData}
			onSelect={handleSelect}
			onSelectAll={handleSelectAll}
			onToggleExpand={handleToggleExpand}
			onDragStart={handleDragStart}
			onDragOverCategory={handleDragOverCategory}
			onDragLeaveCategory={handleDragLeaveCategory}
			onDropOnCategory={handleDropOnCategory}
			onReorder={handleReorder}
			onDragEnd={handleDragEnd}
			onEdit={handleEdit}
			onRemove={handleRemove}
			onInlineEdit={handleInlineEdit}
			onShowSchedule={handleShowSchedule}
		/>
	{/if}
</div>

<!-- Edit Modal -->
<ChannelEditModal
	bind:this={editModalRef}
	open={editModalOpen}
	channel={editingChannel}
	{categories}
	saving={editModalSaving}
	error={editModalError}
	onClose={closeEditModal}
	onSave={handleEditSave}
	onDelete={handleEditDelete}
	onOpenBackupBrowser={openBackupBrowser}
	onOpenEpgSourcePicker={openEpgSourcePicker}
/>

<!-- Category Manager Modal -->
<ChannelCategoryManagerModal
	open={categoryModalOpen}
	{categories}
	{groupedChannels}
	onClose={closeCategoryModal}
	onChange={handleCategoryChange}
/>

<!-- Remove Modal -->
<ChannelRemoveModal
	open={removeModalOpen}
	loading={bulkActionLoading && bulkAction === 'remove'}
	selectedCount={removeModalCount}
	channelName={removeModalChannelName}
	onConfirm={confirmRemove}
	onCancel={closeRemoveModal}
/>

<!-- Bulk Action Bar -->
<ChannelBulkActionBar
	{selectedCount}
	{categories}
	excludedCategoryIds={selectedCategoryIds}
	cleanNameCount={selectedCleanNameCount}
	loading={bulkActionLoading}
	currentAction={bulkAction}
	onSetCategory={handleBulkSetCategory}
	onApplyCleanNames={openBulkCleanNamesModal}
	onRemove={handleBulkRemove}
	onClear={clearSelection}
/>

<ChannelBulkCleanNamesModal
	open={bulkCleanNamesModalOpen}
	loading={bulkActionLoading && bulkAction === 'clean-names'}
	{selectedCount}
	previews={selectedCleanNameSummary.previews}
	skippedExistingCustom={selectedCleanNameSummary.skippedExistingCustom}
	skippedUnchanged={selectedCleanNameSummary.skippedUnchanged}
	onConfirm={handleBulkApplyCleanNames}
	onCancel={closeBulkCleanNamesModal}
/>

<!-- Channel Browser Modal -->
<ChannelBrowserModal
	open={browserModalOpen}
	{lineupChannelIds}
	onClose={closeBrowserModal}
	onChannelsAdded={loadData}
	mode={browserMode}
	lineupItemId={backupLineupItemId}
	excludeChannelId={backupExcludeChannelId}
	onBackupSelected={handleBackupSelected}
/>

<!-- EPG Source Picker Modal -->
<EpgSourcePickerModal
	open={epgSourcePickerOpen}
	excludeChannelId={epgSourcePickerExcludeChannelId}
	onClose={closeEpgSourcePicker}
	onSelect={handleEpgSourceSelected}
/>

<!-- Channel Schedule Modal -->
<ChannelScheduleModal
	open={!!scheduleModalChannel}
	channel={scheduleModalChannel}
	onClose={() => (scheduleModalChannel = null)}
/>
