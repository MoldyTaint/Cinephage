<script lang="ts">
	import { SvelteSet, SvelteMap, SvelteURLSearchParams } from 'svelte/reactivity';
	import {
		X,
		Search,
		Loader2,
		RefreshCw,
		Filter,
		Package,
		AlertCircle,
		CheckCircle2,
		XCircle,
		ChevronDown,
		ChevronUp
	} from 'lucide-svelte';
	import SearchResultRow from './SearchResultRow.svelte';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';

	interface Release {
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
			episode?: {
				season?: number;
				seasons?: number[];
				episodes?: number[];
				isSeasonPack?: boolean;
				isCompleteSeries?: boolean;
			};
		};
		episodeMatch?: {
			season?: number;
			seasons?: number[];
			episodes?: number[];
			isSeasonPack?: boolean;
			isCompleteSeries?: boolean;
		};
		quality?: {
			score: number;
			meetsMinimum: boolean;
		};
		totalScore?: number;
		rejected?: boolean;
	}

	interface IndexerResult {
		name: string;
		count: number;
		durationMs: number;
		error?: string;
		searchMethod?: 'id' | 'text';
	}

	interface RejectedIndexer {
		indexerId: string;
		indexerName: string;
		reason: 'searchType' | 'searchSource' | 'disabled' | 'backoff' | 'indexerFilter';
		message: string;
	}

	interface SearchMeta {
		totalResults: number;
		rejectedCount?: number;
		searchTimeMs: number;
		enrichTimeMs?: number;
		indexerCount?: number;
		indexerResults?: Record<string, IndexerResult>;
		rejectedIndexers?: RejectedIndexer[];
	}

	export type SearchMode = 'all' | 'multiSeasonPack';

	interface Props {
		open: boolean;
		title: string;
		tmdbId?: number;
		imdbId?: string | null;
		year?: number | null;
		mediaType: 'movie' | 'tv';
		scoringProfileId?: string | null;
		season?: number;
		episode?: number;
		searchMode?: SearchMode;
		onClose: () => void;
		onGrab: (
			release: Release,
			streaming?: boolean
		) => Promise<{ success: boolean; error?: string }>;
	}

	let {
		open,
		title,
		tmdbId,
		imdbId,
		year,
		mediaType,
		scoringProfileId,
		season,
		episode,
		searchMode = 'all',
		onClose,
		onGrab
	}: Props = $props();

	// State
	let releases = $state<Release[]>([]);
	let meta = $state<SearchMeta | null>(null);
	let searching = $state(false);
	let searchError = $state<string | null>(null);
	let grabbingIds = new SvelteSet<string>();
	let grabbedIds = new SvelteSet<string>();
	let streamingIds = new SvelteSet<string>();
	let grabErrors = new SvelteMap<string, string>();
	let searchTriggered = $state(false);

	// Sorting
	let sortBy = $state<'score' | 'seeders' | 'size' | 'age'>('score');
	let sortDir = $state<'asc' | 'desc'>('desc');

	// Filtering
	let showRejected = $state(false);
	let filterQuery = $state('');

	// Indexer details visibility
	let showIndexerDetails = $state(false);

	// Helper to check if a release is a multi-season pack
	function isMultiSeasonPack(release: Release): boolean {
		// Check episodeMatch first (from enhanced search results)
		const episodeMatch = release.episodeMatch;
		if (episodeMatch) {
			// Complete series always counts as multi-season
			if (episodeMatch.isCompleteSeries) return true;
			// Multiple seasons in the array
			if (episodeMatch.seasons && episodeMatch.seasons.length > 1) return true;
		}

		// Fall back to parsed.episode info
		const episodeInfo = release.parsed?.episode;
		if (episodeInfo) {
			if (episodeInfo.isCompleteSeries) return true;
			if (episodeInfo.seasons && episodeInfo.seasons.length > 1) return true;
		}

		return false;
	}

	// Derived sorted and filtered releases
	const filteredReleases = $derived.by(() => {
		let result = [...releases];

		// Filter for multi-season packs only when in that mode
		if (searchMode === 'multiSeasonPack') {
			result = result.filter(isMultiSeasonPack);
		}

		// Filter rejected
		if (!showRejected) {
			result = result.filter((r) => !r.rejected);
		}

		// Filter by query
		if (filterQuery) {
			const q = filterQuery.toLowerCase();
			result = result.filter((r) => r.title.toLowerCase().includes(q));
		}

		// Sort
		result.sort((a, b) => {
			let comparison = 0;
			switch (sortBy) {
				case 'score':
					comparison = (a.totalScore ?? 0) - (b.totalScore ?? 0);
					break;
				case 'seeders':
					comparison = (a.seeders ?? 0) - (b.seeders ?? 0);
					break;
				case 'size':
					comparison = a.size - b.size;
					break;
				case 'age':
					comparison = new Date(a.publishDate).getTime() - new Date(b.publishDate).getTime();
					break;
			}
			return sortDir === 'desc' ? -comparison : comparison;
		});

		return result;
	});

	// Auto-search when modal opens
	$effect(() => {
		if (open && releases.length === 0 && !searching && !searchTriggered) {
			searchTriggered = true;
			performSearch();
		}
	});

	// Reset state when modal closes
	$effect(() => {
		if (!open) {
			releases = [];
			meta = null;
			searchError = null;
			grabbingIds.clear();
			grabbedIds.clear();
			streamingIds.clear();
			grabErrors.clear();
			filterQuery = '';
			searchTriggered = false;
		}
	});

	async function performSearch() {
		searching = true;
		searchError = null;

		try {
			const params = new SvelteURLSearchParams({
				searchType: mediaType,
				enrich: 'true',
				filterRejected: 'false' // Keep rejected for display, but mark them
			});

			if (tmdbId) params.set('tmdbId', tmdbId.toString());
			if (imdbId) params.set('imdbId', imdbId);
			if (year) params.set('year', year.toString());
			if (scoringProfileId) params.set('scoringProfileId', scoringProfileId);
			if (season !== undefined) params.set('season', season.toString());
			if (episode !== undefined) params.set('episode', episode.toString());

			// Title is just the clean series/movie title
			// Season/episode are passed separately and backend handles format composition
			params.set('q', title);

			const response = await fetch(`/api/search?${params}`);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Search failed');
			}

			releases = data.releases || [];
			meta = data.meta;
		} catch (err) {
			searchError = err instanceof Error ? err.message : 'Search failed';
			releases = [];
		} finally {
			searching = false;
		}
	}

	async function handleGrab(release: Release, streaming?: boolean) {
		grabbingIds.add(release.guid);
		if (streaming) {
			streamingIds.add(release.guid);
		}
		grabErrors.delete(release.guid);

		try {
			const result = await onGrab(release, streaming);
			if (result.success) {
				grabbedIds.add(release.guid);
			} else {
				grabErrors.set(release.guid, result.error || 'Failed to grab');
			}
		} catch (err) {
			grabErrors.set(release.guid, err instanceof Error ? err.message : 'Failed');
		} finally {
			grabbingIds.delete(release.guid);
			streamingIds.delete(release.guid);
		}
	}

	function toggleSort(field: typeof sortBy) {
		if (sortBy === field) {
			sortDir = sortDir === 'desc' ? 'asc' : 'desc';
		} else {
			sortBy = field;
			sortDir = 'desc';
		}
	}
</script>

<ModalWrapper {open} {onClose} maxWidth="5xl" labelledBy="interactive-search-modal-title">
	<!-- Header -->
	<div class="mb-4 flex items-center justify-between">
		<div>
			<h3 id="interactive-search-modal-title" class="flex items-center gap-2 text-lg font-bold">
				{#if searchMode === 'multiSeasonPack'}
					<Package size={20} class="text-primary" />
					Multi-Season Pack Search
				{:else}
					Interactive Search
				{/if}
			</h3>
			<p class="text-sm text-base-content/60">
				{title}
				{#if searchMode === 'multiSeasonPack'}
					<span class="ml-2 badge badge-sm badge-primary">Complete Series / Multi-Season Only</span>
				{/if}
			</p>
		</div>
		<div class="flex items-center gap-2">
			<button class="btn btn-ghost btn-sm" onclick={performSearch} disabled={searching}>
				{#if searching}
					<Loader2 size={16} class="animate-spin" />
				{:else}
					<RefreshCw size={16} />
				{/if}
				Refresh
			</button>
			<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
				<X size={16} />
			</button>
		</div>
	</div>

	<!-- Search stats -->
	{#if meta}
		<div class="mb-4 space-y-2">
			<div class="flex flex-wrap items-center gap-4 text-sm text-base-content/70">
				<span>{meta.totalResults} results</span>
				{#if meta.rejectedCount}
					<span class="text-warning">{meta.rejectedCount} rejected</span>
				{/if}
				<span>Search: {meta.searchTimeMs}ms</span>
				{#if meta.enrichTimeMs}
					<span>Enrich: {meta.enrichTimeMs}ms</span>
				{/if}
				{#if meta.indexerCount !== undefined}
					<button
						class="btn gap-1 btn-ghost btn-xs"
						onclick={() => (showIndexerDetails = !showIndexerDetails)}
					>
						{meta.indexerCount} indexers
						{#if showIndexerDetails}
							<ChevronUp size={12} />
						{:else}
							<ChevronDown size={12} />
						{/if}
					</button>
				{/if}
			</div>

			<!-- Indexer details panel -->
			{#if showIndexerDetails && (meta.indexerResults || meta.rejectedIndexers?.length)}
				<div class="rounded-lg bg-base-200 p-3 text-sm">
					<!-- Searched indexers -->
					{#if meta.indexerResults}
						<div class="mb-2">
							<span class="font-medium text-base-content/80">Searched:</span>
							<div class="mt-1 flex flex-wrap gap-2">
								{#each Object.entries(meta.indexerResults) as [, result] (result.name)}
									<div
										class="badge gap-1 {result.error
											? 'badge-error'
											: result.count > 0
												? 'badge-success'
												: 'badge-ghost'}"
									>
										{#if result.error}
											<XCircle size={12} />
										{:else if result.count > 0}
											<CheckCircle2 size={12} />
										{/if}
										{result.name}: {result.count}
										{#if result.error}
											<span class="tooltip" data-tip={result.error}>
												<AlertCircle size={12} />
											</span>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Rejected indexers -->
					{#if meta.rejectedIndexers?.length}
						<div>
							<span class="font-medium text-base-content/80">Skipped:</span>
							<div class="mt-1 flex flex-wrap gap-2">
								{#each meta.rejectedIndexers as rejected (rejected.indexerId)}
									<div
										class="tooltip badge gap-1 badge-outline badge-warning"
										data-tip={rejected.message}
									>
										<XCircle size={12} />
										{rejected.indexerName}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Filters -->
	<div class="mb-4 flex flex-wrap items-center gap-4">
		<div class="form-control">
			<div class="input-group input-group-sm">
				<span class="bg-base-200">
					<Filter size={14} />
				</span>
				<input
					type="text"
					placeholder="Filter results..."
					class="input-bordered input input-sm w-full sm:w-48"
					bind:value={filterQuery}
				/>
			</div>
		</div>

		<label class="label cursor-pointer gap-2">
			<input type="checkbox" class="checkbox checkbox-sm" bind:checked={showRejected} />
			<span class="label-text">Show rejected</span>
		</label>
	</div>

	<!-- Results -->
	<div class="flex-1 overflow-auto">
		{#if searching}
			<div class="flex flex-col items-center justify-center py-12">
				<Loader2 size={32} class="animate-spin text-primary" />
				<p class="mt-4 text-base-content/60">Searching indexers...</p>
			</div>
		{:else if searchError}
			<div class="alert alert-error">
				<span>{searchError}</span>
			</div>
		{:else if filteredReleases.length === 0}
			<div class="flex flex-col items-center justify-center py-12">
				{#if searchMode === 'multiSeasonPack'}
					<Package size={48} class="text-base-content/30" />
					<p class="mt-4 text-base-content/60">No multi-season packs found</p>
					<p class="mt-2 text-sm text-base-content/40">
						Try searching by individual season instead
					</p>
				{:else}
					<Search size={48} class="text-base-content/30" />
					<p class="mt-4 text-base-content/60">No results found</p>
				{/if}
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="table table-sm">
					<thead class="sticky top-0 z-10 bg-base-100">
						<tr>
							<th class="w-1/3">
								<button class="btn btn-ghost btn-xs" onclick={() => toggleSort('score')}>
									Release
								</button>
							</th>
							<th>Indexer</th>
							<th>
								<button class="btn btn-ghost btn-xs" onclick={() => toggleSort('size')}>
									Size {sortBy === 'size' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
								</button>
							</th>
							<th>
								<button class="btn btn-ghost btn-xs" onclick={() => toggleSort('seeders')}>
									S/L {sortBy === 'seeders' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
								</button>
							</th>
							<th>
								<button class="btn btn-ghost btn-xs" onclick={() => toggleSort('age')}>
									Age {sortBy === 'age' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
								</button>
							</th>
							<th>
								<button class="btn btn-ghost btn-xs" onclick={() => toggleSort('score')}>
									Score {sortBy === 'score' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
								</button>
							</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredReleases as release (release.guid)}
							<SearchResultRow
								{release}
								onGrab={handleGrab}
								grabbing={grabbingIds.has(release.guid)}
								grabbed={grabbedIds.has(release.guid)}
								streaming={streamingIds.has(release.guid)}
								error={grabErrors.get(release.guid)}
							/>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<!-- Footer -->
	<div class="modal-action">
		<button class="btn" onclick={onClose}>Close</button>
	</div>
</ModalWrapper>
