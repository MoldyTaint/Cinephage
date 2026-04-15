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
	import { Tv, CheckSquare, X, LayoutGrid, List, Search } from 'lucide-svelte';
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
	let selectedSeries = new SvelteSet<string>();
	let showCheckboxes = $state(false);
	let searchQuery = $state('');

	const filteredSeries = $derived(
		searchQuery.trim()
			? data.series.filter((s) => s.title.toLowerCase().includes(searchQuery.trim().toLowerCase()))
			: data.series
	);

	// Progressive rendering: only render a screenful + buffer at a time
	const renderer = createProgressiveRenderer(() => filteredSeries);
	let bulkLoading = $state(false);
	let currentBulkAction = $state<'monitor' | 'unmonitor' | 'quality' | 'delete' | null>(null);
	let isQualityModalOpen = $state(false);
	let isDeleteModalOpen = $state(false);
	let pendingDeleteSeriesId = $state<string | null>(null);
	let isSearchModalOpen = $state(false);
	let selectedSeriesForSearch = $state<(typeof data.series)[number] | null>(null);
	let autoSearchingIds = new SvelteSet<string>();
	const searchProgress = createSearchProgress();
	const defaultScoringProfileId = $derived.by(
		() => data.qualityProfiles.find((profile) => profile.isDefault)?.id ?? null
	);

	const selectedCount = $derived(selectedSeries.size);

	function toggleSelectionMode() {
		showCheckboxes = !showCheckboxes;
		if (!showCheckboxes) {
			selectedSeries.clear();
		}
	}

	function handleItemSelectChange(id: string, selected: boolean) {
		if (selected) {
			selectedSeries.add(id);
		} else {
			selectedSeries.delete(id);
		}
	}

	function selectAll() {
		for (const show of filteredSeries) {
			selectedSeries.add(show.id);
		}
	}

	function clearSelection() {
		selectedSeries.clear();
	}

	async function handleBulkMonitor(monitored: boolean) {
		bulkLoading = true;
		currentBulkAction = monitored ? 'monitor' : 'unmonitor';
		try {
			const response = await fetch('/api/library/series/batch', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					seriesIds: [...selectedSeries],
					updates: { monitored }
				})
			});
			const result = await response.json();
			if (result.success) {
				data = {
					...data,
					series: data.series.map((show) =>
						selectedSeries.has(show.id) ? { ...show, monitored } : show
					)
				};
				toasts.success(
					monitored
						? m.toast_library_tv_monitoringCount({ count: result.updatedCount })
						: m.toast_library_tv_unmonitoredCount({ count: result.updatedCount })
				);
			} else {
				toasts.error(result.error || m.toast_library_tv_failedToUpdate());
			}
		} catch {
			toasts.error(m.toast_library_tv_failedToUpdate());
		} finally {
			bulkLoading = false;
			currentBulkAction = null;
		}
	}

	async function handleBulkQualityChange(profileId: string | null) {
		bulkLoading = true;
		currentBulkAction = 'quality';
		try {
			const response = await fetch('/api/library/series/batch', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					seriesIds: [...selectedSeries],
					updates: { scoringProfileId: profileId }
				})
			});
			const result = await response.json();
			if (result.success) {
				data = {
					...data,
					series: data.series.map((show) =>
						selectedSeries.has(show.id) ? { ...show, scoringProfileId: profileId } : show
					)
				};
				toasts.success(m.toast_library_tv_qualityUpdatedCount({ count: result.updatedCount }));
			} else {
				toasts.error(result.error || m.toast_library_tv_failedToUpdate());
			}
		} catch {
			toasts.error(m.toast_library_tv_failedToUpdate());
		} finally {
			bulkLoading = false;
			currentBulkAction = null;
		}
	}

	async function handleBulkDelete(deleteFiles: boolean, removeFromLibrary: boolean) {
		bulkLoading = true;
		currentBulkAction = 'delete';
		try {
			const response = await fetch('/api/library/series/batch', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					seriesIds: [...selectedSeries],
					deleteFiles,
					removeFromLibrary
				})
			});
			const result = await response.json();
			if (result.success || result.deletedCount > 0 || result.removedCount > 0) {
				if (removeFromLibrary && result.removedCount > 0) {
					const updatedSeries = data.series.filter((show) => !selectedSeries.has(show.id));
					data = { ...data, series: updatedSeries };
					toasts.success(m.toast_library_tv_removedCount({ count: result.removedCount }));
				} else {
					const updatedSeries = data.series.map((show) =>
						selectedSeries.has(show.id)
							? { ...show, episodeFileCount: 0, percentComplete: 0 }
							: show
					);
					data = { ...data, series: updatedSeries };
					toasts.success(m.toast_library_tv_deletedFilesCount({ count: result.deletedCount }));
				}
				selectedSeries.clear();
				showCheckboxes = false;
				isDeleteModalOpen = false;
			} else {
				toasts.error(result.error || m.toast_library_tv_failedToDelete());
			}
		} catch {
			toasts.error(m.toast_library_tv_failedToDelete());
		} finally {
			bulkLoading = false;
			currentBulkAction = null;
		}
	}

	// Table action handlers
	async function handleMonitorToggle(seriesId: string, monitored: boolean) {
		const show = data.series.find((s) => s.id === seriesId);
		if (!show) return;

		try {
			const response = await fetch(`/api/library/series/${seriesId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ monitored })
			});
			const result = await response.json();
			if (result.success) {
				data = {
					...data,
					series: data.series.map((s) => (s.id === seriesId ? { ...s, monitored } : s))
				};
				toasts.success(
					m.toast_library_tv_monitorToggle({
						title: show.title,
						status: monitored ? m.common_monitored() : m.common_unmonitored()
					})
				);
			} else {
				toasts.error(result.error || m.toast_library_tv_failedToUpdateSingle());
			}
		} catch {
			toasts.error(m.toast_library_tv_failedToUpdateSeries());
		}
	}

	async function handleDeleteSeries(seriesId: string) {
		pendingDeleteSeriesId = seriesId;
		isDeleteModalOpen = true;
	}

	async function handleAutoGrab(seriesId: string) {
		const show = data.series.find((s) => s.id === seriesId);
		if (!show || autoSearchingIds.has(seriesId)) return;

		autoSearchingIds.add(seriesId);

		try {
			await searchProgress.startSearch(`/api/library/series/${seriesId}/auto-search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: 'missing' })
			});

			if (searchProgress.results) {
				const summary = searchProgress.results.summary;
				const issue = getPrimaryAutoSearchIssue(searchProgress.results);
				if (summary && summary.grabbed > 0) {
					toasts.success(
						m.toast_library_tv_autoGrabbedCount({ count: summary.grabbed, title: show.title })
					);
				} else if (issue) {
					toasts.error(issue.message, { description: issue.description });
				} else if (summary && summary.found > 0) {
					toasts.info(m.toast_library_tv_foundNoMatch({ count: summary.found, title: show.title }));
				} else {
					toasts.info(m.toast_library_tv_noReleases({ title: show.title }));
				}
			}
		} catch (error) {
			toasts.error(
				error instanceof Error
					? error.message
					: m.toast_library_tv_failedAutoGrab({ title: show.title })
			);
		} finally {
			autoSearchingIds.delete(seriesId);
			searchProgress.reset();
		}
	}

	function handleManualGrab(seriesId: string) {
		const show = data.series.find((s) => s.id === seriesId);
		if (!show) return;
		selectedSeriesForSearch = show;
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
		if (!selectedSeriesForSearch)
			return { success: false, error: m.toast_library_tv_failedToGrab() };

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
					seriesId: selectedSeriesForSearch.id,
					mediaType: 'tv',
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
				toasts.success(m.toast_library_tv_grabbed({ title: release.title }));
				return { success: true };
			} else {
				toasts.error(result.error || m.toast_library_tv_failedToGrab());
				return { success: false, error: result.error, errorCode: result.errorCode };
			}
		} catch {
			toasts.error(m.toast_library_tv_failedToGrab());
			return { success: false, error: m.toast_library_tv_failedToGrab() };
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && showCheckboxes) {
			toggleSelectionMode();
		}
	}

	async function handleDeleteConfirm(deleteFiles: boolean, removeFromLibrary: boolean) {
		if (pendingDeleteSeriesId) {
			// Single item delete from list view
			const seriesId = pendingDeleteSeriesId;
			const show = data.series.find((s) => s.id === seriesId);
			if (!show) return;

			bulkLoading = true;
			currentBulkAction = 'delete';
			try {
				const response = await fetch(
					`/api/library/series/${seriesId}?deleteFiles=${deleteFiles}&removeFromLibrary=${removeFromLibrary}`,
					{ method: 'DELETE' }
				);
				const result = await response.json();
				if (result.success) {
					if (removeFromLibrary) {
						data = { ...data, series: data.series.filter((s) => s.id !== seriesId) };
						toasts.success(m.toast_library_tv_removedFromLibrary({ title: show.title }));
					} else {
						data = {
							...data,
							series: data.series.map((s) =>
								s.id === seriesId ? { ...s, episodeFileCount: 0, percentComplete: 0 } : s
							)
						};
						toasts.success(m.toast_library_tv_filesDeleted({ title: show.title }));
					}
					isDeleteModalOpen = false;
					pendingDeleteSeriesId = null;
				} else {
					toasts.error(result.error || m.toast_library_tv_failedToDelete());
				}
			} catch {
				toasts.error(m.toast_library_tv_failedToDeleteSeries());
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
		{ value: 'title-asc', label: m.library_tv_sortTitleAsc() },
		{ value: 'title-desc', label: m.library_tv_sortTitleDesc() },
		{ value: 'added-desc', label: m.library_tv_sortAddedDesc() },
		{ value: 'added-asc', label: m.library_tv_sortAddedAsc() },
		{ value: 'progress-desc', label: m.library_tv_sortProgressDesc() },
		{ value: 'progress-asc', label: m.library_tv_sortProgressAsc() },
		{ value: 'year-desc', label: m.library_tv_sortYearDesc() },
		{ value: 'year-asc', label: m.library_tv_sortYearAsc() },
		{ value: 'size-desc', label: m.library_tv_sortSizeDesc() },
		{ value: 'size-asc', label: m.library_tv_sortSizeAsc() }
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
						label: m.library_tv_filterLibrary(),
						options: (data.libraryScope?.options ?? []).map((library) => ({
							value: library.slug,
							label: library.name
						}))
					}
				]
			: []),
		{
			key: 'monitored',
			label: m.library_tv_filterMonitored(),
			options: [
				{ value: 'all', label: m.library_tv_filterAll() },
				{ value: 'monitored', label: m.library_tv_filterMonitoredOnly() },
				{ value: 'unmonitored', label: m.library_tv_filterNotMonitored() }
			]
		},
		{
			key: 'status',
			label: m.library_tv_filterShowStatus(),
			options: [
				{ value: 'all', label: m.library_tv_filterAll() },
				{ value: 'continuing', label: m.library_tv_filterContinuing() },
				{ value: 'ended', label: m.library_tv_filterEnded() }
			]
		},
		{
			key: 'progress',
			label: m.library_tv_filterProgress(),
			options: [
				{ value: 'all', label: m.library_tv_filterAll() },
				{ value: 'complete', label: m.library_tv_filterComplete() },
				{ value: 'inProgress', label: m.library_tv_filterInProgress() },
				{ value: 'notStarted', label: m.library_tv_filterNotStarted() }
			]
		},
		{
			key: 'qualityProfile',
			label: m.library_tv_filterQualityProfile(),
			options: [
				{ value: 'all', label: m.library_tv_filterAll() },
				...data.qualityProfiles.map((p) => ({
					value: p.id,
					label: p.isDefault ? m.library_tv_profileDefault({ name: p.name }) : p.name
				}))
			]
		},
		...(data.uniqueResolutions.length > 0
			? [
					{
						key: 'resolution',
						label: m.library_tv_filterResolution(),
						options: [
							{ value: 'all', label: m.library_tv_filterAll() },
							...data.uniqueResolutions.map((r) => ({ value: r, label: r }))
						]
					}
				]
			: []),
		...(data.uniqueCodecs.length > 0
			? [
					{
						key: 'videoCodec',
						label: m.library_tv_filterVideoCodec(),
						options: [
							{ value: 'all', label: m.library_tv_filterAll() },
							...data.uniqueCodecs.map((c) => ({ value: c, label: c }))
						]
					}
				]
			: []),
		...(data.uniqueHdrFormats.length > 0
			? [
					{
						key: 'hdrFormat',
						label: m.library_tv_filterHdr(),
						options: [
							{ value: 'all', label: m.library_tv_filterAll() },
							{ value: 'sdr', label: m.library_tv_filterSdr() },
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
		const url = new URL(resolve('/library/tv'), $page.url.origin);
		if (data.libraryScope?.isSubLibraryScope && data.libraryScope?.selected?.slug) {
			url.searchParams.set('library', data.libraryScope.selected.slug);
		}
		goto(resolvePath(url.pathname + url.search), { keepFocus: true, noScroll: true });
	}

	const currentFilters = $derived({
		library: data.filters.library,
		monitored: data.filters.monitored,
		status: data.filters.status,
		progress: data.filters.progress,
		qualityProfile: data.filters.qualityProfile,
		resolution: data.filters.resolution,
		videoCodec: data.filters.videoCodec,
		hdrFormat: data.filters.hdrFormat
	});
	const downloadingSeriesIdSet = $derived(new Set(data.downloadingSeriesIds));
	const deleteModalCount = $derived(pendingDeleteSeriesId ? 1 : selectedCount);
	const pendingDeleteSeries = $derived(
		pendingDeleteSeriesId ? data.series.find((s) => s.id === pendingDeleteSeriesId) : null
	);
	const pendingDeleteSeriesTitle = $derived(pendingDeleteSeries?.title ?? '');
	const pendingDeleteSeriesHasFiles = $derived((pendingDeleteSeries?.episodeFileCount ?? 0) > 0);
	const pendingDeleteSeriesHasActiveDownload = $derived(
		pendingDeleteSeriesId ? downloadingSeriesIdSet.has(pendingDeleteSeriesId) : false
	);
	const bulkActiveDownloadCount = $derived(
		pendingDeleteSeriesId
			? 0
			: [...selectedSeries].filter((seriesId) => downloadingSeriesIdSet.has(seriesId)).length
	);
	const bulkHasActiveDownloads = $derived(bulkActiveDownloadCount > 0);
</script>

<svelte:head>
	<title>{m.library_tv_pageTitle()}</title>
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
					{m.library_tv_heading()}
				</h1>
				<span class="badge badge-ghost badge-sm sm:badge-lg">{data.total}</span>
				{#if data.total !== data.totalUnfiltered}
					<span class="hidden text-sm text-base-content/50 sm:inline">
						{m.library_tv_ofTotal({ total: data.totalUnfiltered })}
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
						placeholder={m.library_tv_searchPlaceholder()}
						class="input input-md w-full rounded-full border-base-content/20 bg-base-200/60 pr-9 pl-10 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none"
						bind:value={searchQuery}
					/>
					{#if searchQuery}
						<button
							class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-base-content/40 transition-colors hover:bg-base-300 hover:text-base-content"
							onclick={() => (searchQuery = '')}
							aria-label={m.library_tv_clearSearch()}
						>
							<X class="h-3.5 w-3.5" />
						</button>
					{/if}
				</div>
				{#if searchQuery && filteredSeries.length !== data.series.length}
					<span class="shrink-0 text-xs text-base-content/50">
						{filteredSeries.length}/{data.series.length}
					</span>
				{/if}
			</div>

			<div
				class="flex shrink-0 flex-nowrap items-center justify-end gap-2 sm:gap-2 md:justify-self-end"
			>
				{#if showCheckboxes}
					<button class="btn gap-1.5 btn-ghost btn-xs sm:btn-sm" onclick={selectAll}>
						<span class="hidden sm:inline">{m.library_tv_selectAll()}</span>
						<span class="sm:hidden">{m.library_tv_selectAllShort()}</span>
					</button>
					<button class="btn gap-1.5 btn-ghost btn-xs sm:btn-sm" onclick={toggleSelectionMode}>
						<X class="h-4 w-4" />
						<span class="hidden sm:inline">{m.library_tv_done()}</span>
					</button>
				{:else}
					<button class="btn gap-1.5 btn-ghost btn-xs sm:btn-sm" onclick={toggleSelectionMode}>
						<CheckSquare class="h-4 w-4" />
						<span class="hidden sm:inline">{m.library_tv_select()}</span>
					</button>

					<div class="dropdown dropdown-end">
						<div tabindex="0" role="button" class="btn gap-1.5 btn-ghost btn-xs sm:btn-sm">
							<Eye class="h-4 w-4" />
							<span class="hidden sm:inline">{m.library_tv_monitor()}</span>
						</div>
						<form
							id="tv-monitor-all"
							action="?/toggleAllMonitored"
							method="POST"
							use:enhance
							class="hidden"
							aria-hidden="true"
						>
							<input type="hidden" name="monitored" value="true" />
						</form>
						<form
							id="tv-unmonitor-all"
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
								<button type="submit" class="w-full text-left" form="tv-monitor-all">
									{m.library_tv_monitorAll()}
								</button>
							</li>
							<li>
								<button type="submit" class="w-full text-left" form="tv-unmonitor-all">
									{m.library_tv_unmonitorAll()}
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
						? m.library_tv_switchToList()
						: m.library_tv_switchToGrid()}
				>
					{#if viewPreferences.viewMode === 'grid'}
						<List class="h-4 w-4" />
						<span class="hidden sm:inline">{m.library_tv_list()}</span>
					{:else}
						<LayoutGrid class="h-4 w-4" />
						<span class="hidden sm:inline">{m.library_tv_grid()}</span>
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
					placeholder={m.library_tv_searchPlaceholder()}
					class="input input-md w-full rounded-full border-base-content/20 bg-base-200/60 pr-9 pl-10 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none"
					bind:value={searchQuery}
				/>
				{#if searchQuery}
					<button
						class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-base-content/40 transition-colors hover:bg-base-300 hover:text-base-content"
						onclick={() => (searchQuery = '')}
						aria-label={m.library_tv_clearSearch()}
					>
						<X class="h-3.5 w-3.5" />
					</button>
				{/if}
			</div>
			{#if searchQuery && filteredSeries.length !== data.series.length}
				<span class="shrink-0 text-xs text-base-content/50">
					{filteredSeries.length}/{data.series.length}
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
		{:else if filteredSeries.length === 0 && searchQuery}
			<!-- Search Empty State -->
			<div class="flex flex-col items-center justify-center py-20 text-center opacity-50">
				<Search class="mb-4 h-16 w-16" />
				<p class="text-2xl font-bold">{m.library_tv_noSearchMatch({ query: searchQuery })}</p>
				<p class="mt-2">{m.library_tv_tryDifferentSearch()}</p>
				<button class="btn mt-6 btn-ghost" onclick={() => (searchQuery = '')}>
					{m.library_tv_clearSearchBtn()}
				</button>
			</div>
		{:else if data.series.length === 0}
			<!-- Empty State -->
			<div class="flex flex-col items-center justify-center py-20 text-center opacity-50">
				<Tv class="mb-4 h-20 w-20" />
				{#if data.totalUnfiltered === 0}
					<p class="text-2xl font-bold">{m.library_tv_emptyLibrary()}</p>
					<p class="mt-2">{m.library_tv_emptyLibraryHint()}</p>
					<a href={resolvePath('/discover?type=tv')} class="btn mt-6 btn-primary">
						{m.library_tv_discoverTvShows()}
					</a>
				{:else}
					<p class="text-2xl font-bold">{m.library_tv_noFilterMatch()}</p>
					<p class="mt-2">{m.library_tv_noFilterMatchHint()}</p>
					<button class="btn mt-6 btn-primary" onclick={clearFilters}
						>{m.library_tv_clearFilters()}</button
					>
				{/if}
			</div>
		{:else}
			<!-- Series Grid or List -->
			{#if !viewPreferences.isReady}
				<!-- Defer until client resolves view preference to avoid grid flash -->
			{:else}
				<div class="animate-in fade-in slide-in-from-bottom-4 duration-500">
					{#if viewPreferences.viewMode === 'grid'}
						<div class="grid grid-cols-3 gap-3 sm:gap-4 lg:grid-cols-9">
							{#each renderer.visible as show (show.id)}
								<LibraryMediaCard
									item={show}
									selectable={showCheckboxes}
									selected={selectedSeries.has(show.id)}
									onSelectChange={handleItemSelectChange}
								/>
							{/each}
						</div>
					{:else}
						<LibraryMediaTable
							items={renderer.visible}
							mediaType="tv"
							selectedItems={selectedSeries}
							selectable={showCheckboxes}
							qualityProfiles={data.qualityProfiles}
							downloadingIds={downloadingSeriesIdSet}
							{autoSearchingIds}
							onSelectChange={handleItemSelectChange}
							onMonitorToggle={handleMonitorToggle}
							onDelete={handleDeleteSeries}
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
	mediaType="tv"
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
	mediaType="tv"
	onSave={handleBulkQualityChange}
	onCancel={() => (isQualityModalOpen = false)}
/>

<!-- Single Item Delete Modal -->
<DeleteConfirmationModal
	open={isDeleteModalOpen && pendingDeleteSeriesId !== null}
	title={m.library_tv_deleteSeriesTitle()}
	itemName={pendingDeleteSeriesTitle}
	hasFiles={pendingDeleteSeriesHasFiles}
	hasActiveDownload={pendingDeleteSeriesHasActiveDownload}
	loading={bulkLoading && currentBulkAction === 'delete'}
	onConfirm={handleDeleteConfirm}
	onCancel={() => {
		isDeleteModalOpen = false;
		pendingDeleteSeriesId = null;
	}}
/>

<!-- Bulk Delete Modal -->
<BulkDeleteModal
	open={isDeleteModalOpen && pendingDeleteSeriesId === null}
	selectedCount={deleteModalCount}
	mediaType="tv"
	hasActiveDownloads={bulkHasActiveDownloads}
	activeDownloadCount={bulkActiveDownloadCount}
	loading={bulkLoading && currentBulkAction === 'delete'}
	onConfirm={handleDeleteConfirm}
	onCancel={() => {
		isDeleteModalOpen = false;
	}}
/>

<!-- Interactive Search Modal -->
{#if selectedSeriesForSearch}
	<InteractiveSearchModal
		open={isSearchModalOpen}
		title={selectedSeriesForSearch.title}
		tmdbId={selectedSeriesForSearch.tmdbId}
		imdbId={selectedSeriesForSearch.imdbId ?? undefined}
		year={selectedSeriesForSearch.year ?? undefined}
		mediaType="tv"
		scoringProfileId={selectedSeriesForSearch.scoringProfileId ??
			defaultScoringProfileId ??
			undefined}
		onClose={() => {
			isSearchModalOpen = false;
			selectedSeriesForSearch = null;
		}}
		onGrab={handleGrabRelease}
	/>
{/if}
