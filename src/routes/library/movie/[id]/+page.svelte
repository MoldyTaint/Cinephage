<script lang="ts">
	import type { PageData } from './$types';
	import {
		LibraryMovieHeader,
		MovieFilesTab,
		MovieEditModal,
		RenamePreviewModal,
		ScoreDetailModal
	} from '$lib/components/library';
	import type { FileScoreResponse } from '$lib/types/score';
	import { InteractiveSearchModal } from '$lib/components/search';
	import { SubtitleSearchModal } from '$lib/components/subtitles';
	import DeleteConfirmationModal from '$lib/components/ui/modal/DeleteConfirmationModal.svelte';
	import { ConfirmationModal } from '$lib/components/ui/modal';
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
	let isDeleteFileModalOpen = $state(false);
	let deletingFileId = $state<string | null>(null);
	let deletingFileName = $state<string | null>(null);
	let isScoreModalOpen = $state(false);
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let isDeletingFile = $state(false);
	let subtitleAutoSearching = $state(false);
	let autoSearching = $state(false);
	let autoSearchResult = $state<{
		found: boolean;
		grabbed: boolean;
		releaseName?: string;
		error?: string;
	} | null>(null);
	let scoreData = $state<FileScoreResponse | null>(null);
	let scoreLoading = $state(false);
	let scoreFetched = $state(false);

	// Derived score info for header badge (use normalized score for comparison with search results)
	const scoreInfo = $derived.by(() => {
		if (!scoreData) return null;
		return {
			score: scoreData.normalizedScore,
			isAtCutoff: scoreData.upgradeStatus.isAtCutoff,
			upgradesAllowed: scoreData.upgradeStatus.upgradesAllowed
		};
	});

	// Find quality profile name (use default if none set)
	const qualityProfileName = $derived.by(() => {
		if (data.movie.scoringProfileId) {
			return data.qualityProfiles.find((p) => p.id === data.movie.scoringProfileId)?.name ?? null;
		}
		// No profile set - show the default
		const defaultProfile = data.qualityProfiles.find((p) => p.isDefault);
		return defaultProfile ? `${defaultProfile.name} (Default)` : null;
	});

	const movieStoragePath = $derived.by(() => {
		const rootPath = data.movie.rootFolderPath ?? '';
		const relativePath = data.movie.path ?? '';

		if (!rootPath) {
			return relativePath;
		}

		if (!relativePath) {
			return rootPath;
		}

		const normalizedRoot = rootPath.endsWith('/') ? rootPath.slice(0, -1) : rootPath;
		const normalizedRelative = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;

		return `${normalizedRoot}/${normalizedRelative}`;
	});

	function getFileName(path: string): string {
		return path.split('/').pop() || path;
	}

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
				data = {
					...data,
					movie: { ...data.movie, monitored: newValue }
				};
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

	async function performDelete(deleteFiles: boolean, removeFromLibrary: boolean) {
		isDeleting = true;
		try {
			const response = await fetch(
				`/api/library/movies/${data.movie.id}?deleteFiles=${deleteFiles}&removeFromLibrary=${removeFromLibrary}`,
				{ method: 'DELETE' }
			);
			const result = await response.json();

			if (result.success) {
				if (removeFromLibrary) {
					toasts.success('Movie removed from library');
					// Navigate to library since the movie no longer exists
					window.location.href = '/library/movies';
				} else {
					toasts.success('Movie files deleted');
					// Reload to show updated state (movie now missing)
					window.location.reload();
				}
			} else {
				toasts.error('Failed to delete movie', { description: result.error });
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
		const file = data.movie.files.find((f) => f.id === fileId);
		deletingFileId = fileId;
		deletingFileName = file ? getFileName(file.relativePath) : 'this file';
		isDeleteFileModalOpen = true;
	}

	function closeDeleteFileModal() {
		isDeleteFileModalOpen = false;
		deletingFileId = null;
		deletingFileName = null;
	}

	async function confirmDeleteFile() {
		if (!deletingFileId) {
			closeDeleteFileModal();
			return;
		}

		isDeletingFile = true;
		try {
			const response = await fetch(`/api/library/movies/${data.movie.id}/files/${deletingFileId}`, {
				method: 'DELETE'
			});
			const result = await response.json();

			if (result.success) {
				toasts.success('File deleted');
				const updatedFiles = data.movie.files.filter((f) => f.id !== deletingFileId);
				data = {
					...data,
					movie: {
						...data.movie,
						files: updatedFiles,
						hasFile: updatedFiles.length > 0
					}
				};
				closeDeleteFileModal();
			} else {
				toasts.error('Failed to delete file', { description: result.error });
			}
		} catch (error) {
			console.error('Failed to delete file:', error);
			toasts.error('Failed to delete file');
		} finally {
			isDeletingFile = false;
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

	// Score handlers
	async function fetchScore() {
		if (scoreFetched || !data.movie.hasFile) return;

		scoreLoading = true;
		try {
			const response = await fetch(`/api/library/movies/${data.movie.id}/score`);
			if (response.ok) {
				const result = await response.json();
				if (result.success) {
					scoreData = result.score;
				}
			}
		} catch (error) {
			console.error('Failed to fetch score:', error);
		} finally {
			scoreLoading = false;
			scoreFetched = true;
		}
	}

	function handleScoreClick() {
		if (!scoreFetched) {
			fetchScore();
		}
		isScoreModalOpen = true;
	}

	// Fetch score on mount if movie has a file
	$effect(() => {
		if (data.movie.hasFile && !scoreFetched) {
			fetchScore();
		}
	});
</script>

<svelte:head>
	<title>{data.movie.title} - Library - Cinephage</title>
</svelte:head>

<div class="flex w-full flex-col gap-4 overflow-x-hidden px-4 pb-20 md:gap-6 md:px-6 lg:px-8">
	<div
		class="rounded-lg px-3 py-2 text-sm font-medium text-base-100 md:px-4 md:py-3 {data.movie
			.monitored
			? 'bg-success/80'
			: 'bg-error/80'}"
	>
		{#if data.movie.monitored}
			Monitoring enabled.
		{:else}
			Monitoring is disabled.
			<span class="block text-xs font-normal text-base-100/90">
				Automatic downloads and upgrades will not occur.
			</span>
		{/if}
	</div>
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
		onScoreClick={handleScoreClick}
		{autoSearching}
		{autoSearchResult}
		{scoreInfo}
		{scoreLoading}
	/>

	<!-- Main Content -->
	<div class="grid gap-4 lg:grid-cols-2 lg:gap-6 xl:grid-cols-3">
		<!-- Files Section (takes 2 columns on large screens) -->
		<div class="md:col-span-2 lg:col-span-2">
			<div class="rounded-xl bg-base-200 p-4 md:p-6">
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
		<div class="space-y-4 md:space-y-6">
			<!-- Overview -->
			{#if data.movie.overview}
				<div class="rounded-xl bg-base-200 p-4 md:p-6">
					<h3 class="mb-2 font-semibold">Overview</h3>
					<p class="text-sm leading-relaxed text-base-content/80">
						{data.movie.overview}
					</p>
				</div>
			{/if}

			<!-- Details -->
			<div class="rounded-xl bg-base-200 p-4 md:p-6">
				<h3 class="mb-3 font-semibold">Details</h3>
				<dl class="space-y-2 text-sm">
					{#if data.movie.originalTitle && data.movie.originalTitle !== data.movie.title}
						<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
							<dt class="text-base-content/60">Original Title</dt>
							<dd class="sm:text-right">{data.movie.originalTitle}</dd>
						</div>
					{/if}
					{#if data.movie.runtime}
						<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
							<dt class="text-base-content/60">Runtime</dt>
							<dd>{Math.floor(data.movie.runtime / 60)}h {data.movie.runtime % 60}m</dd>
						</div>
					{/if}
					{#if data.movie.genres && data.movie.genres.length > 0}
						<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
							<dt class="text-base-content/60">Genres</dt>
							<dd class="sm:text-right">{data.movie.genres.join(', ')}</dd>
						</div>
					{/if}
					{#if data.movie.imdbId}
						<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
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
					<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
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
			<div class="rounded-xl bg-base-200 p-4 md:p-6">
				<h3 class="mb-3 font-semibold">Storage</h3>
				<dl class="space-y-2 text-sm">
					<div>
						<dt class="text-base-content/60">Path</dt>
						<dd class="mt-1 font-mono text-xs break-all">
							{movieStoragePath}
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

<!-- File Delete Confirmation Modal -->
<ConfirmationModal
	open={isDeleteFileModalOpen}
	title="Delete File"
	message={`Are you sure you want to delete "${deletingFileName ?? 'this file'}"? This cannot be undone.`}
	confirmLabel="Delete"
	confirmVariant="error"
	loading={isDeletingFile}
	onConfirm={confirmDeleteFile}
	onCancel={closeDeleteFileModal}
/>

<!-- Score Detail Modal -->
<ScoreDetailModal open={isScoreModalOpen} onClose={() => (isScoreModalOpen = false)} {scoreData} />
