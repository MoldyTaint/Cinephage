<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { Search, X, Radio, List, ArrowUpDown, Filter, CheckSquare, Square } from 'lucide-svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		ChannelLineupGrouped,
		ChannelBrowseTable,
		ChannelBulkActionBar,
		ChannelCategoryModal,
		ChannelEditModal
	} from '$lib/components/livetv';
	import { toasts } from '$lib/stores/toast.svelte';
	import type { PageData } from './$types';
	import type {
		ChannelCategory,
		ChannelCategoryFormData,
		ChannelLineupItemWithAccount,
		UpdateChannelRequest
	} from '$lib/types/livetv';

	let { data }: { data: PageData } = $props();

	// Mode state
	const mode = $derived(data.mode);
	const isBrowseMode = $derived(mode === 'browse');

	// Selection state
	let selectedLineupIds = new SvelteSet<string>();
	let selectedBrowseKeys = new SvelteSet<string>();
	let showCheckboxes = $state(false);

	// Reorder mode for lineup
	let reorderMode = $state(false);

	// Loading states
	let addingToLineup = $state(false);
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserved for loading UI
	let removingFromLineup = $state(false);

	// Category management state
	let categoryModalOpen = $state(false);
	let categoryModalMode = $state<'add' | 'edit'>('add');
	let editingCategory = $state<ChannelCategory | null>(null);
	let savingCategory = $state(false);
	let categoryError = $state<string | null>(null);

	// Channel edit modal state
	let editModalOpen = $state(false);
	let editingChannel = $state<ChannelLineupItemWithAccount | null>(null);
	let savingChannel = $state(false);
	let channelError = $state<string | null>(null);

	// Filter UI state
	let sortDropdownOpen = $state(false);
	let filterDropdownOpen = $state(false);
	// eslint-disable-next-line svelte/prefer-writable-derived -- Two-way binding with URL sync
	let searchInput = $state('');
	$effect(() => {
		searchInput = data.filters.search;
	});

	// Lineup keys as a Set for quick lookup
	const lineupKeySet = $derived(new Set(data.lineupKeys));

	// Enabled accounts only
	const enabledAccounts = $derived(data.accounts.filter((a) => a.enabled));

	// Sort options
	const sortOptions = [
		{ value: 'number-asc', label: 'Channel # (Low to High)' },
		{ value: 'number-desc', label: 'Channel # (High to Low)' },
		{ value: 'name-asc', label: 'Name (A-Z)' },
		{ value: 'name-desc', label: 'Name (Z-A)' },
		{ value: 'category-asc', label: 'Category' },
		{ value: 'account-asc', label: 'Account' }
	];

	// Filter options
	const lineupStatusOptions = [
		{ value: 'all', label: 'All Channels' },
		{ value: 'notInLineup', label: 'Not in Lineup' },
		{ value: 'inLineup', label: 'In Lineup' }
	];

	// Computed filter state
	const hasActiveFilters = $derived(
		data.filters.account !== 'all' ||
			data.filters.category !== 'all' ||
			data.filters.lineupStatus !== 'all' ||
			data.filters.search !== ''
	);

	const activeFilterCount = $derived(() => {
		let count = 0;
		if (data.filters.account !== 'all') count++;
		if (data.filters.category !== 'all') count++;
		if (data.filters.lineupStatus !== 'all') count++;
		if (data.filters.search !== '') count++;
		return count;
	});

	const activeFilterLabels = $derived(() => {
		const labels: string[] = [];
		if (data.filters.account !== 'all') {
			const account = data.accounts.find((a) => a.id === data.filters.account);
			labels.push(account?.name || 'Unknown Account');
		}
		if (data.filters.category !== 'all') {
			const cat = data.portalCategories.find((c) => c.id === data.filters.category);
			labels.push(cat?.title || 'Unknown Category');
		}
		if (data.filters.lineupStatus !== 'all') {
			const opt = lineupStatusOptions.find((o) => o.value === data.filters.lineupStatus);
			labels.push(opt?.label || '');
		}
		if (data.filters.search !== '') {
			labels.push(`"${data.filters.search}"`);
		}
		return labels;
	});

	const currentSortLabel = $derived(
		sortOptions.find((o) => o.value === data.filters.sort)?.label || 'Channel #'
	);

	// Reset selections when mode changes
	$effect(() => {
		if (!isBrowseMode) {
			selectedBrowseKeys.clear();
			showCheckboxes = false;
		}
	});

	// URL-based filter updates
	function updateFilter(key: string, value: string) {
		const url = new URL($page.url);
		if (value === 'all' || value === '' || (key === 'sort' && value === 'number-asc')) {
			url.searchParams.delete(key);
		} else {
			url.searchParams.set(key, value);
		}
		url.searchParams.set('mode', 'browse');
		goto(url.pathname + url.search, { keepFocus: true, noScroll: true });
	}

	function clearFilters() {
		goto('/livetv/channels?mode=browse', { keepFocus: true, noScroll: true });
		searchInput = '';
	}

	function handleSearchSubmit() {
		updateFilter('search', searchInput.trim());
	}

	function handleSearchClear() {
		searchInput = '';
		updateFilter('search', '');
	}

	function switchMode(newMode: 'lineup' | 'browse') {
		if (newMode === 'lineup') {
			goto('/livetv/channels', { replaceState: true });
		} else {
			goto('/livetv/channels?mode=browse', { replaceState: true });
		}
		// Clear selections when switching modes
		selectedLineupIds.clear();
		selectedBrowseKeys.clear();
		reorderMode = false;
		showCheckboxes = false;
	}

	// Lineup handlers
	function handleLineupToggleSelect(id: string) {
		if (selectedLineupIds.has(id)) {
			selectedLineupIds.delete(id);
		} else {
			selectedLineupIds.add(id);
		}
	}

	function handleLineupSelectAll() {
		for (const item of data.lineup) {
			selectedLineupIds.add(item.id);
		}
	}

	function handleLineupClearSelection() {
		selectedLineupIds.clear();
	}

	async function handleReorder(itemIds: string[]) {
		try {
			const response = await fetch('/api/livetv/lineup/reorder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ itemIds })
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to reorder');
			}

			await invalidateAll();
			toasts.success('Lineup reordered');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			toasts.error(`Failed to reorder: ${message}`);
		}
	}

	async function handleRemoveFromLineup(itemIds: string[]) {
		removingFromLineup = true;
		try {
			const response = await fetch('/api/livetv/lineup/remove', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ itemIds })
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to remove');
			}

			const result = await response.json();
			await invalidateAll();
			selectedLineupIds.clear();
			toasts.success(
				`Removed ${result.removed} channel${result.removed !== 1 ? 's' : ''} from lineup`
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			toasts.error(`Failed to remove: ${message}`);
		} finally {
			removingFromLineup = false;
		}
	}

	function handleToggleReorderMode() {
		reorderMode = !reorderMode;
		if (reorderMode) {
			selectedLineupIds.clear();
		}
	}

	// Browse handlers
	function handleBrowseToggleSelect(key: string) {
		if (selectedBrowseKeys.has(key)) {
			selectedBrowseKeys.delete(key);
		} else {
			selectedBrowseKeys.add(key);
		}
	}

	function handleBrowseSelectAll() {
		for (const channel of data.channels) {
			const key = `${channel.accountId}:${channel.id}`;
			if (!lineupKeySet.has(key)) {
				selectedBrowseKeys.add(key);
			}
		}
	}

	function handleBrowseClearSelection() {
		selectedBrowseKeys.clear();
	}

	function toggleSelectionMode() {
		showCheckboxes = !showCheckboxes;
		if (!showCheckboxes) {
			selectedBrowseKeys.clear();
		}
	}

	async function handleAddToLineup() {
		addingToLineup = true;
		try {
			// Build channels lookup from selected keys
			const channelMap: Record<string, (typeof data.channels)[0]> = {};
			for (const channel of data.channels) {
				const key = `${channel.accountId}:${channel.id}`;
				channelMap[key] = channel;
			}

			const channelsToAdd = Array.from(selectedBrowseKeys)
				.map((key) => channelMap[key])
				.filter((c) => c !== undefined)
				.map((c) => ({
					accountId: c.accountId,
					channelId: c.id,
					name: c.name,
					logo: c.logo || undefined,
					categoryId: c.categoryId || undefined,
					categoryName: c.categoryName || undefined
				}));

			const response = await fetch('/api/livetv/lineup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ channels: channelsToAdd })
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to add');
			}

			const result = await response.json();
			await invalidateAll();
			selectedBrowseKeys.clear();
			showCheckboxes = false;

			if (result.added > 0) {
				toasts.success(`Added ${result.added} channel${result.added !== 1 ? 's' : ''} to lineup`);
			}
			if (result.skipped > 0) {
				toasts.info(
					`${result.skipped} channel${result.skipped !== 1 ? 's' : ''} already in lineup`
				);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			toasts.error(`Failed to add: ${message}`);
		} finally {
			addingToLineup = false;
		}
	}

	// Category handlers
	function handleOpenAddCategory() {
		categoryModalMode = 'add';
		editingCategory = null;
		categoryError = null;
		categoryModalOpen = true;
	}

	function handleOpenEditCategory(category: ChannelCategory) {
		categoryModalMode = 'edit';
		editingCategory = category;
		categoryError = null;
		categoryModalOpen = true;
	}

	function handleCloseCategoryModal() {
		categoryModalOpen = false;
		editingCategory = null;
		categoryError = null;
	}

	async function handleSaveCategory(formData: ChannelCategoryFormData) {
		savingCategory = true;
		categoryError = null;

		try {
			if (categoryModalMode === 'add') {
				const response = await fetch('/api/livetv/channel-categories', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(formData)
				});

				if (!response.ok) {
					const error = await response.json();
					throw new Error(error.error || 'Failed to create category');
				}

				toasts.success('Category created');
			} else if (editingCategory) {
				const response = await fetch(`/api/livetv/channel-categories/${editingCategory.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(formData)
				});

				if (!response.ok) {
					const error = await response.json();
					throw new Error(error.error || 'Failed to update category');
				}

				toasts.success('Category updated');
			}

			await invalidateAll();
			handleCloseCategoryModal();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			categoryError = message;
		} finally {
			savingCategory = false;
		}
	}

	async function handleDeleteCategory() {
		if (!editingCategory) return;

		savingCategory = true;
		try {
			const response = await fetch(`/api/livetv/channel-categories/${editingCategory.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to delete category');
			}

			await invalidateAll();
			handleCloseCategoryModal();
			toasts.success('Category deleted');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			categoryError = message;
		} finally {
			savingCategory = false;
		}
	}

	// Channel edit handlers
	function handleOpenEditChannel(channel: ChannelLineupItemWithAccount) {
		editingChannel = channel;
		channelError = null;
		editModalOpen = true;
	}

	function handleCloseEditModal() {
		editModalOpen = false;
		editingChannel = null;
		channelError = null;
	}

	async function handleSaveChannel(updateData: UpdateChannelRequest) {
		if (!editingChannel) return;

		savingChannel = true;
		channelError = null;

		try {
			const response = await fetch(`/api/livetv/lineup/${editingChannel.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updateData)
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to update channel');
			}

			await invalidateAll();
			handleCloseEditModal();
			toasts.success('Channel updated');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			channelError = message;
		} finally {
			savingChannel = false;
		}
	}

	async function handleDeleteChannel() {
		if (!editingChannel) return;

		savingChannel = true;
		try {
			const response = await fetch(`/api/livetv/lineup/${editingChannel.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to remove channel');
			}

			await invalidateAll();
			handleCloseEditModal();
			toasts.success('Channel removed from lineup');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			channelError = message;
		} finally {
			savingChannel = false;
		}
	}
</script>

<svelte:head>
	<title>Channels - Cinephage</title>
</svelte:head>

<div class="flex min-h-screen w-full flex-col">
	{#if isBrowseMode}
		<!-- Browse Mode: Sticky Header -->
		<div class="sticky top-0 z-30 border-b border-base-200 bg-base-100/80 backdrop-blur-md">
			<div class="flex h-16 items-center justify-between px-4 lg:px-8">
				<!-- Left: Title + count -->
				<div class="flex items-center gap-3">
					<h1
						class="bg-gradient-to-r from-primary to-secondary bg-clip-text text-2xl font-bold text-transparent"
					>
						Browse Channels
					</h1>
					<span class="badge badge-ghost badge-lg">{data.total.toLocaleString()}</span>
					{#if data.total !== data.totalUnfiltered}
						<span class="text-sm text-base-content/50"
							>of {data.totalUnfiltered.toLocaleString()}</span
						>
					{/if}
				</div>

				<!-- Right: Controls -->
				<div class="flex items-center gap-2">
					<!-- Search -->
					<form
						onsubmit={(e) => {
							e.preventDefault();
							handleSearchSubmit();
						}}
						class="relative"
					>
						<Search
							class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-base-content/50"
						/>
						<input
							type="text"
							placeholder="Search..."
							class="input-bordered input input-sm w-48 pr-8 pl-9"
							bind:value={searchInput}
							onkeydown={(e) => e.key === 'Escape' && handleSearchClear()}
						/>
						{#if searchInput}
							<button
								type="button"
								class="absolute top-1/2 right-2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
								onclick={handleSearchClear}
							>
								<X class="h-4 w-4" />
							</button>
						{/if}
					</form>

					<!-- Sort Dropdown -->
					<div class="dropdown dropdown-end">
						<button
							class="btn gap-1 btn-ghost btn-sm"
							onclick={() => (sortDropdownOpen = !sortDropdownOpen)}
						>
							<ArrowUpDown class="h-4 w-4" />
							<span class="hidden sm:inline">{currentSortLabel}</span>
						</button>
						{#if sortDropdownOpen}
							<ul
								class="dropdown-content menu z-50 mt-1 w-56 rounded-box bg-base-100 p-2 shadow-lg"
							>
								{#each sortOptions as option (option.value)}
									<li>
										<button
											class={data.filters.sort === option.value ? 'active' : ''}
											onclick={() => {
												updateFilter('sort', option.value);
												sortDropdownOpen = false;
											}}
										>
											{option.label}
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>

					<!-- Filter Dropdown -->
					<div class="dropdown dropdown-end">
						<button
							class="btn gap-1 btn-ghost btn-sm"
							onclick={() => (filterDropdownOpen = !filterDropdownOpen)}
						>
							<Filter class="h-4 w-4" />
							<span class="hidden sm:inline">Filter</span>
							{#if activeFilterCount() > 0}
								<span class="badge badge-xs badge-primary">{activeFilterCount()}</span>
							{/if}
						</button>
						{#if filterDropdownOpen}
							<div class="dropdown-content z-50 mt-1 w-72 rounded-box bg-base-100 p-4 shadow-lg">
								<!-- Account Filter -->
								<div class="form-control mb-3">
									<label class="label py-1">
										<span class="label-text font-medium">Account</span>
									</label>
									<select
										class="select-bordered select select-sm"
										value={data.filters.account}
										onchange={(e) => updateFilter('account', e.currentTarget.value)}
									>
										<option value="all">All Accounts</option>
										{#each enabledAccounts as account (account.id)}
											<option value={account.id}>{account.name}</option>
										{/each}
									</select>
								</div>

								<!-- Category Filter -->
								<div class="form-control mb-3">
									<label class="label py-1">
										<span class="label-text font-medium">Category</span>
									</label>
									<select
										class="select-bordered select select-sm"
										value={data.filters.category}
										onchange={(e) => updateFilter('category', e.currentTarget.value)}
									>
										<option value="all">All Categories</option>
										{#each data.portalCategories as cat (cat.id)}
											<option value={cat.id}>{cat.title}</option>
										{/each}
									</select>
								</div>

								<!-- Lineup Status Filter -->
								<div class="form-control mb-3">
									<label class="label py-1">
										<span class="label-text font-medium">Lineup Status</span>
									</label>
									<select
										class="select-bordered select select-sm"
										value={data.filters.lineupStatus}
										onchange={(e) => updateFilter('lineupStatus', e.currentTarget.value)}
									>
										{#each lineupStatusOptions as option (option.value)}
											<option value={option.value}>{option.label}</option>
										{/each}
									</select>
								</div>

								{#if hasActiveFilters}
									<button class="btn w-full btn-ghost btn-sm" onclick={clearFilters}>
										<X class="h-4 w-4" />
										Clear All Filters
									</button>
								{/if}
							</div>
						{/if}
					</div>

					<!-- Selection Mode Toggle -->
					<button
						class="btn btn-ghost btn-sm"
						onclick={toggleSelectionMode}
						title={showCheckboxes ? 'Exit selection mode' : 'Enter selection mode'}
					>
						{#if showCheckboxes}
							<CheckSquare class="h-4 w-4" />
						{:else}
							<Square class="h-4 w-4" />
						{/if}
					</button>

					<!-- Back to Lineup -->
					<button class="btn btn-ghost btn-sm" onclick={() => switchMode('lineup')}>
						<List class="h-4 w-4" />
						<span class="hidden sm:inline">My Lineup</span>
					</button>
				</div>
			</div>

			<!-- Active filter badges row -->
			{#if hasActiveFilters}
				<div class="flex items-center gap-2 border-t border-base-200/50 px-4 py-2 lg:px-8">
					{#each activeFilterLabels() as label (label)}
						<span class="badge badge-outline badge-sm">{label}</span>
					{/each}
					<button class="btn btn-ghost btn-xs" onclick={clearFilters}>
						<X class="h-3 w-3" />
						Clear
					</button>
				</div>
			{/if}
		</div>

		<!-- Browse Content -->
		<div class="flex-1 p-4 pb-20 lg:px-8">
			{#if enabledAccounts.length === 0}
				<!-- No enabled accounts -->
				<div class="flex flex-col items-center justify-center py-16 text-base-content/60">
					<Radio class="h-12 w-12 opacity-40" />
					<p class="mt-4 text-lg font-medium">No IPTV accounts</p>
					<p class="mt-1 text-sm">Add an IPTV account to browse channels</p>
					<a href="/livetv/accounts" class="btn mt-4 btn-primary">Add Account</a>
				</div>
			{:else if data.channels.length === 0}
				<!-- No channels found -->
				<div class="flex flex-col items-center justify-center py-16 text-base-content/60">
					<Radio class="h-12 w-12 opacity-40" />
					<p class="mt-4 text-lg font-medium">No channels found</p>
					<p class="mt-1 text-sm">Try adjusting your filters</p>
					{#if hasActiveFilters}
						<button class="btn mt-4 btn-ghost" onclick={clearFilters}>Clear Filters</button>
					{/if}
				</div>
			{:else}
				<!-- Channel Table -->
				<div class="card bg-base-100 shadow-xl">
					<div class="card-body p-0">
						<ChannelBrowseTable
							channels={data.channels}
							selectedKeys={selectedBrowseKeys}
							lineupKeys={lineupKeySet}
							selectable={showCheckboxes}
							onToggleSelect={handleBrowseToggleSelect}
							onSelectAll={handleBrowseSelectAll}
							onClearSelection={handleBrowseClearSelection}
						/>
					</div>
				</div>
			{/if}
		</div>

		<!-- Bulk Action Bar for Browse -->
		{#if showCheckboxes}
			<ChannelBulkActionBar
				selectedCount={selectedBrowseKeys.size}
				loading={addingToLineup}
				onAdd={handleAddToLineup}
				onClear={handleBrowseClearSelection}
			/>
		{/if}
	{:else}
		<!-- Lineup Mode: Header -->
		<div class="sticky top-0 z-30 border-b border-base-200 bg-base-100/80 backdrop-blur-md">
			<div class="flex h-16 items-center justify-between px-4 lg:px-8">
				<div class="flex items-center gap-3">
					<h1
						class="bg-gradient-to-r from-primary to-secondary bg-clip-text text-2xl font-bold text-transparent"
					>
						My Lineup
					</h1>
					<span class="badge badge-ghost badge-lg">{data.lineup.length}</span>
				</div>

				<div class="flex items-center gap-2">
					<button class="btn btn-ghost btn-sm" onclick={() => switchMode('browse')}>
						<Radio class="h-4 w-4" />
						<span class="hidden sm:inline">Browse Channels</span>
					</button>
				</div>
			</div>
		</div>

		<!-- Lineup Content -->
		<div class="flex-1 p-4 lg:px-8">
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body p-0">
					<ChannelLineupGrouped
						items={data.lineup}
						categories={data.channelCategories}
						selectedIds={selectedLineupIds}
						{reorderMode}
						onToggleSelect={handleLineupToggleSelect}
						onSelectAll={handleLineupSelectAll}
						onClearSelection={handleLineupClearSelection}
						onReorder={handleReorder}
						onRemove={handleRemoveFromLineup}
						onToggleReorderMode={handleToggleReorderMode}
						onEdit={handleOpenEditChannel}
						onAddCategory={handleOpenAddCategory}
						onEditCategory={handleOpenEditCategory}
						onDeleteCategory={handleOpenEditCategory}
					/>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Category Modal -->
<ChannelCategoryModal
	open={categoryModalOpen}
	mode={categoryModalMode}
	category={editingCategory}
	saving={savingCategory}
	error={categoryError}
	onClose={handleCloseCategoryModal}
	onSave={handleSaveCategory}
	onDelete={handleDeleteCategory}
/>

<!-- Channel Edit Modal -->
<ChannelEditModal
	open={editModalOpen}
	channel={editingChannel}
	categories={data.channelCategories}
	saving={savingChannel}
	error={channelError}
	onClose={handleCloseEditModal}
	onSave={handleSaveChannel}
	onDelete={handleDeleteChannel}
/>
