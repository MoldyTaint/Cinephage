<script lang="ts">
	import type { PageData } from './$types';
	import type { LibraryMovie, MovieFile } from '$lib/types/library';
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
	import { FileEdit, Wifi, WifiOff, Loader2 } from 'lucide-svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { createDynamicSSE } from '$lib/sse';
	import { mobileSSEStatus } from '$lib/sse/mobileStatus.svelte';

	let { data }: { data: PageData } = $props();

	// Reactive data that will be updated via SSE
	let movieState = $state<LibraryMovie | null>(null);
	let queueItemState = $state<PageData['queueItem'] | undefined>(undefined);
	let lastMovieId = $state<string | null>(null);
	const movie = $derived(movieState ?? data.movie);
	const queueItem = $derived(queueItemState === undefined ? data.queueItem : queueItemState);

	$effect(() => {
		const incomingMovieId = data.movie.id;
		if (lastMovieId !== incomingMovieId) {
			movieState = $state.snapshot(data.movie);
			queueItemState = $state.snapshot(data.queueItem);
			lastMovieId = incomingMovieId;
		}
	});

	// SSE Connection - internally handles browser/SSR
	const sse = createDynamicSSE<{
		'media:initial': { movie: LibraryMovie; queueItem: PageData['queueItem'] };
		'queue:updated': { id: string; title: string; status: string; progress: number | null };
		'file:added': {
			file: MovieFile;
			wasUpgrade: boolean;
			replacedFileIds?: string[];
		};
		'file:removed': { fileId: string };
	}>(() => `/api/library/movies/${movie.id}/stream`, {
		'media:initial': (payload) => {
			movieState = payload.movie;
			queueItemState = payload.queueItem;
		},
		'queue:updated': (payload) => {
			if (payload.status !== 'downloading') {
				queueItemState = null;
			} else {
				queueItemState = {
					id: payload.id,
					title: payload.title,
					status: payload.status,
					progress: payload.progress
				};
			}
		},
		'file:added': (payload) => {
			// Remove replaced files first
			if (payload.replacedFileIds) {
				movie.files = movie.files.filter((f) => !payload.replacedFileIds?.includes(f.id));
			}
			// Check if file already exists (update scenario)
			const existingIndex = movie.files.findIndex((f) => f.id === payload.file.id);
			if (existingIndex >= 0) {
				movie.files[existingIndex] = payload.file;
			} else {
				movie.files = [...movie.files, payload.file];
			}
			movie.hasFile = movie.files.length > 0;
			queueItemState = null;
		},
		'file:removed': (payload) => {
			movie.files = movie.files.filter((f) => f.id !== payload.fileId);
			movie.hasFile = movie.files.length > 0;
		}
	});

	const MOBILE_SSE_SOURCE = 'library-movie';

	$effect(() => {
		mobileSSEStatus.publish(MOBILE_SSE_SOURCE, sse.status);
		return () => {
			mobileSSEStatus.clear(MOBILE_SSE_SOURCE);
		};
	});

	const prefetchProfileId = $derived.by(
		() => movie.scoringProfileId ?? data.qualityProfiles.find((p) => p.isDefault)?.id ?? null
	);
	let prefetchedStreamKey = $state<string | null>(null);

	// Prefetch stream when page loads (warms cache for faster playback)
	$effect(() => {
		if (!(prefetchProfileId === 'streamer' && movie?.tmdbId)) return;
		const key = `movie:${movie.tmdbId}`;
		if (prefetchedStreamKey === key) return;
		prefetchedStreamKey = key;

		fetch(`/api/streaming/resolve/movie/${movie.tmdbId}?prefetch=1`, {
			signal: AbortSignal.timeout(5000),
			headers: { 'X-Prefetch': 'true' }
		}).catch(() => {});
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

	$effect(() => {
		if ($page.url.searchParams.get('edit') === '1') {
			isEditModalOpen = true;
		}
	});

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
		if (movie.scoringProfileId) {
			return data.qualityProfiles.find((p) => p.id === movie.scoringProfileId)?.name ?? null;
		}
		// No profile set - show the default
		const defaultProfile = data.qualityProfiles.find((p) => p.isDefault);
		return defaultProfile ? `${defaultProfile.name} (Default)` : null;
	});

	const movieStoragePath = $derived.by(() => {
		const rootPath = movie.rootFolderPath ?? '';
		const relativePath = movie.path ?? '';

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

	async function refreshMovieFromApi(): Promise<void> {
		try {
			const response = await fetch(`/api/library/movies/${movie.id}`);
			if (!response.ok) return;
			const result = await response.json();
			if (!result.success || !result.movie) return;

			const refreshed = result.movie as LibraryMovie;
			movieState = {
				...movie,
				...refreshed,
				files: refreshed.files ?? [],
				subtitles: refreshed.subtitles ?? []
			};
		} catch (error) {
			console.error('Failed to refresh movie state:', error);
		}
	}

	// Handlers
	async function handleMonitorToggle(newValue: boolean) {
		isSaving = true;
		try {
			const response = await fetch(`/api/library/movies/${movie.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ monitored: newValue })
			});

			if (response.ok) {
				movie.monitored = newValue;
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
			const response = await fetch(`/api/library/movies/${movie.id}/auto-search`, {
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
					movieId: movie.id,
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

	function handleEditClose() {
		isEditModalOpen = false;
		if ($page.url.searchParams.get('edit') === '1') {
			goto($page.url.pathname, { replaceState: true, keepFocus: true, noScroll: true });
		}
	}

	async function handleEditSave(editData: MovieEditData) {
		isSaving = true;
		try {
			const response = await fetch(`/api/library/movies/${movie.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(editData)
			});

			if (response.ok) {
				// Update local state
				movie.monitored = editData.monitored;
				movie.scoringProfileId = editData.scoringProfileId;
				movie.rootFolderId = editData.rootFolderId;
				movie.minimumAvailability = editData.minimumAvailability;
				movie.wantsSubtitles = editData.wantsSubtitles;

				// Update root folder path display
				const newFolder = data.rootFolders.find((f) => f.id === editData.rootFolderId);
				movie.rootFolderPath = newFolder?.path ?? null;

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
				`/api/library/movies/${movie.id}?deleteFiles=${deleteFiles}&removeFromLibrary=${removeFromLibrary}`,
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
					movie.files = [];
					movie.hasFile = false;
					queueItemState = null;
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
		const file = movie.files.find((f) => f.id === fileId);
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
			const response = await fetch(`/api/library/movies/${movie.id}/files/${deletingFileId}`, {
				method: 'DELETE'
			});
			const result = await response.json();

			if (result.success) {
				toasts.success('File deleted');
				const updatedFiles = movie.files.filter((f) => f.id !== deletingFileId);
				movie.files = updatedFiles;
				movie.hasFile = updatedFiles.length > 0;
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
				body: JSON.stringify({ movieId: movie.id })
			});

			const result = await response.json();

			if (result.success && result.subtitle) {
				const subtitleId = result.subtitle.id ?? result.subtitle.subtitleId;
				if (subtitleId) {
					handleSubtitleDownloaded({
						id: subtitleId,
						language: result.subtitle.language ?? 'unknown',
						isForced: result.subtitle.isForced,
						isHearingImpaired: result.subtitle.isHearingImpaired,
						format: result.subtitle.format
					});
				}
			}
		} catch (error) {
			console.error('Failed to auto-search subtitles:', error);
		} finally {
			subtitleAutoSearching = false;
		}
	}

	function handleSubtitleDownloaded(subtitle: {
		id: string;
		language: string;
		isForced?: boolean;
		isHearingImpaired?: boolean;
		format?: string;
	}) {
		if (!movie.subtitles) {
			movie.subtitles = [];
		}
		if (movie.subtitles.some((s) => s.id === subtitle.id)) {
			return;
		}
		movie.subtitles = [...movie.subtitles, subtitle];
	}

	// Score handlers
	async function fetchScore() {
		if (scoreFetched || !movie.hasFile) return;

		scoreLoading = true;
		try {
			const response = await fetch(`/api/library/movies/${movie.id}/score`);
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
		if (movie.hasFile && !scoreFetched) {
			fetchScore();
		}
	});
</script>

<svelte:head>
	<title>{movie.title} - Library - Cinephage</title>
</svelte:head>

<div class="flex w-full flex-col gap-4 overflow-x-hidden px-4 pb-20 md:gap-6 md:px-6 lg:px-8">
	<div class="flex flex-col gap-2">
		<!-- Monitoring Status Banner -->
		<div
			class="rounded-lg px-3 py-2 text-sm font-medium text-base-100 md:px-4 md:py-3 {movie.monitored
				? 'bg-success/80'
				: 'bg-error/80'}"
		>
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					{#if movie.monitored}
						Monitoring enabled.
					{:else}
						<div>
							Monitoring is disabled.
							<span class="block text-xs font-normal text-base-100/90">
								Automatic downloads and upgrades will not occur.
							</span>
						</div>
					{/if}
				</div>
				<div class="hidden shrink-0 items-center lg:flex">
					{#if sse.isConnected}
						<span
							class="inline-flex items-center gap-1 rounded-full border border-success/70 bg-success/90 px-2.5 py-1 text-xs font-medium text-success-content shadow-sm"
						>
							<Wifi class="h-3 w-3" />
							Live
						</span>
					{:else if sse.status === 'error'}
						<span
							class="inline-flex items-center gap-1 rounded-full border border-warning/70 bg-warning/90 px-2.5 py-1 text-xs font-medium text-warning-content shadow-sm"
						>
							<Loader2 class="h-3 w-3 animate-spin" />
							Reconnecting
						</span>
					{:else if sse.status === 'connecting'}
						<span
							class="inline-flex items-center gap-1 rounded-full border border-info/70 bg-info/90 px-2.5 py-1 text-xs font-medium text-info-content shadow-sm"
						>
							<Loader2 class="h-3 w-3 animate-spin" />
							Connecting
						</span>
					{:else}
						<span
							class="inline-flex items-center gap-1 rounded-full border border-base-100/35 bg-base-100/20 px-2.5 py-1 text-xs font-medium text-base-100 shadow-sm"
						>
							<WifiOff class="h-3 w-3" />
							Offline
						</span>
					{/if}
				</div>
			</div>
		</div>
	</div>
	<!-- Header -->
	<LibraryMovieHeader
		{movie}
		{qualityProfileName}
		isDownloading={queueItem !== null}
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
					{#if movie.files.length > 0}
						<button class="btn gap-1 btn-ghost btn-sm" onclick={() => (isRenameModalOpen = true)}>
							<FileEdit class="h-4 w-4" />
							Rename
						</button>
					{/if}
				</div>
				<MovieFilesTab
					files={movie.files}
					subtitles={movie.subtitles}
					isStreamerProfile={movie.scoringProfileId === 'streamer'}
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
			{#if movie.overview}
				<div class="rounded-xl bg-base-200 p-4 md:p-6">
					<h3 class="mb-2 font-semibold">Overview</h3>
					<p class="text-sm leading-relaxed text-base-content/80">
						{movie.overview}
					</p>
				</div>
			{/if}

			<!-- Details -->
			<div class="rounded-xl bg-base-200 p-4 md:p-6">
				<h3 class="mb-3 font-semibold">Details</h3>
				<dl class="space-y-2 text-sm">
					{#if movie.originalTitle && movie.originalTitle !== movie.title}
						<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
							<dt class="text-base-content/60">Original Title</dt>
							<dd class="sm:text-right">{movie.originalTitle}</dd>
						</div>
					{/if}
					{#if movie.runtime}
						<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
							<dt class="text-base-content/60">Runtime</dt>
							<dd>{Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m</dd>
						</div>
					{/if}
					{#if movie.genres && movie.genres.length > 0}
						<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
							<dt class="text-base-content/60">Genres</dt>
							<dd class="sm:text-right">{movie.genres.join(', ')}</dd>
						</div>
					{/if}
					{#if movie.imdbId}
						<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
							<dt class="text-base-content/60">IMDb</dt>
							<dd>
								<a
									href="https://www.imdb.com/title/{movie.imdbId}"
									target="_blank"
									rel="noopener noreferrer"
									class="link link-primary"
								>
									{movie.imdbId}
								</a>
							</dd>
						</div>
					{/if}
					<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
						<dt class="text-base-content/60">TMDB ID</dt>
						<dd>
							<a
								href="https://www.themoviedb.org/movie/{movie.tmdbId}"
								target="_blank"
								rel="noopener noreferrer"
								class="link link-primary"
							>
								{movie.tmdbId}
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
	{movie}
	qualityProfiles={data.qualityProfiles}
	rootFolders={data.rootFolders}
	saving={isSaving}
	onClose={handleEditClose}
	onSave={handleEditSave}
/>

<!-- Search Modal -->
<InteractiveSearchModal
	open={isSearchModalOpen}
	title={movie.title}
	tmdbId={movie.tmdbId}
	imdbId={movie.imdbId}
	year={movie.year}
	mediaType="movie"
	scoringProfileId={movie.scoringProfileId}
	onClose={() => (isSearchModalOpen = false)}
	onGrab={handleGrab}
/>

<!-- Subtitle Search Modal -->
<SubtitleSearchModal
	open={isSubtitleSearchModalOpen}
	title={movie.title}
	movieId={movie.id}
	onClose={() => (isSubtitleSearchModalOpen = false)}
	onDownloaded={handleSubtitleDownloaded}
/>

<!-- Rename Preview Modal -->
<RenamePreviewModal
	open={isRenameModalOpen}
	mediaType="movie"
	mediaId={movie.id}
	mediaTitle={movie.title}
	onClose={() => (isRenameModalOpen = false)}
	onRenamed={() => {
		isRenameModalOpen = false;
		void refreshMovieFromApi();
	}}
/>

<!-- Delete Confirmation Modal -->
<DeleteConfirmationModal
	open={isDeleteModalOpen}
	title="Delete Movie"
	itemName={movie.title}
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
