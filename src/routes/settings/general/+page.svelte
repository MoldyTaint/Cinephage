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
	import type { PageData, ActionData } from './$types';
	import type {
		RootFolder,
		RootFolderFormData,
		PathValidationResult
	} from '$lib/types/downloadClient';

	import { RootFolderModal, RootFolderList } from '$lib/components/rootFolders';

	let { data, form }: { data: PageData; form: ActionData } = $props();

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
	let eventSource = $state<EventSource | null>(null);

	// Cleanup SSE on unmount
	$effect(() => {
		return () => {
			if (eventSource) {
				eventSource.close();
			}
		};
	});

	async function triggerLibraryScan(rootFolderId?: string) {
		scanning = true;
		scanError = null;
		scanSuccess = null;
		scanProgress = null;

		// Connect to SSE for progress updates
		eventSource = new EventSource('/api/library/scan/status');

		eventSource.addEventListener('progress', (e) => {
			scanProgress = JSON.parse(e.data);
		});

		eventSource.addEventListener('scanComplete', (e) => {
			const result = JSON.parse(e.data);
			const totalUnmatched =
				result.results?.reduce(
					(sum: number, r: { unmatchedFiles?: number }) => sum + (r.unmatchedFiles ?? 0),
					0
				) ?? 0;
			scanSuccess = {
				message: `Scan complete: ${result.results?.length ?? 0} folders scanned`,
				unmatchedCount: totalUnmatched
			};
			scanning = false;
			scanProgress = null;
			eventSource?.close();
			eventSource = null;
		});

		eventSource.addEventListener('scanError', (e) => {
			const result = JSON.parse(e.data);
			scanError = result.error?.message ?? 'Scan failed';
			scanning = false;
			scanProgress = null;
			eventSource?.close();
			eventSource = null;
		});

		eventSource.onerror = () => {
			// SSE connection error - scan may have completed or server restarted
			if (scanning) {
				scanning = false;
				scanProgress = null;
			}
			eventSource?.close();
			eventSource = null;
		};

		// Trigger the scan
		try {
			const body = rootFolderId ? { rootFolderId } : { fullScan: true };
			const response = await fetch('/api/library/scan', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to start scan');
			}
		} catch (error) {
			scanError = error instanceof Error ? error.message : 'Failed to start scan';
			scanning = false;
			scanProgress = null;
			eventSource?.close();
			eventSource = null;
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

	async function handleValidatePath(path: string, readOnly = false): Promise<PathValidationResult> {
		try {
			const response = await fetch('/api/root-folders/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path, readOnly })
			});
			return await response.json();
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
			const form = new FormData();
			form.append('data', JSON.stringify(formData));

			let response: Response;
			const isCreating = folderModalMode === 'add';
			if (folderModalMode === 'edit' && editingFolder) {
				form.append('id', editingFolder.id);
				response = await fetch(`?/updateRootFolder`, {
					method: 'POST',
					body: form
				});
			} else {
				response = await fetch(`?/createRootFolder`, {
					method: 'POST',
					body: form
				});
			}

			// Parse the response to check for errors
			const result = await response.json();

			// SvelteKit form actions return data in a specific format
			if (result.type === 'failure' || result.data?.rootFolderError) {
				const errorMessage = result.data?.rootFolderError || 'Failed to save root folder';
				folderSaveError = errorMessage;
				return; // Don't close modal on error
			}

			await invalidateAll();
			closeFolderModal();

			// Auto-scan newly created folder
			if (isCreating && result.data?.createdFolderId) {
				triggerLibraryScan(result.data.createdFolderId);
			}
		} catch (error) {
			folderSaveError = error instanceof Error ? error.message : 'An unexpected error occurred';
		} finally {
			folderSaving = false;
		}
	}

	async function handleFolderDelete() {
		if (!editingFolder) return;
		const form = new FormData();
		form.append('id', editingFolder.id);
		await fetch(`?/deleteRootFolder`, {
			method: 'POST',
			body: form
		});
		await invalidateAll();
		closeFolderModal();
	}

	function confirmFolderDelete(folder: RootFolder) {
		deleteFolderTarget = folder;
		confirmFolderDeleteOpen = true;
	}

	async function handleConfirmFolderDelete() {
		if (!deleteFolderTarget) return;
		const form = new FormData();
		form.append('id', deleteFolderTarget.id);
		await fetch(`?/deleteRootFolder`, {
			method: 'POST',
			body: form
		});
		await invalidateAll();
		confirmFolderDeleteOpen = false;
		deleteFolderTarget = null;
	}
</script>

<div class="w-full p-4">
	<div class="mb-6">
		<h1 class="text-3xl font-bold">General Settings</h1>
		<p class="text-base-content/70">
			Configure general application settings and media library folders.
		</p>
	</div>

	<!-- Root Folders Section -->
	<div class="mb-8">
		<div class="mb-4 flex items-center justify-between">
			<div>
				<h2 class="text-2xl font-bold">Root Folders</h2>
				<p class="text-base-content/70">
					Configure media library folders where content will be organized.
				</p>
			</div>
			<button class="btn gap-2 btn-primary" onclick={openAddFolderModal}>
				<Plus class="h-4 w-4" />
				Add Folder
			</button>
		</div>

		{#if form?.rootFolderError}
			<div class="mb-4 alert alert-error">
				<span>{form.rootFolderError}</span>
			</div>
		{/if}

		{#if form?.rootFolderSuccess}
			<div class="mb-4 alert alert-success">
				<span>Operation completed successfully!</span>
			</div>
		{/if}

		<RootFolderList
			folders={data.rootFolders}
			onEdit={openEditFolderModal}
			onDelete={confirmFolderDelete}
		/>
	</div>

	<div class="divider"></div>

	<!-- Library Scan Section -->
	<div class="mb-8">
		<div class="mb-4 flex items-center justify-between">
			<div>
				<h2 class="text-2xl font-bold">Library Scan</h2>
				<p class="text-base-content/70">
					Scan root folders to discover media files and match them to your library.
				</p>
			</div>
			<button
				class="btn gap-2 btn-primary"
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
				<div class="flex flex-1 items-center justify-between">
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
			<div class="card bg-base-200 p-4">
				<div class="mb-2 flex justify-between text-sm">
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
				<div class="mt-2 flex gap-4 text-xs text-base-content/60">
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
		<div class="modal-box w-full max-w-[min(28rem,calc(100vw-2rem))] break-words">
			<h3 class="text-lg font-bold">Confirm Delete</h3>
			<p class="py-4">
				Are you sure you want to delete <strong>{deleteFolderTarget?.name}</strong>? This action
				cannot be undone.
			</p>
			<div class="modal-action">
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
