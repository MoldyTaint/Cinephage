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
	import SubtitleSyncModal from '$lib/components/subtitles/SubtitleSyncModal.svelte';
	import DeleteConfirmationModal from '$lib/components/ui/modal/DeleteConfirmationModal.svelte';
	import { ConfirmationModal } from '$lib/components/ui/modal';
	import { toasts } from '$lib/stores/toast.svelte';
	import type { MovieEditData } from '$lib/components/library/MovieEditModal.svelte';
	import { FileEdit, Wifi, WifiOff, Loader2, RefreshCw } from 'lucide-svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { resolvePath } from '$lib/utils/routing';
	import { createDynamicSSE } from '$lib/sse';
	import { getFileName } from '$lib/utils/format.js';
	import { layoutState, deriveMobileSseStatus } from '$lib/layout.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { data }: { data: PageData } = $props();

	const ACTIVE_QUEUE_STATUSES = new Set([
		'queued',
		'downloading',
		'stalled',
		'paused',
		'completed',
		'postprocessing',
		'importing',
		'seeding',
		'seeding-imported'
	]);

	// Reactive data that will be updated via SSE
	let movieState = $state<LibraryMovie | null>(null);
	let queueItemState = $state<PageData['queueItem'] | undefined>(undefined);
	let lastMovieId = $state<string | null>(null);
	const movie = $derived(movieState ?? data.movie);
	const queueItem = $derived(queueItemState === undefined ? data.queueItem : queueItemState);

	function describeError(error: unknown, fallback: string): string {
		return error instanceof Error ? error.message : fallback;
	}

	function showActionError(message: string, error: unknown): void {
		toasts.error(message, { description: describeError(error, message) });
	}

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
		'media:updated': { movie: LibraryMovie; queueItem: PageData['queueItem'] };
		'queue:sync': { queueItem: PageData['queueItem'] };
		'queue:added': { id: string; title: string; status: string; progress: number | null };
		'queue:updated': { id: string; title: string; status: string; progress: number | null };
		'queue:removed': { id: string };
		'file:added': {
			file: MovieFile;
			wasUpgrade: boolean;
			replacedFileIds?: string[];
		};
		'file:removed': { fileId: string };
	}>(() => `/api/library/movies/${movie.id}/stream`, {
		'media:updated': (payload) => {
			movieState = payload.movie;
			queueItemState = payload.queueItem;
		},
		'queue:sync': (payload) => {
			queueItemState = payload.queueItem;
		},
		'queue:added': (payload) => {
			queueItemState = {
				id: payload.id,
				title: payload.title,
				status: payload.status,
				progress: payload.progress
			};
		},
		'queue:updated': (payload) => {
			if (!ACTIVE_QUEUE_STATUSES.has(payload.status)) {
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
		'queue:removed': (payload) => {
			if (queueItem?.id === payload.id) {
				queueItemState = null;
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
		},
		'file:removed': (payload) => {
			movie.files = movie.files.filter((f) => f.id !== payload.fileId);
			movie.hasFile = movie.files.length > 0;
		}
	});

	$effect(() => {
		layoutState.setMobileSseStatus(deriveMobileSseStatus(sse));
		return () => {
			layoutState.clearMobileSseStatus();
		};
	});

	const prefetchProfileId = $derived.by(
		() => movie.scoringProfileId ?? data.qualityProfiles.find((p) => p.isDefault)?.id ?? null
	);
	const isStreamerProfile = $derived.by(() => movie.scoringProfileId === 'streamer');
	let prefetchedStreamKey = $state<string | null>(null);

	// Prefetch stream when page loads (warms cache for faster playback)
	$effect(() => {
		if (!(prefetchProfileId === 'streamer' && movie?.tmdbId)) return;
		const key = `movie:${movie.tmdbId}`;
		if (prefetchedStreamKey === key) return;
		prefetchedStreamKey = key;

		fetch(`/api/streaming/session/movie/${movie.tmdbId}/master.m3u8?prefetch=1`, {
			signal: AbortSignal.timeout(5000),
			headers: { 'X-Prefetch': 'true' }
		}).catch(() => {});
	});

	// State
	let isEditModalOpen = $state(false);
	let isSearchModalOpen = $state(false);
	let isSubtitleSearchModalOpen = $state(false);
	let isSubtitleSyncModalOpen = $state(false);
	let syncingSubtitleId = $state<string | null>(null);
	let subtitleSyncError = $state<string | null>(null);
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
		return defaultProfile ? m.library_movies_profileDefault({ name: defaultProfile.name }) : null;
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
			showActionError(m.toast_library_movieDetail_failedToRefresh(), error);
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
			showActionError(m.toast_library_movieDetail_failedToUpdateMonitor(), error);
		} finally {
			isSaving = false;
		}
	}

	function handleSearch() {
		isSearchModalOpen = true;
	}

	import { createSearchProgress } from '$lib/stores/searchProgress.svelte';
	import { getPrimaryAutoSearchIssue } from '$lib/utils/autoSearchIssues';

	const searchProgress = createSearchProgress();

	function handleImport() {
		const query = [
			`mediaType=movie`,
			`tmdbId=${encodeURIComponent(String(movie.tmdbId))}`,
			`libraryId=${encodeURIComponent(movie.id)}`,
			`title=${encodeURIComponent(movie.title)}`,
			...(movie.year ? [`year=${encodeURIComponent(String(movie.year))}`] : [])
		].join('&');
		void goto(resolvePath(`/library/import?${query}`));
	}

	async function handleAutoSearch() {
		autoSearching = true;
		autoSearchResult = null;

		try {
			await searchProgress.startSearch(`/api/library/movies/${movie.id}/auto-search`);

			// Use the results from the search
			if (searchProgress.results) {
				autoSearchResult = {
					found: searchProgress.results.found ?? false,
					grabbed: searchProgress.results.grabbed ?? false,
					releaseName: searchProgress.results.releaseName,
					error: searchProgress.results.error
				};

				// Show toast notification
				const issue = getPrimaryAutoSearchIssue(searchProgress.results);
				if (searchProgress.results.grabbed) {
					toasts.success(
						m.toast_library_movieDetail_foundAndGrabbed({
							release: searchProgress.results.releaseName ?? ''
						})
					);
				} else if (issue) {
					toasts.error(issue.message, { description: issue.description });
				} else {
					toasts.info(m.toast_library_movieDetail_noSuitableReleases());
				}
			}
		} catch (error) {
			autoSearchResult = {
				found: false,
				grabbed: false,
				error:
					error instanceof Error ? error.message : m.toast_library_movieDetail_failedAutoSearch()
			};
			toasts.error(
				error instanceof Error ? error.message : m.toast_library_movieDetail_failedAutoSearch()
			);
		} finally {
			autoSearching = false;
			searchProgress.reset();
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
		commentsUrl?: string;
	}

	async function handleGrab(
		release: Release,
		streaming?: boolean
	): Promise<{ success: boolean; error?: string; errorCode?: string }> {
		try {
			const response = await fetch('/api/download/grab', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					guid: release.guid,
					downloadUrl: release.downloadUrl,
					magnetUrl: release.magnetUrl,
					infoHash: release.infoHash,
					title: release.title,
					indexerId: release.indexerId,
					indexerName: release.indexerName,
					protocol: release.protocol,
					movieId: movie.id,
					mediaType: 'movie',
					streamUsenet: streaming && release.protocol === 'usenet',
					commentsUrl: release.commentsUrl
				})
			});

			const result = await response.json();

			return { success: result.success, error: result.error, errorCode: result.errorCode };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : m.toast_library_movieDetail_failedToGrab()
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

			const result = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(result?.error || m.toast_library_movieDetail_failedToUpdate());
			}

			// Update local state
			movie.monitored = editData.monitored;
			movie.scoringProfileId = editData.scoringProfileId;
			movie.minimumAvailability = editData.minimumAvailability;
			movie.wantsSubtitles = editData.wantsSubtitles;

			if (result?.moveQueued) {
				toasts.success(
					'Move queued. File transfer has started and will appear in Activity until completion.'
				);
			} else {
				movie.rootFolderId = editData.rootFolderId;
				const newFolder = data.rootFolders.find((f) => f.id === editData.rootFolderId);
				movie.rootFolderPath = newFolder?.path ?? null;
			}

			isEditModalOpen = false;
		} catch (error) {
			showActionError(m.toast_library_movieDetail_failedToUpdate(), error);
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
					toasts.success(m.toast_library_movieDetail_movieRemoved());
					// Navigate to library since the movie no longer exists
					window.location.href = '/library/movies';
				} else {
					toasts.success(m.toast_library_movieDetail_movieFilesDeleted());
					movie.files = [];
					movie.hasFile = false;
					queueItemState = null;
				}
			} else {
				toasts.error(m.toast_library_movieDetail_failedToDeleteMovie(), {
					description: result.error
				});
			}
		} catch (error) {
			showActionError(m.toast_library_movieDetail_failedToDeleteMovie(), error);
		} finally {
			isDeleting = false;
			isDeleteModalOpen = false;
		}
	}

	async function handleDeleteFile(fileId: string) {
		const file = movie.files.find((f) => f.id === fileId);
		deletingFileId = fileId;
		deletingFileName = file ? getFileName(file.relativePath) : m.library_movieDetail_thisFile();
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
				toasts.success(m.toast_library_movieDetail_fileDeleted());
				const updatedFiles = movie.files.filter((f) => f.id !== deletingFileId);
				movie.files = updatedFiles;
				movie.hasFile = updatedFiles.length > 0;
				closeDeleteFileModal();
			} else {
				toasts.error(m.toast_library_movieDetail_failedToDeleteFile(), {
					description: result.error
				});
			}
		} catch (error) {
			showActionError(m.toast_library_movieDetail_failedToDeleteFile(), error);
		} finally {
			isDeletingFile = false;
		}
	}

	// Subtitle handlers
	function handleSubtitleSearch() {
		isSubtitleSearchModalOpen = true;
	}

	function handleSubtitleSync() {
		if (isStreamerProfile) {
			return;
		}
		subtitleSyncError = null;
		isSubtitleSyncModalOpen = true;
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
			showActionError(m.toast_library_movieDetail_failedToAutoSearchSubs(), error);
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
		wasSynced?: boolean;
		syncOffset?: number | null;
	}) {
		if (!movie.subtitles) {
			movie.subtitles = [];
		}
		if (movie.subtitles.some((s) => s.id === subtitle.id)) {
			return;
		}
		movie.subtitles = [...movie.subtitles, subtitle];
	}

	async function handleSubtitleResync(
		subtitleId: string,
		settings?: { splitPenalty?: number; noSplits?: boolean }
	): Promise<void> {
		syncingSubtitleId = subtitleId;
		subtitleSyncError = null;

		try {
			const response = await fetch('/api/subtitles/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subtitleId,
					...(settings?.splitPenalty !== undefined && { splitPenalty: settings.splitPenalty }),
					...(settings?.noSplits !== undefined && { noSplits: settings.noSplits })
				})
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || m.toast_library_movieDetail_subtitleSyncFailed());
			}

			movie.subtitles = (movie.subtitles ?? []).map((subtitle) =>
				subtitle.id === subtitleId
					? {
							...subtitle,
							wasSynced: true,
							syncOffset: result.offsetMs
						}
					: subtitle
			);

			toasts.success(m.toast_library_movieDetail_subtitleSynced(), {
				description: m.toast_library_movieDetail_subtitleSyncOffset({
					offset: String(result.offsetMs)
				})
			});
		} catch (error) {
			subtitleSyncError = describeError(error, m.toast_library_movieDetail_subtitleSyncFailed());
			showActionError(m.toast_library_movieDetail_failedToSyncSub(), error);
		} finally {
			syncingSubtitleId = null;
		}
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
			showActionError(m.toast_library_movieDetail_failedToLoadScore(), error);
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
	<title>{m.library_movieDetail_pageTitle({ title: movie.title })}</title>
	<meta
		name="description"
		content={movie.overview || m.library_movieDetail_metaDescription({ title: movie.title })}
	/>
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
						{m.library_movieDetail_monitoringEnabled()}
					{:else}
						<div>
							{m.library_movieDetail_monitoringDisabled()}
							<span class="block text-xs font-normal text-base-100/90">
								{m.library_movieDetail_monitoringDisabledHint()}
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
							{m.library_movieDetail_sseLive()}
						</span>
					{:else if sse.status === 'error'}
						<span
							class="inline-flex items-center gap-1 rounded-full border border-warning/70 bg-warning/90 px-2.5 py-1 text-xs font-medium text-warning-content shadow-sm"
						>
							<Loader2 class="h-3 w-3 animate-spin" />
							{m.library_movieDetail_sseReconnecting()}
						</span>
					{:else if sse.status === 'connecting'}
						<span
							class="inline-flex items-center gap-1 rounded-full border border-info/70 bg-info/90 px-2.5 py-1 text-xs font-medium text-info-content shadow-sm"
						>
							<Loader2 class="h-3 w-3 animate-spin" />
							{m.library_movieDetail_sseConnecting()}
						</span>
					{:else}
						<span
							class="inline-flex items-center gap-1 rounded-full border border-base-100/35 bg-base-100/20 px-2.5 py-1 text-xs font-medium text-base-100 shadow-sm"
						>
							<WifiOff class="h-3 w-3" />
							{m.library_movieDetail_sseOffline()}
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
		onImport={handleImport}
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
					<h2 class="text-lg font-semibold">{m.library_movieDetail_filesHeading()}</h2>
					<div class="flex flex-wrap items-center gap-2">
						{#if !isStreamerProfile && (movie.subtitles?.length ?? 0) > 0}
							<button class="btn gap-1 btn-ghost btn-sm" onclick={handleSubtitleSync}>
								<RefreshCw class="h-4 w-4" />
								{m.library_movieDetail_syncSubtitles()}
							</button>
						{/if}
						{#if movie.files.length > 0}
							<button class="btn gap-1 btn-ghost btn-sm" onclick={() => (isRenameModalOpen = true)}>
								<FileEdit class="h-4 w-4" />
								{m.library_movieDetail_rename()}
							</button>
						{/if}
					</div>
				</div>
				<MovieFilesTab
					files={movie.files}
					subtitles={movie.subtitles}
					{isStreamerProfile}
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
					<h3 class="mb-2 font-semibold">{m.library_movieDetail_overviewHeading()}</h3>
					<p class="text-sm leading-relaxed text-base-content/80">
						{movie.overview}
					</p>
				</div>
			{/if}

			<!-- Details -->
			<div class="rounded-xl bg-base-200 p-4 md:p-6">
				<h3 class="mb-3 font-semibold">{m.library_movieDetail_detailsHeading()}</h3>
				<dl class="space-y-2 text-sm">
					{#if movie.originalTitle && movie.originalTitle !== movie.title}
						<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
							<dt class="text-base-content/60">{m.library_movieDetail_originalTitle()}</dt>
							<dd class="sm:text-right">{movie.originalTitle}</dd>
						</div>
					{/if}
					{#if movie.runtime}
						<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
							<dt class="text-base-content/60">{m.library_movieDetail_runtime()}</dt>
							<dd>
								{m.library_movieDetail_runtimeValue({
									hours: String(Math.floor(movie.runtime / 60)),
									minutes: String(movie.runtime % 60)
								})}
							</dd>
						</div>
					{/if}
					{#if movie.genres && movie.genres.length > 0}
						<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
							<dt class="text-base-content/60">{m.library_movieDetail_genres()}</dt>
							<dd class="sm:text-right">{movie.genres.join(', ')}</dd>
						</div>
					{/if}
					{#if movie.imdbId}
						<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
							<dt class="text-base-content/60">{m.library_movieDetail_imdb()}</dt>
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
						<dt class="text-base-content/60">{m.library_movieDetail_tmdbId()}</dt>
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
				<h3 class="mb-3 font-semibold">{m.library_movieDetail_storageHeading()}</h3>
				<dl class="space-y-2 text-sm">
					<div>
						<dt class="text-base-content/60">{m.library_movieDetail_path()}</dt>
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
	scoringProfileId={prefetchProfileId ?? undefined}
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

<SubtitleSyncModal
	open={isSubtitleSyncModalOpen}
	title={movie.title}
	subtitles={movie.subtitles ?? []}
	{syncingSubtitleId}
	errorMessage={subtitleSyncError}
	onClose={() => {
		isSubtitleSyncModalOpen = false;
		subtitleSyncError = null;
	}}
	onSync={handleSubtitleResync}
/>

<!-- Rename Preview Modal -->
<RenamePreviewModal
	open={isRenameModalOpen}
	mediaType="movie"
	mediaId={movie.id}
	mediaTitle={movie.title}
	onClose={() => (isRenameModalOpen = false)}
	onRenamed={() => {
		void refreshMovieFromApi();
	}}
/>

<!-- Delete Confirmation Modal -->
<DeleteConfirmationModal
	open={isDeleteModalOpen}
	title={m.library_movieDetail_deleteMovieTitle()}
	itemName={movie.title}
	hasFiles={movie.hasFile === true}
	hasActiveDownload={queueItem !== null && queueItem !== undefined}
	loading={isDeleting}
	onConfirm={performDelete}
	onCancel={() => (isDeleteModalOpen = false)}
/>

<!-- File Delete Confirmation Modal -->
<ConfirmationModal
	open={isDeleteFileModalOpen}
	title={m.library_movieDetail_deleteFileTitle()}
	message={m.library_movieDetail_deleteFileMessage({
		fileName: deletingFileName ?? m.library_movieDetail_thisFile()
	})}
	confirmLabel={m.common_delete()}
	confirmVariant="error"
	loading={isDeletingFile}
	onConfirm={confirmDeleteFile}
	onCancel={closeDeleteFileModal}
/>

<!-- Score Detail Modal -->
<ScoreDetailModal open={isScoreModalOpen} onClose={() => (isScoreModalOpen = false)} {scoreData} />
