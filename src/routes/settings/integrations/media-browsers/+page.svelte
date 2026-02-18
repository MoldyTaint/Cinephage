<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Plus } from 'lucide-svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { toasts } from '$lib/stores/toast.svelte';
	import type { PageData, ActionData } from './$types';
	import type {
		MediaBrowserServerPublic,
		MediaBrowserTestResult,
		MediaBrowserPathMapping
	} from '$lib/server/notifications/mediabrowser/types';

	import {
		MediaBrowserBulkActions,
		MediaBrowserModal,
		MediaBrowserTable
	} from '$lib/components/mediaBrowsers';
	import { ConfirmationModal } from '$lib/components/ui/modal';

	interface MediaBrowserFormData {
		name: string;
		serverType: 'jellyfin' | 'emby';
		host: string;
		apiKey: string;
		enabled: boolean;
		onImport: boolean;
		onUpgrade: boolean;
		onRename: boolean;
		onDelete: boolean;
		pathMappings: MediaBrowserPathMapping[];
	}

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Modal state
	let modalOpen = $state(false);
	let modalMode = $state<'add' | 'edit'>('add');
	let editingServer = $state<MediaBrowserServerPublic | null>(null);
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let confirmDeleteOpen = $state(false);
	let deleteTarget = $state<MediaBrowserServerPublic | null>(null);
	let confirmBulkDeleteOpen = $state(false);
	let testingId = $state<string | null>(null);
	let bulkLoading = $state(false);
	let selectedIds = new SvelteSet<string>();

	interface MediaBrowserPageFilters {
		type: 'all' | 'jellyfin' | 'emby';
		status: 'all' | 'enabled' | 'disabled';
		search: string;
	}

	interface MediaBrowserSortState {
		column: 'status' | 'name' | 'type';
		direction: 'asc' | 'desc';
	}

	let filters = $state<MediaBrowserPageFilters>({
		type: 'all',
		status: 'all',
		search: ''
	});

	let sort = $state<MediaBrowserSortState>({
		column: 'name',
		direction: 'asc'
	});

	function getStatusSortRank(server: MediaBrowserServerPublic): number {
		if (!server.enabled) return 2;
		if (server.testResult === 'failed') return 1;
		return 0;
	}

	const filteredServers = $derived.by(() => {
		let result = [...data.servers];

		if (filters.type !== 'all') {
			result = result.filter((server) => server.serverType === filters.type);
		}

		if (filters.status === 'enabled') {
			result = result.filter((server) => !!server.enabled);
		} else if (filters.status === 'disabled') {
			result = result.filter((server) => !server.enabled);
		}

		const query = filters.search.trim().toLowerCase();
		if (query) {
			result = result.filter((server) => {
				return (
					server.name.toLowerCase().includes(query) ||
					server.serverType.toLowerCase().includes(query) ||
					server.host.toLowerCase().includes(query) ||
					(server.serverName ?? '').toLowerCase().includes(query) ||
					(server.serverVersion ?? '').toLowerCase().includes(query)
				);
			});
		}

		return result;
	});

	const sortedServers = $derived.by(() => {
		const result = [...filteredServers];
		const direction = sort.direction === 'asc' ? 1 : -1;

		result.sort((a, b) => {
			if (sort.column === 'status') {
				return (getStatusSortRank(a) - getStatusSortRank(b)) * direction;
			}
			if (sort.column === 'type') {
				return a.serverType.localeCompare(b.serverType) * direction;
			}
			return a.name.localeCompare(b.name) * direction;
		});

		return result;
	});

	// Modal Functions
	function openAddModal() {
		modalMode = 'add';
		editingServer = null;
		saveError = null;
		modalOpen = true;
	}

	function openEditModal(server: MediaBrowserServerPublic) {
		modalMode = 'edit';
		editingServer = server;
		saveError = null;
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		editingServer = null;
		saveError = null;
	}

	function updateFilter<K extends keyof MediaBrowserPageFilters>(
		key: K,
		value: MediaBrowserPageFilters[K]
	) {
		filters = { ...filters, [key]: value };
	}

	function updateSort(column: MediaBrowserSortState['column']) {
		if (sort.column === column) {
			sort = {
				...sort,
				direction: sort.direction === 'asc' ? 'desc' : 'asc'
			};
			return;
		}

		sort = {
			column,
			direction: 'asc'
		};
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
			for (const server of sortedServers) {
				selectedIds.add(server.id);
			}
		} else {
			selectedIds.clear();
		}
	}

	async function handleTest(formData: MediaBrowserFormData): Promise<MediaBrowserTestResult> {
		try {
			if (editingServer) {
				// Edit mode: test current form values against saved server context,
				// but do not persist this ad-hoc result to DB status.
				const response = await fetch(`/api/notifications/mediabrowser/${editingServer.id}/test`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						host: formData.host,
						serverType: formData.serverType,
						apiKey: formData.apiKey?.trim() ? formData.apiKey : undefined,
						persist: false
					})
				});
				return await response.json();
			}

			// Add mode: validate unsaved server config directly.
			const response = await fetch('/api/notifications/mediabrowser/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					host: formData.host,
					apiKey: formData.apiKey,
					serverType: formData.serverType
				})
			});
			return await response.json();
		} catch (e) {
			return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
		}
	}

	async function handleSave(formData: MediaBrowserFormData) {
		saving = true;
		saveError = null;
		try {
			const payload: Partial<MediaBrowserFormData> = { ...formData };
			if (modalMode === 'edit' && !payload.apiKey?.trim()) {
				delete payload.apiKey;
			}

			const form = new FormData();
			form.append('data', JSON.stringify(payload));

			let response: Response;
			if (modalMode === 'edit' && editingServer) {
				form.append('id', editingServer.id);
				response = await fetch(`?/updateServer`, {
					method: 'POST',
					body: form
				});
			} else {
				response = await fetch(`?/createServer`, {
					method: 'POST',
					body: form
				});
			}

			const result = await response.json();
			if (result.type === 'failure' || result.data?.serverError) {
				const errorMessage = result.data?.serverError || 'Failed to save server';
				saveError = errorMessage;
				return;
			}

			await invalidateAll();
			closeModal();
		} catch (error) {
			saveError = error instanceof Error ? error.message : 'An unexpected error occurred';
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!editingServer) return;

		const form = new FormData();
		form.append('id', editingServer.id);
		await fetch(`?/deleteServer`, {
			method: 'POST',
			body: form
		});
		await invalidateAll();
		closeModal();
	}

	function confirmDelete(server: MediaBrowserServerPublic) {
		deleteTarget = server;
		confirmDeleteOpen = true;
	}

	async function handleConfirmDelete() {
		if (!deleteTarget) return;

		const form = new FormData();
		form.append('id', deleteTarget.id);
		await fetch(`?/deleteServer`, {
			method: 'POST',
			body: form
		});
		await invalidateAll();
		confirmDeleteOpen = false;
		deleteTarget = null;
	}

	async function handleToggle(server: MediaBrowserServerPublic) {
		const form = new FormData();
		form.append('id', server.id);
		form.append('enabled', (!server.enabled).toString());
		await fetch(`?/toggleServer`, {
			method: 'POST',
			body: form
		});
		await invalidateAll();
	}

	async function handleTestFromTable(server: MediaBrowserServerPublic) {
		testingId = server.id;
		try {
			const response = await fetch(`/api/notifications/mediabrowser/${server.id}/test`, {
				method: 'POST'
			});
			const result = await response.json();
			if (!response.ok || !result.success) {
				toasts.error(result.error ?? 'Connection test failed');
			} else {
				toasts.success('Connection successful!');
			}
		} finally {
			await invalidateAll();
			testingId = null;
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
				toasts.error(result?.data?.serverError ?? 'Failed to enable selected servers');
				return;
			}

			await invalidateAll();
			selectedIds.clear();
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to enable selected servers');
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
				toasts.error(result?.data?.serverError ?? 'Failed to disable selected servers');
				return;
			}

			await invalidateAll();
			selectedIds.clear();
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to disable selected servers');
		} finally {
			bulkLoading = false;
		}
	}

	function handleBulkDelete() {
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
				toasts.error(result?.data?.serverError ?? 'Failed to delete selected servers');
				return;
			}

			await invalidateAll();
			selectedIds.clear();
			confirmBulkDeleteOpen = false;
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to delete selected servers');
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
				const response = await fetch(`/api/notifications/mediabrowser/${id}/test`, {
					method: 'POST'
				});
				const result = await response.json();
				if (response.ok && result.success) {
					successCount += 1;
				} else {
					failCount += 1;
				}
			}

			await invalidateAll();
			toasts.info(`Bulk test complete: ${successCount} passed, ${failCount} failed`);
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to test selected servers');
		} finally {
			bulkLoading = false;
		}
	}
</script>

<div class="w-full p-4">
	<div class="mb-6">
		<h1 class="text-2xl font-bold">Media Servers</h1>
		<p class="text-base-content/70">
			Configure Jellyfin and Emby servers for library update notifications.
		</p>
	</div>

	<div class="mb-4 flex items-center justify-end">
		<button class="btn gap-2 btn-primary" onclick={openAddModal}>
			<Plus class="h-4 w-4" />
			Add Server
		</button>
	</div>

	<div class="mb-4 flex flex-wrap items-center gap-4">
		<div class="form-control w-full sm:w-48">
			<input
				type="text"
				placeholder="Search servers..."
				class="input-bordered input input-sm w-full pl-9"
				value={filters.search}
				oninput={(e) => updateFilter('search', e.currentTarget.value)}
			/>
		</div>

		<div class="join">
			<button
				class="btn join-item btn-sm"
				class:btn-active={filters.type === 'all'}
				onclick={() => updateFilter('type', 'all')}
			>
				All
			</button>
			<button
				class="btn join-item btn-sm"
				class:btn-active={filters.type === 'jellyfin'}
				onclick={() => updateFilter('type', 'jellyfin')}
			>
				Jellyfin
			</button>
			<button
				class="btn join-item btn-sm"
				class:btn-active={filters.type === 'emby'}
				onclick={() => updateFilter('type', 'emby')}
			>
				Emby
			</button>
		</div>

		<div class="join">
			<button
				class="btn join-item btn-sm"
				class:btn-active={filters.status === 'all'}
				onclick={() => updateFilter('status', 'all')}
			>
				All
			</button>
			<button
				class="btn join-item btn-sm"
				class:btn-active={filters.status === 'enabled'}
				onclick={() => updateFilter('status', 'enabled')}
			>
				Enabled
			</button>
			<button
				class="btn join-item btn-sm"
				class:btn-active={filters.status === 'disabled'}
				onclick={() => updateFilter('status', 'disabled')}
			>
				Disabled
			</button>
		</div>
	</div>

	{#if form?.serverError}
		<div class="mb-4 alert alert-error">
			<span>{form.serverError}</span>
		</div>
	{/if}

	{#if form?.serverSuccess}
		<div class="mb-4 alert alert-success">
			<span>Operation completed successfully!</span>
		</div>
	{/if}

	{#if selectedIds.size > 0}
		<MediaBrowserBulkActions
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
			<MediaBrowserTable
				servers={sortedServers}
				{selectedIds}
				onSelect={handleSelect}
				onSelectAll={handleSelectAll}
				{sort}
				onSort={updateSort}
				onEdit={openEditModal}
				onDelete={confirmDelete}
				onToggle={handleToggle}
				onTest={handleTestFromTable}
				{testingId}
			/>
		</div>
	</div>
</div>

<!-- Media Server Modal -->
<MediaBrowserModal
	open={modalOpen}
	mode={modalMode}
	server={editingServer}
	{saving}
	error={saveError}
	onClose={closeModal}
	onSave={handleSave}
	onDelete={handleDelete}
	onTest={handleTest}
/>

<!-- Delete Confirmation Modal -->
<ConfirmationModal
	open={confirmDeleteOpen}
	title="Confirm Delete"
	messagePrefix="Are you sure you want to delete "
	messageEmphasis={deleteTarget?.name ?? 'this media server'}
	messageSuffix="? This action cannot be undone."
	confirmLabel="Delete"
	confirmVariant="error"
	onConfirm={handleConfirmDelete}
	onCancel={() => {
		confirmDeleteOpen = false;
		deleteTarget = null;
	}}
/>

<ConfirmationModal
	open={confirmBulkDeleteOpen}
	title="Confirm Delete"
	messagePrefix="Are you sure you want to delete "
	messageEmphasis={`${selectedIds.size} media server(s)`}
	messageSuffix="? This action cannot be undone."
	confirmLabel="Delete"
	confirmVariant="error"
	loading={bulkLoading}
	onConfirm={handleConfirmBulkDelete}
	onCancel={() => {
		confirmBulkDeleteOpen = false;
	}}
/>
