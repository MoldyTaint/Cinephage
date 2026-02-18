<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Plus } from 'lucide-svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { toasts } from '$lib/stores/toast.svelte';
	import type { PageData } from './$types';
	import {
		NntpServerBulkActions,
		NntpServerModal,
		NntpServerTable
	} from '$lib/components/nntpServers';
	import { ConfirmationModal } from '$lib/components/ui/modal';

	interface NntpServer {
		id: string;
		name: string;
		host: string;
		port: number;
		useSsl: boolean | null;
		username: string | null;
		hasPassword?: boolean;
		maxConnections: number | null;
		priority: number | null;
		enabled: boolean | null;
		testResult: string | null;
		testError?: string | null;
		lastTestedAt: string | null;
	}

	interface NntpServerFormData {
		name: string;
		host: string;
		port: number;
		useSsl: boolean;
		username: string | null;
		password?: string | null;
		maxConnections: number;
		priority: number;
		enabled: boolean;
	}

	interface ConnectionTestResult {
		success: boolean;
		error?: string;
		greeting?: string;
	}

	let { data }: { data: PageData } = $props();

	let modalOpen = $state(false);
	let modalMode = $state<'add' | 'edit'>('add');
	let editingServer = $state<NntpServer | null>(null);
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let confirmDeleteOpen = $state(false);
	let deleteTarget = $state<NntpServer | null>(null);
	let confirmBulkDeleteOpen = $state(false);
	let testingId = $state<string | null>(null);
	let bulkLoading = $state(false);
	let selectedIds = new SvelteSet<string>();

	interface NntpServerFilters {
		status: 'all' | 'enabled' | 'disabled';
		search: string;
	}

	interface NntpServerSortState {
		column: 'status' | 'name' | 'priority';
		direction: 'asc' | 'desc';
	}

	let filters = $state<NntpServerFilters>({
		status: 'all',
		search: ''
	});

	let sort = $state<NntpServerSortState>({
		column: 'name',
		direction: 'asc'
	});

	const canReorder = $derived(filters.status === 'all' && filters.search.trim().length === 0);

	function getStatusSortRank(server: NntpServer): number {
		if (!server.enabled) return 2;
		if (server.testResult === 'failed') return 1;
		return 0;
	}

	const filteredServers = $derived.by(() => {
		let result = [...data.nntpServers];

		if (filters.status === 'enabled') {
			result = result.filter((server) => !!server.enabled);
		} else if (filters.status === 'disabled') {
			result = result.filter((server) => !server.enabled);
		}

		const query = filters.search.trim().toLowerCase();
		if (query) {
			result = result.filter((server) => {
				const hostAndPort = `${server.host}:${server.port}`;
				return (
					server.name.toLowerCase().includes(query) ||
					server.host.toLowerCase().includes(query) ||
					hostAndPort.toLowerCase().includes(query) ||
					(server.username ?? '').toLowerCase().includes(query)
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
			if (sort.column === 'priority') {
				const aPriority = a.priority ?? Number.MAX_SAFE_INTEGER;
				const bPriority = b.priority ?? Number.MAX_SAFE_INTEGER;
				const byPriority = (aPriority - bPriority) * direction;
				if (byPriority !== 0) return byPriority;
				return a.name.localeCompare(b.name) * direction;
			}
			return a.name.localeCompare(b.name) * direction;
		});

		return result;
	});

	function updateSort(column: NntpServerSortState['column']) {
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

	function handlePrioritySortForReorder() {
		sort = { column: 'priority', direction: 'asc' };
	}

	function updateFilter<K extends keyof NntpServerFilters>(key: K, value: NntpServerFilters[K]) {
		filters = { ...filters, [key]: value };
	}

	function openAddModal() {
		modalMode = 'add';
		editingServer = null;
		saveError = null;
		modalOpen = true;
	}

	function openEditModal(server: NntpServer) {
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

	async function handleTest(data: NntpServerFormData): Promise<ConnectionTestResult> {
		try {
			const response = await fetch('/api/usenet/servers/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});
			const result = await response.json();
			return {
				success: !!result.success,
				error: result.error,
				greeting: result.greeting
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	async function handleSave(formData: NntpServerFormData) {
		saving = true;
		saveError = null;

		try {
			let response: Response;
			if (modalMode === 'edit' && editingServer) {
				response = await fetch(`/api/usenet/servers/${editingServer.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(formData)
				});
			} else {
				response = await fetch('/api/usenet/servers', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(formData)
				});
			}

			const result = await response.json();
			if (!response.ok || result.error) {
				saveError = result.error || 'Failed to save NNTP server';
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

		await fetch(`/api/usenet/servers/${editingServer.id}`, {
			method: 'DELETE'
		});
		await invalidateAll();
		closeModal();
	}

	function confirmDelete(server: NntpServer) {
		deleteTarget = server;
		confirmDeleteOpen = true;
	}

	async function handleConfirmDelete() {
		if (!deleteTarget) return;

		await fetch(`/api/usenet/servers/${deleteTarget.id}`, {
			method: 'DELETE'
		});
		await invalidateAll();
		confirmDeleteOpen = false;
		deleteTarget = null;
	}

	async function handleToggle(server: NntpServer) {
		await fetch(`/api/usenet/servers/${server.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ enabled: !server.enabled })
		});
		await invalidateAll();
	}

	async function handleNntpTest(server: NntpServer) {
		testingId = server.id;
		try {
			await fetch(`/api/usenet/servers/${server.id}/test`, {
				method: 'POST'
			});
			await invalidateAll();
		} finally {
			testingId = null;
		}
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

	async function handleBulkEnable() {
		if (selectedIds.size === 0) return;
		bulkLoading = true;
		try {
			for (const id of selectedIds) {
				await fetch(`/api/usenet/servers/${id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ enabled: true })
				});
			}
			await invalidateAll();
			selectedIds.clear();
		} finally {
			bulkLoading = false;
		}
	}

	async function handleBulkDisable() {
		if (selectedIds.size === 0) return;
		bulkLoading = true;
		try {
			for (const id of selectedIds) {
				await fetch(`/api/usenet/servers/${id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ enabled: false })
				});
			}
			await invalidateAll();
			selectedIds.clear();
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
				await fetch(`/api/usenet/servers/${id}`, {
					method: 'DELETE'
				});
			}
			await invalidateAll();
			selectedIds.clear();
			confirmBulkDeleteOpen = false;
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
				const response = await fetch(`/api/usenet/servers/${id}/test`, {
					method: 'POST'
				});
				if (response.ok) {
					successCount += 1;
				} else {
					failCount += 1;
				}
			}
			await invalidateAll();
			toasts.info(`Bulk test complete: ${successCount} passed, ${failCount} failed`);
		} finally {
			bulkLoading = false;
		}
	}

	async function handleReorder(serverIds: string[]) {
		try {
			const responses = await Promise.all(
				serverIds.map((id, index) =>
					fetch(`/api/usenet/servers/${id}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ priority: index + 1 })
					})
				)
			);

			const failed = responses.find((response) => !response.ok);
			if (failed) {
				toasts.error('Failed to reorder NNTP server priorities');
				return;
			}

			await invalidateAll();
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to reorder priorities');
		}
	}
</script>

<div class="w-full p-4">
	<div class="mb-6">
		<h1 class="text-2xl font-bold">NNTP Servers</h1>
		<p class="text-base-content/70">Configure Usenet providers for streaming and article checks.</p>
	</div>

	<div class="mb-3 flex justify-end">
		<button class="btn gap-2 btn-primary" onclick={openAddModal}>
			<Plus class="h-4 w-4" />
			Add NNTP Server
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
		<NntpServerBulkActions
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
			<NntpServerTable
				servers={sortedServers}
				{selectedIds}
				onSelect={handleSelect}
				onSelectAll={handleSelectAll}
				{sort}
				onSort={updateSort}
				{canReorder}
				onPrioritySortForReorder={handlePrioritySortForReorder}
				onEdit={openEditModal}
				onDelete={confirmDelete}
				onToggle={handleToggle}
				onTest={handleNntpTest}
				{testingId}
				onReorder={handleReorder}
			/>
		</div>
	</div>
</div>

<NntpServerModal
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

<ConfirmationModal
	open={confirmDeleteOpen}
	title="Confirm Delete"
	messagePrefix="Are you sure you want to delete "
	messageEmphasis={deleteTarget?.name ?? 'this NNTP server'}
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
	messageEmphasis={`${selectedIds.size} NNTP server(s)`}
	messageSuffix="? This action cannot be undone."
	confirmLabel="Delete"
	confirmVariant="error"
	onConfirm={handleConfirmBulkDelete}
	onCancel={() => (confirmBulkDeleteOpen = false)}
/>
