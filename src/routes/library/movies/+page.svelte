<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { resolvePath } from '$lib/utils/routing';
	import { SvelteSet } from 'svelte/reactivity';
	import LibraryMediaCard from '$lib/components/library/LibraryMediaCard.svelte';
	import LibraryMediaTable from '$lib/components/library/LibraryMediaTable.svelte';
	import LibraryControls from '$lib/components/library/LibraryControls.svelte';
	import LibraryBulkActionBar from '$lib/components/library/LibraryBulkActionBar.svelte';
	import BulkQualityProfileModal from '$lib/components/library/BulkQualityProfileModal.svelte';
	import BulkDeleteModal from '$lib/components/library/BulkDeleteModal.svelte';
	import DeleteConfirmationModal from '$lib/components/ui/modal/DeleteConfirmationModal.svelte';
	import InteractiveSearchModal from '$lib/components/search/InteractiveSearchModal.svelte';
	import { Clapperboard, CheckSquare, X, LayoutGrid, List, Search } from 'lucide-svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import { viewPreferences } from '$lib/stores/view-preferences.svelte';
	import { enhance } from '$app/forms';
	import { Eye } from 'lucide-svelte';
	import { createSearchProgress } from '$lib/stores/searchProgress.svelte';
	import { getPrimaryAutoSearchIssue } from '$lib/utils/autoSearchIssues';
	import { createProgressiveRenderer } from '$lib/utils/progressive-render.svelte.js';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	// Selection state
	let selectedMovies = new SvelteSet<string>();
	let showCheckboxes = $state(false);
	let searchQuery = $state('');

	const filteredMovies = $derived(
		searchQuery.trim()
			? data.movies.filter((mv) =>
					mv.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
				)
			: data.movies
	);

	// Progressive rendering: only render a screenful + buffer at a time
	const renderer = createProgressiveRenderer(() => filteredMovies);
	let bulkLoading = $state(false);
	let currentBulkAction = $state<'monitor' | 'unmonitor' | 'quality' | 'delete' | null>(null);
	let isQualityModalOpen = $state(false);
	let isDeleteModalOpen = $state(false);
	let pendingDeleteMovieId = $state<string | null>(null);
	let isSearchModalOpen = $state(false);
	let selectedMovieForSearch = $state<(typeof data.movies)[number] | null>(null);
	let autoSearchingIds = new SvelteSet<string>();
	const searchProgress = createSearchProgress();
	const defaultScoringProfileId = $derived.by(
		() => data.qualityProfiles.find((profile) => profile.isDefault)?.id ?? null
	);

	const selectedCount = $derived(selectedMovies.size);

	function toggleSelectionMode() {
		showCheckboxes = !showCheckboxes;
		if (!showCheckboxes) {
			selectedMovies.clear();
		}
	}

	function handleItemSelectChange(id: string, selected: boolean) {
		if (selected) {
			selectedMovies.add(id);
		} else {
			selectedMovies.delete(id);
		}
	}

	function selectAll() {
		for (const movie of filteredMovies) {
			selectedMovies.add(movie.id);
		}
	}

	function clearSelection() {
		selectedMovies.clear();
	}

	async function handleBulkMonitor(monitored: boolean) {
		bulkLoading = true;
		currentBulkAction = monitored ? 'monitor' : 'unmonitor';
		try {
			const response = await fetch('/api/library/movies/batch', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					movieIds: [...selectedMovies],
					updates: { monitored }
				})
			});
			const result = await response.json();
			if (result.success) {
				data = {
					...data,
					movies: data.movies.map((movie) =>
						selectedMovies.has(movie.id) ? { ...movie, monitored } : movie
					)
				};
				toasts.success(
					monitored
						? m.toast_library_movies_monitoringCount({ count: result.updatedCount })
						: m.toast_library_movies_unmonitoredCount({ count: result.updatedCount })
				);
			} else {
				toasts.error(result.error || m.toast_library_movies_failedToUpdate());
			}
		} catch {
			toasts.error(m.toast_library_movies_failedToUpdate());
		} finally {
			bulkLoading = false;
			currentBulkAction = null;
		}
	}

	async function handleBulkQualityChange(profileId: string | null) {
		bulkLoading = true;
		currentBulkAction = 'quality';
		try {
			const response = await fetch('/api/library/movies/batch', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					movieIds: [...selectedMovies],
					updates: { scoringProfileId: profileId }
				})
			});
			const result = await response.json();
			if (result.success) {
				data = {
					...data,
					movies: data.movies.map((movie) =>
						selectedMovies.has(movie.id) ? { ...movie, scoringProfileId: profileId } : movie
					)
				};
				toasts.success(m.toast_library_movies_qualityUpdatedCount({ count: result.updatedCount }));
			} else {
				toasts.error(result.error || m.toast_library_movies_failedToUpdate());
			}
		} catch {
			toasts.error(m.toast_library_movies_failedToUpdate());
		} finally {
			bulkLoading = false;
			currentBulkAction = null;
		}
	}

	async function handleBulkDelete(deleteFiles: boolean, removeFromLibrary: boolean) {
		bulkLoading = true;
		currentBulkAction = 'delete';
		try {
			const response = await fetch('/api/library/movies/batch', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					movieIds: [...selectedMovies],
					deleteFiles,
					removeFromLibrary
				})
			});
			const result = await response.json();
			if (result.success || result.deletedCount > 0 || result.removedCount > 0) {
				if (removeFromLibrary && result.removedCount > 0) {
					const updatedMovies = data.movies.filter((movie) => !selectedMovies.has(movie.id));
					data = { ...data, movies: updatedMovies };
					toasts.success(m.toast_library_movies_removedCount({ count: result.removedCount }));
				} else {
					const updatedMovies = data.movies.map((movie) =>
						selectedMovies.has(movie.id) ? { ...movie, hasFile: false, files: [] } : movie
					);
					data = { ...data, movies: updatedMovies };
					toasts.success(m.toast_library_movies_deletedFilesCount({ count: result.deletedCount }));
				}
				selectedMovies.clear();
				showCheckboxes = false;
				isDeleteModalOpen = false;
			} else {
				toasts.error(result.error || m.toast_library_movies_failedToDelete());
			}
		} catch {
			toasts.error(m.toast_library_movies_failedToDelete());
		} finally {
			bulkLoading = false;
			currentBulkAction = null;
		}
	}

	// Table action handlers
	async function handleMonitorToggle(movieId: string, monitored: boolean) {
		const movie = data.movies.find((mv) => mv.id === movieId);
		if (!movie) return;

		try {
			const response = await fetch(`/api/library/movies/${movieId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ monitored })
			});
			const result = await response.json();
			if (result.success) {
				data = {
					...data,
					movies: data.movies.map((mv) => (mv.id === movieId ? { ...mv, monitored } : mv))
				};
				toasts.success(
					m.toast_library_movies_monitorToggle({
						title: movie.title,
						status: monitored ? m.common_monitored() : m.common_unmonitored()
					})
				);
			} else {
				toasts.error(result.error || m.toast_library_movies_failedToUpdateSingle());
			}
		} catch {
			toasts.error(m.toast_library_movies_failedToUpdateMovie());
		}
	}

	async function handleDeleteMovie(movieId: string) {
		pendingDeleteMovieId = movieId;
		isDeleteModalOpen = true;
	}

	async function handleAutoGrab(movieId: string) {
		const movie = data.movies.find((mv) => mv.id === movieId);
		if (!movie || autoSearchingIds.has(movieId)) return;

		autoSearchingIds.add(movieId);

		try {
			await searchProgress.startSearch(`/api/library/movies/${movieId}/auto-search`);

			if (searchProgress.results) {
				const issue = getPrimaryAutoSearchIssue(searchProgress.results);
				if (searchProgress.results.grabbed) {
					toasts.success(
						m.toast_library_movies_autoGrabbed({
							release: searchProgress.results.releaseName ?? '',
							title: movie.title
						})
					);
				} else if (issue) {
					toasts.error(issue.message, { description: issue.description });
				} else if (searchProgress.results.found) {
					toasts.info(m.toast_library_movies_foundNoMatch({ title: movie.title }));
				} else {
					toasts.info(m.toast_library_movies_noReleases({ title: movie.title }));
				}
			}
		} catch (error) {
			toasts.error(
				error instanceof Error
					? error.message
					: m.toast_library_movies_failedAutoGrab({ title: movie.title })
			);
		} finally {
			autoSearchingIds.delete(movieId);
			searchProgress.reset();
		}
	}

	function handleManualGrab(movieId: string) {
		const movie = data.movies.find((mv) => mv.id === movieId);
		if (!movie) return;
		selectedMovieForSearch = movie;
		isSearchModalOpen = true;
	}

	async function handleGrabRelease(
		release: {
			guid: string;
			title: string;
			downloadUrl: string;
			magnetUrl?: string;
			infoHash?: string;
			size: number;
			seeders?: number;
			leechers?: number;
			publishDate: string | Date;
			indexerId: string;
			indexerName: string;
			protocol: string;
			commentsUrl?: string;
			parsed?: {
				resolution?: string;
				source?: string;
				codec?: string;
				hdr?: string;
				releaseGroup?: string;
			};
		},
		streaming?: boolean
	) {
		if (!selectedMovieForSearch)
			return { success: false, error: m.toast_library_movies_failedToGrab() };

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
					size: release.size,
					movieId: selectedMovieForSearch.id,
					mediaType: 'movie',
					quality: release.parsed
						? {
								resolution: release.parsed.resolution,
								source: release.parsed.source,
								codec: release.parsed.codec,
								hdr: release.parsed.hdr
							}
						: undefined,
					streamUsenet: streaming,
					commentsUrl: release.commentsUrl
				})
			});
			const result = await response.json();
			if (result.success) {
				toasts.success(m.toast_library_movies_grabbed({ title: release.title }));
				return { success: true };
			} else {
				toasts.error(result.error || m.toast_library_movies_failedToGrab());
				return { success: false, error: result.error, errorCode: result.errorCode };
			}
		} catch {
			toasts.error(m.toast_library_movies_failedToGrab());
			return { success: false, error: m.toast_library_movies_failedToGrab() };
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && showCheckboxes) {
			toggleSelectionMode();
		}
	}

	async function handleDeleteConfirm(deleteFiles: boolean, removeFromLibrary: boolean) {
		if (pendingDeleteMovieId) {
			// Single item delete from list view
			const movieId = pendingDeleteMovieId;
			const movie = data.movies.find((mv) => mv.id === movieId);
			if (!movie) return;

			bulkLoading = true;
			currentBulkAction = 'delete';
			try {
				const response = await fetch(
					`/api/library/movies/${movieId}?deleteFiles=${deleteFiles}&removeFromLibrary=${removeFromLibrary}`,
					{ method: 'DELETE' }
				);
				const result = await response.json();
				if (result.success) {
					if (removeFromLibrary) {
						data = { ...data, movies: data.movies.filter((m2) => m2.id !== movieId) };
						toasts.success(m.toast_library_movies_removedFromLibrary({ title: movie.title }));
					} else {
						data = {
							...data,
							movies: data.movies.map((m2) =>
								m2.id === movieId ? { ...m2, hasFile: false, files: [] } : m2
							)
						};
						toasts.success(m.toast_library_movies_filesDeleted({ title: movie.title }));
					}
					isDeleteModalOpen = false;
					pendingDeleteMovieId = null;
				} else {
					toasts.error(result.error || m.toast_library_movies_failedToDelete());
				}
			} catch {
				toasts.error(m.toast_library_movies_failedToUpdateMovie());
			} finally {
				bulkLoading = false;
				currentBulkAction = null;
			}
		} else {
			// Bulk delete
			await handleBulkDelete(deleteFiles, removeFromLibrary);
		}
	}

	const sortOptions = [
		{ value: 'title-asc', label: m.library_movies_sortTitleAsc() },
		{ value: 'title-desc', label: m.library_movies_sortTitleDesc() },
		{ value: 'added-desc', label: m.library_movies_sortAddedDesc() },
		{ value: 'added-asc', label: m.library_movies_sortAddedAsc() },
		{ value: 'year-desc', label: m.library_movies_sortYearDesc() },
		{ value: 'year-asc', label: m.library_movies_sortYearAsc() },
		{ value: 'size-desc', label: m.library_movies_sortSizeDesc() },
		{ value: 'size-asc', label: m.library_movies_sortSizeAsc() }
	];

	const defaultLibrarySlug = $derived.by(
		() => data.libraryScope?.options?.find((library) => library.isDefault)?.slug ?? ''
	);
	const showLibraryFilter = $derived.by(
		() => Boolean(data.libraryScope?.hasSubLibraries) && !data.libraryScope?.isSubLibraryScope
	);

	const filterOptions = $derived([
		...(showLibraryFilter
			? [
					{
						key: 'library',
						label: m.library_movies_filterLibrary(),
						options: (data.libraryScope?.options ?? []).map((library) => ({
							value: library.slug,
							label: library.name
						}))
					}
				]
			: []),
		{
			key: 'monitored',
			label: m.library_movies_filterMonitored(),
			options: [
				{ value: 'all', label: m.library_movies_filterAll() },
				{ value: 'monitored', label: m.library_movies_filterMonitoredOnly() },
				{ value: 'unmonitored', label: m.library_movies_filterNotMonitored() }
			]
		},
		{
			key: 'fileStatus',
			label: m.library_movies_filterFileStatus(),
			options: [
				{ value: 'all', label: m.library_movies_filterAll() },
				{ value: 'hasFile', label: m.library_movies_filterHasFile() },
				{ value: 'missingFile', label: m.library_movies_filterMissingFile() }
			]
		},
		{
			key: 'qualityProfile',
			label: m.library_movies_filterQualityProfile(),
			options: [
				{ value: 'all', label: m.library_movies_filterAll() },
				...data.qualityProfiles.map((p) => ({
					value: p.id,
					label: p.isDefault ? m.library_movies_profileDefault({ name: p.name }) : p.name
				}))
			]
		},
		...(data.uniqueResolutions.length > 0
			? [
					{
						key: 'resolution',
						label: m.library_movies_filterResolution(),
						options: [
							{ value: 'all', label: m.library_movies_filterAll() },
							...data.uniqueResolutions.map((r) => ({ value: r, label: r }))
						]
					}
				]
			: []),
		...(data.uniqueCodecs.length > 0
			? [
					{
						key: 'videoCodec',
						label: m.library_movies_filterVideoCodec(),
						options: [
							{ value: 'all', label: m.library_movies_filterAll() },
							...data.uniqueCodecs.map((c) => ({ value: c, label: c }))
						]
					}
				]
			: []),
		...(data.uniqueHdrFormats.length > 0
			? [
					{
						key: 'hdrFormat',
						label: m.library_movies_filterHdr(),
						options: [
							{ value: 'all', label: m.library_movies_filterAll() },
							{ value: 'sdr', label: m.library_movies_filterSdr() },
							...data.uniqueHdrFormats.map((h) => ({ value: h, label: h }))
						]
					}
				]
			: [])
	]);

	function updateUrlParam(key: string, value: string) {
		const url = new URL($page.url);
		if (key === 'library') {
			if (!value || value === defaultLibrarySlug) {
				url.searchParams.delete(key);
			} else {
				url.searchParams.set(key, value);
			}
		} else if (value === 'all' || (key === 'sort' && value === 'title-asc')) {
			url.searchParams.delete(key);
		} else {
			url.searchParams.set(key, value);
		}
		goto(resolvePath(url.pathname + url.search), { keepFocus: true, noScroll: true });
	}

	function clearFilters() {
		const url = new URL(resolve('/library/movies'), $page.url.origin);
		if (data.libraryScope?.isSubLibraryScope && data.libraryScope?.selected?.slug) {
			url.searchParams.set('library', data.libraryScope.selected.slug);
		}
		goto(resolvePath(url.pathname + url.search), { keepFocus: true, noScroll: true });
	}

	const currentFilters = $derived({
		library: data.filters.library,
		monitored: data.filters.monitored,
		fileStatus: data.filters.fileStatus,
		qualityProfile: data.filters.qualityProfile,
		resolution: data.filters.resolution,
		videoCodec: data.filters.videoCodec,
		hdrFormat: data.filters.hdrFormat
	});
	const downloadingMovieIdSet = $derived(new Set(data.downloadingMovieIds));
	const deleteModalCount = $derived(pendingDeleteMovieId ? 1 : selectedCount);
	const pendingDeleteMovie = $derived(
		pendingDeleteMovieId ? data.movies.find((mv) => mv.id === pendingDeleteMovieId) : null
	);
	const pendingDeleteMovieTitle = $derived(pendingDeleteMovie?.title ?? '');
	const pendingDeleteMovieHasFiles = $derived(pendingDeleteMovie?.hasFile ?? false);
	const pendingDeleteMovieHasActiveDownload = $derived(
		pendingDeleteMovieId ? downloadingMovieIdSet.has(pendingDeleteMovieId) : false
	);
	const bulkActiveDownloadCount = $derived(
		pendingDeleteMovieId
			? 0
			: [...selectedMovies].filter((movieId) => downloadingMovieIdSet.has(movieId)).length
	);
	const bulkHasActiveDownloads = $derived(bulkActiveDownloadCount > 0);
</script>

<svelte:head>
	<title>{m.library_movies_pageTitle()}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="min-h-screen bg-base-100 pb-20">
	<!-- Header -->
	<div
		class="sticky top-16 z-30 -mx-4 border-b border-base-200 bg-base-100/80 backdrop-blur-md lg:top-0 lg:mx-0"
	>
		<div
			class="flex h-16 w-full flex-nowrap items-center gap-2 px-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(18rem,32rem)_minmax(0,1fr)] md:gap-4 lg:px-8"
		>
			<div class="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 md:flex-none">
				<h1
					class="min-w-0 bg-linear-to-r from-primary to-secondary bg-clip-text text-xl font-bold text-transparent sm:text-2xl"
				>
					{m.library_movies_heading()}
				</h1>
				<span class="badge badge-ghost badge-sm sm:badge-lg">{data.total}</span>
				{#if data.total !== data.totalUnfiltered}
					<span class="hidden text-sm text-base-content/50 sm:inline">
						{m.library_movies_ofTotal({ total: data.totalUnfiltered })}
					</span>
				{/if}
			</div>

			<!-- Search (desktop) -->
			<div class="hidden w-full items-center gap-2 md:flex md:justify-self-center">
				<div class="group relative w-full">
					<Search
						class="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-base-content/40 transition-colors group-focus-within:text-primary"
					/>
					<input
						type="text"
						placeholder={m.library_movies_searchPlaceholder()}
						class="input input-md w-full rounded-full border-base-content/20 bg-base-200/60 pr-9 pl-10 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none"
						bind:value={searchQuery}
					/>
					{#if searchQuery}
						<button
							class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-base-content/40 transition-colors hover:bg-base-300 hover:text-base-content"
							onclick={() => (searchQuery = '')}
							aria-label={m.library_movies_clearSearch()}
						>
							<X class="h-3.5 w-3.5" />
						</button>
					{/if}
				</div>
				{#if searchQuery && filteredMovies.length !== data.movies.length}
					<span class="shrink-0 text-xs text-base-content/50">
						{filteredMovies.length}/{data.movies.length}
					</span>
				{/if}
			</div>

			<div
				class="flex shrink-0 flex-nowrap items-center justify-end gap-2 sm:gap-2 md:justify-self-end"
			>
				{#if showCheckboxes}
					<button class="btn gap-1.5 btn-ghost btn-xs sm:btn-sm" onclick={selectAll}>
						<span class="hidden sm:inline">{m.library_movies_selectAll()}</span>
						<span class="sm:hidden">{m.library_movies_selectAllShort()}</span>
					</button>
					<button class="btn gap-1.5 btn-ghost btn-xs sm:btn-sm" onclick={toggleSelectionMode}>
						<X class="h-4 w-4" />
						<span class="hidden sm:inline">{m.library_movies_done()}</span>
					</button>
				{:else}
					<button class="btn gap-1.5 btn-ghost btn-xs sm:btn-sm" onclick={toggleSelectionMode}>
						<CheckSquare class="h-4 w-4" />
						<span class="hidden sm:inline">{m.library_movies_select()}</span>
					</button>

					<div class="dropdown dropdown-end">
						<div tabindex="0" role="button" class="btn gap-1.5 btn-ghost btn-xs sm:btn-sm">
							<Eye class="h-4 w-4" />
							<span class="hidden sm:inline">{m.library_movies_monitor()}</span>
						</div>
						<form
							id="movies-monitor-all"
							action="?/toggleAllMonitored"
							method="POST"
							use:enhance
							class="hidden"
							aria-hidden="true"
						>
							<input type="hidden" name="monitored" value="true" />
						</form>
						<form
							id="movies-unmonitor-all"
							action="?/toggleAllMonitored"
							method="POST"
							use:enhance
							class="hidden"
							aria-hidden="true"
						>
							<input type="hidden" name="monitored" value="false" />
						</form>
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<ul
							tabindex="0"
							class="dropdown-content menu z-2 w-52 rounded-box border border-base-content/10 bg-base-200 p-2 shadow-lg"
						>
							<li>
								<button type="submit" class="w-full text-left" form="movies-monitor-all">
									{m.library_movies_monitorAll()}
								</button>
							</li>
							<li>
								<button type="submit" class="w-full text-left" form="movies-unmonitor-all">
									{m.library_movies_unmonitorAll()}
								</button>
							</li>
						</ul>
					</div>
				{/if}

				<!-- View Toggle -->
				<button
					class="btn btn-ghost btn-xs sm:btn-sm"
					onclick={() => viewPreferences.toggleViewMode()}
					aria-label={viewPreferences.viewMode === 'grid'
						? m.library_movies_switchToList()
						: m.library_movies_switchToGrid()}
				>
					{#if viewPreferences.viewMode === 'grid'}
						<List class="h-4 w-4" />
						<span class="hidden sm:inline">{m.library_movies_list()}</span>
					{:else}
						<LayoutGrid class="h-4 w-4" />
						<span class="hidden sm:inline">{m.library_movies_grid()}</span>
					{/if}
				</button>

				<LibraryControls
					{sortOptions}
					{filterOptions}
					currentSort={data.filters.sort}
					{currentFilters}
					hiddenActiveFilterKeys={['library']}
					onSortChange={(sort) => updateUrlParam('sort', sort)}
					onFilterChange={(key, value) => updateUrlParam(key, value)}
					onClearFilters={clearFilters}
				/>
			</div>
		</div>

		<!-- Search (mobile) -->
		<div class="flex items-center gap-2 border-t border-base-200/50 px-4 py-2 md:hidden">
			<div class="group relative w-full">
				<Search
					class="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-base-content/40 transition-colors group-focus-within:text-primary"
				/>
				<input
					type="text"
					placeholder={m.library_movies_searchPlaceholder()}
					class="input input-md w-full rounded-full border-base-content/20 bg-base-200/60 pr-9 pl-10 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none"
					bind:value={searchQuery}
				/>
				{#if searchQuery}
					<button
						class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-base-content/40 transition-colors hover:bg-base-300 hover:text-base-content"
						onclick={() => (searchQuery = '')}
						aria-label={m.library_movies_clearSearch()}
					>
						<X class="h-3.5 w-3.5" />
					</button>
				{/if}
			</div>
			{#if searchQuery && filteredMovies.length !== data.movies.length}
				<span class="shrink-0 text-xs text-base-content/50">
					{filteredMovies.length}/{data.movies.length}
				</span>
			{/if}
		</div>
	</div>

	<!-- Main Content -->
	<main class="w-full px-4 py-8 lg:px-8">
		{#if data.error}
			<div role="alert" class="alert alert-error">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>{data.error}</span>
			</div>
		{:else if filteredMovies.length === 0 && searchQuery}
			<!-- Search Empty State -->
			<div class="flex flex-col items-center justify-center py-20 text-center opacity-50">
				<Search class="mb-4 h-16 w-16" />
				<p class="text-2xl font-bold">{m.library_movies_noSearchMatch({ query: searchQuery })}</p>
				<p class="mt-2">{m.library_movies_tryDifferentSearch()}</p>
				<button class="btn mt-6 btn-ghost" onclick={() => (searchQuery = '')}>
					{m.library_movies_clearSearchBtn()}
				</button>
			</div>
		{:else if data.movies.length === 0}
			<!-- Empty State -->
			<div class="flex flex-col items-center justify-center py-20 text-center opacity-50">
				<Clapperboard class="mb-4 h-20 w-20" />
				{#if data.totalUnfiltered === 0}
					<p class="text-2xl font-bold">{m.library_movies_emptyLibrary()}</p>
					<p class="mt-2">{m.library_movies_emptyLibraryHint()}</p>
					<a href={resolvePath('/discover?type=movie')} class="btn mt-6 btn-primary">
						{m.library_movies_discoverMovies()}
					</a>
				{:else}
					<p class="text-2xl font-bold">{m.library_movies_noFilterMatch()}</p>
					<p class="mt-2">{m.library_movies_noFilterMatchHint()}</p>
					<button class="btn mt-6 btn-primary" onclick={clearFilters}
						>{m.library_movies_clearFilters()}</button
					>
				{/if}
			</div>
		{:else}
			<!-- Movies Grid or List -->
			{#if !viewPreferences.isReady}
				<!-- Defer until client resolves view preference to avoid grid flash -->
			{:else}
				<div class="animate-in fade-in slide-in-from-bottom-4 duration-500">
					{#if viewPreferences.viewMode === 'grid'}
						<div class="grid grid-cols-3 gap-3 sm:gap-4 lg:grid-cols-9">
							{#each renderer.visible as movie (movie.id)}
								<LibraryMediaCard
									item={movie}
									selectable={showCheckboxes}
									selected={selectedMovies.has(movie.id)}
									onSelectChange={handleItemSelectChange}
								/>
							{/each}
						</div>
					{:else}
						<LibraryMediaTable
							items={renderer.visible}
							mediaType="movie"
							selectedItems={selectedMovies}
							selectable={showCheckboxes}
							downloadingIds={downloadingMovieIdSet}
							{autoSearchingIds}
							onSelectChange={handleItemSelectChange}
							onMonitorToggle={handleMonitorToggle}
							onDelete={handleDeleteMovie}
							onAutoGrab={handleAutoGrab}
							onManualGrab={handleManualGrab}
						/>
					{/if}

					<!-- Progressive rendering sentinel -->
					{#if renderer.hasMore}
						<div bind:this={renderer.sentinel} class="flex justify-center py-8">
							<span class="loading loading-md loading-dots text-base-content/30"></span>
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	</main>
</div>

<!-- Bulk Action Bar -->
<LibraryBulkActionBar
	{selectedCount}
	loading={bulkLoading}
	currentAction={currentBulkAction}
	mediaType="movie"
	onMonitor={() => handleBulkMonitor(true)}
	onUnmonitor={() => handleBulkMonitor(false)}
	onChangeQuality={() => (isQualityModalOpen = true)}
	onDelete={() => (isDeleteModalOpen = true)}
	onClear={clearSelection}
/>

<!-- Bulk Quality Profile Modal -->
<BulkQualityProfileModal
	open={isQualityModalOpen}
	{selectedCount}
	qualityProfiles={data.qualityProfiles}
	saving={bulkLoading && currentBulkAction === 'quality'}
	mediaType="movie"
	onSave={handleBulkQualityChange}
	onCancel={() => (isQualityModalOpen = false)}
/>

<!-- Single Item Delete Modal -->
<DeleteConfirmationModal
	open={isDeleteModalOpen && pendingDeleteMovieId !== null}
	title={m.library_movies_deleteMovieTitle()}
	itemName={pendingDeleteMovieTitle}
	hasFiles={pendingDeleteMovieHasFiles}
	hasActiveDownload={pendingDeleteMovieHasActiveDownload}
	loading={bulkLoading && currentBulkAction === 'delete'}
	onConfirm={handleDeleteConfirm}
	onCancel={() => {
		isDeleteModalOpen = false;
		pendingDeleteMovieId = null;
	}}
/>

<!-- Bulk Delete Modal -->
<BulkDeleteModal
	open={isDeleteModalOpen && pendingDeleteMovieId === null}
	selectedCount={deleteModalCount}
	mediaType="movie"
	hasActiveDownloads={bulkHasActiveDownloads}
	activeDownloadCount={bulkActiveDownloadCount}
	loading={bulkLoading && currentBulkAction === 'delete'}
	onConfirm={handleDeleteConfirm}
	onCancel={() => {
		isDeleteModalOpen = false;
	}}
/>

<!-- Interactive Search Modal -->
{#if selectedMovieForSearch}
	<InteractiveSearchModal
		open={isSearchModalOpen}
		title={selectedMovieForSearch.title}
		tmdbId={selectedMovieForSearch.tmdbId}
		imdbId={selectedMovieForSearch.imdbId ?? undefined}
		year={selectedMovieForSearch.year ?? undefined}
		mediaType="movie"
		scoringProfileId={selectedMovieForSearch.scoringProfileId ??
			defaultScoringProfileId ??
			undefined}
		onClose={() => {
			isSearchModalOpen = false;
			selectedMovieForSearch = null;
		}}
		onGrab={handleGrabRelease}
	/>
{/if}
