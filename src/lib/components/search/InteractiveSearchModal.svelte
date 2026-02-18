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
		ChevronUp,
		Download,
		Bug
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
		/** Results after first deduplication */
		afterDedup?: number;
		/** Results after season/category filtering */
		afterFiltering?: number;
		/** Results after enrichment and smart dedup */
		afterEnrichment?: number;
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
	let showPipelineDetails = $state(false);
	let showDebugPanel = $state(false);
	let selectedDebugRelease = $state<Release | null>(null);

	// Download debug JSON
	function downloadDebugJson() {
		const debugData = {
			timestamp: new Date().toISOString(),
			searchParams: {
				title,
				tmdbId,
				imdbId,
				year,
				mediaType,
				season,
				episode,
				scoringProfileId,
				searchMode
			},
			meta,
			allReleases: releases,
			filteredReleases: filteredReleases
		};
		const blob = new Blob([JSON.stringify(debugData, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `search-debug-${title.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

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
				<span>{releases.length} of {meta.afterEnrichment ?? meta.totalResults} results</span>
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
				<!-- Pipeline details button -->
				{#if meta.afterDedup || meta.afterFiltering || meta.afterEnrichment}
					<button
						class="btn gap-1 btn-ghost btn-xs"
						onclick={() => (showPipelineDetails = !showPipelineDetails)}
					>
						Pipeline
						{#if showPipelineDetails}
							<ChevronUp size={12} />
						{:else}
							<ChevronDown size={12} />
						{/if}
					</button>
				{/if}
			</div>

			<!-- Pipeline breakdown panel -->
			{#if showPipelineDetails && (meta.afterDedup || meta.afterFiltering || meta.afterEnrichment)}
				<div class="rounded-lg bg-base-200 p-3 text-sm">
					<div class="mb-2 font-medium text-base-content/80">Filtering Pipeline:</div>
					<div class="space-y-1">
						<div class="flex justify-between">
							<span>1. Raw from indexers:</span>
							<span class="font-mono">{meta.totalResults}</span>
						</div>
						{#if meta.afterDedup !== undefined}
							<div class="flex justify-between">
								<span>2. After deduplication:</span>
								<span class="font-mono"
									>{meta.afterDedup}
									<span class="text-error">(-{meta.totalResults - meta.afterDedup})</span></span
								>
							</div>
						{/if}
						{#if meta.afterFiltering !== undefined}
							<div class="flex justify-between">
								<span>3. After season/category filter:</span>
								<span class="font-mono"
									>{meta.afterFiltering}
									{#if meta.afterDedup !== undefined && meta.afterFiltering < meta.afterDedup}
										<span class="text-error">(-{meta.afterDedup - meta.afterFiltering})</span>
									{/if}</span
								>
							</div>
						{/if}
						{#if meta.afterEnrichment !== undefined}
							<div class="flex justify-between">
								<span>4. After quality scoring & smart dedup:</span>
								<span class="font-mono"
									>{meta.afterEnrichment}
									{#if meta.afterFiltering !== undefined && meta.afterEnrichment < meta.afterFiltering}
										<span class="text-error">(-{meta.afterFiltering - meta.afterEnrichment})</span>
									{/if}</span
								>
							</div>
						{/if}
						{#if meta.rejectedCount}
							<div class="flex justify-between text-warning">
								<span>└ Quality rejected (hidden by default):</span>
								<span class="font-mono">{meta.rejectedCount}</span>
							</div>
						{/if}
						<div class="mt-1 flex justify-between border-t border-base-300 pt-1">
							<span class="font-medium">5. Displayed (after limit):</span>
							<span class="font-mono font-medium">{releases.length}</span>
						</div>
					</div>
				</div>
			{/if}

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
										class="tooltip tooltip-right badge gap-1 badge-outline badge-warning before:max-w-72 before:text-left before:whitespace-normal"
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

			<!-- Debug tools -->
			<div class="mt-2 flex gap-2">
				<button
					class="btn gap-1 btn-ghost btn-xs"
					onclick={downloadDebugJson}
					title="Download full debug JSON with all release details"
				>
					<Download size={12} />
					Download Debug JSON
				</button>
				<button
					class="btn gap-1 btn-ghost btn-xs"
					onclick={() => (showDebugPanel = !showDebugPanel)}
					title="View raw JSON data"
				>
					<Bug size={12} />
					{showDebugPanel ? 'Hide' : 'Show'} Debug Panel
				</button>
			</div>

			<!-- Debug panel -->
			{#if showDebugPanel}
				<div class="mt-2 rounded-lg bg-base-300 p-3">
					<div class="mb-2 flex gap-2">
						<button
							class="btn btn-xs {selectedDebugRelease === null ? 'btn-primary' : 'btn-ghost'}"
							onclick={() => (selectedDebugRelease = null)}
						>
							All Releases ({releases.length})
						</button>
						{#if selectedDebugRelease}
							<span class="text-sm text-base-content/70">
								Selected: {selectedDebugRelease.title.substring(0, 50)}...
							</span>
						{/if}
					</div>
					<div class="mb-2 text-xs text-base-content/60">
						Click on any release row below to view its detailed JSON here
					</div>
					<pre
						class="max-h-96 overflow-auto rounded bg-base-100 p-2 font-mono text-xs whitespace-pre-wrap">{JSON.stringify(
							selectedDebugRelease ?? {
								meta,
								releases: releases.slice(0, 10),
								note: 'Showing first 10 releases. Download JSON for full data.'
							},
							null,
							2
						)}</pre>
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
								onClick={showDebugPanel ? () => (selectedDebugRelease = release) : undefined}
								clickable={showDebugPanel}
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
