<script lang="ts">
	import {
		Clapperboard,
		Tv,
		RefreshCw,
		Trash2,
		Link,
		HardDrive,
		Calendar,
		AlertCircle,
		CheckCircle,
		ChevronDown,
		ChevronRight,
		AlertTriangle,
		Folder,
		List,
		ChevronsUpDown
	} from 'lucide-svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import MatchFileModal from '$lib/components/library/MatchFileModal.svelte';
	import MatchFolderModal from '$lib/components/library/MatchFolderModal.svelte';
	import DeleteConfirmationModal from '$lib/components/ui/modal/DeleteConfirmationModal.svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Local state for files (so we can update after actions)
	// Initialized from props, refreshed via refreshList()
	let files = $state<PageData['files']>([]);
	let folders = $state<PageData['folders']>([]);
	let libraryItems = $state<PageData['libraryItems']>([]);
	let rootFolders = $state<PageData['rootFolders']>([]);
	$effect(() => {
		files = data.files;
		folders = data.folders ?? [];
		libraryItems = data.libraryItems ?? [];
		rootFolders = data.rootFolders ?? [];
		libraryIssuesOpen = (data.files?.length ?? 0) === 0;
	});
	let filter = $state<'all' | 'movie' | 'tv'>('all');
	let viewMode = $state<'list' | 'folder'>('list');
	let isProcessing = $state(false);
	let selectedFile = $state<(typeof files)[0] | null>(null);
	let matchModalOpen = $state(false);
	let matchFolderModalOpen = $state(false);
	let selectedFolder = $state<(typeof folders)[0] | null>(null);
	let expandedFolders = $state<Set<string>>(new Set());
	let libraryIssuesOpen = $state(false);
	let savingIssues = new SvelteMap<string, boolean>();
	let selectedIssues = $state<string[]>([]);
	let libraryIssuesFilter = $state<'movie' | 'tv'>('movie');
	let bulkMovieRootFolder = $state('');
	let bulkTvRootFolder = $state('');
	let bulkSavingMovie = $state(false);
	let bulkSavingTv = $state(false);
	const movieFolders = $derived(rootFolders.filter((folder) => folder.mediaType === 'movie'));
	const tvFolders = $derived(rootFolders.filter((folder) => folder.mediaType === 'tv'));
	const selectedCount = $derived(selectedIssues.length);
	const movieIssueCount = $derived(
		libraryItems.filter((item) => item.mediaType === 'movie').length
	);
	const tvIssueCount = $derived(libraryItems.filter((item) => item.mediaType === 'tv').length);
	const filteredLibraryItems = $derived(() =>
		libraryItems.filter((item) => item.mediaType === libraryIssuesFilter)
	);

	// Filter folders based on media type
	const filteredFolders = $derived(() => {
		if (filter === 'all') return folders;
		return folders.filter((f) => f.mediaType === filter);
	});

	$effect(() => {
		if (movieIssueCount > 0 && tvIssueCount === 0 && libraryIssuesFilter !== 'movie') {
			libraryIssuesFilter = 'movie';
		} else if (tvIssueCount > 0 && movieIssueCount === 0 && libraryIssuesFilter !== 'tv') {
			libraryIssuesFilter = 'tv';
		}
	});

	// Delete modal state
	let deleteModalOpen = $state(false);
	let deletingFileId = $state<string | null>(null);
	let deletingFileName = $state<string>('');
	let isDeleting = $state(false);

	// Filtered files based on filter selection
	const filteredFiles = $derived(() => {
		if (filter === 'all') return files;
		return files.filter((f) => f.mediaType === filter);
	});

	// Format file size
	function formatSize(bytes: number | null): string {
		if (!bytes) return 'Unknown';
		const gb = bytes / (1024 * 1024 * 1024);
		if (gb >= 1) return `${gb.toFixed(2)} GB`;
		const mb = bytes / (1024 * 1024);
		return `${mb.toFixed(1)} MB`;
	}

	// Format relative path (remove root folder path prefix)
	function formatPath(fullPath: string, rootPath: string | null): string {
		if (!rootPath) return fullPath;
		if (fullPath.startsWith(rootPath)) {
			return fullPath.substring(rootPath.length).replace(/^\//, '');
		}
		return fullPath;
	}

	// Format date
	function formatDate(dateStr: string | null): string {
		if (!dateStr) return 'Unknown';
		return new Date(dateStr).toLocaleDateString();
	}

	// Re-process all unmatched files
	async function reprocessAll() {
		if (files.length === 0) {
			toasts.info('No unmatched files to process');
			return;
		}
		isProcessing = true;
		try {
			const response = await fetch('/api/library/unmatched', { method: 'POST' });
			const result = await response.json();

			if (result.success) {
				toasts.success(`Processed ${result.processed} files`, {
					description: `${result.matched} matched, ${result.failed} still unmatched`
				});
				// Refresh the list
				await refreshList();
			} else {
				toasts.error('Failed to process files', { description: result.error });
			}
		} catch {
			toasts.error('Error processing files');
		} finally {
			isProcessing = false;
		}
	}

	// Show delete confirmation modal
	function confirmDelete(file: (typeof files)[0]) {
		deletingFileId = file.id;
		deletingFileName = file.path.split('/').pop() || file.path;
		deleteModalOpen = true;
	}

	// Perform deletion with optional file delete
	async function performDelete(deleteFile: boolean, _removeFromLibrary: boolean) {
		if (!deletingFileId) return;

		isDeleting = true;
		try {
			const url = deleteFile
				? `/api/library/unmatched/${deletingFileId}?deleteFile=true`
				: `/api/library/unmatched/${deletingFileId}`;
			const response = await fetch(url, { method: 'DELETE' });
			const result = await response.json();

			if (result.success) {
				toasts.success(deleteFile ? 'File deleted from disk' : 'File removed from list');
				files = files.filter((f) => f.id !== deletingFileId);
			} else {
				toasts.error('Failed to remove file', { description: result.error });
			}
		} catch {
			toasts.error('Error removing file');
		} finally {
			isDeleting = false;
			deleteModalOpen = false;
			deletingFileId = null;
		}
	}

	// Open match modal for a file
	function openMatchModal(file: (typeof files)[0]) {
		selectedFile = file;
		matchModalOpen = true;
	}

	// Open match modal for a folder
	function openFolderMatchModal(folder: (typeof folders)[0]) {
		selectedFolder = folder;
		matchFolderModalOpen = true;
	}

	// Handle successful match
	function handleMatchSuccess(fileId: string) {
		files = files.filter((f) => f.id !== fileId);
		matchModalOpen = false;
		selectedFile = null;
	}

	// Handle successful folder match
	function handleFolderMatchSuccess(folderPath: string) {
		// Remove all files in the matched folder
		files = files.filter((f) => !f.path.startsWith(folderPath));
		// Remove the folder from the list
		folders = folders.filter((f) => f.folderPath !== folderPath);
		matchFolderModalOpen = false;
		selectedFolder = null;
	}

	// Toggle folder expansion
	function toggleFolderExpansion(folderPath: string) {
		if (expandedFolders.has(folderPath)) {
			expandedFolders.delete(folderPath);
		} else {
			expandedFolders.add(folderPath);
		}
		expandedFolders = expandedFolders; // Trigger reactivity
	}

	// Refresh file list
	async function refreshList() {
		try {
			const response = await fetch('/api/library/unmatched');
			const result = await response.json();
			if (result.success) {
				files = result.files;
				libraryItems = result.libraryItems ?? [];
				rootFolders = result.rootFolders ?? [];
				selectedIssues = [];
			}
		} catch (error) {
			console.error('Failed to refresh list:', error);
		}
	}

	async function updateRootFolder(
		item: { id: string; mediaType: 'movie' | 'tv' },
		rootFolderId: string,
		options: { silent?: boolean } = {}
	) {
		if (!rootFolderId) return;
		savingIssues.set(item.id, true);
		try {
			const endpoint =
				item.mediaType === 'movie'
					? `/api/library/movies/${item.id}`
					: `/api/library/series/${item.id}`;
			const response = await fetch(endpoint, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ rootFolderId })
			});
			const result = await response.json();
			if (response.ok && result.success !== false) {
				if (!options.silent) {
					toasts.success('Root folder updated');
				}
				libraryItems = libraryItems.filter((i) => i.id !== item.id);
			} else {
				if (!options.silent) {
					toasts.error('Failed to update root folder', {
						description: result.error || 'Please try again'
					});
				}
			}
		} catch {
			if (!options.silent) {
				toasts.error('Failed to update root folder');
			}
		} finally {
			savingIssues.delete(item.id);
		}
	}

	function toggleIssueSelection(id: string) {
		if (selectedIssues.includes(id)) {
			selectedIssues = selectedIssues.filter((itemId) => itemId !== id);
		} else {
			selectedIssues = [...selectedIssues, id];
		}
	}

	function selectAllIssues(mediaType: 'movie' | 'tv') {
		const ids = filteredLibraryItems()
			.filter((item) => item.mediaType === mediaType)
			.map((item) => item.id);
		selectedIssues = ids;
	}

	function clearIssueSelection() {
		selectedIssues = [];
	}

	async function bulkAssignRootFolder(mediaType: 'movie' | 'tv', rootFolderId: string) {
		if (!rootFolderId) return;
		const selectedItems = filteredLibraryItems().filter(
			(item) => item.mediaType === mediaType && selectedIssues.includes(item.id)
		);
		if (selectedItems.length === 0) {
			toasts.info('Select items to apply the bulk action');
			return;
		}
		if (mediaType === 'movie') {
			bulkSavingMovie = true;
		} else {
			bulkSavingTv = true;
		}
		try {
			for (const item of selectedItems) {
				await updateRootFolder(item, rootFolderId, { silent: true });
			}
			toasts.success('Root folder updated for selected items');
			selectedIssues = selectedIssues.filter((id) => !selectedItems.some((item) => item.id === id));
		} catch {
			toasts.error('Failed to update some items');
		} finally {
			if (mediaType === 'movie') {
				bulkSavingMovie = false;
			} else {
				bulkSavingTv = false;
			}
		}
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold">Unmatched Files</h1>
			<p class="text-base-content/70">
				{files.length} file{files.length !== 1 ? 's' : ''} need attention
			</p>
		</div>
		<div class="flex gap-2">
			<button
				class="btn btn-outline"
				onclick={reprocessAll}
				disabled={isProcessing || files.length === 0}
				title="Re-process unmatched files only"
			>
				<RefreshCw class="h-4 w-4 {isProcessing ? 'animate-spin' : ''}" />
				Re-process Unmatched Files
			</button>
		</div>
	</div>

	<!-- Filters and View Toggle -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex gap-2">
			<button
				class="btn btn-sm {filter === 'all' ? 'btn-primary' : 'btn-ghost'}"
				onclick={() => (filter = 'all')}
			>
				All ({viewMode === 'folder' ? folders.length : files.length})
			</button>
			<button
				class="btn btn-sm {filter === 'movie' ? 'btn-primary' : 'btn-ghost'}"
				onclick={() => (filter = 'movie')}
			>
				<Clapperboard class="h-4 w-4" />
				Movies ({viewMode === 'folder'
					? folders.filter((f) => f.mediaType === 'movie').length
					: files.filter((f) => f.mediaType === 'movie').length})
			</button>
			<button
				class="btn btn-sm {filter === 'tv' ? 'btn-primary' : 'btn-ghost'}"
				onclick={() => (filter = 'tv')}
			>
				<Tv class="h-4 w-4" />
				TV Shows ({viewMode === 'folder'
					? folders.filter((f) => f.mediaType === 'tv').length
					: files.filter((f) => f.mediaType === 'tv').length})
			</button>
		</div>

		<!-- View Mode Toggle -->
		{#if folders.length > 0}
			<div class="flex gap-1 rounded-lg bg-base-200 p-1">
				<button
					class="btn btn-sm {viewMode === 'list' ? 'btn-primary' : 'btn-ghost'}"
					onclick={() => (viewMode = 'list')}
					title="List View - Individual files"
				>
					<List class="h-4 w-4" />
					<span class="hidden sm:inline">List</span>
				</button>
				<button
					class="btn btn-sm {viewMode === 'folder' ? 'btn-primary' : 'btn-ghost'}"
					onclick={() => (viewMode = 'folder')}
					title="Folder View - Grouped by folder"
				>
					<Folder class="h-4 w-4" />
					<span class="hidden sm:inline">Folders</span>
				</button>
			</div>
		{/if}
	</div>

	<!-- Library Issues (separate from unmatched files) -->
	{#if libraryItems.length > 0}
		<div class="card bg-base-200">
			<button
				class="card-body flex-row items-center justify-between gap-3 p-4 text-left"
				onclick={() => (libraryIssuesOpen = !libraryIssuesOpen)}
			>
				<div class="flex items-center gap-2">
					<AlertCircle class="h-5 w-5 text-warning" />
					<div>
						<div class="font-semibold">Library Issues</div>
						<div class="text-xs text-base-content/60">
							Missing root folder on {libraryItems.length} item{libraryItems.length !== 1
								? 's'
								: ''}
						</div>
					</div>
				</div>
				{#if libraryIssuesOpen}
					<ChevronDown class="h-4 w-4 text-base-content/60" />
				{:else}
					<ChevronRight class="h-4 w-4 text-base-content/60" />
				{/if}
			</button>
			{#if libraryIssuesOpen}
				<div class="border-t border-base-300 px-4 pb-4">
					<p class="pt-3 text-xs text-base-content/60">
						These library items have no root folder set. Select a root folder to fix them.
					</p>
					<div class="mt-3 flex flex-wrap gap-2">
						<button
							class="btn btn-xs {libraryIssuesFilter === 'movie' ? 'btn-primary' : 'btn-ghost'}"
							onclick={() => (libraryIssuesFilter = 'movie')}
							disabled={movieIssueCount === 0}
						>
							Movies ({movieIssueCount})
						</button>
						<button
							class="btn btn-xs {libraryIssuesFilter === 'tv' ? 'btn-primary' : 'btn-ghost'}"
							onclick={() => (libraryIssuesFilter = 'tv')}
							disabled={tvIssueCount === 0}
						>
							TV Shows ({tvIssueCount})
						</button>
					</div>
					<div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
						<div class="flex flex-wrap items-center gap-2 text-xs text-base-content/60">
							<span>{selectedCount} selected</span>
							{#if libraryIssuesFilter === 'movie'}
								<button class="btn btn-ghost btn-xs" onclick={() => selectAllIssues('movie')}>
									Select all Movies
								</button>
							{/if}
							{#if libraryIssuesFilter === 'tv'}
								<button class="btn btn-ghost btn-xs" onclick={() => selectAllIssues('tv')}>
									Select all TV
								</button>
							{/if}
							<button class="btn btn-ghost btn-xs" onclick={clearIssueSelection}> Clear </button>
						</div>
						{#if filteredLibraryItems().some((item) => item.mediaType === 'movie')}
							<div class="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
								{#if movieFolders.length > 0}
									<select
										class="select-bordered select w-full select-sm sm:w-72"
										bind:value={bulkMovieRootFolder}
										disabled={bulkSavingMovie}
									>
										<option value="" selected>Select root folder</option>
										{#each movieFolders as folder (folder.id)}
											<option value={folder.id}>{folder.name} — {folder.path}</option>
										{/each}
									</select>
									<button
										class="btn btn-outline btn-xs"
										disabled={!bulkMovieRootFolder || bulkSavingMovie || selectedCount === 0}
										onclick={() => bulkAssignRootFolder('movie', bulkMovieRootFolder)}
									>
										Apply to selected
									</button>
								{:else}
									<span class="text-xs text-warning">
										No Movie root folders configured.
										<a class="ml-1 link" href="/settings/general">Add a root folder</a>
									</span>
								{/if}
							</div>
						{/if}
						{#if filteredLibraryItems().some((item) => item.mediaType === 'tv')}
							<div class="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
								{#if tvFolders.length > 0}
									<select
										class="select-bordered select w-full select-sm sm:w-72"
										bind:value={bulkTvRootFolder}
										disabled={bulkSavingTv}
									>
										<option value="" selected>Select root folder</option>
										{#each tvFolders as folder (folder.id)}
											<option value={folder.id}>{folder.name} — {folder.path}</option>
										{/each}
									</select>
									<button
										class="btn btn-outline btn-xs"
										disabled={!bulkTvRootFolder || bulkSavingTv || selectedCount === 0}
										onclick={() => bulkAssignRootFolder('tv', bulkTvRootFolder)}
									>
										Apply to selected
									</button>
								{:else}
									<span class="text-xs text-warning">
										No TV root folders configured.
										<a class="ml-1 link" href="/settings/general">Add a root folder</a>
									</span>
								{/if}
							</div>
						{/if}
					</div>
					<div class="space-y-2 pt-3">
						{#each filteredLibraryItems() as item (item.id)}
							{@const folderOptions = rootFolders.filter(
								(folder) => folder.mediaType === item.mediaType
							)}
							<div
								class="flex flex-col gap-3 rounded-lg bg-base-300/60 p-3 sm:flex-row sm:items-center"
							>
								<div class="flex items-center gap-2">
									<input
										type="checkbox"
										class="checkbox checkbox-sm"
										checked={selectedIssues.includes(item.id)}
										onchange={() => toggleIssueSelection(item.id)}
									/>
									<div
										class="flex h-12 w-8 items-center justify-center rounded bg-base-100/70 text-xs font-semibold text-base-content/70"
									>
										{item.mediaType === 'movie' ? 'M' : 'TV'}
									</div>
									<AlertTriangle class="h-4 w-4 text-warning" />
								</div>
								<div class="min-w-0 flex-1">
									<a
										class="font-medium wrap-break-word hover:text-primary"
										href={item.mediaType === 'movie'
											? `/library/movie/${item.id}`
											: `/library/tv/${item.id}`}
									>
										{item.title}
										{#if item.year}
											<span class="text-base-content/50">({item.year})</span>
										{/if}
									</a>
									<div class="text-xs text-base-content/60">Root folder not set</div>
								</div>
								{#if folderOptions.length > 0}
									<select
										class="select-bordered select w-full select-sm sm:w-72"
										disabled={savingIssues.get(item.id) ?? false}
										onchange={(e) =>
											updateRootFolder(item, (e.currentTarget as HTMLSelectElement).value)}
									>
										<option value="" selected>Select root folder</option>
										{#each folderOptions as folder (folder.id)}
											<option value={folder.id}>{folder.name} — {folder.path}</option>
										{/each}
									</select>
								{:else}
									<span class="text-xs text-warning">No root folders for this type</span>
								{/if}
								<a
									class="btn btn-ghost btn-xs"
									title="Open details"
									href={item.mediaType === 'movie'
										? `/library/movie/${item.id}`
										: `/library/tv/${item.id}`}
								>
									<Link class="h-4 w-4" />
								</a>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Folder View -->
	{#if viewMode === 'folder' && filteredFolders().length > 0}
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-xl font-semibold">Folders with Unmatched Files</h2>
				<p class="text-sm text-base-content/70">
					{filteredFolders().length} folder{filteredFolders().length !== 1 ? 's' : ''}
				</p>
			</div>

			<!-- Folder Cards -->
			<div class="space-y-3">
				{#each filteredFolders() as folder (folder.folderPath)}
					<div class="card bg-base-200">
						<!-- Folder Header -->
						<div class="card-body p-4">
							<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								<div class="flex items-start gap-3">
									<div class="rounded-lg bg-base-300 p-2">
										<Folder class="h-5 w-5 text-primary" />
									</div>
									<div class="min-w-0 flex-1">
										<h3 class="truncate font-medium" title={folder.folderPath}>
											{folder.folderName}
										</h3>
										<p class="truncate text-sm text-base-content/60">
											{folder.folderPath}
										</p>
										<div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
											<span class="badge badge-sm">
												{folder.fileCount} file{folder.fileCount !== 1 ? 's' : ''}
											</span>
											<span class="badge badge-outline badge-sm">
												{folder.mediaType === 'movie' ? 'Movie' : 'TV'}
											</span>
											{#each folder.reasons as reason}
												<span class="badge badge-sm badge-warning">{reason}</span>
											{/each}
										</div>
										{#if folder.commonParsedTitle}
											<p class="mt-1 text-xs text-base-content/50">
												Parsed: {folder.commonParsedTitle}
											</p>
										{/if}
									</div>
								</div>
								<div class="flex items-center gap-2">
									<button
										class="btn btn-ghost btn-sm"
										onclick={() => toggleFolderExpansion(folder.folderPath)}
									>
										<ChevronsUpDown class="h-4 w-4" />
										{expandedFolders.has(folder.folderPath) ? 'Collapse' : 'Expand'}
									</button>
									<button
										class="btn btn-sm btn-primary"
										onclick={() => openFolderMatchModal(folder)}
									>
										<Link class="h-4 w-4" />
										Match Folder
									</button>
								</div>
							</div>

							<!-- Expanded Files List -->
							{#if expandedFolders.has(folder.folderPath)}
								<div class="mt-4 border-t border-base-300 pt-4">
									<p class="mb-2 text-xs font-medium text-base-content/60">Files in this folder:</p>
									<div class="space-y-1">
										{#each folder.files as file}
											<div
												class="flex items-center justify-between rounded bg-base-300/50 px-3 py-2 text-sm"
											>
												<div class="flex min-w-0 flex-1 items-center gap-2">
													{#if file.mediaType === 'movie'}
														<Clapperboard class="h-3 w-3 shrink-0 text-primary" />
													{:else}
														<Tv class="h-3 w-3 shrink-0 text-secondary" />
													{/if}
													<span class="truncate">{file.path.split('/').pop()}</span>
												</div>
												<div class="flex shrink-0 items-center gap-2">
													{#if file.parsedSeason !== null && file.parsedEpisode !== null}
														<span class="badge badge-sm badge-secondary">
															S{String(file.parsedSeason).padStart(2, '0')}E{String(
																file.parsedEpisode
															).padStart(2, '0')}
														</span>
													{/if}
													<span class="text-xs text-base-content/50">{formatSize(file.size)}</span>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{:else if viewMode === 'folder' && filteredFolders().length === 0}
		<div class="card bg-base-200">
			<div class="card-body items-center py-12 text-center">
				<p class="text-base-content/70">No folders to show with current filter</p>
			</div>
		</div>
	{/if}

	<!-- Empty State -->
	{#if files.length === 0}
		<div class="card bg-base-200">
			<div class="card-body items-center py-12 text-center">
				<div class="rounded-full bg-success/10 p-4">
					<CheckCircle class="h-12 w-12 text-success" />
				</div>
				<h2 class="mt-4 card-title">All Files Matched</h2>
				<p class="text-base-content/70">
					No unmatched files in your library. Everything is organized!
				</p>
			</div>
		</div>
	{:else if filteredFiles().length === 0}
		<div class="card bg-base-200">
			<div class="card-body items-center py-12 text-center">
				<p class="text-base-content/70">No {filter === 'movie' ? 'movie' : 'TV'} files to show</p>
			</div>
		</div>
	{:else if viewMode === 'list'}
		<!-- Mobile list -->
		<div class="space-y-3 md:hidden">
			{#each filteredFiles() as file (file.id)}
				<div class="rounded-lg bg-base-200 p-3">
					<div class="flex items-start justify-between gap-3">
						<div class="flex items-start gap-3">
							<div class="rounded-lg bg-base-300 p-2">
								{#if file.mediaType === 'movie'}
									<Clapperboard class="h-5 w-5 text-primary" />
								{:else}
									<Tv class="h-5 w-5 text-secondary" />
								{/if}
							</div>
							<div class="min-w-0">
								<p class="font-medium wrap-break-word" title={file.path}>
									{formatPath(file.path, file.rootFolderPath)}
								</p>
								<div class="mt-1 flex items-center gap-2 text-xs text-base-content/50">
									<HardDrive class="h-3 w-3" />
									<span>{formatSize(file.size)}</span>
								</div>
								<div class="mt-2 flex flex-wrap gap-1">
									{#if file.parsedYear}
										<span class="badge badge-ghost badge-sm">{file.parsedYear}</span>
									{/if}
									{#if file.mediaType === 'tv' && file.parsedSeason !== null}
										<span class="badge badge-sm badge-secondary">
											S{String(file.parsedSeason).padStart(2, '0')}
											{#if file.parsedEpisode !== null}
												E{String(file.parsedEpisode).padStart(2, '0')}
											{/if}
										</span>
									{/if}
									<span class="badge badge-outline badge-sm">
										{file.mediaType === 'movie' ? 'Movie' : 'TV'}
									</span>
								</div>
								{#if file.reason}
									<div class="mt-2 flex items-center gap-1 text-xs text-warning">
										<AlertCircle class="h-3 w-3" />
										<span>{file.reason}</span>
									</div>
								{/if}
								<div class="mt-1 flex items-center gap-1 text-xs text-base-content/50">
									<Calendar class="h-3 w-3" />
									<span>{formatDate(file.discoveredAt)}</span>
								</div>
							</div>
						</div>
						<div class="flex flex-col gap-8">
							<button class="btn btn-ghost btn-xs" onclick={() => openMatchModal(file)}>
								<Link class="h-4 w-4" />
								Match
							</button>
							<button class="btn text-error btn-ghost btn-xs" onclick={() => confirmDelete(file)}>
								<Trash2 class="h-4 w-4" />
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- Files Table -->
		<div class="hidden overflow-x-auto md:block">
			<table class="table">
				<thead>
					<tr>
						<th>File</th>
						<th>Parsed Info</th>
						<th>Details</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredFiles() as file (file.id)}
						<tr class="hover">
							<td>
								<div class="flex items-start gap-3">
									<div class="rounded-lg bg-base-300 p-2">
										{#if file.mediaType === 'movie'}
											<Clapperboard class="h-5 w-5 text-primary" />
										{:else}
											<Tv class="h-5 w-5 text-secondary" />
										{/if}
									</div>
									<div class="min-w-0">
										<p class="max-w-xs truncate font-medium" title={file.path}>
											{formatPath(file.path, file.rootFolderPath)}
										</p>
										<div class="flex items-center gap-2 text-xs text-base-content/50">
											<HardDrive class="h-3 w-3" />
											<span>{formatSize(file.size)}</span>
										</div>
									</div>
								</div>
							</td>
							<td>
								<div class="space-y-1">
									{#if file.parsedTitle}
										<p class="font-medium">{file.parsedTitle}</p>
									{:else}
										<p class="text-base-content/50 italic">Could not parse title</p>
									{/if}
									<div class="flex flex-wrap gap-1">
										{#if file.parsedYear}
											<span class="badge badge-ghost badge-sm">{file.parsedYear}</span>
										{/if}
										{#if file.mediaType === 'tv' && file.parsedSeason !== null}
											<span class="badge badge-sm badge-secondary">
												S{String(file.parsedSeason).padStart(2, '0')}
												{#if file.parsedEpisode !== null}
													E{String(file.parsedEpisode).padStart(2, '0')}
												{/if}
											</span>
										{/if}
										<span class="badge badge-outline badge-sm">
											{file.mediaType === 'movie' ? 'Movie' : 'TV'}
										</span>
									</div>
								</div>
							</td>
							<td>
								<div class="space-y-1 text-sm">
									{#if file.reason}
										<div class="flex items-center gap-1 text-warning">
											<AlertCircle class="h-3 w-3" />
											<span>{file.reason}</span>
										</div>
									{/if}
									<div class="flex items-center gap-1 text-base-content/50">
										<Calendar class="h-3 w-3" />
										<span>{formatDate(file.discoveredAt)}</span>
									</div>
								</div>
							</td>
							<td>
								<div class="flex gap-1">
									<button
										class="btn btn-ghost btn-sm"
										onclick={() => openMatchModal(file)}
										title="Match to TMDB"
									>
										<Link class="h-4 w-4" />
										Match
									</button>
									<button
										class="btn text-error btn-ghost btn-sm"
										onclick={() => confirmDelete(file)}
										title="Delete file"
									>
										<Trash2 class="h-4 w-4" />
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<!-- Match Modal -->
	{#if selectedFile}
		<MatchFileModal
			open={matchModalOpen}
			file={selectedFile}
			onClose={() => (matchModalOpen = false)}
			onSuccess={handleMatchSuccess}
		/>
	{/if}

	<!-- Match Folder Modal -->
	{#if selectedFolder}
		<MatchFolderModal
			open={matchFolderModalOpen}
			folder={selectedFolder}
			onClose={() => (matchFolderModalOpen = false)}
			onSuccess={handleFolderMatchSuccess}
		/>
	{/if}
</div>

<!-- Delete Confirmation Modal -->
<DeleteConfirmationModal
	open={deleteModalOpen}
	title="Delete File"
	itemName={deletingFileName}
	loading={isDeleting}
	onConfirm={performDelete}
	onCancel={() => (deleteModalOpen = false)}
/>
