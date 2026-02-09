<script lang="ts">
	import { page } from '$app/stores';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { resolvePath } from '$lib/utils/routing';
	import type { TmdbMediaItem } from '$lib/types/tmdb';
	import { tick } from 'svelte';
	import { SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';
	import MediaCard from '$lib/components/tmdb/MediaCard.svelte';
	import FilterDrawer from '$lib/components/discover/FilterDrawer.svelte';
	import SectionRow from '$lib/components/discover/SectionRow.svelte';
	import SearchBar from '$lib/components/discover/SearchBar.svelte';
	import AddToLibraryModal from '$lib/components/library/AddToLibraryModal.svelte';
	import TmdbConfigRequired from '$lib/components/ui/TmdbConfigRequired.svelte';
	import { UI } from '$lib/config/constants';
	import { parseProviderIds, parseGenreIds, extractYear } from '$lib/utils/discoverParams';
	import { Search, Eye, EyeOff } from 'lucide-svelte';
	import { getMediaTypeLabel } from '$lib/types/tmdb-guards';

	let { data } = $props();

	// Add to Library Modal state
	let addModalOpen = $state(false);
	let selectedItem = $state<{
		mediaType: 'movie' | 'tv';
		tmdbId: number;
		title: string;
		year?: number;
		posterPath?: string | null;
	} | null>(null);

	// Handle adding item to library - accepts data from various TMDB endpoints
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function handleAddToLibrary(item: any) {
		const mediaType = getMediaTypeLabel(item as TmdbMediaItem);
		const isMovie = mediaType === 'Movie';
		const isTv = mediaType === 'TV';

		if (!isMovie && !isTv) return;

		const tmdbId = item.id as number;
		const title = (item.title || item.name || 'Unknown') as string;
		const releaseDate = (item.release_date || item.first_air_date) as string | undefined;
		const year = releaseDate ? new Date(releaseDate).getFullYear() : undefined;
		const posterPath = item.poster_path as string | null | undefined;

		selectedItem = {
			mediaType: isMovie ? 'movie' : 'tv',
			tmdbId,
			title,
			year,
			posterPath
		};
		addModalOpen = true;
	}

	function handleAddSuccess() {
		// Refresh the page data to update library status indicators
		invalidateAll();
	}

	// Search state
	let searchQuery = $state('');
	// Search results from TMDB multi-search API
	// Type is loose since TMDB returns various media types - MediaCard handles the union
	let searchResults = $state<Array<Record<string, unknown> & { id: number; media_type?: string }>>(
		[]
	);
	let isSearching = $state(false);
	let searchPagination = $state<{
		page: number;
		total_pages: number;
		total_results: number;
	} | null>(null);
	let searchLoadMoreTrigger = $state<HTMLElement>();

	const normalizedSearchQuery = $derived(searchQuery.trim());
	// Computed: are we in search mode?
	let isSearchMode = $derived(normalizedSearchQuery.length > 0);

	async function handleSearch(query: string) {
		searchQuery = query;
		const normalizedQuery = query.trim();

		if (!normalizedQuery) {
			searchResults = [];
			searchPagination = null;
			return;
		}

		isSearching = true;
		try {
			const res = await fetch(
				`/api/discover/search?query=${encodeURIComponent(normalizedQuery)}&type=${type}${excludeInLibrary ? '&exclude_in_library=true' : ''}`
			);
			if (!res.ok) throw new Error('Search failed');

			const result = await res.json();
			searchResults = result.results;
			searchPagination = result.pagination;
		} catch (e) {
			console.error('Search error:', e);
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}

	async function loadMoreSearchResults() {
		if (!searchPagination || searchPagination.page >= searchPagination.total_pages || isSearching)
			return;

		isSearching = true;
		try {
			const nextPage = searchPagination.page + 1;
			const res = await fetch(
				`/api/discover/search?query=${encodeURIComponent(normalizedSearchQuery)}&type=${type}&page=${nextPage}${excludeInLibrary ? '&exclude_in_library=true' : ''}`
			);
			if (!res.ok) return;

			const result = await res.json();
			// Deduplicate
			const existingIds = new Set(searchResults.map((r) => r.id + (r.media_type || '')));
			const newResults = result.results.filter(
				(r: { id: number; media_type?: string }) => !existingIds.has(r.id + (r.media_type || ''))
			);

			searchResults = [...searchResults, ...newResults];
			searchPagination = result.pagination;
		} finally {
			isSearching = false;
		}
	}

	// Re-run search when type or excludeInLibrary filter changes
	$effect(() => {
		if (searchQuery && type) {
			void excludeInLibrary;
			handleSearch(searchQuery);
		}
	});

	// Infinite scroll for search results
	$effect(() => {
		if (!searchLoadMoreTrigger || !isSearchMode) return;

		const observer = new IntersectionObserver(
			async (entries) => {
				if (entries[0].isIntersecting && !isSearching) {
					await loadMoreSearchResults();
				}
			},
			{ rootMargin: '200px' }
		);

		observer.observe(searchLoadMoreTrigger);

		return () => observer.disconnect();
	});

	// Derived state from URL params
	let type = $derived($page.url.searchParams.get('type') || 'all');
	let sortBy = $derived($page.url.searchParams.get('sort_by') || 'popularity.desc');
	let selectedProviders = $derived(
		parseProviderIds($page.url.searchParams.get('with_watch_providers'))
	);
	let selectedGenres = $derived(parseGenreIds($page.url.searchParams.get('with_genres')));
	let minYear = $derived(extractYear($page.url.searchParams.get('primary_release_date.gte')));
	let maxYear = $derived(extractYear($page.url.searchParams.get('primary_release_date.lte')));
	let minRating = $derived(Number($page.url.searchParams.get('vote_average.gte')) || 0);
	let excludeInLibrary = $derived($page.url.searchParams.get('exclude_in_library') === 'true');

	function updateFilter(key: string, value: string | null) {
		const url = new URL($page.url);
		if (value) {
			url.searchParams.set(key, value);
		} else {
			url.searchParams.delete(key);
		}
		// Reset page on filter change
		if (key !== 'page') {
			url.searchParams.set('page', '1');
		}
		goto(resolvePath(url.pathname + url.search), { keepFocus: true });
	}

	function updateYear(min: string, max: string) {
		const url = new URL($page.url);
		if (min) url.searchParams.set('primary_release_date.gte', `${min}-01-01`);
		else url.searchParams.delete('primary_release_date.gte');

		if (max) url.searchParams.set('primary_release_date.lte', `${max}-12-31`);
		else url.searchParams.delete('primary_release_date.lte');

		url.searchParams.set('page', '1');
		goto(resolvePath(url.pathname + url.search), { keepFocus: true });
	}

	function toggleProvider(providerId: number) {
		const current = new SvelteSet(selectedProviders);
		if (current.has(providerId)) {
			current.delete(providerId);
		} else {
			current.add(providerId);
		}
		updateFilter('with_watch_providers', Array.from(current).join(','));
	}

	function toggleGenre(genreId: number) {
		const current = new SvelteSet(selectedGenres);
		if (current.has(genreId)) {
			current.delete(genreId);
		} else {
			current.add(genreId);
		}
		updateFilter('with_genres', Array.from(current).join(','));
	}

	function toggleExcludeInLibrary() {
		updateFilter('exclude_in_library', excludeInLibrary ? null : 'true');
	}

	let isFilterOpen = $state(false);

	function resetFilters() {
		goto(resolve('/discover'));
	}

	function applyFilters() {
		// Filters are applied instantly via URL, so this is just for closing the drawer if needed
		// But the drawer applies changes via the bound props which call updateFilter
		// Wait, the props are derived from URL, so we need to update URL.
		// The FilterPanel calls the callbacks which update URL.
		// So "Apply" button in drawer might just close it, or we can make the drawer state local and only apply on "Apply".
		// For now, let's keep the instant update pattern as it's more responsive,
		// but the drawer has an "Apply" button which implies batching.
		// Let's stick to instant updates for now as implemented in the callbacks.
		isFilterOpen = false;
	}

	type MediaItemWithLibraryStatus = TmdbMediaItem & {
		inLibrary?: boolean;
		hasFile?: boolean;
		libraryId?: string;
		media_type?: string;
	};
	type ResultsType = MediaItemWithLibraryStatus[];
	let allResults = $state<ResultsType>([]);
	let currentPage = $state(1);
	let isLoadingMore = $state(false);
	let loadMoreTrigger = $state<HTMLElement>();

	// Sync results from props - handles initial load and filter changes
	$effect(() => {
		if (data.results) {
			// Reset when filters change (page resets to 1) or on initial load
			if (data.pagination?.page === 1 || allResults.length === 0) {
				allResults = data.results as ResultsType;
				currentPage = data.pagination?.page ?? 1;
			}
		}
	});

	// Cap results to prevent unbounded memory growth
	$effect(() => {
		if (allResults.length > UI.MAX_DISPLAY_ITEMS) {
			// Keep most recent results
			allResults = allResults.slice(-UI.MAX_DISPLAY_ITEMS);
		}
	});

	async function loadMoreResults() {
		if (isLoadingMore || !data.pagination || currentPage >= data.pagination.total_pages) return;

		isLoadingMore = true;
		try {
			const nextPage = currentPage + 1;
			const params = new SvelteURLSearchParams($page.url.searchParams);
			params.set('page', String(nextPage));

			const res = await fetch(`/api/discover?${params.toString()}`);
			if (!res.ok) return;

			const newData = await res.json();
			if (!newData.results || newData.results.length === 0) return;

			// Filter out duplicates based on ID and media_type
			const getResultKey = (item: { id: number; media_type?: string | null }) =>
				`${item.id}-${item.media_type ?? ''}`;
			const existingIds = new Set(allResults.map((i) => getResultKey(i)));
			const uniqueNewResults = newData.results.filter(
				(i: { id: number; media_type?: string | null }) => !existingIds.has(getResultKey(i))
			);

			if (uniqueNewResults.length > 0) {
				allResults = [...allResults, ...(uniqueNewResults as ResultsType)];
			}
			currentPage = nextPage;
		} catch (e) {
			console.error('Failed to load more results', e);
		} finally {
			isLoadingMore = false;
		}
	}

	$effect(() => {
		if (!loadMoreTrigger || data.viewType !== 'grid') return;

		const observer = new IntersectionObserver(
			async (entries) => {
				if (entries[0].isIntersecting && !isLoadingMore) {
					await loadMoreResults();
					// After loading, check if still visible and load more if needed
					await tick();
					if (loadMoreTrigger) {
						const rect = loadMoreTrigger.getBoundingClientRect();
						if (
							rect.top < window.innerHeight + 200 &&
							currentPage < (data.pagination?.total_pages ?? 0)
						) {
							loadMoreResults();
						}
					}
				}
			},
			{ rootMargin: '200px' }
		);

		observer.observe(loadMoreTrigger);

		return () => observer.disconnect();
	});
</script>

<div class="min-h-screen bg-base-100 pb-20">
	<!-- Header -->
	<div
		class="sticky top-16 z-30 -mx-4 border-b border-base-200 bg-base-100/80 backdrop-blur-md lg:top-0 lg:mx-0"
	>
		<div class="flex h-16 w-full items-center justify-between gap-4 px-4 lg:px-8">
			<h1
				class="shrink-0 bg-gradient-to-r from-primary to-secondary bg-clip-text text-2xl font-bold text-transparent"
			>
				{isSearchMode ? 'Search' : 'Discover'}
			</h1>

			<!-- Search Bar -->
			<SearchBar bind:value={searchQuery} onSearch={handleSearch} isLoading={isSearching} />

			<div class="flex shrink-0 items-center gap-3">
				<!-- Active Filters Summary -->
				{#if selectedProviders.length > 0 || type !== 'all' || selectedGenres.length > 0 || minYear || maxYear || minRating > 0}
					<div class="hidden items-center gap-2 md:flex">
						{#if type !== 'all'}
							<div class="badge badge-sm badge-primary">
								{type === 'tv' ? 'TV Shows' : 'Movies'}
							</div>
						{/if}
						{#if selectedGenres.length > 0}
							<div class="badge badge-outline badge-sm">{selectedGenres.length} Genres</div>
						{/if}
						<button class="btn text-error btn-ghost btn-xs" onclick={resetFilters}>Clear</button>
					</div>
				{/if}

				<!-- Hide In Library Toggle -->
				<button
					class="btn btn-circle btn-sm {excludeInLibrary
						? 'btn-primary'
						: 'border border-base-300 btn-ghost'}"
					onclick={toggleExcludeInLibrary}
					title={excludeInLibrary ? 'Show items in library' : 'Hide items in library'}
				>
					{#if excludeInLibrary}
						<EyeOff class="h-4 w-4" />
					{:else}
						<Eye class="h-4 w-4" />
					{/if}
				</button>

				<button
					class="btn gap-2 shadow-lg shadow-primary/20 btn-sm btn-primary"
					onclick={() => (isFilterOpen = true)}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
						/>
					</svg>
					Filters
				</button>
			</div>
		</div>
	</div>

	<!-- Main Content -->
	<main class="w-full space-y-12 px-4 py-8 lg:px-8">
		{#if data.viewType === 'not_configured'}
			<div class="mx-auto max-w-2xl py-12">
				<TmdbConfigRequired
					message="Configure your TMDB API key to browse and discover movies and TV shows."
				/>
				<div class="mt-8 text-center">
					<p class="text-base-content/60">
						TMDB (The Movie Database) provides the metadata for all movies and TV shows in
						Cinephage. You'll need a free API key to get started.
					</p>
				</div>
			</div>
		{:else if data.error}
			<div role="alert" class="alert alert-error">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/></svg
				>
				<span>{data.error}</span>
			</div>
		{:else if isSearchMode}
			<!-- Search Results View -->
			<div class="animate-in fade-in slide-in-from-bottom-4 duration-500">
				<div class="mb-6 flex items-center justify-between">
					<h2 class="text-xl font-bold opacity-70">
						{#if searchPagination}
							{searchPagination.total_results.toLocaleString()} Results for "{searchQuery}"
						{:else}
							Searching...
						{/if}
					</h2>
				</div>

				<div class="grid grid-cols-3 gap-2 sm:gap-4 lg:grid-cols-9">
					{#each searchResults as item (item.id + (item.media_type || ''))}
						<MediaCard
							item={item as unknown as TmdbMediaItem}
							onAddToLibrary={handleAddToLibrary}
						/>
					{/each}
				</div>

				{#if searchResults.length === 0 && !isSearching && searchPagination}
					<div class="flex flex-col items-center justify-center py-20 text-center opacity-50">
						<Search class="mb-4 h-20 w-20" />
						<p class="text-2xl font-bold">No results found</p>
						<p class="mt-2">Try a different search term</p>
					</div>
				{/if}

				<!-- Infinite Scroll Trigger for Search -->
				<div bind:this={searchLoadMoreTrigger} class="flex justify-center py-12">
					{#if isSearching}
						<span class="loading loading-lg loading-dots text-primary"></span>
					{:else if searchPagination && searchPagination.page >= searchPagination.total_pages && searchResults.length > 0}
						<span class="text-sm tracking-widest text-base-content/30 uppercase"
							>End of results</span
						>
					{/if}
				</div>
			</div>
		{:else if data.viewType === 'dashboard' && data.sections}
			<!-- Dashboard View -->
			<div class="animate-in fade-in space-y-12 duration-500">
				<SectionRow
					title="Trending Today"
					items={data.sections.trendingDay}
					link="/discover?trending=day{excludeInLibrary ? '&exclude_in_library=true' : ''}"
					endpoint="trending/all/day"
					onAddToLibrary={handleAddToLibrary}
					{excludeInLibrary}
				/>
				<SectionRow
					title="Trending This Week"
					items={data.sections.trendingWeek}
					link="/discover?trending=week{excludeInLibrary ? '&exclude_in_library=true' : ''}"
					endpoint="trending/all/week"
					onAddToLibrary={handleAddToLibrary}
					{excludeInLibrary}
				/>
				<SectionRow
					title="Popular Movies"
					items={data.sections.popularMovies}
					link="/discover?type=movie&sort_by=popularity.desc{excludeInLibrary
						? '&exclude_in_library=true'
						: ''}"
					endpoint="movie/popular"
					onAddToLibrary={handleAddToLibrary}
					{excludeInLibrary}
				/>
				<SectionRow
					title="Popular TV Shows"
					items={data.sections.popularTV}
					link="/discover?type=tv&sort_by=popularity.desc{excludeInLibrary
						? '&exclude_in_library=true'
						: ''}"
					endpoint="tv/popular"
					onAddToLibrary={handleAddToLibrary}
					{excludeInLibrary}
				/>
				<SectionRow
					title="Top Rated Movies"
					items={data.sections.topRatedMovies}
					link="/discover?type=movie&top_rated=true{excludeInLibrary
						? '&exclude_in_library=true'
						: ''}"
					endpoint="movie/top_rated"
					onAddToLibrary={handleAddToLibrary}
					{excludeInLibrary}
				/>
				<SectionRow
					title="Top Rated TV Shows"
					items={data.sections.topRatedTV}
					link="/discover?type=tv&top_rated=true{excludeInLibrary
						? '&exclude_in_library=true'
						: ''}"
					endpoint="tv/top_rated"
					onAddToLibrary={handleAddToLibrary}
					{excludeInLibrary}
				/>
			</div>
		{:else if data.viewType === 'grid' && data.results}
			<!-- Grid View -->
			<div class="animate-in fade-in slide-in-from-bottom-4 duration-500">
				<div class="mb-6 flex items-center justify-between">
					<h2 class="text-xl font-bold opacity-70">
						{data.pagination.total_results.toLocaleString()} Results
					</h2>
				</div>

				<div class="grid grid-cols-3 gap-2 sm:gap-4 lg:grid-cols-9">
					{#each allResults as item (`${item.id}-${item.media_type ?? ''}`)}
						<MediaCard {item} onAddToLibrary={handleAddToLibrary} />
					{/each}
				</div>

				{#if allResults.length === 0}
					<div class="flex flex-col items-center justify-center py-20 text-center opacity-50">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mb-4 h-20 w-20"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="1"
								d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
							/>
						</svg>
						<p class="text-2xl font-bold">No results found</p>
						<p class="mt-2">Try adjusting your filters to find what you're looking for.</p>
						<button class="btn mt-6 btn-primary" onclick={resetFilters}>Clear Filters</button>
					</div>
				{/if}

				<!-- Infinite Scroll Trigger -->
				<div bind:this={loadMoreTrigger} class="flex justify-center py-12">
					{#if isLoadingMore}
						<span class="loading loading-lg loading-dots text-primary"></span>
					{:else if currentPage >= data.pagination.total_pages && allResults.length > 0}
						<span class="text-sm tracking-widest text-base-content/30 uppercase"
							>End of results</span
						>
					{/if}
				</div>
			</div>
		{/if}
	</main>

	<!-- Filter Drawer -->
	<FilterDrawer
		bind:isOpen={isFilterOpen}
		{type}
		{sortBy}
		{selectedProviders}
		genres={data.genres}
		{selectedGenres}
		{minYear}
		{maxYear}
		{minRating}
		providers={data.providers}
		onTypeChange={(t) => updateFilter('type', t)}
		onSortChange={(s) => updateFilter('sort_by', s)}
		onProviderToggle={toggleProvider}
		onGenreToggle={toggleGenre}
		onYearChange={updateYear}
		onRatingChange={(r) => updateFilter('vote_average.gte', String(r))}
		onReset={resetFilters}
		onApply={applyFilters}
	/>

	<!-- Add to Library Modal -->
	{#if selectedItem}
		<AddToLibraryModal
			open={addModalOpen}
			mediaType={selectedItem.mediaType}
			tmdbId={selectedItem.tmdbId}
			title={selectedItem.title}
			year={selectedItem.year}
			posterPath={selectedItem.posterPath}
			onClose={() => (addModalOpen = false)}
			onSuccess={handleAddSuccess}
		/>
	{/if}
</div>
