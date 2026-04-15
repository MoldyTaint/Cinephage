<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Plus } from 'lucide-svelte';
	import type { PageData } from './$types';
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
	import { getResponseErrorMessage, readResponsePayload } from '$lib/utils/http';
	import { SvelteSet } from 'svelte/reactivity';
	import { ConfirmationModal } from '$lib/components/ui/modal';
	import { SettingsPage } from '$lib/components/ui/settings';
	import * as m from '$lib/paraglide/messages.js';

	let { data }: { data: PageData } = $props();

	// Indexer Modal state
	let modalOpen = $state(false);
	let modalMode = $state<'add' | 'edit'>('add');
	let editingIndexer = $state<Indexer | null>(null);
	let saving = $state(false);

	// Selection state
	let selectedIds = new SvelteSet<string>();
	let testingIds = new SvelteSet<string>();
	let togglingIds = new SvelteSet<string>();
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
	let confirmBulkDeleteOpen = $state(false);

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

	const canReorder = $derived(
		filters.protocol === 'all' && filters.status === 'all' && filters.search.trim().length === 0
	);

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

	function handlePrioritySortForReorder() {
		sort = { column: 'priority', direction: 'asc' };
	}

	function confirmDelete(indexer: IndexerWithStatus) {
		deleteTarget = indexer;
		confirmDeleteOpen = true;
	}

	function buildIndexerPayload(formData: IndexerFormData) {
		return {
			name: formData.name,
			definitionId: formData.definitionId,
			baseUrl: formData.baseUrl,
			alternateUrls: formData.alternateUrls,
			enabled: formData.enabled,
			priority: formData.priority,
			protocol: formData.protocol,
			settings: formData.settings,
			enableAutomaticSearch: formData.enableAutomaticSearch,
			enableInteractiveSearch: formData.enableInteractiveSearch,
			minimumSeeders: formData.minimumSeeders,
			seedRatio: formData.seedRatio,
			seedTime: formData.seedTime,
			packSeedTime: formData.packSeedTime,
			rejectDeadTorrents: formData.rejectDeadTorrents
		};
	}

	async function updateIndexerById(
		id: string,
		payload: Record<string, unknown>,
		fallback: string
	): Promise<boolean> {
		const response = await fetch(`/api/indexers/${id}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			const result = await readResponsePayload<Record<string, unknown>>(response);
			throw new Error(getResponseErrorMessage(result, fallback));
		}

		return true;
	}

	async function handleTest(
		indexer: IndexerWithStatus,
		refresh: boolean = true,
		notify: boolean = true
	): Promise<boolean> {
		testingIds.add(indexer.id);
		try {
			const response = await fetch('/api/indexers/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					indexerId: indexer.id,
					name: indexer.name,
					definitionId: indexer.definitionId,
					baseUrl: indexer.baseUrl,
					settings: indexer.settings
				})
			});
			const result = await readResponsePayload<{ success?: boolean; error?: string }>(response);
			if (!response.ok || !result || typeof result === 'string' || !result.success) {
				if (notify) {
					toasts.error(getResponseErrorMessage(result, 'Connection test failed'));
				}
				return false;
			} else {
				if (notify) {
					toasts.success(m.settings_integrations_connectionSuccessful());
				}
				return true;
			}
		} catch (e) {
			if (notify) {
				toasts.error(e instanceof Error ? e.message : 'Connection test failed');
			}
			return false;
		} finally {
			testingIds.delete(indexer.id);
			if (refresh) {
				await invalidateAll();
			}
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
					indexerId: modalMode === 'edit' ? editingIndexer?.id : undefined,
					name: formData.name,
					definitionId: formData.definitionId,
					baseUrl: formData.baseUrl,
					protocol: formData.protocol,
					settings: formData.settings
				})
			});
			const result = await readResponsePayload<{ success?: boolean; error?: string }>(response);
			if (!response.ok || !result || typeof result === 'string') {
				return {
					success: false,
					error: getResponseErrorMessage(result, 'Connection test failed')
				};
			}
			return { success: Boolean(result.success), error: result.error };
		} catch (e) {
			return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
		}
	}

	async function handleSave(formData: IndexerFormData) {
		saving = true;
		try {
			const payload = buildIndexerPayload(formData);
			const response =
				modalMode === 'edit' && editingIndexer
					? await fetch(`/api/indexers/${editingIndexer.id}`, {
							method: 'PUT',
							headers: {
								'Content-Type': 'application/json',
								Accept: 'application/json'
							},
							body: JSON.stringify(payload)
						})
					: await fetch('/api/indexers', {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								Accept: 'application/json'
							},
							body: JSON.stringify(payload)
						});

			if (!response.ok) {
				const result = await readResponsePayload<Record<string, unknown>>(response);
				toasts.error(getResponseErrorMessage(result, 'Failed to save indexer'));
				return;
			}

			await invalidateAll();
			closeModal();
			toasts.success(
				modalMode === 'edit'
					? m.settings_integrations_indexers_updated()
					: m.settings_integrations_indexers_created()
			);
		} catch (e) {
			toasts.error(`Failed to save: ${e instanceof Error ? e.message : 'Unknown error'}`);
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!editingIndexer) return;

		try {
			const response = await fetch(`/api/indexers/${editingIndexer.id}`, {
				method: 'DELETE',
				headers: { Accept: 'application/json' }
			});

			if (!response.ok) {
				const result = await readResponsePayload<Record<string, unknown>>(response);
				throw new Error(getResponseErrorMessage(result, 'Failed to delete indexer'));
			}

			await invalidateAll();
			closeModal();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Failed to delete indexer');
		}
	}

	async function handleConfirmDelete() {
		if (!deleteTarget) return;

		try {
			const response = await fetch(`/api/indexers/${deleteTarget.id}`, {
				method: 'DELETE',
				headers: { Accept: 'application/json' }
			});

			if (!response.ok) {
				const result = await readResponsePayload<Record<string, unknown>>(response);
				throw new Error(getResponseErrorMessage(result, 'Failed to delete indexer'));
			}

			await invalidateAll();
			confirmDeleteOpen = false;
			deleteTarget = null;
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Failed to delete indexer');
		}
	}

	async function handleBulkEnable() {
		bulkLoading = true;
		try {
			for (const id of selectedIds) {
				await updateIndexerById(id, { enabled: true }, 'Failed to enable indexer');
			}
			await invalidateAll();
			selectedIds.clear();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Failed to enable selected indexers');
		} finally {
			bulkLoading = false;
		}
	}

	async function handleBulkDisable() {
		bulkLoading = true;
		try {
			for (const id of selectedIds) {
				await updateIndexerById(id, { enabled: false }, 'Failed to disable indexer');
			}
			await invalidateAll();
			selectedIds.clear();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Failed to disable selected indexers');
		} finally {
			bulkLoading = false;
		}
	}

	async function handleBulkDelete() {
		if (selectedIds.size === 0) return;
		confirmBulkDeleteOpen = true;
	}

	async function handleConfirmBulkDelete() {
		if (selectedIds.size === 0) {
			confirmBulkDeleteOpen = false;
			return;
		}

		bulkLoading = true;
		try {
			for (const id of selectedIds) {
				const response = await fetch(`/api/indexers/${id}`, {
					method: 'DELETE',
					headers: { Accept: 'application/json' }
				});

				if (!response.ok) {
					const result = await readResponsePayload<Record<string, unknown>>(response);
					throw new Error(getResponseErrorMessage(result, 'Failed to delete selected indexers'));
				}
			}
			await invalidateAll();
			selectedIds.clear();
			confirmBulkDeleteOpen = false;
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Failed to delete selected indexers');
		} finally {
			bulkLoading = false;
		}
	}

	async function handleBulkTest() {
		if (selectedIds.size === 0) return;
		bulkLoading = true;
		try {
			const ids = [...selectedIds];
			let successCount = 0;
			let failCount = 0;
			for (const id of ids) {
				const indexer = data.indexers.find((i) => i.id === id);
				if (indexer) {
					const passed = await handleTest(indexer as IndexerWithStatus, false, false);
					if (passed) {
						successCount += 1;
					} else {
						failCount += 1;
					}
				}
			}
			await invalidateAll();
			toasts.info(
				m.settings_integrations_bulkTestComplete({
					successCount: String(successCount),
					failCount: String(failCount)
				})
			);
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Failed to run bulk test');
		} finally {
			bulkLoading = false;
		}
	}

	async function handleToggle(indexer: IndexerWithStatus) {
		if (togglingIds.has(indexer.id)) return;

		togglingIds.add(indexer.id);
		try {
			await updateIndexerById(
				indexer.id,
				{ enabled: !indexer.enabled },
				'Failed to update indexer state'
			);
			await invalidateAll();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Failed to update indexer state');
		} finally {
			togglingIds.delete(indexer.id);
		}
	}

	async function handleReorder(indexerIds: string[]) {
		try {
			for (const [index, id] of indexerIds.entries()) {
				await updateIndexerById(id, { priority: index + 1 }, 'Failed to reorder priorities');
			}

			await invalidateAll();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Failed to reorder priorities');
		}
	}
</script>

<SettingsPage title={m.nav_indexers()} subtitle={m.settings_integrations_indexers_subtitle()}>
	{#snippet actions()}
		<button class="btn w-full gap-2 btn-sm btn-primary sm:w-auto" onclick={openAddModal}>
			<Plus class="h-4 w-4" />
			{m.settings_integrations_indexers_addButton()}
		</button>
	{/snippet}

	{#if data.definitionErrors && data.definitionErrors.length > 0}
		<div class="mb-4 alert alert-warning">
			<div>
				<span class="font-semibold"
					>{m.settings_integrations_indexers_definitionErrors({
						count: data.definitionErrors.length
					})}</span
				>
				<ul class="mt-1 list-inside list-disc text-sm">
					{#each data.definitionErrors.slice(0, 3) as error (error.filePath)}
						<li class="truncate">{error.filePath}: {error.error}</li>
					{/each}
					{#if data.definitionErrors.length > 3}
						<li>... and {data.definitionErrors.length - 3} more</li>
					{/if}
				</ul>
			</div>
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

	<div class="card bg-base-200/40 shadow-none sm:bg-base-100 sm:shadow-xl">
		<div class="card-body p-2 sm:p-0">
			<IndexerTable
				indexers={filteredIndexers()}
				{selectedIds}
				{sort}
				{canReorder}
				{testingIds}
				{togglingIds}
				onSelect={handleSelect}
				onSelectAll={handleSelectAll}
				onSort={handleSort}
				onPrioritySortForReorder={handlePrioritySortForReorder}
				onEdit={openEditModal}
				onDelete={confirmDelete}
				onTest={handleTest}
				onToggle={handleToggle}
				onReorder={handleReorder}
			/>
		</div>
	</div>
</SettingsPage>

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
<ConfirmationModal
	open={confirmDeleteOpen}
	title={m.ui_modal_deleteTitle()}
	messagePrefix={m.settings_integrations_deleteConfirmPrefix()}
	messageEmphasis={deleteTarget?.name ?? ''}
	messageSuffix={m.settings_integrations_deleteConfirmSuffix()}
	confirmLabel={m.action_delete()}
	confirmVariant="error"
	onConfirm={handleConfirmDelete}
	onCancel={() => (confirmDeleteOpen = false)}
/>

<ConfirmationModal
	open={confirmBulkDeleteOpen}
	title={m.ui_modal_deleteTitle()}
	messagePrefix={m.settings_integrations_deleteConfirmPrefix()}
	messageEmphasis={m.settings_integrations_indexers_bulkDeleteCount({ count: selectedIds.size })}
	messageSuffix={m.settings_integrations_deleteConfirmSuffix()}
	confirmLabel={m.action_delete()}
	confirmVariant="error"
	onConfirm={handleConfirmBulkDelete}
	onCancel={() => (confirmBulkDeleteOpen = false)}
/>
