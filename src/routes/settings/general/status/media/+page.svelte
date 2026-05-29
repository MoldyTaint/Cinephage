<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Search, HardDrive, Film, Tv, X, SlidersHorizontal, ChevronDown } from 'lucide-svelte';
	import { SettingsPage } from '$lib/components/ui/settings';
	import { MediaExplorerTable } from '$lib/components/status';
	import { createProgressiveRenderer } from '$lib/utils/progressive-render.svelte.ts';
	import { formatBytes } from '$lib/utils/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let searchQuery = $state('');

	let qualityExpanded = $derived(
		Object.entries(data.filters).some(
			([key, value]) =>
				!['sort', 'type', 'monitored', 'hasPlays', 'library'].includes(key) && value !== 'all'
		)
	);

	const filteredItems = $derived(
		searchQuery.trim()
			? data.items.filter((item) => item.title.toLowerCase().includes(searchQuery.toLowerCase()))
			: data.items
	);

	const renderer = createProgressiveRenderer(() => filteredItems);

	const hasActiveFilters = $derived(
		Object.entries(data.filters).some(([key, value]) => key !== 'sort' && value !== 'all')
	);

	const qualityActiveCount = $derived(
		[
			data.filters.classification,
			data.filters.resolution,
			data.filters.videoCodec,
			data.filters.hdrFormat,
			data.filters.audioCodec,
			data.filters.container,
			data.filters.rootFolder
		].filter((v) => v !== 'all').length
	);

	function updateUrlParam(key: string, value: string) {
		const url = new URL(page.url);
		if (value === 'all' || (key === 'sort' && value === 'title-asc')) {
			url.searchParams.delete(key);
		} else {
			url.searchParams.set(key, value);
		}
		goto(url.pathname + url.search, { keepFocus: true, noScroll: true });
	}

	function handleSortChange(sort: string) {
		updateUrlParam('sort', sort);
	}

	function handleClearAll() {
		searchQuery = '';
		goto(page.url.pathname, { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head>
	<title>Media Explorer</title>
</svelte:head>

<SettingsPage
	title="Media Explorer"
	subtitle="Browse all media with stats, quality info, and playback data"
>
	{#snippet actions()}
		<label class="input input-sm flex items-center gap-2">
			<Search class="h-4 w-4 opacity-50" />
			<input type="text" class="grow" placeholder="Search media..." bind:value={searchQuery} />
		</label>
	{/snippet}

	<!-- Stats bar -->
	<div class="flex flex-wrap items-center gap-3 text-sm text-base-content/70">
		<span class="badge badge-ghost badge-sm">
			{data.totalCount} item{data.totalCount !== 1 ? 's' : ''}
		</span>
		{#if data.totalFileSize > 0}
			<span class="badge badge-ghost badge-sm">
				<HardDrive class="h-3 w-3" />
				{formatBytes(data.totalFileSize)}
			</span>
		{/if}
		<span class="badge badge-ghost badge-sm">
			<Film class="h-3 w-3" />
			{data.movieCount} movie{data.movieCount !== 1 ? 's' : ''}
		</span>
		<span class="badge badge-ghost badge-sm">
			<Tv class="h-3 w-3" />
			{data.seriesCount} series
		</span>
		{#if hasActiveFilters}
			<button class="btn gap-1 text-base-content/50 btn-ghost btn-xs" onclick={handleClearAll}>
				<X class="h-3 w-3" />
				Clear filters
			</button>
		{/if}
	</div>

	<!-- Filter bar -->
	<div class="space-y-2">
		<!-- Tier 1: Primary filter chips -->
		<div class="flex flex-wrap items-center gap-2">
			<!-- Type filter -->
			<div class="join">
				<button
					class="btn join-item btn-sm {data.filters.type === 'all' ? 'btn-primary' : 'btn-ghost'}"
					onclick={() => updateUrlParam('type', 'all')}
				>
					All
				</button>
				<button
					class="btn join-item btn-sm {data.filters.type === 'movie' ? 'btn-primary' : 'btn-ghost'}"
					onclick={() => updateUrlParam('type', 'movie')}
				>
					<Film class="h-3.5 w-3.5" />
					Movies
				</button>
				<button
					class="btn join-item btn-sm {data.filters.type === 'tv' ? 'btn-primary' : 'btn-ghost'}"
					onclick={() => updateUrlParam('type', 'tv')}
				>
					<Tv class="h-3.5 w-3.5" />
					TV
				</button>
			</div>

			<!-- Status filter -->
			<div class="join">
				<button
					class="btn join-item btn-sm {data.filters.monitored === 'all'
						? 'btn-primary'
						: 'btn-ghost'}"
					onclick={() => updateUrlParam('monitored', 'all')}
				>
					All Status
				</button>
				<button
					class="btn join-item btn-sm {data.filters.monitored === 'monitored'
						? 'btn-primary'
						: 'btn-ghost'}"
					onclick={() => updateUrlParam('monitored', 'monitored')}
				>
					Monitored
				</button>
				<button
					class="btn join-item btn-sm {data.filters.monitored === 'unmonitored'
						? 'btn-primary'
						: 'btn-ghost'}"
					onclick={() => updateUrlParam('monitored', 'unmonitored')}
				>
					Unmonitored
				</button>
			</div>

			<!-- Plays filter -->
			<div class="join">
				<button
					class="btn join-item btn-sm {data.filters.hasPlays === 'all'
						? 'btn-primary'
						: 'btn-ghost'}"
					onclick={() => updateUrlParam('hasPlays', 'all')}
				>
					All Plays
				</button>
				<button
					class="btn join-item btn-sm {data.filters.hasPlays === 'played'
						? 'btn-primary'
						: 'btn-ghost'}"
					onclick={() => updateUrlParam('hasPlays', 'played')}
				>
					Played
				</button>
				<button
					class="btn join-item btn-sm {data.filters.hasPlays === 'neverPlayed'
						? 'btn-primary'
						: 'btn-ghost'}"
					onclick={() => updateUrlParam('hasPlays', 'neverPlayed')}
				>
					Never Played
				</button>
			</div>

			{#if (data.libraries?.length ?? 0) > 1}
				<select
					class="select-bordered select w-auto select-sm"
					value={data.filters.library}
					onchange={(e) => updateUrlParam('library', (e.target as HTMLSelectElement).value)}
				>
					<option value="all">All Libraries</option>
					{#each data.libraries ?? [] as lib (lib.id)}
						<option value={lib.id}>{lib.name}</option>
					{/each}
				</select>
			{/if}

			<!-- Quality toggle button -->
			<button
				class="btn btn-sm {qualityExpanded ? 'btn-active' : 'btn-ghost'} gap-1"
				onclick={() => (qualityExpanded = !qualityExpanded)}
			>
				<SlidersHorizontal class="h-4 w-4" />
				Quality &amp; Technical
				{#if qualityActiveCount > 0}
					<span class="badge badge-xs badge-primary">{qualityActiveCount}</span>
				{/if}
				<ChevronDown
					class="h-3.5 w-3.5 transition-transform {qualityExpanded ? 'rotate-180' : ''}"
				/>
			</button>
		</div>

		<!-- Tier 2: Quality & Technical filters (expandable) -->
		{#if qualityExpanded}
			<div class="flex flex-wrap items-center gap-2 rounded-lg bg-base-200/50 p-2">
				<select
					class="select-bordered select w-auto select-sm"
					value={data.filters.classification}
					onchange={(e) => updateUrlParam('classification', (e.target as HTMLSelectElement).value)}
				>
					<option value="all">All Classes</option>
					<option value="standard">Standard</option>
					<option value="anime">Anime</option>
				</select>

				{#if data.filterOptions.resolutions.length > 0}
					<select
						class="select-bordered select w-auto select-sm"
						value={data.filters.resolution}
						onchange={(e) => updateUrlParam('resolution', (e.target as HTMLSelectElement).value)}
					>
						<option value="all">All Resolutions</option>
						{#each data.filterOptions.resolutions as opt (opt)}
							<option value={opt}>{opt}</option>
						{/each}
					</select>
				{/if}

				{#if data.filterOptions.videoCodecs.length > 0}
					<select
						class="select-bordered select w-auto select-sm"
						value={data.filters.videoCodec}
						onchange={(e) => updateUrlParam('videoCodec', (e.target as HTMLSelectElement).value)}
					>
						<option value="all">All Codecs</option>
						{#each data.filterOptions.videoCodecs as opt (opt)}
							<option value={opt}>{opt}</option>
						{/each}
					</select>
				{/if}

				{#if data.filterOptions.hdrFormats.length > 0}
					<select
						class="select-bordered select w-auto select-sm"
						value={data.filters.hdrFormat}
						onchange={(e) => updateUrlParam('hdrFormat', (e.target as HTMLSelectElement).value)}
					>
						<option value="all">All HDR</option>
						{#each data.filterOptions.hdrFormats as opt (opt)}
							<option value={opt}>{opt}</option>
						{/each}
					</select>
				{/if}

				{#if data.filterOptions.audioCodecs.length > 0}
					<select
						class="select-bordered select w-auto select-sm"
						value={data.filters.audioCodec}
						onchange={(e) => updateUrlParam('audioCodec', (e.target as HTMLSelectElement).value)}
					>
						<option value="all">All Audio</option>
						{#each data.filterOptions.audioCodecs as opt (opt)}
							<option value={opt}>{opt}</option>
						{/each}
					</select>
				{/if}

				{#if data.filterOptions.containers.length > 0}
					<select
						class="select-bordered select w-auto select-sm"
						value={data.filters.container}
						onchange={(e) => updateUrlParam('container', (e.target as HTMLSelectElement).value)}
					>
						<option value="all">All Containers</option>
						{#each data.filterOptions.containers as opt (opt)}
							<option value={opt}>{opt}</option>
						{/each}
					</select>
				{/if}

				{#if (data.rootFolders?.length ?? 0) > 1}
					<select
						class="select-bordered select w-auto select-sm"
						value={data.filters.rootFolder}
						onchange={(e) => updateUrlParam('rootFolder', (e.target as HTMLSelectElement).value)}
					>
						<option value="all">All Folders</option>
						{#each data.rootFolders ?? [] as rf (rf.id)}
							<option value={rf.id}>{rf.name || rf.path}</option>
						{/each}
					</select>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Results -->
	{#if filteredItems.length === 0}
		<div class="py-16 text-center text-base-content/60">
			<HardDrive class="mx-auto mb-4 h-12 w-12 opacity-40" />
			<p class="text-lg font-medium">
				{#if searchQuery.trim()}
					No media matches "{searchQuery}"
				{:else if hasActiveFilters}
					No media matches the current filters
				{:else}
					No media in your library yet
				{/if}
			</p>
			{#if searchQuery.trim() || hasActiveFilters}
				<button class="btn mt-4 btn-ghost btn-sm" onclick={handleClearAll}>
					Clear all filters
				</button>
			{/if}
		</div>
	{:else}
		<MediaExplorerTable
			items={renderer.visible}
			currentSort={data.filters.sort}
			onSortChange={handleSortChange}
		/>

		{#if renderer.hasMore}
			<div bind:this={renderer.sentinel} class="h-1"></div>
		{/if}

		<div class="text-center text-xs text-base-content/50">
			Showing {renderer.visible.length} of {filteredItems.length} items
		</div>
	{/if}
</SettingsPage>
