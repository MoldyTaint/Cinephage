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
		CheckCircle
	} from 'lucide-svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import MatchFileModal from '$lib/components/library/MatchFileModal.svelte';
	import DeleteConfirmationModal from '$lib/components/ui/modal/DeleteConfirmationModal.svelte';

	let { data } = $props();

	// Local state for files (so we can update after actions)
	// Initialized from props, refreshed via refreshList()
	let files = $state(data.files);
	let filter = $state<'all' | 'movie' | 'tv'>('all');
	let isProcessing = $state(false);
	let selectedFile = $state<(typeof files)[0] | null>(null);
	let matchModalOpen = $state(false);

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
	async function performDelete(deleteFile: boolean) {
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

	// Handle successful match
	function handleMatchSuccess(fileId: string) {
		files = files.filter((f) => f.id !== fileId);
		matchModalOpen = false;
		selectedFile = null;
	}

	// Refresh file list
	async function refreshList() {
		try {
			const response = await fetch('/api/library/unmatched');
			const result = await response.json();
			if (result.success) {
				files = result.files;
			}
		} catch (error) {
			console.error('Failed to refresh list:', error);
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
			>
				<RefreshCw class="h-4 w-4 {isProcessing ? 'animate-spin' : ''}" />
				Re-process All
			</button>
		</div>
	</div>

	<!-- Filters -->
	<div class="flex gap-2">
		<button
			class="btn btn-sm {filter === 'all' ? 'btn-primary' : 'btn-ghost'}"
			onclick={() => (filter = 'all')}
		>
			All ({files.length})
		</button>
		<button
			class="btn btn-sm {filter === 'movie' ? 'btn-primary' : 'btn-ghost'}"
			onclick={() => (filter = 'movie')}
		>
			<Clapperboard class="h-4 w-4" />
			Movies ({files.filter((f) => f.mediaType === 'movie').length})
		</button>
		<button
			class="btn btn-sm {filter === 'tv' ? 'btn-primary' : 'btn-ghost'}"
			onclick={() => (filter = 'tv')}
		>
			<Tv class="h-4 w-4" />
			TV Shows ({files.filter((f) => f.mediaType === 'tv').length})
		</button>
	</div>

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
	{:else}
		<!-- Files Table -->
		<div class="overflow-x-auto">
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
</div>

<!-- Match Modal -->
{#if selectedFile}
	<MatchFileModal
		open={matchModalOpen}
		file={selectedFile}
		onClose={() => (matchModalOpen = false)}
		onSuccess={handleMatchSuccess}
	/>
{/if}

<!-- Delete Confirmation Modal -->
<DeleteConfirmationModal
	open={deleteModalOpen}
	title="Delete File"
	itemName={deletingFileName}
	loading={isDeleting}
	onConfirm={performDelete}
	onCancel={() => (deleteModalOpen = false)}
/>
