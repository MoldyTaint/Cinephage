<script lang="ts">
	import { SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';
	import {
		X,
		Loader2,
		Search,
		Tv,
		Radio,
		List,
		Plus,
		Check,
		ChevronLeft,
		ChevronRight
	} from 'lucide-svelte';
	import type { LiveTvProviderType } from '$lib/types/livetv';
	import type { LiveTvAccount, LiveTvCategory, CachedChannel } from '$lib/types/livetv';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';

	type BrowserMode = 'add-to-lineup' | 'select-backup';

	interface Props {
		open: boolean;
		lineupChannelIds: Set<string>;
		onClose: () => void;
		onChannelsAdded: () => void;
		// Backup selection mode props
		mode?: BrowserMode;
		lineupItemId?: string; // The lineup item we're adding backup for
		excludeChannelId?: string; // The primary channel to exclude from selection
		onBackupSelected?: (accountId: string, channelId: string) => void;
	}

	let {
		open,
		lineupChannelIds,
		onClose,
		onChannelsAdded,
		mode = 'add-to-lineup',
		lineupItemId,
		excludeChannelId,
		onBackupSelected
	}: Props = $props();

	// Derived mode checks
	const isBackupMode = $derived(mode === 'select-backup');

	// Data state
	let accounts = $state<LiveTvAccount[]>([]);
	let categories = $state<LiveTvCategory[]>([]);
	let channels = $state<CachedChannel[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// Filter state
	let selectedAccountId = $state('');
	let selectedCategoryId = $state('');
	let searchQuery = $state('');
	let debouncedSearch = $state('');
	let showAdded = $state(false);

	// Pagination state
	let page = $state(1);
	let pageSize = $state(50);
	let total = $state(0);
	let totalPages = $state(0);

	// Selection state
	let selectedIds = new SvelteSet<string>();
	let addingIds = new SvelteSet<string>();
	let bulkAdding = $state(false);
	let addingCategory = $state(false);

	// Local copy of lineup IDs (updated after successful adds)
	let localLineupIds = new SvelteSet<string>();

	// Track modal open state for transition detection
	let wasOpen = $state(false);

	// Debounce timer
	let searchDebounceTimer: ReturnType<typeof setTimeout>;

	// Backup selection state
	let addingBackup = $state(false);

	// Derived
	// In backup mode, only exclude the primary channel; in lineup mode, exclude already-added channels
	const isExcluded = (channelId: string) => {
		if (isBackupMode) {
			return channelId === excludeChannelId;
		}
		if (showAdded) {
			return false;
		}
		return localLineupIds.has(channelId);
	};

	// Legacy alias for lineup mode
	const isInLineup = (channelId: string) => localLineupIds.has(channelId);

	const selectableChannels = $derived(channels.filter((c) => !isExcluded(c.id)));
	const visibleChannels = $derived(showAdded || isBackupMode ? channels : selectableChannels);

	const allVisibleSelected = $derived(
		selectableChannels.length > 0 && selectableChannels.every((c) => selectedIds.has(c.id))
	);

	const someVisibleSelected = $derived(
		selectableChannels.some((c) => selectedIds.has(c.id)) && !allVisibleSelected
	);
	const selectedCategory = $derived(
		categories.find((category) => category.id === selectedCategoryId)
	);

	// Reset state only when modal OPENS (transition from closed to open)
	$effect(() => {
		const justOpened = open && !wasOpen;
		wasOpen = open;

		if (justOpened) {
			selectedIds.clear();
			selectedAccountId = '';
			selectedCategoryId = '';
			searchQuery = '';
			debouncedSearch = '';
			page = 1;
			error = null;
			pageSize = showAdded ? 50 : 200;
			localLineupIds.clear();
			for (const id of lineupChannelIds) {
				localLineupIds.add(id);
			}
			loadAccounts();
			loadChannels();
		}
	});

	// Sync lineup IDs from parent without resetting filters
	$effect(() => {
		if (open && wasOpen) {
			localLineupIds.clear();
			for (const id of lineupChannelIds) {
				localLineupIds.add(id);
			}
		}
	});

	// Debounce search input
	$effect(() => {
		const query = searchQuery; // Read synchronously to track as dependency
		clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(() => {
			if (debouncedSearch !== query) {
				debouncedSearch = query;
				page = 1;
			}
		}, 300);
	});

	// Reload categories when account changes
	$effect(() => {
		if (open) {
			if (selectedAccountId) {
				loadCategories(selectedAccountId);
			} else {
				categories = [];
				selectedCategoryId = '';
			}
		}
	});

	// Reload channels when filters or page changes
	$effect(() => {
		if (open) {
			// Dependencies: selectedAccountId, selectedCategoryId, debouncedSearch, page
			void selectedAccountId;
			void selectedCategoryId;
			void debouncedSearch;
			void page;
			loadChannels();
		}
	});

	async function loadAccounts() {
		try {
			const response = await fetch('/api/livetv/accounts');
			if (response.ok) {
				const result = await response.json();
				accounts = result.accounts?.filter((a: LiveTvAccount) => a.enabled) || [];
			}
		} catch (e) {
			console.error('Failed to load accounts:', e);
		}
	}

	async function loadCategories(accountId: string) {
		try {
			const response = await fetch(`/api/livetv/categories?accountId=${accountId}`);
			if (response.ok) {
				const data = await response.json();
				categories = data.categories || [];
				selectedCategoryId = '';
			}
		} catch (e) {
			console.error('Failed to load categories:', e);
			categories = [];
		}
	}

	async function loadChannels() {
		loading = true;
		error = null;

		const params = new SvelteURLSearchParams();
		params.set('page', String(page));
		params.set('pageSize', String(pageSize));

		if (selectedAccountId) {
			params.set('accountIds', selectedAccountId);
		}
		if (selectedCategoryId) {
			params.set('categoryIds', selectedCategoryId);
		}
		if (debouncedSearch) {
			params.set('search', debouncedSearch);
		}

		try {
			const response = await fetch(`/api/livetv/channels?${params}`);
			if (!response.ok) throw new Error('Failed to load channels');

			const result = await response.json();
			if (!result.success) throw new Error(result.error || 'Failed to load channels');
			channels = result.channels || [];
			total = result.total || 0;
			totalPages = result.totalPages || 1;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load channels';
			channels = [] as CachedChannel[];
		} finally {
			loading = false;
		}
	}

	function toggleSelection(channelId: string) {
		if (isInLineup(channelId)) return;

		if (selectedIds.has(channelId)) {
			selectedIds.delete(channelId);
		} else {
			selectedIds.add(channelId);
		}
	}

	function toggleAllVisible() {
		if (allVisibleSelected) {
			// Deselect all visible
			for (const channel of selectableChannels) {
				selectedIds.delete(channel.id);
			}
		} else {
			// Select all visible
			for (const channel of selectableChannels) {
				selectedIds.add(channel.id);
			}
		}
	}

	function clearSelection() {
		selectedIds.clear();
	}

	async function addSingleChannel(channel: CachedChannel) {
		if (isInLineup(channel.id) || addingIds.has(channel.id)) return;

		addingIds.add(channel.id);

		try {
			const response = await fetch('/api/livetv/lineup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					channels: [{ accountId: channel.accountId, channelId: channel.id }]
				})
			});

			if (!response.ok) throw new Error('Failed to add channel');

			// Update local state for immediate feedback
			localLineupIds.add(channel.id);

			// Remove from selection if selected
			if (selectedIds.has(channel.id)) {
				selectedIds.delete(channel.id);
			}

			onChannelsAdded();
		} catch (e) {
			console.error('Failed to add channel:', e);
		} finally {
			addingIds.delete(channel.id);
		}
	}

	async function addSelectedChannels() {
		if (selectedIds.size === 0 || bulkAdding) return;

		bulkAdding = true;

		const channelsToAdd = channels
			.filter((c) => selectedIds.has(c.id))
			.map((c) => ({ accountId: c.accountId, channelId: c.id }));

		try {
			const response = await fetch('/api/livetv/lineup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ channels: channelsToAdd })
			});

			if (!response.ok) throw new Error('Failed to add channels');

			// Update local state
			for (const id of selectedIds) {
				localLineupIds.add(id);
			}

			selectedIds.clear();
			onChannelsAdded();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add channels';
		} finally {
			bulkAdding = false;
		}
	}

	async function getAllChannelsForSelectedCategory(): Promise<CachedChannel[]> {
		if (!selectedAccountId || !selectedCategoryId) {
			return [];
		}

		const categoryChannels: CachedChannel[] = [];
		let currentPage = 1;
		let hasMore = true;
		const fetchPageSize = 500;

		while (hasMore) {
			const params = new SvelteURLSearchParams();
			params.set('page', String(currentPage));
			params.set('pageSize', String(fetchPageSize));
			params.set('accountIds', selectedAccountId);
			params.set('categoryIds', selectedCategoryId);

			const response = await fetch(`/api/livetv/channels?${params.toString()}`);
			if (!response.ok) {
				throw new Error('Failed to load category channels');
			}

			const result = await response.json();
			if (!result.success) {
				throw new Error(result.error || 'Failed to load category channels');
			}

			const pageChannels = (result.channels ?? []) as CachedChannel[];
			categoryChannels.push(...pageChannels);

			const totalPagesForQuery = Math.max(1, Number(result.totalPages || 1));
			currentPage++;
			hasMore = currentPage <= totalPagesForQuery;
		}

		return categoryChannels;
	}

	async function getOrCreateLineupCategoryId(name: string): Promise<string> {
		const normalizedName = name.trim();
		if (!normalizedName) {
			throw new Error('Selected category has no name');
		}

		const existingResponse = await fetch('/api/livetv/channel-categories');
		if (!existingResponse.ok) {
			throw new Error('Failed to load Cinephage categories');
		}

		const existingData = await existingResponse.json();
		const existingCategories = (existingData.categories ?? []) as Array<{
			id: string;
			name: string;
		}>;
		const existing = existingCategories.find(
			(category) => category.name?.trim().toLowerCase() === normalizedName.toLowerCase()
		);
		if (existing?.id) {
			return existing.id;
		}

		const createResponse = await fetch('/api/livetv/channel-categories', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: normalizedName })
		});

		if (!createResponse.ok) {
			const data = await createResponse.json().catch(() => ({}));
			throw new Error(data.error || 'Failed to create Cinephage category');
		}

		const createData = await createResponse.json();
		const categoryId = createData.category?.id as string | undefined;
		if (!categoryId) {
			throw new Error('Created category did not return an ID');
		}

		return categoryId;
	}

	async function addSelectedCategoryChannels() {
		if (!selectedAccountId || !selectedCategoryId || addingCategory) return;

		addingCategory = true;
		error = null;

		try {
			const lineupCategoryName = selectedCategory?.title?.trim();
			if (!lineupCategoryName) {
				throw new Error('Please select a valid provider category first');
			}
			const lineupCategoryId = await getOrCreateLineupCategoryId(lineupCategoryName);
			const categoryChannels = await getAllChannelsForSelectedCategory();

			if (categoryChannels.length === 0) {
				return;
			}

			const response = await fetch('/api/livetv/lineup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					channels: categoryChannels.map((channel) => ({
						accountId: channel.accountId,
						channelId: channel.id,
						categoryId: lineupCategoryId
					}))
				})
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.error || 'Failed to add category channels');
			}

			for (const channel of categoryChannels) {
				localLineupIds.add(channel.id);
				selectedIds.delete(channel.id);
			}

			onChannelsAdded();
			await loadChannels();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add category channels';
		} finally {
			addingCategory = false;
		}
	}

	// Add a channel as backup (backup mode only)
	async function selectAsBackup(channel: CachedChannel) {
		if (!lineupItemId || !onBackupSelected || addingBackup) return;
		if (channel.id === excludeChannelId) return;

		addingBackup = true;
		try {
			const response = await fetch(`/api/livetv/lineup/${lineupItemId}/backups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					accountId: channel.accountId,
					channelId: channel.id
				})
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.error || 'Failed to add backup');
			}

			onBackupSelected(channel.accountId, channel.id);
			onClose();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add backup';
		} finally {
			addingBackup = false;
		}
	}

	function handleFilterChange() {
		page = 1;
		selectedIds.clear();
	}

	function formatChannelName(name: string): string {
		return name.replace(/#+/g, ' ').replace(/\s+/g, ' ').trim();
	}

	// Helper to get category display name (handles M3U group-title)
	function getCategoryDisplayName(channel: CachedChannel): string {
		if (channel.categoryTitle) return channel.categoryTitle;
		if (channel.m3u?.groupTitle) return channel.m3u.groupTitle;
		return '-';
	}

	// Helper to get provider badge info
	function getProviderBadgeInfo(type: LiveTvProviderType) {
		switch (type) {
			case 'stalker':
				return { class: 'badge-primary', icon: Tv, label: 'Stalker' };
			case 'xstream':
				return { class: 'badge-secondary', icon: Radio, label: 'XStream' };
			case 'm3u':
				return { class: 'badge-accent', icon: List, label: 'M3U' };
			default:
				return { class: 'badge-ghost', icon: Tv, label: type };
		}
	}
</script>

<ModalWrapper {open} {onClose} maxWidth="5xl" labelledBy="channel-browser-modal-title">
	<!-- Header -->
	<div class="mb-4 flex items-center justify-between">
		<div>
			<h3 id="channel-browser-modal-title" class="text-lg font-bold">
				{isBackupMode ? 'Select Backup Channel' : 'Browse Channels'}
			</h3>
			<p class="text-sm text-base-content/60">
				{isBackupMode ? 'Select an alternative channel source' : 'Add channels from your accounts'}
			</p>
		</div>
		<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
			<X class="h-4 w-4" />
		</button>
	</div>

	<!-- Filters Row -->
	<div class="mb-4 flex flex-wrap items-center gap-3">
		<!-- Account Filter -->
		<select
			class="select-bordered select w-full select-sm sm:w-48"
			bind:value={selectedAccountId}
			onchange={handleFilterChange}
		>
			<option value="">All Accounts</option>
			{#each accounts as account (account.id)}
				<option value={account.id}>
					{account.name}
					{#if account.channelCount}({account.channelCount.toLocaleString()}){/if}
				</option>
			{/each}
		</select>

		<!-- Category Filter -->
		<select
			class="select-bordered select w-full select-sm sm:w-48"
			bind:value={selectedCategoryId}
			onchange={handleFilterChange}
			disabled={!selectedAccountId}
		>
			<option value="">All Categories</option>
			{#each categories as category (category.id)}
				<option value={category.id}>
					{category.title}
					({category.channelCount})
				</option>
			{/each}
		</select>

		<!-- Search Input -->
		<div class="relative flex-1">
			<Search
				class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-base-content/40"
			/>
			<input
				type="text"
				placeholder="Search channels..."
				class="input-bordered input input-sm w-full pl-9"
				bind:value={searchQuery}
			/>
		</div>
	</div>

	<!-- Results Summary & Bulk Actions -->
	<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
		<span class="text-sm text-base-content/60">
			{total.toLocaleString()} channel{total !== 1 ? 's' : ''}
			{#if !isBackupMode && selectedIds.size > 0}
				<span class="text-primary">({selectedIds.size} selected)</span>
			{/if}
		</span>

		{#if !isBackupMode}
			<label class="flex items-center gap-2 text-xs text-base-content/60">
				<input
					type="checkbox"
					class="checkbox checkbox-xs"
					bind:checked={showAdded}
					onchange={() => {
						pageSize = showAdded ? 50 : 200;
						page = 1;
						selectedIds.clear();
					}}
				/>
				Show already added
			</label>
			{#if selectedAccountId && selectedCategoryId}
				<button
					class="btn btn-outline btn-sm"
					onclick={addSelectedCategoryChannels}
					disabled={addingCategory || loading}
					title="Add all channels in this provider category"
				>
					{#if addingCategory}
						<Loader2 class="h-4 w-4 animate-spin" />
					{:else}
						<Plus class="h-4 w-4" />
					{/if}
					Add Entire Category
					{#if selectedCategory}
						({selectedCategory.channelCount})
					{/if}
				</button>
			{/if}
			{#if selectedIds.size > 0}
				<div class="flex gap-2">
					<button class="btn btn-ghost btn-xs" onclick={clearSelection}>Clear</button>
					<button
						class="btn btn-sm btn-primary"
						onclick={addSelectedChannels}
						disabled={bulkAdding}
					>
						{#if bulkAdding}
							<Loader2 class="h-4 w-4 animate-spin" />
						{:else}
							<Plus class="h-4 w-4" />
						{/if}
						Add {selectedIds.size} Selected
					</button>
				</div>
			{:else if selectableChannels.length > 0}
				<button class="btn btn-ghost btn-xs" onclick={toggleAllVisible}>
					Select All Visible
				</button>
			{/if}
		{/if}
	</div>

	<!-- Error Display -->
	{#if error}
		<div class="mb-2 alert alert-error">
			<span>{error}</span>
			<button class="btn btn-ghost btn-xs" onclick={loadChannels}>Retry</button>
		</div>
	{/if}

	<!-- Channel List -->
	<div class="flex-1 overflow-auto rounded-lg border border-base-300">
		{#if loading}
			<div class="flex items-center justify-center py-12">
				<Loader2 class="h-8 w-8 animate-spin text-primary" />
			</div>
		{:else if channels.length === 0}
			<div class="flex flex-col items-center justify-center py-12 text-base-content/50">
				<Tv class="mb-4 h-12 w-12" />
				<p>No channels found</p>
				{#if debouncedSearch || selectedAccountId || selectedCategoryId}
					<p class="text-sm">Try adjusting your filters</p>
				{/if}
			</div>
		{:else if visibleChannels.length === 0}
			<div class="flex flex-col items-center justify-center py-12 text-base-content/50">
				<p class="text-center text-sm">All channels on this page are already in your lineup.</p>
				<p class="text-xs">Try the next page or enable “Show already added”.</p>
			</div>
		{:else}
			<!-- Mobile cards -->
			<div class="space-y-3 p-3 sm:hidden">
				{#each visibleChannels as channel (channel.id)}
					{@const excluded = isExcluded(channel.id)}
					{@const inLineup = isInLineup(channel.id)}
					{@const isSelected = selectedIds.has(channel.id)}
					{@const isAdding = addingIds.has(channel.id)}
					{@const providerBadge = getProviderBadgeInfo(channel.providerType)}
					<div class="rounded-xl bg-base-200 p-3 {excluded ? 'opacity-60' : ''}">
						<div class="flex items-start gap-3">
							{#if !isBackupMode}
								<input
									type="checkbox"
									class="checkbox mt-1 checkbox-sm"
									checked={isSelected}
									disabled={inLineup}
									onchange={() => toggleSelection(channel.id)}
								/>
							{/if}
							{#if channel.logo}
								<img
									src={channel.logo}
									alt=""
									class="h-10 w-10 rounded bg-base-200 object-contain"
								/>
							{:else}
								<div class="flex h-10 w-10 items-center justify-center rounded bg-base-200">
									<Tv class="h-4 w-4 text-base-content/30" />
								</div>
							{/if}
							<div class="min-w-0 flex-1">
								<div class="text-sm font-medium break-words sm:text-base" title={channel.name}>
									{formatChannelName(channel.name)}
								</div>
								<div class="mt-1 text-xs text-base-content/60">
									{#if channel.number}
										#{channel.number}
										<span class="text-base-content/40">•</span>
									{/if}
									{getCategoryDisplayName(channel)}
									<span class="text-base-content/40">•</span>
									{channel.accountName || '-'}
									<span class="text-base-content/40">•</span>
									<span class="badge {providerBadge.class} gap-1 badge-xs">
										<providerBadge.icon class="h-3 w-3" />
										{providerBadge.label}
									</span>
								</div>
							</div>
							<div class="flex items-center gap-2">
								{#if isBackupMode}
									{#if excluded}
										<span class="badge badge-ghost badge-sm">Primary</span>
									{:else}
										<button
											class="btn btn-ghost btn-xs"
											onclick={() => selectAsBackup(channel)}
											disabled={addingBackup}
										>
											{#if addingBackup}
												<Loader2 class="h-3 w-3 animate-spin" />
											{:else}
												<Plus class="h-3 w-3" />
											{/if}
											Select
										</button>
									{/if}
								{:else if inLineup}
									<span class="badge gap-1 badge-ghost badge-sm">
										<Check class="h-3 w-3" />
										Added
									</span>
								{:else}
									<button
										class="btn btn-ghost btn-xs"
										onclick={() => addSingleChannel(channel)}
										disabled={isAdding}
									>
										{#if isAdding}
											<Loader2 class="h-3 w-3 animate-spin" />
										{:else}
											<Plus class="h-3 w-3" />
										{/if}
										Add
									</button>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Desktop table -->
			<div class="hidden sm:block">
				<table class="table table-sm">
					<thead class="sticky top-0 z-10 bg-base-200">
						<tr>
							{#if !isBackupMode}
								<th class="w-10">
									<input
										type="checkbox"
										class="checkbox checkbox-sm"
										checked={allVisibleSelected}
										indeterminate={someVisibleSelected}
										disabled={selectableChannels.length === 0}
										onchange={toggleAllVisible}
									/>
								</th>
							{/if}
							<th>Channel</th>
							<th>Category</th>
							<th>Account</th>
							<th>Provider</th>
							<th class="w-24">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each visibleChannels as channel (channel.id)}
							{@const excluded = isExcluded(channel.id)}
							{@const inLineup = isInLineup(channel.id)}
							{@const isSelected = selectedIds.has(channel.id)}
							{@const isAdding = addingIds.has(channel.id)}
							{@const providerBadge = getProviderBadgeInfo(channel.providerType)}

							<tr class={excluded ? 'bg-base-200/50 opacity-50' : ''}>
								{#if !isBackupMode}
									<td>
										<input
											type="checkbox"
											class="checkbox checkbox-sm"
											checked={isSelected}
											disabled={inLineup}
											onchange={() => toggleSelection(channel.id)}
										/>
									</td>
								{/if}
								<td>
									<div class="flex items-center gap-3">
										{#if channel.logo}
											<img
												src={channel.logo}
												alt=""
												class="h-8 w-8 rounded bg-base-200 object-contain"
											/>
										{:else}
											<div class="flex h-8 w-8 items-center justify-center rounded bg-base-200">
												<Tv class="h-4 w-4 text-base-content/30" />
											</div>
										{/if}
										<div>
											<p class="max-w-xs font-medium break-words" title={channel.name}>
												{formatChannelName(channel.name)}
											</p>
											{#if channel.number}
												<p class="text-xs text-base-content/50">#{channel.number}</p>
											{/if}
										</div>
									</div>
								</td>
								<td class="text-sm">{getCategoryDisplayName(channel)}</td>
								<td class="text-sm">{channel.accountName || '-'}</td>
								<td>
									<span class="badge {providerBadge.class} gap-1 badge-sm">
										<providerBadge.icon class="h-3 w-3" />
										{providerBadge.label}
									</span>
								</td>
								<td>
									{#if isBackupMode}
										{#if excluded}
											<span class="badge badge-ghost badge-sm">Primary</span>
										{:else}
											<button
												class="btn btn-ghost btn-xs"
												onclick={() => selectAsBackup(channel)}
												disabled={addingBackup}
											>
												{#if addingBackup}
													<Loader2 class="h-3 w-3 animate-spin" />
												{:else}
													<Plus class="h-3 w-3" />
												{/if}
												Select
											</button>
										{/if}
									{:else if inLineup}
										<span class="badge gap-1 badge-ghost badge-sm">
											<Check class="h-3 w-3" />
											Added
										</span>
									{:else}
										<button
											class="btn btn-ghost btn-xs"
											onclick={() => addSingleChannel(channel)}
											disabled={isAdding}
										>
											{#if isAdding}
												<Loader2 class="h-3 w-3 animate-spin" />
											{:else}
												<Plus class="h-3 w-3" />
											{/if}
											Add
										</button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<!-- Pagination -->
	{#if totalPages > 1}
		<div class="mt-4 flex items-center justify-center gap-2">
			<button
				class="btn btn-ghost btn-sm"
				disabled={page === 1 || loading}
				onclick={() => (page = page - 1)}
			>
				<ChevronLeft class="h-4 w-4" />
				Previous
			</button>
			<span class="text-sm">
				Page {page} of {totalPages}
			</span>
			<button
				class="btn btn-ghost btn-sm"
				disabled={page === totalPages || loading}
				onclick={() => (page = page + 1)}
			>
				Next
				<ChevronRight class="h-4 w-4" />
			</button>
		</div>
	{/if}

	<!-- Footer -->
	<div class="modal-action">
		<button class="btn" onclick={onClose}>Done</button>
	</div>
</ModalWrapper>
