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
	let bulkLoading = $state(false);
	let currentBulkAction = $state<'monitor' | 'unmonitor' | 'quality' | 'delete' | null>(null);
	let isQualityModalOpen = $state(false);
	let isDeleteModalOpen = $state(false);
	let pendingDeleteSeriesId = $state<string | null>(null);
	let isSearchModalOpen = $state(false);
	let selectedSeriesForSearch = $state<(typeof data.series)[number] | null>(null);

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
				toasts.success(`${monitored ? 'Monitoring' : 'Unmonitored'} ${result.updatedCount} series`);
				selectedSeries.clear();
				showCheckboxes = false;
			} else {
				toasts.error(result.error || 'Failed to update series');
			}
		} catch {
			toasts.error('Failed to update series');
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
				toasts.success(`Updated quality profile for ${result.updatedCount} series`);
				selectedSeries.clear();
				showCheckboxes = false;
				isQualityModalOpen = false;
			} else {
				toasts.error(result.error || 'Failed to update series');
			}
		} catch {
			toasts.error('Failed to update series');
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
					toasts.success(`Removed ${result.removedCount} series from library`);
				} else {
					const updatedSeries = data.series.map((show) =>
						selectedSeries.has(show.id)
							? { ...show, episodeFileCount: 0, percentComplete: 0 }
							: show
					);
					data = { ...data, series: updatedSeries };
					toasts.success(`Deleted files for ${result.deletedCount} series`);
				}
				selectedSeries.clear();
				showCheckboxes = false;
				isDeleteModalOpen = false;
			} else {
				toasts.error(result.error || 'Failed to delete');
			}
		} catch {
			toasts.error('Failed to delete');
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
				toasts.success(`"${show.title}" ${monitored ? 'monitored' : 'unmonitored'}`);
			} else {
				toasts.error(result.error || 'Failed to update');
			}
		} catch {
			toasts.error('Failed to update series');
		}
	}

	async function handleDeleteSeries(seriesId: string) {
		pendingDeleteSeriesId = seriesId;
		isDeleteModalOpen = true;
	}

	async function handleAutoGrab(seriesId: string) {
		const show = data.series.find((s) => s.id === seriesId);
		if (!show) return;

		try {
			const response = await fetch(`/api/library/series/${seriesId}/auto-search`, {
				method: 'POST'
			});
			const result = await response.json();
			if (result.grabbed) {
				toasts.success(`Auto-grabbed "${result.releaseName}" for "${show.title}"`);
			} else if (result.found) {
				toasts.info(`Found releases but none met criteria for "${show.title}"`);
			} else {
				toasts.info(`No releases found for "${show.title}"`);
			}
		} catch {
			toasts.error(`Failed to auto-grab for "${show.title}"`);
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
		if (!selectedSeriesForSearch) return { success: false, error: 'No series selected' };

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
					streamUsenet: streaming
				})
			});
			const result = await response.json();
			if (result.success) {
				toasts.success(`Grabbed "${release.title}"`);
				return { success: true };
			} else {
				toasts.error(result.error || 'Failed to grab release');
				return { success: false, error: result.error };
			}
		} catch {
			toasts.error('Failed to grab release');
			return { success: false, error: 'Failed to grab release' };
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
						toasts.success(`Removed "${show.title}" from library`);
					} else {
						data = {
							...data,
							series: data.series.map((s) =>
								s.id === seriesId ? { ...s, episodeFileCount: 0, percentComplete: 0 } : s
							)
						};
						toasts.success(`"${show.title}" files deleted`);
					}
					isDeleteModalOpen = false;
					pendingDeleteSeriesId = null;
				} else {
					toasts.error(result.error || 'Failed to delete');
				}
			} catch {
				toasts.error('Failed to delete series');
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
		{ value: 'title-asc', label: 'Title (A-Z)' },
		{ value: 'title-desc', label: 'Title (Z-A)' },
		{ value: 'added-desc', label: 'Date Added (Newest)' },
		{ value: 'added-asc', label: 'Date Added (Oldest)' },
		{ value: 'progress-desc', label: 'Progress (Highest)' },
		{ value: 'progress-asc', label: 'Progress (Lowest)' },
		{ value: 'year-desc', label: 'Year (Newest)' },
		{ value: 'year-asc', label: 'Year (Oldest)' },
		{ value: 'size-desc', label: 'Size (Largest)' },
		{ value: 'size-asc', label: 'Size (Smallest)' }
	];

	const filterOptions = $derived([
		{
			key: 'monitored',
			label: 'Monitored',
			options: [
				{ value: 'all', label: 'All' },
				{ value: 'monitored', label: 'Monitored Only' },
				{ value: 'unmonitored', label: 'Not Monitored' }
			]
		},
		{
			key: 'status',
			label: 'Show Status',
			options: [
				{ value: 'all', label: 'All' },
				{ value: 'continuing', label: 'Continuing' },
				{ value: 'ended', label: 'Ended' }
			]
		},
		{
			key: 'progress',
			label: 'Progress',
			options: [
				{ value: 'all', label: 'All' },
				{ value: 'complete', label: 'Complete (100%)' },
				{ value: 'inProgress', label: 'In Progress' },
				{ value: 'notStarted', label: 'Not Started (0%)' }
			]
		},
		{
			key: 'qualityProfile',
			label: 'Quality Profile',
			options: [
				{ value: 'all', label: 'All' },
				...data.qualityProfiles.map((p) => ({
					value: p.id,
					label: p.isDefault ? `${p.name} (Default)` : p.name
				}))
			]
		},
		...(data.uniqueResolutions.length > 0
			? [
					{
						key: 'resolution',
						label: 'Resolution',
						options: [
							{ value: 'all', label: 'All' },
							...data.uniqueResolutions.map((r) => ({ value: r, label: r }))
						]
					}
				]
			: []),
		...(data.uniqueCodecs.length > 0
			? [
					{
						key: 'videoCodec',
						label: 'Video Codec',
						options: [
							{ value: 'all', label: 'All' },
							...data.uniqueCodecs.map((c) => ({ value: c, label: c }))
						]
					}
				]
			: []),
		...(data.uniqueHdrFormats.length > 0
			? [
					{
						key: 'hdrFormat',
						label: 'HDR',
						options: [
							{ value: 'all', label: 'All' },
							{ value: 'sdr', label: 'SDR' },
							...data.uniqueHdrFormats.map((h) => ({ value: h, label: h }))
						]
					}
				]
			: [])
	]);

	function updateUrlParam(key: string, value: string) {
		const url = new URL($page.url);
		if (value === 'all' || (key === 'sort' && value === 'title-asc')) {
			url.searchParams.delete(key);
		} else {
			url.searchParams.set(key, value);
		}
		goto(resolvePath(url.pathname + url.search), { keepFocus: true, noScroll: true });
	}

	function clearFilters() {
		goto(resolve('/library/tv'), { keepFocus: true, noScroll: true });
	}

	const currentFilters = $derived({
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
	<title>TV Shows - Library - Cinephage</title>
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
					TV Shows
				</h1>
				<span class="badge badge-ghost badge-sm sm:badge-lg">{data.total}</span>
				{#if data.total !== data.totalUnfiltered}
					<span class="hidden text-sm text-base-content/50 sm:inline">
						of {data.totalUnfiltered}
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
						placeholder="Search TV shows…"
						class="input input-md w-full rounded-full border-base-content/20 bg-base-200/60 pr-9 pl-10 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none"
						bind:value={searchQuery}
					/>
					{#if searchQuery}
						<button
							class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-base-content/40 transition-colors hover:bg-base-300 hover:text-base-content"
							onclick={() => (searchQuery = '')}
							aria-label="Clear search"
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
						<span class="hidden sm:inline">Select All</span>
						<span class="sm:hidden">All</span>
					</button>
					<button class="btn gap-1.5 btn-ghost btn-xs sm:btn-sm" onclick={toggleSelectionMode}>
						<X class="h-4 w-4" />
						<span class="hidden sm:inline">Done</span>
					</button>
				{:else}
					<button class="btn gap-1.5 btn-ghost btn-xs sm:btn-sm" onclick={toggleSelectionMode}>
						<CheckSquare class="h-4 w-4" />
						<span class="hidden sm:inline">Select</span>
					</button>

					<div class="dropdown dropdown-end">
						<div tabindex="0" role="button" class="btn gap-1.5 btn-ghost btn-xs sm:btn-sm">
							<Eye class="h-4 w-4" />
							<span class="hidden sm:inline">Monitor</span>
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
									Monitor All
								</button>
							</li>
							<li>
								<button type="submit" class="w-full text-left" form="tv-unmonitor-all">
									Unmonitor All
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
						? 'Switch to list view'
						: 'Switch to grid view'}
				>
					{#if viewPreferences.viewMode === 'grid'}
						<List class="h-4 w-4" />
						<span class="hidden sm:inline">List</span>
					{:else}
						<LayoutGrid class="h-4 w-4" />
						<span class="hidden sm:inline">Grid</span>
					{/if}
				</button>

				<LibraryControls
					{sortOptions}
					{filterOptions}
					currentSort={data.filters.sort}
					{currentFilters}
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
					placeholder="Search TV shows…"
					class="input input-md w-full rounded-full border-base-content/20 bg-base-200/60 pr-9 pl-10 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none"
					bind:value={searchQuery}
				/>
				{#if searchQuery}
					<button
						class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-base-content/40 transition-colors hover:bg-base-300 hover:text-base-content"
						onclick={() => (searchQuery = '')}
						aria-label="Clear search"
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
				<p class="text-2xl font-bold">No TV shows match "{searchQuery}"</p>
				<p class="mt-2">Try a different search term.</p>
				<button class="btn mt-6 btn-ghost" onclick={() => (searchQuery = '')}>
					Clear Search
				</button>
			</div>
		{:else if data.series.length === 0}
			<!-- Empty State -->
			<div class="flex flex-col items-center justify-center py-20 text-center opacity-50">
				<Tv class="mb-4 h-20 w-20" />
				{#if data.totalUnfiltered === 0}
					<p class="text-2xl font-bold">No TV shows in your library</p>
					<p class="mt-2">Add TV shows from the Discover page to see them here.</p>
					<a href={resolvePath('/discover?type=tv')} class="btn mt-6 btn-primary">
						Discover TV Shows
					</a>
				{:else}
					<p class="text-2xl font-bold">No TV shows match your filters</p>
					<p class="mt-2">Try adjusting your filters to see more results.</p>
					<button class="btn mt-6 btn-primary" onclick={clearFilters}>Clear Filters</button>
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
							{#each filteredSeries as show (show.id)}
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
							items={filteredSeries}
							mediaType="tv"
							selectedItems={selectedSeries}
							selectable={showCheckboxes}
							qualityProfiles={data.qualityProfiles}
							downloadingIds={downloadingSeriesIdSet}
							onSelectChange={handleItemSelectChange}
							onMonitorToggle={handleMonitorToggle}
							onDelete={handleDeleteSeries}
							onAutoGrab={handleAutoGrab}
							onManualGrab={handleManualGrab}
						/>
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
	title="Delete Series"
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
		scoringProfileId={selectedSeriesForSearch.scoringProfileId ?? undefined}
		onClose={() => {
			isSearchModalOpen = false;
			selectedSeriesForSearch = null;
		}}
		onGrab={handleGrabRelease}
	/>
{/if}
