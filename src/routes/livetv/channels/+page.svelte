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
		WifiOff
	} from 'lucide-svelte';
	import {
		ChannelLineupTable,
		ChannelEditModal,
		ChannelCategoryManagerModal,
		ChannelBulkActionBar,
		ChannelBrowserModal,
		EpgSourcePickerModal,
		ChannelScheduleModal
	} from '$lib/components/livetv';
	import type {
		ChannelLineupItemWithDetails,
		ChannelCategory,
		UpdateChannelRequest,
		EpgProgram,
		EpgProgramWithProgress
	} from '$lib/types/livetv';
	import { onMount } from 'svelte';
	import { createSSE } from '$lib/sse';
	import { mobileSSEStatus } from '$lib/sse/mobileStatus.svelte';
	import { resolvePath } from '$lib/utils/routing';

	interface NowNextEntry {
		now: EpgProgramWithProgress | null;
		next: EpgProgram | null;
	}

	// Data state
	let lineup = $state<ChannelLineupItemWithDetails[]>([]);
	let categories = $state<ChannelCategory[]>([]);
	let loading = $state(true);
	let refreshing = $state(false);
	let error = $state<string | null>(null);

	// Selection state
	let selectedIds = new SvelteSet<string>();

	// Expanded categories state (all expanded by default)
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

	// Edit modal reference for refreshing backups and setting EPG source
	let editModalRef:
		| { refreshBackups: () => void; setEpgSourceChannelId: (id: string | null) => void }
		| undefined = $state(undefined);

	// EPG source picker modal state
	let epgSourcePickerOpen = $state(false);
	let epgSourcePickerExcludeChannelId = $state<string | undefined>(undefined);

	// Schedule modal state
	let scheduleModalChannel = $state<ChannelLineupItemWithDetails | null>(null);

	// Bulk action state
	let bulkActionLoading = $state(false);
	let bulkAction = $state<'category' | 'remove' | null>(null);

	// EPG state (now/next programs)
	let epgData = new SvelteMap<string, NowNextEntry>();
	let channelSearch = $state('');

	// SSE Connection - internally handles browser/SSR
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const sse = createSSE<Record<string, any>>(resolvePath('/api/livetv/channels/stream'), {
		'livetv:initial': (payload) => {
			lineup = payload.lineup || [];
			categories = payload.categories || [];
			lineupChannelIds.clear();
			for (const item of lineup) {
				lineupChannelIds.add(item.channelId);
			}
			updateEpgData(payload.epgNowNext || {});
			loading = false;
		},
		'lineup:updated': (payload) => {
			lineup = payload.lineup || [];
			lineupChannelIds.clear();
			for (const item of lineup) {
				lineupChannelIds.add(item.channelId);
			}
		},
		'categories:updated': (payload) => {
			categories = payload.categories || [];
		},
		'epg:nowNext': (payload) => {
			updateEpgData(payload.channels || {});
		},
		'channels:syncStarted': (payload) => {
			console.log('Channel sync started:', payload.accountId);
		},
		'channels:syncCompleted': (payload) => {
			console.log('Channel sync completed:', payload.accountId);
		},
		'channels:syncFailed': (payload) => {
			console.error('Channel sync failed:', payload.accountId, payload.error);
		}
	});

	const MOBILE_SSE_SOURCE = 'livetv-channels';

	$effect(() => {
		mobileSSEStatus.publish(MOBILE_SSE_SOURCE, sse.status);
		return () => {
			mobileSSEStatus.clear(MOBILE_SSE_SOURCE);
		};
	});

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
	const _hasSelection = $derived(selectedIds.size > 0);
	const selectedCount = $derived(selectedIds.size);

	// Initialize expanded categories when data loads
	$effect(() => {
		if (categories.length > 0 && expandedCategories.size === 0) {
			for (const cat of categories) {
				expandedCategories.add(cat.id);
			}
			expandedCategories.add(null); // Include uncategorized
		}
	});

	onMount(() => {
		loadData();
		fetchEpgData();

		return () => {
			sse.close();
		};
	});

	function updateEpgData(epgNowNext: Record<string, NowNextEntry>) {
		epgData.clear();
		for (const [channelId, entry] of Object.entries(epgNowNext)) {
			epgData.set(channelId, entry as NowNextEntry);
		}
	}

	async function fetchEpgData() {
		try {
			const res = await fetch('/api/livetv/epg/now');
			if (!res.ok) return;
			const data = await res.json();
			if (data.channels) {
				updateEpgData(data.channels);
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
			lineupChannelIds.clear();
			for (const id of lineupData.lineupChannelIds || []) {
				lineupChannelIds.add(id);
			}
			categories = categoriesData.categories || [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load data';
		} finally {
			loading = false;
		}
	}

	async function refreshData() {
		refreshing = true;
		await loadData();
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
			expandedCategories.delete(categoryId);
		} else {
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

	async function handleEditDelete() {
		if (!editingChannel) return;
		const item = editingChannel;
		closeEditModal();
		await handleRemove(item);
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

	// Remove handler
	async function handleRemove(item: ChannelLineupItemWithDetails) {
		const confirmed = confirm(`Remove "${item.displayName}" from your lineup?`);
		if (!confirmed) return;

		try {
			const response = await fetch(`/api/livetv/lineup/${item.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error('Failed to remove channel');
			}

			// Remove from selection if selected
			if (selectedIds.has(item.id)) {
				selectedIds.delete(item.id);
			}

			await loadData();
		} catch (e) {
			console.error('Failed to remove channel:', e);
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
				throw new Error('Failed to update categories');
			}

			await loadData();
			clearSelection();
		} catch (e) {
			console.error('Failed to bulk update categories:', e);
		} finally {
			bulkActionLoading = false;
			bulkAction = null;
		}
	}

	async function handleBulkRemove() {
		if (selectedIds.size === 0) return;

		const confirmed = confirm(`Remove ${selectedIds.size} channel(s) from your lineup?`);
		if (!confirmed) return;

		bulkActionLoading = true;
		bulkAction = 'remove';

		try {
			const response = await fetch('/api/livetv/lineup/remove', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					itemIds: Array.from(selectedIds)
				})
			});

			if (!response.ok) {
				throw new Error('Failed to remove channels');
			}

			await loadData();
			clearSelection();
		} catch (e) {
			console.error('Failed to bulk remove:', e);
		} finally {
			bulkActionLoading = false;
			bulkAction = null;
		}
	}

	// Backup browser handlers
	function openBackupBrowser(lineupItemId: string, excludeChannelId: string) {
		browserMode = 'select-backup';
		backupLineupItemId = lineupItemId;
		backupExcludeChannelId = excludeChannelId;
		browserModalOpen = true;
	}

	function handleBackupSelected(_accountId: string, _channelId: string) {
		// Refresh the edit modal's backups list
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
		return `${getBaseUrl()}/api/livetv/playlist.m3u`;
	}

	function getEpgUrl(): string {
		return `${getBaseUrl()}/api/livetv/epg.xml`;
	}

	async function copyToClipboard(type: 'm3u' | 'epg') {
		const url = type === 'm3u' ? getM3uUrl() : getEpgUrl();
		try {
			await navigator.clipboard.writeText(url);
			copiedField = type;
			setTimeout(() => {
				copiedField = null;
			}, 2000);
		} catch (e) {
			console.error('Failed to copy:', e);
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
				{/if}
			</button>
			<button class="btn btn-ghost btn-sm" onclick={openCategoryModal}>
				<FolderOpen class="h-4 w-4" />
				Categories
			</button>
			<!-- Export Dropdown -->
			<div class="dropdown dropdown-end">
				<button
					class="btn btn-ghost btn-sm"
					onclick={toggleExportDropdown}
					disabled={lineup.length === 0}
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
						class="dropdown-content menu pointer-events-auto left-1/2 z-50 mt-1
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
				class="input-bordered input input-sm w-full pl-9"
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

<!-- Bulk Action Bar -->
<ChannelBulkActionBar
	{selectedCount}
	{categories}
	loading={bulkActionLoading}
	currentAction={bulkAction}
	onSetCategory={handleBulkSetCategory}
	onRemove={handleBulkRemove}
	onClear={clearSelection}
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
