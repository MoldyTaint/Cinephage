<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Plus, Search } from 'lucide-svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { PageData, ActionData } from './$types';
	import type { SubtitleProviderConfig } from '$lib/server/subtitles/types';
	import type { ProviderDefinition } from '$lib/server/subtitles/providers/interfaces';

	import {
		SubtitleProviderTable,
		SubtitleProviderModal,
		SubtitleProviderBulkActions
	} from '$lib/components/subtitleProviders';
	import { toasts } from '$lib/stores/toast.svelte';
	import { ConfirmationModal } from '$lib/components/ui/modal';

	interface SubtitleProviderFormData {
		name: string;
		implementation: string;
		enabled: boolean;
		priority: number;
		apiKey?: string;
		username?: string;
		password?: string;
		requestsPerMinute: number;
		settings?: Record<string, unknown>;
	}

	interface SubtitleProviderWithDefinition extends SubtitleProviderConfig {
		definitionName?: string;
		definition?: ProviderDefinition;
	}

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Modal state
	let modalOpen = $state(false);
	let modalMode = $state<'add' | 'edit'>('add');
	let editingProvider = $state<SubtitleProviderWithDefinition | null>(null);
	let saving = $state(false);

	// Test state
	let testingIds = new SvelteSet<string>();
	let bulkLoading = $state(false);
	let selectedIds = new SvelteSet<string>();

	// Confirmation dialog state
	let confirmDeleteOpen = $state(false);
	let deleteTarget = $state<SubtitleProviderWithDefinition | null>(null);
	let confirmBulkDeleteOpen = $state(false);

	// Sort state
	type SortColumn = 'name' | 'priority' | 'enabled';
	let sort = $state<{ column: SortColumn; direction: 'asc' | 'desc' }>({
		column: 'priority',
		direction: 'asc'
	});

	interface SubtitleProviderPageFilters {
		status: 'all' | 'enabled' | 'disabled';
		search: string;
	}

	let filters = $state<SubtitleProviderPageFilters>({
		status: 'all',
		search: ''
	});

	function updateFilter<K extends keyof SubtitleProviderPageFilters>(
		key: K,
		value: SubtitleProviderPageFilters[K]
	) {
		filters = { ...filters, [key]: value };
	}

	const filteredProviders = $derived(() => {
		let result = [...data.providers] as SubtitleProviderWithDefinition[];

		if (filters.status === 'enabled') {
			result = result.filter((provider) => !!provider.enabled);
		} else if (filters.status === 'disabled') {
			result = result.filter((provider) => !provider.enabled);
		}

		const query = filters.search.trim().toLowerCase();
		if (query) {
			result = result.filter((provider) => {
				const definitionName =
					provider.definitionName ?? provider.definition?.name ?? provider.implementation;
				return (
					provider.name.toLowerCase().includes(query) ||
					provider.implementation.toLowerCase().includes(query) ||
					definitionName.toLowerCase().includes(query)
				);
			});
		}

		return result;
	});

	// Derived: filtered + sorted providers
	const sortedProviders = $derived(() => {
		let result = [...filteredProviders()] as SubtitleProviderWithDefinition[];

		result.sort((a, b) => {
			let comparison = 0;
			switch (sort.column) {
				case 'name':
					comparison = a.name.localeCompare(b.name);
					break;
				case 'priority':
					comparison = a.priority - b.priority;
					break;
				case 'enabled':
					comparison = (a.enabled ? 1 : 0) - (b.enabled ? 1 : 0);
					break;
			}
			return sort.direction === 'asc' ? comparison : -comparison;
		});

		return result;
	});

	const canReorder = $derived(() => filters.status === 'all' && filters.search.trim().length === 0);

	// Functions
	function openAddModal() {
		modalMode = 'add';
		editingProvider = null;
		modalOpen = true;
	}

	function openEditModal(provider: SubtitleProviderWithDefinition) {
		modalMode = 'edit';
		editingProvider = provider;
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		editingProvider = null;
	}

	function handleSort(column: SortColumn) {
		if (sort.column === column) {
			sort = { column, direction: sort.direction === 'asc' ? 'desc' : 'asc' };
		} else {
			sort = { column, direction: 'asc' };
		}
	}

	function confirmDelete(provider: SubtitleProviderWithDefinition) {
		deleteTarget = provider;
		confirmDeleteOpen = true;
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
			for (const provider of sortedProviders()) {
				selectedIds.add(provider.id);
			}
		} else {
			selectedIds.clear();
		}
	}

	async function testProviderConnection(provider: SubtitleProviderWithDefinition) {
		const response = await fetch('/api/subtitles/providers/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				implementation: provider.implementation,
				apiKey: provider.apiKey,
				username: provider.username,
				password: provider.password
			})
		});
		return response.json();
	}

	async function handleTest(provider: SubtitleProviderWithDefinition) {
		testingIds.add(provider.id);
		try {
			const result = await testProviderConnection(provider);
			if (!result.success) {
				toasts.error(`Test failed: ${result.message || result.error || 'Connection test failed'}`);
			} else {
				toasts.success(`Connection successful! (${result.responseTime}ms)`);
			}
		} catch (e) {
			toasts.error(`Test failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
		} finally {
			testingIds.delete(provider.id);
		}
	}

	async function handleToggle(provider: SubtitleProviderWithDefinition) {
		try {
			const form = new FormData();
			form.append('id', provider.id);
			form.append('enabled', (!provider.enabled).toString());
			await fetch(`?/toggleProvider`, {
				method: 'POST',
				body: form
			});
			await invalidateAll();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Failed to update provider state');
		}
	}

	async function handleBulkEnable() {
		if (selectedIds.size === 0) return;
		bulkLoading = true;
		try {
			const form = new FormData();
			form.append('ids', JSON.stringify([...selectedIds]));
			const response = await fetch(`?/bulkEnable`, { method: 'POST', body: form });
			if (!response.ok) {
				const result = await response.json();
				toasts.error(result?.data?.providerError ?? 'Failed to enable selected providers');
				return;
			}

			await invalidateAll();
			selectedIds.clear();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Failed to enable selected providers');
		} finally {
			bulkLoading = false;
		}
	}

	async function handleBulkDisable() {
		if (selectedIds.size === 0) return;
		bulkLoading = true;
		try {
			const form = new FormData();
			form.append('ids', JSON.stringify([...selectedIds]));
			const response = await fetch(`?/bulkDisable`, { method: 'POST', body: form });
			if (!response.ok) {
				const result = await response.json();
				toasts.error(result?.data?.providerError ?? 'Failed to disable selected providers');
				return;
			}

			await invalidateAll();
			selectedIds.clear();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Failed to disable selected providers');
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
			const form = new FormData();
			form.append('ids', JSON.stringify([...selectedIds]));
			const response = await fetch(`?/bulkDelete`, { method: 'POST', body: form });
			if (!response.ok) {
				const result = await response.json();
				toasts.error(result?.data?.providerError ?? 'Failed to delete selected providers');
				return;
			}

			await invalidateAll();
			selectedIds.clear();
			confirmBulkDeleteOpen = false;
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Failed to delete selected providers');
		} finally {
			bulkLoading = false;
		}
	}

	async function handleBulkTest() {
		if (selectedIds.size === 0) return;
		bulkLoading = true;

		let successCount = 0;
		let failCount = 0;
		try {
			for (const id of selectedIds) {
				const provider = data.providers.find((p) => p.id === id) as
					| SubtitleProviderWithDefinition
					| undefined;
				if (!provider) continue;

				const result = await testProviderConnection(provider);
				if (result.success) {
					successCount += 1;
				} else {
					failCount += 1;
				}
			}

			toasts.info(`Bulk test complete: ${successCount} passed, ${failCount} failed`);
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Failed to test selected providers');
		} finally {
			bulkLoading = false;
		}
	}

	async function handleModalTest(
		formData: SubtitleProviderFormData
	): Promise<{ success: boolean; error?: string }> {
		try {
			const response = await fetch('/api/subtitles/providers/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					implementation: formData.implementation,
					apiKey: formData.apiKey,
					username: formData.username,
					password: formData.password
				})
			});
			return await response.json();
		} catch (e) {
			return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
		}
	}

	async function handleSave(formData: SubtitleProviderFormData) {
		saving = true;
		try {
			const form = new FormData();
			form.append('data', JSON.stringify(formData));

			if (modalMode === 'edit' && editingProvider) {
				form.append('id', editingProvider.id);
				await fetch(`?/updateProvider`, {
					method: 'POST',
					body: form
				});
			} else {
				await fetch(`?/createProvider`, {
					method: 'POST',
					body: form
				});
			}

			await invalidateAll();
			closeModal();
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!editingProvider) return;
		const form = new FormData();
		form.append('id', editingProvider.id);
		await fetch(`?/deleteProvider`, {
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
		await fetch(`?/deleteProvider`, {
			method: 'POST',
			body: form
		});
		await invalidateAll();
		confirmDeleteOpen = false;
		deleteTarget = null;
	}

	async function handleReorder(providerIds: string[]) {
		try {
			const response = await fetch('/api/subtitles/providers/reorder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ providerIds })
			});

			if (!response.ok) {
				const error = await response.json();
				console.error('Failed to reorder providers:', error);
				return;
			}

			await invalidateAll();
		} catch (e) {
			console.error('Failed to reorder providers:', e);
		}
	}
</script>

<div class="w-full p-3 sm:p-4">
	<div class="mb-5 sm:mb-6">
		<h1 class="text-xl font-bold sm:text-2xl">Subtitle Providers</h1>
		<p class="text-base-content/70">
			Configure subtitle providers for automatic subtitle search and download.
		</p>
	</div>

	<div class="mb-4 flex items-center justify-end">
		<button class="btn w-full gap-2 btn-sm btn-primary sm:w-auto" onclick={openAddModal}>
			<Plus class="h-4 w-4" />
			Add Provider
		</button>
	</div>

	<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
		<div class="form-control relative w-full sm:w-56">
			<Search
				class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-base-content/40"
			/>
			<input
				type="text"
				placeholder="Search providers..."
				class="input input-sm w-full rounded-full border-base-content/20 bg-base-200/60 pr-4 pl-10 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none"
				value={filters.search}
				oninput={(e) => updateFilter('search', e.currentTarget.value)}
			/>
		</div>

		<div class="join w-full sm:w-auto">
			<button
				class="btn join-item flex-1 btn-sm sm:flex-none"
				class:btn-active={filters.status === 'all'}
				onclick={() => updateFilter('status', 'all')}
			>
				All
			</button>
			<button
				class="btn join-item flex-1 btn-sm sm:flex-none"
				class:btn-active={filters.status === 'enabled'}
				onclick={() => updateFilter('status', 'enabled')}
			>
				Enabled
			</button>
			<button
				class="btn join-item flex-1 btn-sm sm:flex-none"
				class:btn-active={filters.status === 'disabled'}
				onclick={() => updateFilter('status', 'disabled')}
			>
				Disabled
			</button>
		</div>
	</div>

	{#if form?.providerError}
		<div class="mb-4 alert alert-error">
			<span>{form.providerError}</span>
		</div>
	{/if}

	{#if form?.providerSuccess}
		<div class="mb-4 alert alert-success">
			<span>Operation completed successfully!</span>
		</div>
	{/if}

	{#if selectedIds.size > 0}
		<SubtitleProviderBulkActions
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
			<SubtitleProviderTable
				providers={sortedProviders()}
				{selectedIds}
				{sort}
				{testingIds}
				onSelect={handleSelect}
				onSelectAll={handleSelectAll}
				onSort={handleSort}
				onEdit={openEditModal}
				onDelete={confirmDelete}
				onTest={handleTest}
				onToggle={handleToggle}
				onReorder={canReorder() ? handleReorder : undefined}
			/>
		</div>
	</div>
</div>

<!-- Add/Edit Modal -->
<SubtitleProviderModal
	open={modalOpen}
	mode={modalMode}
	provider={editingProvider}
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
		<div class="modal-box w-full max-w-[min(28rem,calc(100vw-2rem))] wrap-break-word">
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

<ConfirmationModal
	open={confirmBulkDeleteOpen}
	title="Confirm Delete"
	messagePrefix="Are you sure you want to delete "
	messageEmphasis={`${selectedIds.size} subtitle provider(s)`}
	messageSuffix="? This action cannot be undone."
	confirmLabel="Delete"
	confirmVariant="error"
	loading={bulkLoading}
	onConfirm={handleConfirmBulkDelete}
	onCancel={() => (confirmBulkDeleteOpen = false)}
/>
