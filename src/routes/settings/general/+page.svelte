<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import {
		Plus,
		HardDrive,
		RefreshCw,
		CheckCircle,
		AlertCircle,
		ExternalLink
	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import type {
		RootFolder,
		RootFolderFormData,
		PathValidationResult
	} from '$lib/types/downloadClient';
	import { createSSE } from '$lib/sse';

	import { RootFolderModal, RootFolderList } from '$lib/components/rootFolders';
	import { toasts } from '$lib/stores/toast.svelte';
	import { getResponseErrorMessage, readResponsePayload } from '$lib/utils/http';

	let { data }: { data: PageData } = $props();

	// Library Scan state
	interface ScanProgress {
		phase: string;
		rootFolderId?: string;
		rootFolderPath?: string;
		filesFound: number;
		filesProcessed: number;
		filesAdded: number;
		filesUpdated: number;
		filesRemoved: number;
		unmatchedCount: number;
		currentFile?: string;
	}

	let scanning = $state(false);
	let scanProgress = $state<ScanProgress | null>(null);
	let scanError = $state<string | null>(null);
	let scanSuccess = $state<{ message: string; unmatchedCount: number } | null>(null);

	// SSE Connection for library scan progress
	createSSE<{
		status: {
			fullScan?: boolean;
			activeScans?: unknown[];
			inProgress?: boolean;
			isScanning?: boolean;
		};
		progress: ScanProgress;
		scanComplete: { results?: Array<{ unmatchedFiles?: number }> };
		scanError: { error?: { message?: string } };
	}>('/api/library/scan/status', {
		status: (data) => {
			scanning = Boolean(data.inProgress ?? data.isScanning ?? false);
			if (!scanning) {
				scanProgress = null;
			}
		},
		progress: (data) => {
			scanning = true;
			scanProgress = data;
		},
		scanComplete: (data) => {
			const totalUnmatched =
				data.results?.reduce(
					(sum: number, r: { unmatchedFiles?: number }) => sum + (r.unmatchedFiles ?? 0),
					0
				) ?? 0;
			scanSuccess = {
				message: `Scan complete: ${data.results?.length ?? 0} folders scanned`,
				unmatchedCount: totalUnmatched
			};
			scanning = false;
			scanProgress = null;
		},
		scanError: (data) => {
			scanError = data.error?.message ?? 'Scan failed';
			scanning = false;
			scanProgress = null;
		}
	});

	async function triggerLibraryScan(rootFolderId?: string) {
		scanning = true;
		scanError = null;
		scanSuccess = null;
		scanProgress = null;

		// Trigger the scan
		try {
			const body = rootFolderId ? { rootFolderId } : { fullScan: true };
			const response = await fetch('/api/library/scan', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				const payload = await readResponsePayload<Record<string, unknown>>(response);
				throw new Error(getResponseErrorMessage(payload, 'Failed to start scan'));
			}
		} catch (error) {
			scanError = error instanceof Error ? error.message : 'Failed to start scan';
			scanning = false;
			scanProgress = null;
		}
	}

	// Root Folder state
	let folderModalOpen = $state(false);
	let folderModalMode = $state<'add' | 'edit'>('add');
	let editingFolder = $state<RootFolder | null>(null);
	let folderSaving = $state(false);
	let folderSaveError = $state<string | null>(null);
	let confirmFolderDeleteOpen = $state(false);
	let deleteFolderTarget = $state<RootFolder | null>(null);

	// Root Folder Functions
	function openAddFolderModal() {
		folderModalMode = 'add';
		editingFolder = null;
		folderSaveError = null;
		folderModalOpen = true;
	}

	function openEditFolderModal(folder: RootFolder) {
		folderModalMode = 'edit';
		editingFolder = folder;
		folderSaveError = null;
		folderModalOpen = true;
	}

	function closeFolderModal() {
		folderModalOpen = false;
		editingFolder = null;
		folderSaveError = null;
	}

	async function handleValidatePath(
		path: string,
		readOnly = false,
		folderId?: string
	): Promise<PathValidationResult> {
		try {
			const response = await fetch('/api/root-folders/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path, readOnly, folderId })
			});
			const payload = await readResponsePayload<PathValidationResult>(response);

			if (!response.ok) {
				return {
					valid: false,
					exists: false,
					writable: false,
					error: getResponseErrorMessage(payload, 'Failed to validate path')
				};
			}

			if (payload && typeof payload === 'object') {
				return payload as PathValidationResult;
			}

			return {
				valid: false,
				exists: false,
				writable: false,
				error: 'Invalid response from path validation'
			};
		} catch (e) {
			return {
				valid: false,
				exists: false,
				writable: false,
				error: e instanceof Error ? e.message : 'Unknown error'
			};
		}
	}

	async function handleFolderSave(formData: RootFolderFormData) {
		folderSaving = true;
		folderSaveError = null;
		try {
			const isCreating = folderModalMode === 'add';
			const response =
				folderModalMode === 'edit' && editingFolder
					? await fetch(`/api/root-folders/${editingFolder.id}`, {
							method: 'PUT',
							headers: {
								'Content-Type': 'application/json',
								Accept: 'application/json'
							},
							body: JSON.stringify(formData)
						})
					: await fetch('/api/root-folders', {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								Accept: 'application/json'
							},
							body: JSON.stringify(formData)
						});

			const payload = await readResponsePayload<{
				success?: boolean;
				folder?: { id?: string };
				error?: string;
			}>(response);

			if (!response.ok) {
				folderSaveError = getResponseErrorMessage(payload, 'Failed to save root folder');
				return;
			}

			await invalidateAll();
			closeFolderModal();

			// Auto-scan newly created folder
			if (
				isCreating &&
				payload &&
				typeof payload === 'object' &&
				'folder' in payload &&
				payload.folder?.id
			) {
				triggerLibraryScan(payload.folder.id);
			}
		} catch (error) {
			folderSaveError = error instanceof Error ? error.message : 'An unexpected error occurred';
		} finally {
			folderSaving = false;
		}
	}

	async function handleFolderDelete() {
		if (!editingFolder) return;

		try {
			const response = await fetch(`/api/root-folders/${editingFolder.id}`, {
				method: 'DELETE',
				headers: { Accept: 'application/json' }
			});

			if (!response.ok) {
				const payload = await readResponsePayload<Record<string, unknown>>(response);
				throw new Error(getResponseErrorMessage(payload, 'Failed to delete root folder'));
			}

			await invalidateAll();
			closeFolderModal();
		} catch (error) {
			toasts.error(
				error instanceof Error ? error.message : 'An unexpected error occurred while deleting'
			);
		}
	}

	function confirmFolderDelete(folder: RootFolder) {
		deleteFolderTarget = folder;
		confirmFolderDeleteOpen = true;
	}

	async function handleConfirmFolderDelete() {
		if (!deleteFolderTarget) return;

		try {
			const response = await fetch(`/api/root-folders/${deleteFolderTarget.id}`, {
				method: 'DELETE',
				headers: { Accept: 'application/json' }
			});

			if (!response.ok) {
				const payload = await readResponsePayload<Record<string, unknown>>(response);
				throw new Error(getResponseErrorMessage(payload, 'Failed to delete root folder'));
			}

			await invalidateAll();
			confirmFolderDeleteOpen = false;
			deleteFolderTarget = null;
		} catch (error) {
			toasts.error(
				error instanceof Error ? error.message : 'An unexpected error occurred while deleting'
			);
		}
	}
</script>

<svelte:head>
	<title>General Settings - Cinephage</title>
</svelte:head>

<div class="w-full p-3 sm:p-4">
	<div class="mb-5 sm:mb-6">
		<h1 class="text-2xl font-bold">General Settings</h1>
		<p class="text-base-content/70">
			Configure general application settings and media library folders.
		</p>
	</div>

	<!-- Root Folders Section -->
	<div class="mb-8">
		<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="min-w-0">
				<h2 class="text-2xl font-bold">Root Folders</h2>
				<p class="text-base-content/70">
					Configure media library folders where content will be organized.
				</p>
			</div>
			<button class="btn gap-2 btn-sm btn-primary sm:w-auto" onclick={openAddFolderModal}>
				<Plus class="h-4 w-4" />
				Add Folder
			</button>
		</div>

		<RootFolderList
			folders={data.rootFolders}
			onEdit={openEditFolderModal}
			onDelete={confirmFolderDelete}
		/>
	</div>

	<div class="divider"></div>

	<!-- Library Scan Section -->
	<div class="mb-8">
		<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="min-w-0">
				<h2 class="text-2xl font-bold">Library Scan</h2>
				<p class="text-base-content/70">
					Scan root folders to discover media files and match them to your library.
				</p>
			</div>
			<button
				class="btn gap-2 self-start btn-sm btn-primary sm:w-auto"
				onclick={() => triggerLibraryScan()}
				disabled={scanning || data.rootFolders.length === 0}
			>
				{#if scanning}
					<RefreshCw class="h-4 w-4 animate-spin" />
					Scanning...
				{:else}
					<HardDrive class="h-4 w-4" />
					Scan Library
				{/if}
			</button>
		</div>

		{#if data.rootFolders.length === 0}
			<div class="mb-4 alert alert-warning">
				<AlertCircle class="h-5 w-5" />
				<span>Add a root folder above before scanning your library.</span>
			</div>
		{/if}

		{#if scanError}
			<div class="mb-4 alert alert-error">
				<AlertCircle class="h-5 w-5" />
				<span>{scanError}</span>
			</div>
		{/if}

		{#if scanSuccess}
			<div class="mb-4 alert alert-success">
				<CheckCircle class="h-5 w-5" />
				<div class="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<span>{scanSuccess.message}</span>
					{#if scanSuccess.unmatchedCount > 0}
						<a href="/library/unmatched" class="btn gap-1 btn-ghost btn-sm">
							View {scanSuccess.unmatchedCount} unmatched file{scanSuccess.unmatchedCount !== 1
								? 's'
								: ''}
							<ExternalLink class="h-3 w-3" />
						</a>
					{/if}
				</div>
			</div>
		{/if}

		{#if scanning && scanProgress}
			<div class="card bg-base-200 p-3 sm:p-4">
				<div
					class="mb-2 flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between"
				>
					<span class="max-w-md truncate">
						{scanProgress.phase === 'scanning' ? 'Discovering files...' : ''}
						{scanProgress.phase === 'processing' ? 'Processing...' : ''}
						{scanProgress.phase === 'matching' ? 'Matching files...' : ''}
						{scanProgress.rootFolderPath ?? ''}
					</span>
					<span class="text-base-content/60">
						{scanProgress.filesProcessed} / {scanProgress.filesFound} files
					</span>
				</div>
				<progress
					class="progress w-full progress-primary"
					value={scanProgress.filesProcessed}
					max={scanProgress.filesFound || 1}
				></progress>
				<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/60">
					<span>Added: {scanProgress.filesAdded}</span>
					<span>Updated: {scanProgress.filesUpdated}</span>
					<span>Removed: {scanProgress.filesRemoved}</span>
					<span>Unmatched: {scanProgress.unmatchedCount}</span>
				</div>
				{#if scanProgress.currentFile}
					<div class="mt-2 truncate text-xs text-base-content/50">
						{scanProgress.currentFile}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<!-- Root Folder Modal -->
<RootFolderModal
	open={folderModalOpen}
	mode={folderModalMode}
	folder={editingFolder}
	saving={folderSaving}
	error={folderSaveError}
	onClose={closeFolderModal}
	onSave={handleFolderSave}
	onDelete={handleFolderDelete}
	onValidatePath={handleValidatePath}
/>

<!-- Root Folder Delete Confirmation Modal -->
{#if confirmFolderDeleteOpen}
	<div class="modal-open modal">
		<div class="modal-box w-full max-w-[min(28rem,calc(100vw-2rem))] wrap-break-word">
			<h3 class="text-lg font-bold">Confirm Delete</h3>
			<p class="py-4">
				Are you sure you want to delete <strong>{deleteFolderTarget?.name}</strong>? This action
				cannot be undone.
			</p>
			<div class="modal-action flex-col-reverse sm:flex-row">
				<button class="btn btn-ghost" onclick={() => (confirmFolderDeleteOpen = false)}
					>Cancel</button
				>
				<button class="btn btn-error" onclick={handleConfirmFolderDelete}>Delete</button>
			</div>
		</div>
		<button
			type="button"
			class="modal-backdrop cursor-default border-none bg-black/50"
			onclick={() => (confirmFolderDeleteOpen = false)}
			aria-label="Close modal"
		></button>
	</div>
{/if}
