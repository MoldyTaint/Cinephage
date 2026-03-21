<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Plus, Search } from 'lucide-svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import { getResponseErrorMessage, readResponsePayload } from '$lib/utils/http';
	import { SvelteSet } from 'svelte/reactivity';
	import { toFriendlyDownloadClientError } from '$lib/downloadClients/errorMessages';
	import type { PageData } from './$types';
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

	let { data }: { data: PageData } = $props();

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

	function toDownloadClientErrorMessage(payload: unknown, fallback: string): string {
		return toFriendlyDownloadClientError(getResponseErrorMessage(payload, fallback));
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
			const payload = await readResponsePayload<ConnectionTestResult>(response);
			if (!response.ok || !payload || typeof payload === 'string') {
				return {
					success: false,
					error: toDownloadClientErrorMessage(payload, 'Connection test failed')
				};
			}
			return payload;
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
			const payload = formData as DownloadClientFormData;
			const response =
				modalMode === 'edit' && editingClient
					? await fetch(`/api/download-clients/${editingClient.id}`, {
							method: 'PUT',
							headers: {
								'Content-Type': 'application/json',
								Accept: 'application/json'
							},
							body: JSON.stringify(payload)
						})
					: await fetch('/api/download-clients', {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								Accept: 'application/json'
							},
							body: JSON.stringify(payload)
						});

			const result = await readResponsePayload<Record<string, unknown>>(response);
			if (!response.ok) {
				saveError = toDownloadClientErrorMessage(result, 'Failed to save download client');
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
		try {
			const response = await fetch(`/api/download-clients/${editingClient.id}`, {
				method: 'DELETE',
				headers: { Accept: 'application/json' }
			});
			const result = await readResponsePayload<Record<string, unknown>>(response);
			if (!response.ok) {
				throw new Error(toDownloadClientErrorMessage(result, 'Failed to delete download client'));
			}

			await invalidateAll();
			closeModal();
		} catch (error) {
			toasts.error(
				toDownloadClientErrorMessage(
					error instanceof Error ? error.message : null,
					'Failed to delete download client'
				)
			);
		}
	}

	function confirmDelete(client: UnifiedClientItem) {
		deleteTarget = client;
		confirmDeleteOpen = true;
	}

	async function handleConfirmDelete() {
		if (!deleteTarget) return;
		try {
			const response = await fetch(`/api/download-clients/${deleteTarget.id}`, {
				method: 'DELETE',
				headers: { Accept: 'application/json' }
			});
			const result = await readResponsePayload<Record<string, unknown>>(response);
			if (!response.ok) {
				throw new Error(toDownloadClientErrorMessage(result, 'Failed to delete download client'));
			}

			await invalidateAll();
			confirmDeleteOpen = false;
			deleteTarget = null;
		} catch (error) {
			toasts.error(
				toDownloadClientErrorMessage(
					error instanceof Error ? error.message : null,
					'Failed to delete download client'
				)
			);
		}
	}

	async function handleToggle(client: UnifiedClientItem) {
		try {
			const response = await fetch(`/api/download-clients/${client.id}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify({ enabled: !client.enabled })
			});
			const result = await readResponsePayload<Record<string, unknown>>(response);
			if (!response.ok) {
				throw new Error(toDownloadClientErrorMessage(result, 'Failed to update client state'));
			}

			await invalidateAll();
		} catch (error) {
			toasts.error(
				toDownloadClientErrorMessage(
					error instanceof Error ? error.message : null,
					'Failed to update client state'
				)
			);
		}
	}

	async function handleRowTest(client: UnifiedClientItem) {
		testingId = client.id;
		try {
			const response = await fetch(`/api/download-clients/${client.id}/test`, {
				method: 'POST'
			});
			const result = await readResponsePayload<ConnectionTestResult>(response);
			if (!response.ok || !result || typeof result === 'string' || !result.success) {
				toasts.error(toDownloadClientErrorMessage(result, 'Connection test failed'));
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
			for (const id of selectedIds) {
				const response = await fetch(`/api/download-clients/${id}`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json'
					},
					body: JSON.stringify({ enabled: true })
				});
				const result = await readResponsePayload<Record<string, unknown>>(response);
				if (!response.ok) {
					throw new Error(
						toDownloadClientErrorMessage(result, 'Failed to enable selected clients')
					);
				}
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
			for (const id of selectedIds) {
				const response = await fetch(`/api/download-clients/${id}`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json'
					},
					body: JSON.stringify({ enabled: false })
				});
				const result = await readResponsePayload<Record<string, unknown>>(response);
				if (!response.ok) {
					throw new Error(
						toDownloadClientErrorMessage(result, 'Failed to disable selected clients')
					);
				}
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
			for (const id of selectedIds) {
				const response = await fetch(`/api/download-clients/${id}`, {
					method: 'DELETE',
					headers: { Accept: 'application/json' }
				});
				const result = await readResponsePayload<Record<string, unknown>>(response);
				if (!response.ok) {
					throw new Error(
						toDownloadClientErrorMessage(result, 'Failed to delete selected clients')
					);
				}
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
				const result = await readResponsePayload<ConnectionTestResult>(response);
				if (response.ok && result && typeof result !== 'string' && result.success) {
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

<div class="w-full p-3 sm:p-4">
	<div class="mb-5 sm:mb-6">
		<h1 class="text-xl font-bold sm:text-2xl">Download Clients</h1>
		<p class="text-base-content/70">
			Configure download clients used for downloading and post-processing.
		</p>
	</div>

	<div class="mb-4 flex items-center justify-end">
		<button
			class="btn w-full gap-2 btn-sm btn-primary sm:w-auto"
			onclick={openAddDownloadClientModal}
		>
			<Plus class="h-4 w-4" />
			Add Download Client
		</button>
	</div>

	<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
		<div class="form-control relative w-full sm:w-56">
			<Search
				class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-base-content/40"
			/>
			<input
				type="text"
				placeholder="Search clients..."
				class="input input-sm w-full rounded-full border-base-content/20 bg-base-200/60 pr-4 pl-10 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none"
				value={filters.search}
				oninput={(e) => updateFilter('search', e.currentTarget.value)}
			/>
		</div>

		<div class="join w-full sm:w-auto">
			<button
				class="btn join-item flex-1 btn-sm sm:flex-none"
				class:btn-active={filters.protocol === 'all'}
				onclick={() => updateFilter('protocol', 'all')}
			>
				All
			</button>
			<button
				class="btn join-item flex-1 btn-sm sm:flex-none"
				class:btn-active={filters.protocol === 'torrent'}
				onclick={() => updateFilter('protocol', 'torrent')}
			>
				Torrent
			</button>
			<button
				class="btn join-item flex-1 btn-sm sm:flex-none"
				class:btn-active={filters.protocol === 'usenet'}
				onclick={() => updateFilter('protocol', 'usenet')}
			>
				Usenet
			</button>
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

	<div class="card bg-base-200/40 shadow-none sm:bg-base-100 sm:shadow-xl">
		<div class="card-body p-2 sm:p-0">
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
