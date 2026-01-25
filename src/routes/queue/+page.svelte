<script lang="ts">
	import { resolve } from '$app/paths';
	import { resolvePath } from '$lib/utils/routing';
	import { page } from '$app/stores';
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { Download, History, Filter, CheckSquare, X, Trash2, Loader2 } from 'lucide-svelte';
	import type { PageData } from './$types';
	import QueueTable from '$lib/components/queue/QueueTable.svelte';
	import QueueStats from '$lib/components/queue/QueueStats.svelte';
	import HistoryTable from '$lib/components/queue/HistoryTable.svelte';
	import QueueBulkActionBar from '$lib/components/queue/QueueBulkActionBar.svelte';
	import QueueBulkRemoveModal from '$lib/components/queue/QueueBulkRemoveModal.svelte';
	import { Inbox, Search } from 'lucide-svelte';
	import { toasts } from '$lib/stores/toast.svelte';

	let { data }: { data: PageData } = $props();

	let activeTab = $state<'queue' | 'history'>('queue');
	const failedItems = $derived(data.queueItems.filter((item) => item.status === 'failed'));
	const failedCount = $derived(failedItems.length);
	const failedIds = $derived(failedItems.map((item) => item.id));

	// Queue selection state (for bulk remove)
	let selectedQueueIds = new SvelteSet<string>();
	let showQueueCheckboxes = $state(false);
	let isBulkRemoveModalOpen = $state(false);
	let bulkLoading = $state(false);
	let failedModalOpen = $state(false);
	let failedModalLoading = $state(false);

	function handleFailedModalDone(opts: { success: boolean; removedCount?: number; error?: string }) {
		failedModalLoading = false;
		if (opts.success) {
			failedModalOpen = false;
			invalidateAll();
			toasts.success(
				opts.removedCount && opts.removedCount > 0
					? `Removed ${opts.removedCount} failed item${opts.removedCount === 1 ? '' : 's'}`
					: 'Failed downloads cleared from queue'
			);
		} else {
			toasts.error(opts.error || 'Unable to clear failed downloads');
		}
	}

	const selectedQueueCount = $derived(selectedQueueIds.size);

	function toggleQueueSelectionMode() {
		showQueueCheckboxes = !showQueueCheckboxes;
		if (!showQueueCheckboxes) {
			selectedQueueIds.clear();
		}
	}

	function selectAllQueue() {
		for (const item of data.queueItems) {
			selectedQueueIds.add(item.id);
		}
	}

	function clearQueueSelection() {
		selectedQueueIds.clear();
	}

	function handleQueueItemSelectChange(id: string, selected: boolean) {
		if (selected) {
			selectedQueueIds.add(id);
		} else {
			selectedQueueIds.delete(id);
		}
	}

	function handleQueueSelectAllToggle() {
		if (selectedQueueIds.size === data.queueItems.length) {
			clearQueueSelection();
		} else {
			selectAllQueue();
		}
	}

	function handleQueueKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && showQueueCheckboxes) {
			toggleQueueSelectionMode();
		}
	}

	function handleBulkRemoveDone(opts: { success: boolean; removedCount?: number; error?: string }) {
		bulkLoading = false;
		if (opts.success) {
			isBulkRemoveModalOpen = false;
			clearQueueSelection();
			showQueueCheckboxes = false;
			invalidateAll();
			if (opts.removedCount != null && opts.removedCount > 0) {
				toasts.success(`Removed ${opts.removedCount} from queue`);
			}
		} else {
			toasts.error(opts.error || 'Failed to remove from queue');
		}
	}

	// SSE for real-time updates
	let eventSource: EventSource | null = null;
	let reconnectAttempts = 0;
	const MAX_RECONNECT_ATTEMPTS = 10;
	const RECONNECT_BASE_DELAY = 1000; // 1 second
	let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

	// Debounce invalidation to prevent excessive page reloads
	// This is especially important when SABnzbd is slow to respond
	let invalidateTimeout: ReturnType<typeof setTimeout> | null = null;
	const INVALIDATE_DEBOUNCE_MS = 500;

	function debouncedInvalidate() {
		if (invalidateTimeout) {
			clearTimeout(invalidateTimeout);
		}
		invalidateTimeout = setTimeout(() => {
			invalidateAll();
			invalidateTimeout = null;
		}, INVALIDATE_DEBOUNCE_MS);
	}

	function openFailedModal() {
		if (failedCount === 0) return;
		failedModalOpen = true;
	}

	function connectSSE() {
		if (eventSource) {
			eventSource.close();
		}

		eventSource = new EventSource('/api/queue/events');

		eventSource.onopen = () => {
			// Reset reconnect attempts on successful connection
			reconnectAttempts = 0;
		};

		eventSource.onerror = () => {
			// Close the failed connection
			eventSource?.close();
			eventSource = null;

			// Attempt reconnection with exponential backoff
			if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
				const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts);
				reconnectAttempts++;
				reconnectTimeout = setTimeout(connectSSE, delay);
			}
		};

		// Use debounced invalidation for frequent events
		eventSource.addEventListener('queue:updated', () => {
			debouncedInvalidate();
		});

		eventSource.addEventListener('queue:stats', () => {
			debouncedInvalidate();
		});

		// Immediate invalidation for significant state changes
		eventSource.addEventListener('queue:added', () => {
			invalidateAll();
		});

		eventSource.addEventListener('queue:removed', () => {
			invalidateAll();
		});

		eventSource.addEventListener('queue:completed', () => {
			invalidateAll();
		});

		eventSource.addEventListener('queue:imported', () => {
			invalidateAll();
		});

		eventSource.addEventListener('queue:failed', () => {
			invalidateAll();
		});
	}

	onMount(() => {
		connectSSE();
	});

	onDestroy(() => {
		if (reconnectTimeout) {
			clearTimeout(reconnectTimeout);
		}
		if (invalidateTimeout) {
			clearTimeout(invalidateTimeout);
		}
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	});

	// Filter handling
	function updateFilters(key: string, value: string) {
		const url = new URL($page.url);
		if (value === 'all' || !value) {
			url.searchParams.delete(key);
		} else {
			url.searchParams.set(key, value);
		}
		goto(resolvePath(url.pathname + url.search), {
			replaceState: true,
			invalidateAll: true
		});
	}

	// Actions
	let actionInProgress = $state<string | null>(null);

	function handleAction(id: string) {
		return () => {
			actionInProgress = id;
			return async ({ update }: { update: () => Promise<void> }) => {
				await update();
				actionInProgress = null;
			};
		};
	}
</script>

<svelte:head>
	<title>Download Queue - Cinephage</title>
</svelte:head>

<svelte:window onkeydown={handleQueueKeydown} />

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold">Download Queue</h1>
			<p class="mt-1 text-base-content/60">Monitor and manage your downloads</p>
		</div>
	</div>

	<!-- Stats -->
	<QueueStats stats={data.stats} />

	<!-- Tabs -->
	<div class="tabs-boxed tabs w-fit bg-base-200">
		<button
			class="tab gap-2"
			class:tab-active={activeTab === 'queue'}
			onclick={() => (activeTab = 'queue')}
		>
			<Download class="h-4 w-4" />
			Queue
			{#if data.stats.totalCount > 0}
				<span class="badge badge-sm">{data.stats.totalCount}</span>
			{/if}
		</button>
		<button
			class="tab gap-2"
			class:tab-active={activeTab === 'history'}
			onclick={() => (activeTab = 'history')}
		>
			<History class="h-4 w-4" />
			History
		</button>
	</div>

	<!-- Queue Tab -->
	{#if activeTab === 'queue'}
		<!-- Queue Filters -->
		<div class="flex flex-wrap items-center gap-3">
			{#if showQueueCheckboxes}
				<button class="btn gap-1.5 btn-ghost btn-xs sm:btn-sm" onclick={selectAllQueue}>
					<span class="hidden sm:inline">Select All</span>
					<span class="sm:hidden">All</span>
				</button>
				<button class="btn gap-1.5 btn-ghost btn-xs sm:btn-sm" onclick={toggleQueueSelectionMode}>
					<X class="h-4 w-4" />
					<span class="hidden sm:inline">Done</span>
				</button>
			{:else}
				<button class="btn gap-1.5 btn-ghost btn-xs sm:btn-sm" onclick={toggleQueueSelectionMode}>
					<CheckSquare class="h-4 w-4" />
					<span class="hidden sm:inline">Select</span>
				</button>
			{/if}
			<div class="flex items-center gap-2">
				<Filter class="h-4 w-4 text-base-content/60" />
				<span class="text-sm text-base-content/60">Filters:</span>
			</div>

			<select
				class="select-bordered select select-sm"
				value={data.filters.status}
				onchange={(e) => updateFilters('status', e.currentTarget.value)}
			>
				<option value="all">All Statuses</option>
				<option value="queued">Queued</option>
				<option value="downloading">Downloading</option>
				<option value="seeding">Seeding</option>
				<option value="paused">Paused</option>
				<option value="completed">Completed</option>
				<option value="importing">Importing</option>
				<option value="failed">Failed</option>
			</select>

			<select
				class="select-bordered select select-sm"
				value={data.filters.mediaType}
				onchange={(e) => updateFilters('mediaType', e.currentTarget.value)}
			>
				<option value="all">All Media</option>
				<option value="movie">Movies</option>
				<option value="tv">TV Shows</option>
			</select>

			<!-- Mobile only: Sort by (desktop uses table header clicks) -->
			<select
				class="select-bordered select select-sm lg:hidden"
				value={data.filters.sort ?? 'added-desc'}
				onchange={(e) => updateFilters('sort', e.currentTarget.value)}
			>
				<option value="added-desc">Added (Newest)</option>
				<option value="added-asc">Added (Oldest)</option>
				<option value="title-asc">Title (A-Z)</option>
				<option value="title-desc">Title (Z-A)</option>
				<option value="media-asc">Media (Movies first)</option>
				<option value="media-desc">Media (TV first)</option>
				<option value="status-asc">Status (A-Z)</option>
				<option value="status-desc">Status (Z-A)</option>
				<option value="progress-desc">Progress (High)</option>
				<option value="progress-asc">Progress (Low)</option>
				<option value="size-desc">Size (Largest)</option>
				<option value="size-asc">Size (Smallest)</option>
				<option value="group-asc">Group (A-Z)</option>
				<option value="group-desc">Group (Z-A)</option>
			</select>

			{#if data.clients.length > 0}
				<select
					class="select-bordered select select-sm"
					value={data.filters.clientId || 'all'}
					onchange={(e) => updateFilters('clientId', e.currentTarget.value)}
				>
					<option value="all">All Clients</option>
					{#each data.clients as client (client.id)}
						<option value={client.id}>{client.name}</option>
					{/each}
				</select>
			{/if}

			{#if failedCount > 0}
				<div class="ml-auto flex items-center gap-2">
					<button
						class="btn btn-sm btn-error"
						disabled={failedModalLoading}
						onclick={openFailedModal}
					>
						{#if failedModalLoading}
							<Loader2 class="h-4 w-4 animate-spin" />
							Clearing…
						{:else}
							<Trash2 class="h-4 w-4" />
							Clear Failed ({failedCount})
						{/if}
					</button>
				</div>
			{/if}
		</div>

		<!-- Queue Table or Empty State -->
		{#if data.queueItems.length === 0}
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<div class="mb-4 rounded-full bg-base-200 p-4">
					<Inbox class="h-8 w-8 text-base-content/40" />
				</div>
				<h3 class="text-lg font-medium">No downloads in queue</h3>
				<p class="mt-1 max-w-sm text-base-content/60">
					{#if data.filters.status !== 'all' || data.filters.mediaType !== 'all'}
						No downloads match your current filters. Try adjusting or clearing the filters.
					{:else}
						When you add content to download, it will appear here. Head to Discover to find
						something to add.
					{/if}
				</p>
				{#if data.filters.status !== 'all' || data.filters.mediaType !== 'all'}
					<button class="btn mt-4 btn-ghost btn-sm" onclick={() => goto(resolve('/queue'))}>
						Clear Filters
					</button>
				{:else}
					<a href={resolve('/discover')} class="btn mt-4 btn-sm btn-primary">
						<Search class="h-4 w-4" />
						Discover Content
					</a>
				{/if}
			</div>
		{:else}
			<QueueTable
				items={data.queueItems}
				{actionInProgress}
				{handleAction}
				selectable={showQueueCheckboxes}
				selectedIds={selectedQueueIds}
				onSelectChange={handleQueueItemSelectChange}
				onSelectAllToggle={handleQueueSelectAllToggle}
				sort={data.filters.sort ?? 'added-desc'}
				onSort={(field) => {
					const [f, d] = (data.filters.sort || 'added-desc').split('-');
					const newDir = f === field ? (d === 'desc' ? 'asc' : 'desc') : 'desc';
					updateFilters('sort', `${field}-${newDir}`);
				}}
			/>
		{/if}
	{/if}

	<!-- History Tab -->
	{#if activeTab === 'history'}
		<!-- History Filters -->
		<div class="flex flex-wrap items-center gap-3">
			<div class="flex items-center gap-2">
				<Filter class="h-4 w-4 text-base-content/60" />
				<span class="text-sm text-base-content/60">Filters:</span>
			</div>

			<select
				class="select-bordered select select-sm"
				value={data.filters.historyStatus}
				onchange={(e) => updateFilters('historyStatus', e.currentTarget.value)}
			>
				<option value="all">All Statuses</option>
				<option value="imported">Imported</option>
				<option value="streaming">Streaming</option>
				<option value="failed">Failed</option>
				<option value="rejected">Rejected</option>
				<option value="removed">Removed</option>
			</select>

			<select
				class="select-bordered select select-sm"
				value={data.filters.historyMediaType}
				onchange={(e) => updateFilters('historyMediaType', e.currentTarget.value)}
			>
				<option value="all">All Media</option>
				<option value="movie">Movies</option>
				<option value="tv">TV Shows</option>
			</select>

			<!-- Mobile only: Sort by (desktop uses table header clicks) -->
			<select
				class="select-bordered select select-sm lg:hidden"
				value={data.filters.historySort ?? 'date-desc'}
				onchange={(e) => updateFilters('historySort', e.currentTarget.value)}
			>
				<option value="date-desc">Date (Newest)</option>
				<option value="date-asc">Date (Oldest)</option>
				<option value="grabbed-desc">Grabbed (Newest)</option>
				<option value="grabbed-asc">Grabbed (Oldest)</option>
				<option value="completed-desc">Completed (Newest)</option>
				<option value="completed-asc">Completed (Oldest)</option>
				<option value="title-asc">Title (A-Z)</option>
				<option value="title-desc">Title (Z-A)</option>
				<option value="media-asc">Media (Movies first)</option>
				<option value="media-desc">Media (TV first)</option>
				<option value="status-asc">Status (A-Z)</option>
				<option value="status-desc">Status (Z-A)</option>
				<option value="size-desc">Size (Largest)</option>
				<option value="size-asc">Size (Smallest)</option>
				<option value="group-asc">Group (A-Z)</option>
				<option value="group-desc">Group (Z-A)</option>
				<option value="indexer-asc">Indexer (A-Z)</option>
				<option value="indexer-desc">Indexer (Z-A)</option>
			</select>

			{#if data.clients.length > 0}
				<select
					class="select-bordered select select-sm"
					value={data.filters.clientId || 'all'}
					onchange={(e) => updateFilters('clientId', e.currentTarget.value)}
				>
					<option value="all">All Clients</option>
					{#each data.clients as client (client.id)}
						<option value={client.id}>{client.name}</option>
					{/each}
				</select>
			{/if}
		</div>

		<!-- History Table or Empty State -->
		{#if data.historyItems.length === 0}
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<div class="mb-4 rounded-full bg-base-200 p-4">
					<History class="h-8 w-8 text-base-content/40" />
				</div>
				<h3 class="text-lg font-medium">No download history</h3>
				<p class="mt-1 max-w-sm text-base-content/60">
					{#if data.filters.historyStatus !== 'all' || data.filters.historyMediaType !== 'all'}
						No history items match your current filters.
					{:else}
						Completed downloads will appear here once you start adding content.
					{/if}
				</p>
				{#if data.filters.historyStatus !== 'all' || data.filters.historyMediaType !== 'all'}
					<button class="btn mt-4 btn-ghost btn-sm" onclick={() => goto(resolve('/queue'))}>
						Clear Filters
					</button>
				{/if}
			</div>
		{:else}
			<HistoryTable
				items={data.historyItems}
				sort={data.filters.historySort ?? 'date-desc'}
				onSort={(field) => {
					const [f, d] = (data.filters.historySort || 'date-desc').split('-');
					const newDir = f === field ? (d === 'desc' ? 'asc' : 'desc') : 'desc';
					updateFilters('historySort', `${field}-${newDir}`);
				}}
			/>
		{/if}
	{/if}
</div>

{#if activeTab === 'queue' && selectedQueueCount > 0}
	<QueueBulkActionBar
		selectedCount={selectedQueueCount}
		loading={bulkLoading}
		onRemove={() => (isBulkRemoveModalOpen = true)}
		onClear={clearQueueSelection}
	/>
{/if}

<QueueBulkRemoveModal
	open={isBulkRemoveModalOpen}
	selectedCount={selectedQueueCount}
	selectedIds={[...selectedQueueIds]}
	loading={bulkLoading}
	onCancel={() => (isBulkRemoveModalOpen = false)}
	onSubmitting={() => (bulkLoading = true)}
	onDone={handleBulkRemoveDone}
/>

<QueueBulkRemoveModal
	open={failedModalOpen}
	selectedCount={failedCount}
	selectedIds={failedIds}
	loading={failedModalLoading}
	onCancel={() => {
		failedModalOpen = false;
		failedModalLoading = false;
	}}
	onSubmitting={() => (failedModalLoading = true)}
	onDone={handleFailedModalDone}
/>
