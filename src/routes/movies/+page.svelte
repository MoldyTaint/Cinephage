<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { resolvePath } from '$lib/utils/routing';
	import LibraryMediaCard from '$lib/components/library/LibraryMediaCard.svelte';
	import LibraryControls from '$lib/components/library/LibraryControls.svelte';
	import { Clapperboard } from 'lucide-svelte';

	let { data } = $props();

	const sortOptions = [
		{ value: 'title-asc', label: 'Title (A-Z)' },
		{ value: 'title-desc', label: 'Title (Z-A)' },
		{ value: 'added-desc', label: 'Date Added (Newest)' },
		{ value: 'added-asc', label: 'Date Added (Oldest)' },
		{ value: 'year-desc', label: 'Year (Newest)' },
		{ value: 'year-asc', label: 'Year (Oldest)' }
	];

	const filterOptions = [
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
		}
	];

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
		goto(resolve('/movies'), { keepFocus: true, noScroll: true });
	}

	const currentFilters = $derived({
		monitored: data.filters.monitored,
		fileStatus: data.filters.fileStatus
	});

    import { enhance } from '$app/forms';
    import { ChevronDown } from 'lucide-svelte';
</script>

<div class="min-h-screen bg-base-100 pb-20">
	<!-- Header -->
	<div class="sticky top-0 z-30 border-b border-base-200 bg-base-100/80 backdrop-blur-md">
		<div class="flex h-16 w-full items-center justify-between px-4 lg:px-8">
			<div class="flex items-center gap-3">
				<h1
					class="bg-gradient-to-r from-primary to-secondary bg-clip-text text-2xl font-bold text-transparent"
				>
					Movies
				</h1>
				<span class="badge badge-ghost badge-lg">{data.total}</span>
				{#if data.total !== data.totalUnfiltered}
					<span class="text-sm text-base-content/50">of {data.totalUnfiltered}</span>
				{/if}
			</div>

            <div class="flex items-center gap-2">
                <div class="dropdown dropdown-end">
                    <div tabindex="0" role="button" class="btn btn-ghost gap-2">
                        Actions
                        <ChevronDown class="h-4 w-4" />
                    </div>
                    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                    <ul tabindex="0" class="dropdown-content z-[2] menu p-2 shadow-lg bg-base-200 rounded-box w-52 border border-base-content/10">
                        <li>
                            <form action="?/toggleAllMonitored" method="POST" use:enhance>
                                <input type="hidden" name="monitored" value="true" />
                                <button type="submit" class="w-full text-left">Monitor All</button>
                            </form>
                        </li>
                        <li>
                            <form action="?/toggleAllMonitored" method="POST" use:enhance>
                                <input type="hidden" name="monitored" value="false" />
                                <button type="submit" class="w-full text-left">Unmonitor All</button>
                            </form>
                        </li>
                    </ul>
                </div>

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
				<div
					class="grid grid-cols-3 gap-4 sm:grid-cols-4 sm:gap-6 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10"
				>
					{#each data.movies as movie (movie.id)}
						<LibraryMediaCard item={movie} />
					{/each}
				</div>
			</div>
		{/if}
	</main>
</div>
