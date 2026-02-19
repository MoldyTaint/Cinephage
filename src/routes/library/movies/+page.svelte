<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { resolvePath } from '$lib/utils/routing';
	import { SvelteSet } from 'svelte/reactivity';
	import LibraryMediaCard from '$lib/components/library/LibraryMediaCard.svelte';
	import LibraryControls from '$lib/components/library/LibraryControls.svelte';
	import LibraryBulkActionBar from '$lib/components/library/LibraryBulkActionBar.svelte';
	import BulkQualityProfileModal from '$lib/components/library/BulkQualityProfileModal.svelte';
	import BulkDeleteModal from '$lib/components/library/BulkDeleteModal.svelte';
	import { Clapperboard, CheckSquare, X } from 'lucide-svelte';
	import { toasts } from '$lib/stores/toast.svelte';

	let { data } = $props();

	// Selection state
	let selectedMovies = new SvelteSet<string>();
	let showCheckboxes = $state(false);
	let bulkLoading = $state(false);
	let currentBulkAction = $state<'monitor' | 'unmonitor' | 'quality' | 'delete' | null>(null);
	let isQualityModalOpen = $state(false);
	let isDeleteModalOpen = $state(false);

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
		for (const movie of data.movies) {
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
				// Update local data
				for (const movie of data.movies) {
					if (selectedMovies.has(movie.id)) {
						movie.monitored = monitored;
					}
				}
				toasts.success(`${monitored ? 'Monitoring' : 'Unmonitored'} ${result.updatedCount} movies`);
				selectedMovies.clear();
				showCheckboxes = false;
			} else {
				toasts.error(result.error || 'Failed to update movies');
			}
		} catch {
			toasts.error('Failed to update movies');
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
				// Update local data
				for (const movie of data.movies) {
					if (selectedMovies.has(movie.id)) {
						movie.scoringProfileId = profileId;
					}
				}
				toasts.success(`Updated quality profile for ${result.updatedCount} movies`);
				selectedMovies.clear();
				showCheckboxes = false;
				isQualityModalOpen = false;
			} else {
				toasts.error(result.error || 'Failed to update movies');
			}
		} catch {
			toasts.error('Failed to update movies');
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
					// Remove from local data entirely
					const updatedMovies = data.movies.filter((movie) => !selectedMovies.has(movie.id));
					data = { ...data, movies: updatedMovies };
					toasts.success(`Removed ${result.removedCount} movies from library`);
				} else {
					// Update local data - mark as missing
					const updatedMovies = data.movies.map((movie) =>
						selectedMovies.has(movie.id) ? { ...movie, hasFile: false, files: [] } : movie
					);
					data = { ...data, movies: updatedMovies };
					toasts.success(`Deleted files for ${result.deletedCount} movies`);
				}
				selectedMovies.clear();
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

	// Escape key to exit selection mode
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && showCheckboxes) {
			toggleSelectionMode();
		}
	}

	const sortOptions = [
		{ value: 'title-asc', label: 'Title (A-Z)' },
		{ value: 'title-desc', label: 'Title (Z-A)' },
		{ value: 'added-desc', label: 'Date Added (Newest)' },
		{ value: 'added-asc', label: 'Date Added (Oldest)' },
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
			key: 'fileStatus',
			label: 'File Status',
			options: [
				{ value: 'all', label: 'All' },
				{ value: 'hasFile', label: 'Has File' },
				{ value: 'missingFile', label: 'Missing File' }
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
		goto(resolve('/library/movies'), { keepFocus: true, noScroll: true });
	}

	const currentFilters = $derived({
		monitored: data.filters.monitored,
		fileStatus: data.filters.fileStatus,
		qualityProfile: data.filters.qualityProfile,
		resolution: data.filters.resolution,
		videoCodec: data.filters.videoCodec,
		hdrFormat: data.filters.hdrFormat
	});

	import { enhance } from '$app/forms';
	import { Eye } from 'lucide-svelte';
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="min-h-screen bg-base-100 pb-20">
	<!-- Header -->
	<div
		class="sticky top-16 z-30 -mx-4 border-b border-base-200 bg-base-100/80 backdrop-blur-md lg:top-0 lg:mx-0"
	>
		<div class="flex h-16 w-full flex-nowrap items-center justify-between gap-2 px-4 lg:px-8">
			<div class="flex min-w-0 items-center gap-2 sm:gap-3">
				<h1
					class="min-w-0 bg-linear-to-r from-primary to-secondary bg-clip-text text-xl font-bold text-transparent sm:text-2xl"
				>
					Movies
				</h1>
				<span class="badge badge-ghost badge-sm sm:badge-lg">{data.total}</span>
				{#if data.total !== data.totalUnfiltered}
					<span class="hidden text-sm text-base-content/50 sm:inline">
						of {data.totalUnfiltered}
					</span>
				{/if}
			</div>

			<div class="flex shrink-0 items-center gap-2 sm:gap-2">
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
									Monitor All
								</button>
							</li>
							<li>
								<button type="submit" class="w-full text-left" form="movies-unmonitor-all">
									Unmonitor All
								</button>
							</li>
						</ul>
					</div>
				{/if}

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
		{:else if data.movies.length === 0}
			<!-- Empty State -->
			<div class="flex flex-col items-center justify-center py-20 text-center opacity-50">
				<Clapperboard class="mb-4 h-20 w-20" />
				{#if data.totalUnfiltered === 0}
					<p class="text-2xl font-bold">No movies in your library</p>
					<p class="mt-2">Add movies from the Discover page to see them here.</p>
					<a href={resolvePath('/discover?type=movie')} class="btn mt-6 btn-primary"
						>Discover Movies</a
					>
				{:else}
					<p class="text-2xl font-bold">No movies match your filters</p>
					<p class="mt-2">Try adjusting your filters to see more results.</p>
					<button class="btn mt-6 btn-primary" onclick={clearFilters}>Clear Filters</button>
				{/if}
			</div>
		{:else}
			<!-- Movies Grid -->
			<div class="animate-in fade-in slide-in-from-bottom-4 duration-500">
				<div class="grid grid-cols-3 gap-3 sm:gap-4 lg:grid-cols-9">
					{#each data.movies as movie (movie.id)}
						<LibraryMediaCard
							item={movie}
							selectable={showCheckboxes}
							selected={selectedMovies.has(movie.id)}
							onSelectChange={handleItemSelectChange}
						/>
					{/each}
				</div>
			</div>
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

<!-- Bulk Delete Modal -->
<BulkDeleteModal
	open={isDeleteModalOpen}
	{selectedCount}
	mediaType="movie"
	loading={bulkLoading && currentBulkAction === 'delete'}
	onConfirm={handleBulkDelete}
	onCancel={() => (isDeleteModalOpen = false)}
/>
