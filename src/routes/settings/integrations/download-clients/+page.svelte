<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Plus } from 'lucide-svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { toFriendlyDownloadClientError } from '$lib/downloadClients/errorMessages';
	import type { PageData, ActionData } from './$types';
	import type {
		DownloadClientFormData,
		ConnectionTestResult,
		UnifiedClientItem
	} from '$lib/types/downloadClient';
	import {
		DownloadClientBulkActions,
		DownloadClientModal,
		DownloadClientTable
	} from '$lib/components/downloadClients';
	import { ConfirmationModal } from '$lib/components/ui/modal';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let modalOpen = $state(false);
	let modalMode = $state<'add' | 'edit'>('add');
	let editingClient = $state<UnifiedClientItem | null>(null);
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let confirmDeleteOpen = $state(false);
	let deleteTarget = $state<UnifiedClientItem | null>(null);
	let confirmBulkDeleteOpen = $state(false);
	let testingId = $state<string | null>(null);
	let bulkLoading = $state(false);
	let selectedIds = new SvelteSet<string>();

	interface DownloadClientPageFilters {
		protocol: 'all' | 'torrent' | 'usenet';
		status: 'all' | 'enabled' | 'disabled';
		search: string;
	}

	interface DownloadClientSortState {
		column: 'status' | 'name' | 'protocol';
		direction: 'asc' | 'desc';
	}

	let filters = $state<DownloadClientPageFilters>({
		protocol: 'all',
		status: 'all',
		search: ''
	});

	let sort = $state<DownloadClientSortState>({
		column: 'name',
		direction: 'asc'
	});

	interface NntpServerFormData {
		name: string;
		host: string;
		port: number;
		useSsl: boolean;
		username: string | null;
		password: string | null;
		maxConnections: number;
		priority: number;
		enabled: boolean;
	}

	const downloadClientRows = $derived(
		data.downloadClients.map(
			(c): UnifiedClientItem => ({
				...c,
				type: 'download-client',
				implementation: c.implementation
			})
		)
	);

	function getClientProtocol(
		implementation: UnifiedClientItem['implementation']
	): 'torrent' | 'usenet' {
		switch (implementation) {
			case 'sabnzbd':
			case 'nzbget':
			case 'nzb-mount':
			case 'nntp':
				return 'usenet';
			default:
				return 'torrent';
		}
	}

	const filteredDownloadClientRows = $derived.by(() => {
		let result = [...downloadClientRows];

		if (filters.protocol !== 'all') {
			result = result.filter(
				(client) => getClientProtocol(client.implementation) === filters.protocol
			);
		}

		if (filters.status === 'enabled') {
			result = result.filter((client) => !!client.enabled);
		} else if (filters.status === 'disabled') {
			result = result.filter((client) => !client.enabled);
		}

		const query = filters.search.trim().toLowerCase();
		if (query) {
			result = result.filter((client) => {
				const hostAndPort = `${client.host}:${client.port}`;
				return (
					client.name.toLowerCase().includes(query) ||
					client.implementation.toLowerCase().includes(query) ||
					client.host.toLowerCase().includes(query) ||
					hostAndPort.toLowerCase().includes(query) ||
					client.movieCategory?.toLowerCase().includes(query) ||
					client.tvCategory?.toLowerCase().includes(query)
				);
			});
		}

		return result;
	});

	function getStatusSortRank(client: UnifiedClientItem): number {
		if (!client.enabled) return 3;

		switch (client.status?.health) {
			case 'failing':
				return 2;
			case 'warning':
				return 1;
			default:
				return 0;
		}
	}

	const sortedDownloadClientRows = $derived.by(() => {
		const result = [...filteredDownloadClientRows];
		const direction = sort.direction === 'asc' ? 1 : -1;

		result.sort((a, b) => {
			if (sort.column === 'status') {
				return (getStatusSortRank(a) - getStatusSortRank(b)) * direction;
			}

			if (sort.column === 'name') {
				return a.name.localeCompare(b.name) * direction;
			}

			const aProtocol = getClientProtocol(a.implementation);
			const bProtocol = getClientProtocol(b.implementation);
			return aProtocol.localeCompare(bProtocol) * direction;
		});

		return result;
	});

	function updateFilter<K extends keyof DownloadClientPageFilters>(
		key: K,
		value: DownloadClientPageFilters[K]
	) {
		filters = { ...filters, [key]: value };
	}

	function updateSort(column: DownloadClientSortState['column']) {
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
			for (const client of sortedDownloadClientRows) {
				selectedIds.add(client.id);
			}
		} else {
			selectedIds.clear();
		}
	}

	function openAddDownloadClientModal() {
		modalMode = 'add';
		editingClient = null;
		saveError = null;
		modalOpen = true;
	}

	function openEditModal(client: UnifiedClientItem) {
		modalMode = 'edit';
		editingClient = client;
		saveError = null;
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		editingClient = null;
		saveError = null;
	}

	async function handleTest(
		formData: DownloadClientFormData | NntpServerFormData,
		isNntp: boolean
	): Promise<ConnectionTestResult> {
		if (isNntp) {
			return {
				success: false,
				error: 'NNTP servers are managed on the NNTP Servers page.'
			};
		}

		const dcFormData = formData as DownloadClientFormData;
		const hasPasswordOverride =
			typeof dcFormData.password === 'string' && dcFormData.password.trim().length > 0;
		const fallbackId =
			modalMode === 'edit' && editingClient && !hasPasswordOverride ? editingClient.id : undefined;

		try {
			const response = await fetch('/api/download-clients/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: fallbackId,
					implementation: dcFormData.implementation,
					host: dcFormData.host,
					port: dcFormData.port,
					useSsl: dcFormData.useSsl,
					urlBase: dcFormData.urlBase,
					mountMode: dcFormData.mountMode,
					username: dcFormData.username || null,
					password: dcFormData.password || null
				})
			});
			return await response.json();
		} catch (e) {
			return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
		}
	}

	async function handleSave(
		formData: DownloadClientFormData | NntpServerFormData,
		isNntp: boolean
	) {
		if (isNntp) {
			saveError = 'NNTP servers are managed on the NNTP Servers page.';
			return;
		}

		saving = true;
		saveError = null;
		try {
			const body = new FormData();
			body.append('data', JSON.stringify(formData as DownloadClientFormData));

			let response: Response;
			if (modalMode === 'edit' && editingClient) {
				body.append('id', editingClient.id);
				response = await fetch(`?/updateDownloadClient`, {
					method: 'POST',
					body
				});
			} else {
				response = await fetch(`?/createDownloadClient`, {
					method: 'POST',
					body
				});
			}

			const result = await response.json();
			if (result.type === 'failure' || result.data?.downloadClientError) {
				saveError = toFriendlyDownloadClientError(
					result.data?.downloadClientError || 'Failed to save download client'
				);
				return;
			}

			await invalidateAll();
			closeModal();
		} catch (error) {
			saveError = toFriendlyDownloadClientError(
				error instanceof Error ? error.message : 'An unexpected error occurred'
			);
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!editingClient) return;

		const body = new FormData();
		body.append('id', editingClient.id);
		await fetch(`?/deleteDownloadClient`, {
			method: 'POST',
			body
		});
		await invalidateAll();
		closeModal();
	}

	function confirmDelete(client: UnifiedClientItem) {
		deleteTarget = client;
		confirmDeleteOpen = true;
	}

	async function handleConfirmDelete() {
		if (!deleteTarget) return;

		const body = new FormData();
		body.append('id', deleteTarget.id);
		await fetch(`?/deleteDownloadClient`, {
			method: 'POST',
			body
		});
		await invalidateAll();
		confirmDeleteOpen = false;
		deleteTarget = null;
	}

	async function handleToggle(client: UnifiedClientItem) {
		const body = new FormData();
		body.append('id', client.id);
		body.append('enabled', (!client.enabled).toString());
		await fetch(`?/toggleDownloadClient`, {
			method: 'POST',
			body
		});
		await invalidateAll();
	}

	async function handleRowTest(client: UnifiedClientItem) {
		testingId = client.id;
		try {
			const response = await fetch(`/api/download-clients/${client.id}/test`, {
				method: 'POST'
			});
			const result = await response.json();
			if (!response.ok || !result.success) {
				toasts.error(toFriendlyDownloadClientError(result.error || 'Connection test failed'));
				return;
			}

			toasts.success('Connection successful!');
		} catch (error) {
			toasts.error(
				toFriendlyDownloadClientError(
					error instanceof Error ? error.message : 'Connection test failed'
				)
			);
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
				toasts.error(result?.data?.downloadClientError ?? 'Failed to enable selected clients');
				return;
			}

			await invalidateAll();
			selectedIds.clear();
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to enable selected clients');
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
				toasts.error(result?.data?.downloadClientError ?? 'Failed to disable selected clients');
				return;
			}

			await invalidateAll();
			selectedIds.clear();
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to disable selected clients');
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
				toasts.error(result?.data?.downloadClientError ?? 'Failed to delete selected clients');
				return;
			}

			await invalidateAll();
			selectedIds.clear();
			confirmBulkDeleteOpen = false;
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to delete selected clients');
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
				const response = await fetch(`/api/download-clients/${id}/test`, {
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
			toasts.error(error instanceof Error ? error.message : 'Failed to test selected clients');
		} finally {
			bulkLoading = false;
		}
	}
</script>

<div class="w-full p-4">
	<div class="mb-6">
		<h1 class="text-2xl font-bold">Download Clients</h1>
		<p class="text-base-content/70">
			Configure download clients used for downloading and post-processing.
		</p>
	</div>

	{#if form?.downloadClientError}
		<div class="mb-4 alert alert-error">
			<span>{form.downloadClientError}</span>
		</div>
	{/if}

	{#if form?.downloadClientSuccess}
		<div class="mb-4 alert alert-success">
			<span>Operation completed successfully!</span>
		</div>
	{/if}

	<div class="mb-3 flex justify-end">
		<button class="btn gap-2 btn-primary" onclick={openAddDownloadClientModal}>
			<Plus class="h-4 w-4" />
			Add Download Client
		</button>
	</div>

	<div class="mb-4 flex flex-wrap items-center gap-4">
		<div class="form-control w-full sm:w-48">
			<input
				type="text"
				placeholder="Search clients..."
				class="input-bordered input input-sm w-full pl-9"
				value={filters.search}
				oninput={(e) => updateFilter('search', e.currentTarget.value)}
			/>
		</div>

		<div class="join">
			<button
				class="btn join-item btn-sm"
				class:btn-active={filters.protocol === 'all'}
				onclick={() => updateFilter('protocol', 'all')}
			>
				All
			</button>
			<button
				class="btn join-item btn-sm"
				class:btn-active={filters.protocol === 'torrent'}
				onclick={() => updateFilter('protocol', 'torrent')}
			>
				Torrent
			</button>
			<button
				class="btn join-item btn-sm"
				class:btn-active={filters.protocol === 'usenet'}
				onclick={() => updateFilter('protocol', 'usenet')}
			>
				Usenet
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

	{#if selectedIds.size > 0}
		<DownloadClientBulkActions
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
			<DownloadClientTable
				clients={sortedDownloadClientRows}
				{selectedIds}
				onSelect={handleSelect}
				onSelectAll={handleSelectAll}
				{sort}
				onSort={updateSort}
				onEdit={openEditModal}
				onDelete={confirmDelete}
				onToggle={handleToggle}
				onTest={handleRowTest}
				{testingId}
			/>
		</div>
	</div>
</div>

<DownloadClientModal
	open={modalOpen}
	mode={modalMode}
	client={editingClient as unknown as import('$lib/types/downloadClient').DownloadClient | null}
	{saving}
	error={saveError}
	onClose={closeModal}
	onSave={handleSave}
	onDelete={handleDelete}
	onTest={handleTest}
	allowNntp={false}
/>

<ConfirmationModal
	open={confirmDeleteOpen}
	title="Confirm Delete"
	messagePrefix="Are you sure you want to delete "
	messageEmphasis={deleteTarget?.name ?? 'this download client'}
	messageSuffix="? This action cannot be undone."
	confirmLabel="Delete"
	confirmVariant="error"
	onConfirm={handleConfirmDelete}
	onCancel={() => (confirmDeleteOpen = false)}
/>

<ConfirmationModal
	open={confirmBulkDeleteOpen}
	title="Confirm Delete"
	messagePrefix="Are you sure you want to delete "
	messageEmphasis={`${selectedIds.size} download client(s)`}
	messageSuffix="? This action cannot be undone."
	confirmLabel="Delete"
	confirmVariant="error"
	onConfirm={handleConfirmBulkDelete}
	onCancel={() => (confirmBulkDeleteOpen = false)}
/>
