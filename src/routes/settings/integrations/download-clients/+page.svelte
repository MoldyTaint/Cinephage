<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Plus } from 'lucide-svelte';
	import type { PageData, ActionData } from './$types';
	import type {
		DownloadClientFormData,
		ConnectionTestResult,
		UnifiedClientItem
	} from '$lib/types/downloadClient';

	import { DownloadClientModal, DownloadClientTable } from '$lib/components/downloadClients';
	import { ConfirmationModal } from '$lib/components/ui/modal';

	// NNTP server form data type (matches modal)
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

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Unified state
	let modalOpen = $state(false);
	let modalMode = $state<'add' | 'edit'>('add');
	let editingClient = $state<UnifiedClientItem | null>(null);
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let confirmDeleteOpen = $state(false);
	let deleteTarget = $state<UnifiedClientItem | null>(null);
	let testingId = $state<string | null>(null);

	// Create unified client list
	const unifiedClients = $derived([
		...data.downloadClients.map(
			(c): UnifiedClientItem => ({
				...c,
				type: 'download-client',
				implementation: c.implementation
			})
		),
		...data.nntpServers.map(
			(s): UnifiedClientItem => ({
				...s,
				type: 'nntp-server',
				implementation: 'nntp'
			})
		)
	]);

	// Modal Functions
	function openAddModal() {
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
		try {
			if (isNntp) {
				const response = await fetch('/api/usenet/servers/test', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						host: formData.host,
						port: formData.port,
						useSsl: formData.useSsl,
						username: formData.username || null,
						password: formData.password || null
					})
				});
				const result = await response.json();
				return {
					success: result.success,
					error: result.error,
					greeting: result.greeting
				};
			} else {
				const dcFormData = formData as DownloadClientFormData;
				const response = await fetch('/api/download-clients/test', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
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
			}
		} catch (e) {
			return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
		}
	}

	async function handleSave(
		formData: DownloadClientFormData | NntpServerFormData,
		isNntp: boolean
	) {
		saving = true;
		saveError = null;
		try {
			if (isNntp) {
				let response: Response;
				if (modalMode === 'edit' && editingClient) {
					response = await fetch(`/api/usenet/servers/${editingClient.id}`, {
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
					saveError = result.error || 'Failed to save server';
					return;
				}
			} else {
				const form = new FormData();
				form.append('data', JSON.stringify(formData));

				let response: Response;
				if (modalMode === 'edit' && editingClient) {
					form.append('id', editingClient.id);
					response = await fetch(`?/updateDownloadClient`, {
						method: 'POST',
						body: form
					});
				} else {
					response = await fetch(`?/createDownloadClient`, {
						method: 'POST',
						body: form
					});
				}

				const result = await response.json();
				if (result.type === 'failure' || result.data?.downloadClientError) {
					const errorMessage = result.data?.downloadClientError || 'Failed to save download client';
					saveError = errorMessage;
					return;
				}
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
		if (!editingClient) return;

		if (editingClient.type === 'nntp-server') {
			await fetch(`/api/usenet/servers/${editingClient.id}`, {
				method: 'DELETE'
			});
		} else {
			const form = new FormData();
			form.append('id', editingClient.id);
			await fetch(`?/deleteDownloadClient`, {
				method: 'POST',
				body: form
			});
		}
		await invalidateAll();
		closeModal();
	}

	function confirmDelete(client: UnifiedClientItem) {
		deleteTarget = client;
		confirmDeleteOpen = true;
	}

	async function handleConfirmDelete() {
		if (!deleteTarget) return;

		if (deleteTarget.type === 'nntp-server') {
			await fetch(`/api/usenet/servers/${deleteTarget.id}`, {
				method: 'DELETE'
			});
		} else {
			const form = new FormData();
			form.append('id', deleteTarget.id);
			await fetch(`?/deleteDownloadClient`, {
				method: 'POST',
				body: form
			});
		}
		await invalidateAll();
		confirmDeleteOpen = false;
		deleteTarget = null;
	}

	async function handleToggle(client: UnifiedClientItem) {
		if (client.type === 'nntp-server') {
			await fetch(`/api/usenet/servers/${client.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled: !client.enabled })
			});
		} else {
			const form = new FormData();
			form.append('id', client.id);
			form.append('enabled', (!client.enabled).toString());
			await fetch(`?/toggleDownloadClient`, {
				method: 'POST',
				body: form
			});
		}
		await invalidateAll();
	}

	async function handleTestFromTable(client: UnifiedClientItem) {
		if (client.type !== 'nntp-server') return;

		testingId = client.id;
		try {
			await fetch(`/api/usenet/servers/${client.id}/test`, {
				method: 'POST'
			});
			await invalidateAll();
		} finally {
			testingId = null;
		}
	}
</script>

<div class="w-full p-4">
	<div class="mb-6">
		<h1 class="text-2xl font-bold">Download Clients</h1>
		<p class="text-base-content/70">Configure download clients and usenet servers.</p>
	</div>

	<div class="mb-4 flex items-center justify-end">
		<button class="btn gap-2 btn-primary" onclick={openAddModal}>
			<Plus class="h-4 w-4" />
			Add Client
		</button>
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

	<div class="card bg-base-100 shadow-xl">
		<div class="card-body p-0">
			<DownloadClientTable
				clients={unifiedClients}
				onEdit={openEditModal}
				onDelete={confirmDelete}
				onToggle={handleToggle}
				onTest={handleTestFromTable}
				{testingId}
			/>
		</div>
	</div>
</div>

<!-- Download Client Modal -->
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
/>

<!-- Delete Confirmation Modal -->
<ConfirmationModal
	open={confirmDeleteOpen}
	title="Confirm Delete"
	message="Are you sure you want to delete {deleteTarget?.name}? This action cannot be undone."
	confirmLabel="Delete"
	confirmVariant="error"
	onConfirm={handleConfirmDelete}
	onCancel={() => (confirmDeleteOpen = false)}
/>
