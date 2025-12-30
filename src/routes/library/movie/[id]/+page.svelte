<script lang="ts">
	import type { PageData } from './$types';
	import {
		LibraryMovieHeader,
		MovieFilesTab,
		MovieEditModal,
		RenamePreviewModal
	} from '$lib/components/library';
	import { InteractiveSearchModal } from '$lib/components/search';
	import { SubtitleSearchModal } from '$lib/components/subtitles';
	import ExtractionProgressModal from '$lib/components/streaming/ExtractionProgressModal.svelte';
	import DeleteConfirmationModal from '$lib/components/ui/modal/DeleteConfirmationModal.svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import type { MovieEditData } from '$lib/components/library/MovieEditModal.svelte';
	import { FileEdit } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	// Prefetch stream when page loads (warms cache for faster playback)
	$effect(() => {
		if (data.movie?.tmdbId) {
			fetch(`/api/streaming/resolve/movie/${data.movie.tmdbId}`, {
				signal: AbortSignal.timeout(5000)
			}).catch(() => {});
		}
	});

	// State
	let isEditModalOpen = $state(false);
	let isSearchModalOpen = $state(false);
	let isSubtitleSearchModalOpen = $state(false);
	let isRenameModalOpen = $state(false);
	let isDeleteModalOpen = $state(false);
	let isExtractionModalOpen = $state(false);
	let extractionMountId = $state<string | null>(null);
	let extractionTitle = $state('');
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let subtitleAutoSearching = $state(false);
	let autoSearching = $state(false);
	let autoSearchResult = $state<{
		found: boolean;
		grabbed: boolean;
		releaseName?: string;
		error?: string;
	} | null>(null);

	// Find quality profile name (use default if none set)
	const qualityProfileName = $derived.by(() => {
		if (data.movie.scoringProfileId) {
			return data.qualityProfiles.find((p) => p.id === data.movie.scoringProfileId)?.name ?? null;
		}
		// No profile set - show the default
		const defaultProfile = data.qualityProfiles.find((p) => p.isDefault);
		return defaultProfile ? `${defaultProfile.name} (Default)` : null;
	});

	// Handlers
	async function handleMonitorToggle(newValue: boolean) {
		isSaving = true;
		try {
			const response = await fetch(`/api/library/movies/${data.movie.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ monitored: newValue })
			});

			if (response.ok) {
				// Update local state
				data.movie.monitored = newValue;
			}
		} catch (error) {
			console.error('Failed to update monitored status:', error);
		} finally {
			isSaving = false;
		}
	}

	function handleSearch() {
		isSearchModalOpen = true;
	}

	async function handleAutoSearch() {
		autoSearching = true;
		autoSearchResult = null;
		try {
			const response = await fetch(`/api/library/movies/${data.movie.id}/auto-search`, {
				method: 'POST'
			});

			const result = await response.json();
			autoSearchResult = {
				found: result.found ?? false,
				grabbed: result.grabbed ?? false,
				releaseName: result.releaseName,
				error: result.error
			};

			// If grabbed successfully, update local state
			if (result.grabbed) {
				// The file won't be immediately available, but we can indicate download started
				// A more complete implementation would refresh data or use SSE
			}
		} catch (error) {
			autoSearchResult = {
				found: false,
				grabbed: false,
				error: error instanceof Error ? error.message : 'Failed to auto-search'
			};
		} finally {
			autoSearching = false;
		}
	}

	interface Release {
		guid: string;
		title: string;
		downloadUrl: string;
		magnetUrl?: string;
		infoHash?: string;
		indexerId: string;
		indexerName: string;
		protocol: string;
	}

	async function handleGrab(
		release: Release,
		streaming?: boolean
	): Promise<{ success: boolean; error?: string }> {
		try {
			const response = await fetch('/api/download/grab', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					downloadUrl: release.downloadUrl,
					magnetUrl: release.magnetUrl,
					infoHash: release.infoHash,
					title: release.title,
					indexerId: release.indexerId,
					indexerName: release.indexerName,
					protocol: release.protocol,
					movieId: data.movie.id,
					mediaType: 'movie',
					streamUsenet: streaming && release.protocol === 'usenet'
				})
			});

			const result = await response.json();

			// Check if extraction is required for this NZB stream
			if (result.success && result.data?.requiresExtraction && result.data?.mountId) {
				// Close search modal and open extraction modal
				isSearchModalOpen = false;
				extractionMountId = result.data.mountId;
				extractionTitle = release.title;
				isExtractionModalOpen = true;
				return { success: true };
			}

			return { success: result.success, error: result.error };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to grab release'
			};
		}
	}

	function handleEdit() {
		isEditModalOpen = true;
	}

	async function handleEditSave(editData: MovieEditData) {
		isSaving = true;
		try {
			const response = await fetch(`/api/library/movies/${data.movie.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(editData)
			});

			if (response.ok) {
				// Update local state
				data.movie.monitored = editData.monitored;
				data.movie.scoringProfileId = editData.scoringProfileId;
				data.movie.rootFolderId = editData.rootFolderId;
				data.movie.minimumAvailability = editData.minimumAvailability;
				data.movie.wantsSubtitles = editData.wantsSubtitles;

				// Update root folder path display
				const newFolder = data.rootFolders.find((f) => f.id === editData.rootFolderId);
				data.movie.rootFolderPath = newFolder?.path ?? null;

				isEditModalOpen = false;
			}
		} catch (error) {
			console.error('Failed to update movie:', error);
		} finally {
			isSaving = false;
		}
	}

	function handleDelete() {
		isDeleteModalOpen = true;
	}

	async function performDelete(deleteFiles: boolean) {
		isDeleting = true;
		try {
			const response = await fetch(
				`/api/library/movies/${data.movie.id}?deleteFiles=${deleteFiles}`,
				{ method: 'DELETE' }
			);
			const result = await response.json();

			if (result.success) {
				toasts.success('Movie files deleted');
				// Reload to show updated state (movie now missing)
				window.location.reload();
			} else {
				toasts.error('Failed to delete movie files', { description: result.error });
			}
		} catch (error) {
			console.error('Failed to delete movie:', error);
			toasts.error('Failed to delete movie');
		} finally {
			isDeleting = false;
			isDeleteModalOpen = false;
		}
	}

	async function handleDeleteFile(fileId: string) {
		if (!confirm('Are you sure you want to delete this file? This cannot be undone.')) {
			return;
		}

		try {
			const response = await fetch(`/api/library/movies/${data.movie.id}/files/${fileId}`, {
				method: 'DELETE'
			});
			const result = await response.json();

			if (result.success) {
				toasts.success('File deleted');
				data.movie.files = data.movie.files.filter((f) => f.id !== fileId);
				data.movie.hasFile = data.movie.files.length > 0;
			} else {
				toasts.error('Failed to delete file', { description: result.error });
			}
		} catch (error) {
			console.error('Failed to delete file:', error);
			toasts.error('Failed to delete file');
		}
	}

	// Subtitle handlers
	function handleSubtitleSearch() {
		isSubtitleSearchModalOpen = true;
	}

	async function handleSubtitleAutoSearch() {
		subtitleAutoSearching = true;
		try {
			const response = await fetch('/api/subtitles/auto-search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ movieId: data.movie.id })
			});

			const result = await response.json();

			if (result.success && result.subtitle) {
				// Refresh subtitles by adding the new one
				data.movie.subtitles = [...(data.movie.subtitles || []), result.subtitle];
			}
		} catch (error) {
			console.error('Failed to auto-search subtitles:', error);
		} finally {
			subtitleAutoSearching = false;
		}
	}

	function handleSubtitleDownloaded() {
		// Refresh the page data to get updated subtitles
		// In a more sophisticated app, we'd invalidate the server load
		window.location.reload();
	}
</script>

<svelte:head>
	<title>{data.movie.title} - Library - Cinephage</title>
</svelte:head>

<div class="flex w-full flex-col gap-6 px-4 pb-20 lg:px-8">
	<!-- Header -->
	<LibraryMovieHeader
		movie={data.movie}
		{qualityProfileName}
		isDownloading={data.queueItem !== null}
		onMonitorToggle={handleMonitorToggle}
		onAutoSearch={handleAutoSearch}
		onSearch={handleSearch}
		onEdit={handleEdit}
		onDelete={handleDelete}
		{autoSearching}
		{autoSearchResult}
	/>

	<!-- Main Content -->
	<div class="grid gap-6 lg:grid-cols-3">
		<!-- Files Section (takes 2 columns on large screens) -->
		<div class="lg:col-span-2">
			<div class="rounded-xl bg-base-200 p-6">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-lg font-semibold">Files</h2>
					{#if data.movie.files.length > 0}
						<button class="btn gap-1 btn-ghost btn-sm" onclick={() => (isRenameModalOpen = true)}>
							<FileEdit class="h-4 w-4" />
							Rename
						</button>
					{/if}
				</div>
				<MovieFilesTab
					files={data.movie.files}
					subtitles={data.movie.subtitles}
					onDeleteFile={handleDeleteFile}
					onSearch={handleSearch}
					onSubtitleSearch={handleSubtitleSearch}
					onSubtitleAutoSearch={handleSubtitleAutoSearch}
					{subtitleAutoSearching}
				/>
			</div>
		</div>

		<!-- Sidebar -->
		<div class="space-y-6">
			<!-- Overview -->
			{#if data.movie.overview}
				<div class="rounded-xl bg-base-200 p-6">
					<h3 class="mb-2 font-semibold">Overview</h3>
					<p class="text-sm leading-relaxed text-base-content/80">
						{data.movie.overview}
					</p>
				</div>
			{/if}

			<!-- Details -->
			<div class="rounded-xl bg-base-200 p-6">
				<h3 class="mb-3 font-semibold">Details</h3>
				<dl class="space-y-2 text-sm">
					{#if data.movie.originalTitle && data.movie.originalTitle !== data.movie.title}
						<div class="flex justify-between">
							<dt class="text-base-content/60">Original Title</dt>
							<dd>{data.movie.originalTitle}</dd>
						</div>
					{/if}
					{#if data.movie.runtime}
						<div class="flex justify-between">
							<dt class="text-base-content/60">Runtime</dt>
							<dd>{Math.floor(data.movie.runtime / 60)}h {data.movie.runtime % 60}m</dd>
						</div>
					{/if}
					{#if data.movie.genres && data.movie.genres.length > 0}
						<div class="flex justify-between">
							<dt class="text-base-content/60">Genres</dt>
							<dd class="text-right">{data.movie.genres.join(', ')}</dd>
						</div>
					{/if}
					{#if data.movie.imdbId}
						<div class="flex justify-between">
							<dt class="text-base-content/60">IMDb</dt>
							<dd>
								<a
									href="https://www.imdb.com/title/{data.movie.imdbId}"
									target="_blank"
									rel="noopener noreferrer"
									class="link link-primary"
								>
									{data.movie.imdbId}
								</a>
							</dd>
						</div>
					{/if}
					<div class="flex justify-between">
						<dt class="text-base-content/60">TMDB ID</dt>
						<dd>
							<a
								href="https://www.themoviedb.org/movie/{data.movie.tmdbId}"
								target="_blank"
								rel="noopener noreferrer"
								class="link link-primary"
							>
								{data.movie.tmdbId}
							</a>
						</dd>
					</div>
				</dl>
			</div>

			<!-- Path Info -->
			<div class="rounded-xl bg-base-200 p-6">
				<h3 class="mb-3 font-semibold">Storage</h3>
				<dl class="space-y-2 text-sm">
					<div>
						<dt class="text-base-content/60">Path</dt>
						<dd class="mt-1 font-mono text-xs break-all">
							{data.movie.rootFolderPath}{data.movie.path}
						</dd>
					</div>
				</dl>
			</div>
		</div>
	</div>
</div>

<!-- Edit Modal -->
<MovieEditModal
	open={isEditModalOpen}
	movie={data.movie}
	qualityProfiles={data.qualityProfiles}
	rootFolders={data.rootFolders}
	saving={isSaving}
	onClose={() => (isEditModalOpen = false)}
	onSave={handleEditSave}
/>

<!-- Search Modal -->
<InteractiveSearchModal
	open={isSearchModalOpen}
	title={data.movie.title}
	tmdbId={data.movie.tmdbId}
	imdbId={data.movie.imdbId}
	year={data.movie.year}
	mediaType="movie"
	scoringProfileId={data.movie.scoringProfileId}
	onClose={() => (isSearchModalOpen = false)}
	onGrab={handleGrab}
/>

<!-- Subtitle Search Modal -->
<SubtitleSearchModal
	open={isSubtitleSearchModalOpen}
	title={data.movie.title}
	movieId={data.movie.id}
	onClose={() => (isSubtitleSearchModalOpen = false)}
	onDownloaded={handleSubtitleDownloaded}
/>

<!-- Rename Preview Modal -->
<RenamePreviewModal
	open={isRenameModalOpen}
	mediaType="movie"
	mediaId={data.movie.id}
	mediaTitle={data.movie.title}
	onClose={() => (isRenameModalOpen = false)}
	onRenamed={() => location.reload()}
/>

<!-- Delete Confirmation Modal -->
<DeleteConfirmationModal
	open={isDeleteModalOpen}
	title="Delete Movie"
	itemName={data.movie.title}
	loading={isDeleting}
	onConfirm={performDelete}
	onCancel={() => (isDeleteModalOpen = false)}
/>

<!-- Extraction Progress Modal -->
{#if extractionMountId}
	<ExtractionProgressModal
		open={isExtractionModalOpen}
		mountId={extractionMountId}
		title={extractionTitle}
		onClose={() => {
			isExtractionModalOpen = false;
			extractionMountId = null;
		}}
		onComplete={() => {
			isExtractionModalOpen = false;
			extractionMountId = null;
			toasts.success('Extraction complete - content is ready to stream');
			location.reload();
		}}
	/>
{/if}
