<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { unmatchedFilesStore } from '$lib/stores/unmatched-files.svelte.js';
	import {
		UnmatchedFileCard,
		UnmatchedFolderCard,
		UnmatchedFilters,
		UnmatchedBulkActions,
		UnmatchedEmptyState,
		UnmatchedPagination,
		UnmatchedLibraryIssues
	} from '$lib/components/unmatched';
	import MatchFileModal from '$lib/components/library/MatchFileModal.svelte';
	import MatchFolderModal from '$lib/components/library/MatchFolderModal.svelte';
	import BatchMatchModal from '$lib/components/library/BatchMatchModal.svelte';
	import DeleteConfirmationModal from '$lib/components/ui/modal/DeleteConfirmationModal.svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import type { UnmatchedFile, UnmatchedFolder } from '$lib/types/unmatched.js';

	// Modal states
	let showMatchModal = $state(false);
	let showFolderMatchModal = $state(false);
	let showBatchMatchModal = $state(false);
	let showDeleteModal = $state(false);

	// Selected items for modals
	let selectedFile = $state<UnmatchedFile | null>(null);
	let selectedFolder = $state<UnmatchedFolder | null>(null);
	let fileToDelete = $state<UnmatchedFile | null>(null);
	let isDeleting = $state(false);

	// Local checkbox state
	let showCheckboxes = $state(false);

	// Track expanded folders
	const expandedFolders = new SvelteSet<string>();

	// Load data on mount
	onMount(() => {
		unmatchedFilesStore.loadFiles();
	});

	// Handle file selection
	function toggleFileSelection(fileId: string) {
		unmatchedFilesStore.toggleFileSelection(fileId);
	}

	// Handle file match
	function handleMatchFile(file: UnmatchedFile) {
		selectedFile = file;
		showMatchModal = true;
	}

	// Handle folder match
	function handleMatchFolder(folder: UnmatchedFolder) {
		selectedFolder = folder;
		showFolderMatchModal = true;
	}

	// Handle batch match
	function handleBatchMatch() {
		if (unmatchedFilesStore.selectedCount === 0) {
			toasts.info('Select files to match first');
			return;
		}
		showBatchMatchModal = true;
	}

	// Toggle folder expansion
	function toggleFolder(folderPath: string) {
		if (expandedFolders.has(folderPath)) {
			expandedFolders.delete(folderPath);
		} else {
			expandedFolders.add(folderPath);
		}
	}

	// Expand all folders
	function expandAllFolders() {
		for (const folder of filteredFolders) {
			expandedFolders.add(folder.folderPath);
		}
	}

	// Collapse all folders
	function collapseAllFolders() {
		expandedFolders.clear();
	}

	// Handle file delete
	function handleDeleteFile(file: UnmatchedFile) {
		fileToDelete = file;
		showDeleteModal = true;
	}

	// Perform delete
	async function performDelete(deleteFromDisk: boolean) {
		if (!fileToDelete) return;

		isDeleting = true;
		try {
			await unmatchedFilesStore.deleteFiles([fileToDelete.id], deleteFromDisk);
			toasts.success(deleteFromDisk ? 'File deleted from disk' : 'File removed from list');
			showDeleteModal = false;
			fileToDelete = null;
		} catch (_err) {
			toasts.error('Failed to delete file');
		} finally {
			isDeleting = false;
		}
	}

	// Handle match success
	function handleMatchSuccess() {
		showMatchModal = false;
		selectedFile = null;
		unmatchedFilesStore.loadFiles();
		toasts.success('File matched successfully');
	}

	// Handle folder match success
	function handleFolderMatchSuccess() {
		showFolderMatchModal = false;
		selectedFolder = null;
		unmatchedFilesStore.loadFiles();
		toasts.success('Folder matched successfully');
	}

	// Handle batch match success
	function handleBatchMatchSuccess() {
		showBatchMatchModal = false;
		showCheckboxes = false;
		unmatchedFilesStore.clearSelection();
		unmatchedFilesStore.loadFiles();
		toasts.success('Files matched successfully');
	}

	// Derived values
	const files = $derived(unmatchedFilesStore.files);
	const folders = $derived(unmatchedFilesStore.folders);
	const viewMode = $derived(unmatchedFilesStore.viewMode);
	const loading = $derived(unmatchedFilesStore.loading);
	const pagination = $derived(unmatchedFilesStore.pagination);
	const selectedCount = $derived(unmatchedFilesStore.selectedCount);
	// Check for data based on current view mode
	const hasData = $derived(viewMode === 'folder' ? folders.length > 0 : files.length > 0);
	const filteredFiles = $derived(unmatchedFilesStore.filteredFiles);
	const filteredFolders = $derived(unmatchedFilesStore.filteredFolders);

	// Reset expanded folders when filters change to avoid stale state
	$effect(() => {
		// This effect runs when filteredFolders changes
		const validPaths = new Set(filteredFolders.map((f) => f.folderPath));
		for (const path of expandedFolders) {
			if (!validPaths.has(path)) {
				expandedFolders.delete(path);
			}
		}
	});
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold">Unmatched Files</h1>
			<p class="text-base-content/70">
				{pagination.total} file{pagination.total !== 1 ? 's' : ''} need attention
			</p>
		</div>
	</div>

	<!-- Filters -->
	<UnmatchedFilters
		onToggleCheckboxes={(showing) => {
			showCheckboxes = showing;
		}}
	/>

	<!-- Library issues panel (missing/invalid root folders) -->
	<UnmatchedLibraryIssues unmatchedFileCount={pagination.total} />

	<!-- Loading State -->
	{#if loading}
		<div class="flex items-center justify-center py-12">
			<span class="loading loading-lg loading-spinner"></span>
		</div>

		<!-- Bulk Actions -->
	{:else if showCheckboxes && selectedCount > 0}
		<UnmatchedBulkActions
			onMatch={handleBatchMatch}
			onDelete={() => {
				// For bulk delete, we could show a different modal
				toasts.info('Bulk delete not yet implemented');
			}}
		/>

		<!-- Empty State -->
	{:else if !hasData}
		<UnmatchedEmptyState />

		<!-- Folder View -->
	{:else if viewMode === 'folder'}
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<div>
					<h2 class="text-xl font-semibold">Folders with Unmatched Files</h2>
					<p class="text-sm text-base-content/70">
						{filteredFolders.length} folder{filteredFolders.length !== 1 ? 's' : ''}
					</p>
				</div>
				{#if filteredFolders.length > 0}
					<div class="flex gap-2">
						<button class="btn btn-ghost btn-sm" onclick={expandAllFolders}> Expand All </button>
						<button class="btn btn-ghost btn-sm" onclick={collapseAllFolders}>
							Collapse All
						</button>
					</div>
				{/if}
			</div>

			<div class="space-y-3">
				{#each filteredFolders as folder (folder.folderPath)}
					<UnmatchedFolderCard
						{folder}
						expanded={expandedFolders.has(folder.folderPath)}
						onToggle={() => toggleFolder(folder.folderPath)}
						onMatch={() => handleMatchFolder(folder)}
					/>
				{/each}
			</div>
		</div>

		<!-- List View -->
	{:else}
		<div class="space-y-3">
			{#each filteredFiles as file (file.id)}
				<UnmatchedFileCard
					{file}
					selected={unmatchedFilesStore.selectedFiles.has(file.id)}
					{showCheckboxes}
					onSelect={() => toggleFileSelection(file.id)}
					onMatch={() => handleMatchFile(file)}
					onDelete={() => handleDeleteFile(file)}
				/>
			{/each}
		</div>
	{/if}

	<!-- Pagination -->
	{#if viewMode === 'list' && files.length > 0}
		<UnmatchedPagination />
	{/if}
</div>

<!-- Match File Modal -->
{#if selectedFile && showMatchModal}
	<MatchFileModal
		open={showMatchModal}
		file={selectedFile}
		onClose={() => {
			showMatchModal = false;
			selectedFile = null;
		}}
		onSuccess={handleMatchSuccess}
	/>
{/if}

<!-- Match Folder Modal -->
{#if selectedFolder && showFolderMatchModal}
	<MatchFolderModal
		open={showFolderMatchModal}
		folder={selectedFolder}
		onClose={() => {
			showFolderMatchModal = false;
			selectedFolder = null;
		}}
		onSuccess={handleFolderMatchSuccess}
	/>
{/if}

<!-- Batch Match Modal -->
{#if showBatchMatchModal}
	<BatchMatchModal
		open={showBatchMatchModal}
		selectedFileIds={[...unmatchedFilesStore.selectedFiles]}
		allFiles={files}
		onClose={() => {
			showBatchMatchModal = false;
		}}
		onSuccess={handleBatchMatchSuccess}
	/>
{/if}

<!-- Delete Confirmation Modal -->
<DeleteConfirmationModal
	open={showDeleteModal}
	title="Delete File"
	itemName={fileToDelete?.path.split('/').pop() || 'Unknown'}
	loading={isDeleting}
	onConfirm={performDelete}
	onCancel={() => {
		showDeleteModal = false;
		fileToDelete = null;
	}}
/>
