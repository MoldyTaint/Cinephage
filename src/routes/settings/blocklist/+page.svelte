<script lang="ts">
	import { Search, Ban, Clock } from 'lucide-svelte';
	import { SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';
	import { toasts } from '$lib/stores/toast.svelte';
	import { SettingsPage } from '$lib/components/ui/settings';
	import { ConfirmationModal } from '$lib/components/ui/modal';
	import { BlocklistTable, BlocklistBulkActions } from '$lib/components/blocklist';

	interface BlocklistEntry {
		id: string;
		title: string;
		infoHash: string | null;
		indexerId: string | null;
		movieId: string | null;
		seriesId: string | null;
		episodeIds: string[] | null;
		reason: string;
		message: string | null;
		sourceTitle: string | null;
		quality: { resolution?: string; source?: string; codec?: string; hdr?: string } | null;
		size: number | null;
		protocol: string | null;
		createdAt: string | null;
		expiresAt: string | null;
	}

	let { data }: { data: { entries: BlocklistEntry[]; total: number } } = $props();

	let entries = $state<BlocklistEntry[]>(data.entries);
	let total = $state(data.total);
	let selectedIds = new SvelteSet<string>();
	let bulkLoading = $state(false);

	let confirmDeleteOpen = $state(false);
	let deleteTarget = $state<BlocklistEntry | null>(null);
	let confirmBulkDeleteOpen = $state(false);
	let confirmPurgeExpiredOpen = $state(false);

	interface BlocklistFilters {
		reason: string;
		protocol: string;
		activeOnly: boolean;
		search: string;
	}

	interface BlocklistSortState {
		column: 'title' | 'reason' | 'createdAt' | 'expiresAt';
		direction: 'asc' | 'desc';
	}

	let filters = $state<BlocklistFilters>({
		reason: '',
		protocol: '',
		activeOnly: false,
		search: ''
	});

	let sort = $state<BlocklistSortState>({
		column: 'createdAt',
		direction: 'desc'
	});

	async function fetchEntries() {
		try {
			const params = new SvelteURLSearchParams();
			if (filters.reason) params.set('reason', filters.reason);
			if (filters.protocol) params.set('protocol', filters.protocol);
			if (filters.activeOnly) params.set('activeOnly', 'true');

			const res = await fetch(`/api/settings/blocklist?${params.toString()}`);
			if (!res.ok) throw new Error('Failed to fetch');
			const result = await res.json();
			entries = result.entries;
			total = result.total;
		} catch (err) {
			toasts.error(err instanceof Error ? err.message : 'Failed to load blocklist');
		}
	}

	const filteredEntries = $derived.by(() => {
		let result = [...entries];
		const query = filters.search.trim().toLowerCase();
		if (query) {
			result = result.filter(
				(e) =>
					e.title.toLowerCase().includes(query) || (e.message ?? '').toLowerCase().includes(query)
			);
		}
		const direction = sort.direction === 'asc' ? 1 : -1;
		result.sort((a, b) => {
			switch (sort.column) {
				case 'title':
					return direction * a.title.localeCompare(b.title);
				case 'reason':
					return direction * a.reason.localeCompare(b.reason);
				case 'createdAt':
					return direction * (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
				case 'expiresAt':
					return direction * (a.expiresAt ?? '').localeCompare(b.expiresAt ?? '');
				default:
					return 0;
			}
		});
		return result;
	});

	function handleSort(column: typeof sort.column) {
		if (sort.column === column) {
			sort.direction = sort.direction === 'asc' ? 'desc' : 'asc';
		} else {
			sort.column = column;
			sort.direction = 'asc';
		}
	}

	function handleSelect(id: string, selected: boolean) {
		if (selected) selectedIds.add(id);
		else selectedIds.delete(id);
	}

	function handleSelectAll(selected: boolean) {
		selectedIds.clear();
		if (selected) {
			for (const e of filteredEntries) selectedIds.add(e.id);
		}
	}

	function handleDelete(entry: BlocklistEntry) {
		deleteTarget = entry;
		confirmDeleteOpen = true;
	}

	async function confirmDelete() {
		if (!deleteTarget) return;
		try {
			const res = await fetch('/api/settings/blocklist', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: [deleteTarget.id] })
			});
			if (!res.ok) throw new Error('Failed to delete');
			toasts.success('Entry removed from blocklist');
			await fetchEntries();
		} catch (err) {
			toasts.error(err instanceof Error ? err.message : 'Failed to delete entry');
		} finally {
			confirmDeleteOpen = false;
			deleteTarget = null;
			selectedIds.clear();
		}
	}

	async function confirmBulkDelete() {
		try {
			bulkLoading = true;
			const ids = Array.from(selectedIds);
			const res = await fetch('/api/settings/blocklist', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids })
			});
			if (!res.ok) throw new Error('Failed to delete');
			toasts.success(`${ids.length} entries removed`);
			selectedIds.clear();
			await fetchEntries();
		} catch (err) {
			toasts.error(err instanceof Error ? err.message : 'Failed to delete entries');
		} finally {
			confirmBulkDeleteOpen = false;
			bulkLoading = false;
		}
	}

	async function confirmPurgeExpired() {
		try {
			bulkLoading = true;
			const res = await fetch('/api/settings/blocklist', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'purgeExpired' })
			});
			if (!res.ok) throw new Error('Failed to purge');
			toasts.success('Expired entries purged');
			await fetchEntries();
		} catch (err) {
			toasts.error(err instanceof Error ? err.message : 'Failed to purge expired entries');
		} finally {
			confirmPurgeExpiredOpen = false;
			bulkLoading = false;
		}
	}

	const bulkDeleteMessage = $derived(
		`Remove ${selectedIds.size} ${selectedIds.size === 1 ? 'entry' : 'entries'} from the blocklist?`
	);
</script>

<SettingsPage title="Blocklist" subtitle="Manage blocked releases that won't be re-downloaded">
	{#snippet actions()}
		<button class="btn gap-1 btn-ghost btn-sm" onclick={() => (confirmPurgeExpiredOpen = true)}>
			<Clock class="h-4 w-4" />
			Purge Expired
		</button>
	{/snippet}

	<div class="mb-4 flex flex-wrap items-center gap-2">
		<div class="form-control relative w-full sm:w-56">
			<Search
				class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-base-content/40"
			/>
			<input
				type="text"
				placeholder="Search releases..."
				class="input input-sm w-full rounded-full border-base-content/20 bg-base-200/60 pr-4 pl-10 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none"
				bind:value={filters.search}
			/>
		</div>

		<select class="select-bordered select select-sm" bind:value={filters.reason}>
			<option value="">All Reasons</option>
			<option value="download_failed">Download Failed</option>
			<option value="import_failed">Import Failed</option>
			<option value="quality_mismatch">Quality Mismatch</option>
			<option value="manual">Manual</option>
			<option value="duplicate">Duplicate</option>
			<option value="bad_release">Bad Release</option>
		</select>

		<select class="select-bordered select select-sm" bind:value={filters.protocol}>
			<option value="">All Protocols</option>
			<option value="torrent">Torrent</option>
			<option value="usenet">Usenet</option>
			<option value="streaming">Streaming</option>
		</select>

		<label class="label cursor-pointer gap-2">
			<input type="checkbox" class="checkbox checkbox-xs" bind:checked={filters.activeOnly} />
			<span class="label-text text-sm">Active only</span>
		</label>

		<span class="text-sm text-base-content/60">
			{total}
			{total === 1 ? 'entry' : 'entries'}
		</span>
	</div>

	{#if selectedIds.size > 0}
		<BlocklistBulkActions
			selectedCount={selectedIds.size}
			loading={bulkLoading}
			onDelete={() => (confirmBulkDeleteOpen = true)}
			onPurgeExpired={() => (confirmPurgeExpiredOpen = true)}
		/>
	{/if}

	<div class="card bg-base-200/40 shadow-none sm:bg-base-100 sm:shadow-xl">
		<div class="card-body p-2 sm:p-0">
			{#if filteredEntries.length > 0}
				<BlocklistTable
					entries={filteredEntries}
					{selectedIds}
					onSelect={handleSelect}
					onSelectAll={handleSelectAll}
					{sort}
					onSort={handleSort}
					onDelete={handleDelete}
				/>
			{:else}
				<div class="py-12 text-center text-base-content/50">
					<Ban class="mx-auto mb-4 h-12 w-12 opacity-40" />
					<p class="text-lg font-medium">No blocklisted releases</p>
					<p class="mt-1 text-sm">
						Blocked releases will appear here when downloads fail repeatedly.
					</p>
				</div>
			{/if}
		</div>
	</div>
</SettingsPage>

<ConfirmationModal
	open={confirmDeleteOpen}
	onCancel={() => (confirmDeleteOpen = false)}
	onConfirm={confirmDelete}
	title="Remove from Blocklist"
	message="Remove this release from the blocklist? It may be grabbed again by monitoring."
	confirmLabel="Remove"
	confirmVariant="error"
/>

<ConfirmationModal
	open={confirmBulkDeleteOpen}
	onCancel={() => (confirmBulkDeleteOpen = false)}
	onConfirm={confirmBulkDelete}
	title="Remove Selected"
	message={bulkDeleteMessage}
	confirmLabel={`Remove ${selectedIds.size}`}
	confirmVariant="error"
/>

<ConfirmationModal
	open={confirmPurgeExpiredOpen}
	onCancel={() => (confirmPurgeExpiredOpen = false)}
	onConfirm={confirmPurgeExpired}
	title="Purge Expired Entries"
	message="Remove all expired blocklist entries? This cannot be undone."
	confirmLabel="Purge"
	confirmVariant="warning"
/>
