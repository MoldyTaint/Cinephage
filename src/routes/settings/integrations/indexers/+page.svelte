<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Plus } from 'lucide-svelte';
	import type { PageData, ActionData } from './$types';
	import type {
		Indexer,
		IndexerWithStatus,
		IndexerFilters as IIndexerFilters,
		IndexerSort,
		IndexerFormData
	} from '$lib/types/indexer';

	import IndexerTable from '$lib/components/indexers/IndexerTable.svelte';
	import IndexerFilters from '$lib/components/indexers/IndexerFilters.svelte';
	import IndexerBulkActions from '$lib/components/indexers/IndexerBulkActions.svelte';
	import IndexerModal from '$lib/components/indexers/IndexerModal.svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import { SvelteSet } from 'svelte/reactivity';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Indexer Modal state
	let modalOpen = $state(false);
	let modalMode = $state<'add' | 'edit'>('add');
	let editingIndexer = $state<Indexer | null>(null);
	let saving = $state(false);

	// Selection state
	let selectedIds = new SvelteSet<string>();
	let testingIds = new SvelteSet<string>();
	let bulkLoading = $state(false);

	// Filter state
	let filters = $state<IIndexerFilters>({
		protocol: 'all',
		status: 'all',
		search: ''
	});

	// Sort state
	let sort = $state<IndexerSort>({
		column: 'priority',
		direction: 'asc'
	});

	// Confirmation dialog state
	let confirmDeleteOpen = $state(false);
	let deleteTarget = $state<Indexer | null>(null);

	// Derived: filtered and sorted indexers
	const filteredIndexers = $derived(() => {
		let result = [...data.indexers] as IndexerWithStatus[];

		// Add definition names
		result = result.map((indexer) => ({
			...indexer,
			definitionName: data.definitions.find((d) => d.id === indexer.definitionId)?.name
		}));

		// Apply filters
		if (filters.protocol !== 'all') {
			result = result.filter((i) => i.protocol === filters.protocol);
		}
		if (filters.status === 'enabled') {
			result = result.filter((i) => i.enabled);
		} else if (filters.status === 'disabled') {
			result = result.filter((i) => !i.enabled);
		}
		if (filters.search) {
			const search = filters.search.toLowerCase();
			result = result.filter(
				(i) =>
					i.name.toLowerCase().includes(search) || i.definitionId.toLowerCase().includes(search)
			);
		}

		// Apply sort
		result.sort((a, b) => {
			let comparison = 0;
			switch (sort.column) {
				case 'name':
					comparison = a.name.localeCompare(b.name);
					break;
				case 'priority':
					comparison = a.priority - b.priority;
					break;
				case 'protocol':
					comparison = a.protocol.localeCompare(b.protocol);
					break;
				case 'enabled':
					comparison = (a.enabled ? 1 : 0) - (b.enabled ? 1 : 0);
					break;
			}
			return sort.direction === 'asc' ? comparison : -comparison;
		});

		return result;
	});

	// Functions
	function openAddModal() {
		modalMode = 'add';
		editingIndexer = null;
		modalOpen = true;
	}

	function openEditModal(indexer: IndexerWithStatus) {
		modalMode = 'edit';
		editingIndexer = indexer;
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		editingIndexer = null;
	}

	function handleSelect(id: string, selected: boolean) {
		if (selected) {
			selectedIds.add(id);
		} else {
			selectedIds.delete(id);
		}
	}

	function handleSelectAll(selected: boolean) {
		if (selected) {
			for (const indexer of filteredIndexers()) {
				selectedIds.add(indexer.id);
			}
		} else {
			selectedIds.clear();
		}
	}

	function handleSort(column: IndexerSort['column']) {
		if (sort.column === column) {
			sort = { column, direction: sort.direction === 'asc' ? 'desc' : 'asc' };
		} else {
			sort = { column, direction: 'asc' };
		}
	}

	function handleFilterChange(newFilters: IIndexerFilters) {
		filters = newFilters;
	}

	function confirmDelete(indexer: IndexerWithStatus) {
		deleteTarget = indexer;
		confirmDeleteOpen = true;
	}

	async function handleTest(indexer: IndexerWithStatus) {
		testingIds.add(indexer.id);
		try {
			const response = await fetch('/api/indexers/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: indexer.name,
					definitionId: indexer.definitionId,
					baseUrl: indexer.baseUrl,
					settings: indexer.settings
				})
			});
			const result = await response.json();
			if (!result.success) {
				toasts.error(`Test failed: ${result.error}`);
			} else {
				toasts.success('Connection successful!');
			}
		} catch (e) {
			toasts.error(`Test failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
		} finally {
			testingIds.delete(indexer.id);
		}
	}

	async function handleModalTest(
		formData: IndexerFormData
	): Promise<{ success: boolean; error?: string }> {
		try {
			const response = await fetch('/api/indexers/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: formData.name,
					definitionId: formData.definitionId,
					baseUrl: formData.baseUrl,
					protocol: formData.protocol,
					settings: formData.settings
				})
			});
			return await response.json();
		} catch (e) {
			return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
		}
	}

	async function handleSave(formData: IndexerFormData) {
		saving = true;
		try {
			const form = new FormData();
			form.append(
				'data',
				JSON.stringify({
					name: formData.name,
					definitionId: formData.definitionId,
					baseUrl: formData.baseUrl,
					alternateUrls: formData.alternateUrls,
					enabled: formData.enabled,
					priority: formData.priority,
					protocol: formData.protocol,
					settings: formData.settings,

					// Search capability toggles
					enableAutomaticSearch: formData.enableAutomaticSearch,
					enableInteractiveSearch: formData.enableInteractiveSearch,

					// Torrent seeding settings
					minimumSeeders: formData.minimumSeeders,
					seedRatio: formData.seedRatio,
					seedTime: formData.seedTime,
					packSeedTime: formData.packSeedTime,
					preferMagnetUrl: formData.preferMagnetUrl,
					rejectDeadTorrents: formData.rejectDeadTorrents
				})
			);

			let response: Response;
			const headers = { Accept: 'application/json' };
			if (modalMode === 'edit' && editingIndexer) {
				form.append('id', editingIndexer.id);
				response = await fetch(`?/updateIndexer`, {
					method: 'POST',
					body: form,
					headers
				});
			} else {
				response = await fetch(`?/createIndexer`, {
					method: 'POST',
					body: form,
					headers
				});
			}

			// Check for errors in the response
			if (!response.ok) {
				const result = await response.json();
				toasts.error(result.data?.indexerError ?? 'Failed to save indexer');
				return;
			}

			await invalidateAll();
			closeModal();
			toasts.success(modalMode === 'edit' ? 'Indexer updated' : 'Indexer created');
		} catch (e) {
			toasts.error(`Failed to save: ${e instanceof Error ? e.message : 'Unknown error'}`);
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!editingIndexer) return;
		const form = new FormData();
		form.append('id', editingIndexer.id);
		await fetch(`?/deleteIndexer`, {
			method: 'POST',
			body: form
		});
		await invalidateAll();
		closeModal();
	}

	async function handleConfirmDelete() {
		if (!deleteTarget) return;
		const form = new FormData();
		form.append('id', deleteTarget.id);
		await fetch(`?/deleteIndexer`, {
			method: 'POST',
			body: form
		});
		await invalidateAll();
		confirmDeleteOpen = false;
		deleteTarget = null;
	}

	async function handleBulkEnable() {
		bulkLoading = true;
		try {
			const form = new FormData();
			form.append('ids', JSON.stringify([...selectedIds]));
			await fetch(`?/bulkEnable`, { method: 'POST', body: form });
			await invalidateAll();
			selectedIds.clear();
		} finally {
			bulkLoading = false;
		}
	}

	async function handleBulkDisable() {
		bulkLoading = true;
		try {
			const form = new FormData();
			form.append('ids', JSON.stringify([...selectedIds]));
			await fetch(`?/bulkDisable`, { method: 'POST', body: form });
			await invalidateAll();
			selectedIds.clear();
		} finally {
			bulkLoading = false;
		}
	}

	async function handleBulkDelete() {
		if (!confirm(`Delete ${selectedIds.size} indexer(s)?`)) return;
		bulkLoading = true;
		try {
			const form = new FormData();
			form.append('ids', JSON.stringify([...selectedIds]));
			await fetch(`?/bulkDelete`, { method: 'POST', body: form });
			await invalidateAll();
			selectedIds.clear();
		} finally {
			bulkLoading = false;
		}
	}

	async function handleBulkTest() {
		const ids = [...selectedIds];
		for (const id of ids) {
			const indexer = data.indexers.find((i) => i.id === id);
			if (indexer) {
				await handleTest(indexer as IndexerWithStatus);
			}
		}
	}
</script>

<div class="w-full p-4">
	<div class="mb-6">
		<h1 class="text-2xl font-bold">Indexers</h1>
		<p class="text-base-content/70">Configure torrent and usenet indexers for content search.</p>
	</div>

	<div class="mb-4 flex items-center justify-end">
		<button class="btn gap-2 btn-primary" onclick={openAddModal}>
			<Plus class="h-4 w-4" />
			Add Indexer
		</button>
	</div>

	{#if data.definitionErrors && data.definitionErrors.length > 0}
		<div class="mb-4 alert alert-warning">
			<div>
				<span class="font-semibold"
					>{data.definitionErrors.length} indexer definition(s) failed to load:</span
				>
				<ul class="mt-1 list-inside list-disc text-sm">
					{#each data.definitionErrors.slice(0, 3) as error}
						<li class="truncate">{error.filePath}: {error.error}</li>
					{/each}
					{#if data.definitionErrors.length > 3}
						<li>... and {data.definitionErrors.length - 3} more</li>
					{/if}
				</ul>
			</div>
		</div>
	{/if}

	{#if form?.indexerError}
		<div class="mb-4 alert alert-error">
			<span>{form.indexerError}</span>
		</div>
	{/if}

	{#if form?.indexerSuccess}
		<div class="mb-4 alert alert-success">
			<span>Operation completed successfully!</span>
		</div>
	{/if}

	<IndexerFilters {filters} onFilterChange={handleFilterChange} />

	{#if selectedIds.size > 0}
		<IndexerBulkActions
			selectedCount={selectedIds.size}
			loading={bulkLoading}
			onEnable={handleBulkEnable}
			onDisable={handleBulkDisable}
			onDelete={handleBulkDelete}
			onTestAll={handleBulkTest}
		/>
	{/if}

	<div class="card bg-base-100 shadow-xl">
		<div class="card-body p-0">
			<IndexerTable
				indexers={filteredIndexers()}
				{selectedIds}
				{sort}
				{testingIds}
				onSelect={handleSelect}
				onSelectAll={handleSelectAll}
				onSort={handleSort}
				onEdit={openEditModal}
				onDelete={confirmDelete}
				onTest={handleTest}
			/>
		</div>
	</div>
</div>

<!-- Add/Edit Modal -->
<IndexerModal
	open={modalOpen}
	mode={modalMode}
	indexer={editingIndexer}
	definitions={data.definitions}
	{saving}
	onClose={closeModal}
	onSave={handleSave}
	onDelete={handleDelete}
	onTest={handleModalTest}
/>

<!-- Delete Confirmation Modal -->
{#if confirmDeleteOpen}
	<div class="modal-open modal">
		<div class="modal-box w-full max-w-[min(28rem,calc(100vw-2rem))] break-words">
			<h3 class="text-lg font-bold">Confirm Delete</h3>
			<p class="py-4">
				Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be
				undone.
			</p>
			<div class="modal-action">
				<button class="btn btn-ghost" onclick={() => (confirmDeleteOpen = false)}>Cancel</button>
				<button class="btn btn-error" onclick={handleConfirmDelete}>Delete</button>
			</div>
		</div>
		<button
			type="button"
			class="modal-backdrop cursor-default border-none bg-black/50"
			onclick={() => (confirmDeleteOpen = false)}
			aria-label="Close modal"
		></button>
	</div>
{/if}
