<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { SvelteSet, SvelteMap, SvelteURLSearchParams } from 'svelte/reactivity';
	import {
		X,
		Search,
		Loader2,
		RefreshCw,
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
	import type { ScoreComponents } from '$lib/server/quality/types.js';

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
		scoreComponents?: ScoreComponents;
		scoringResult?: {
			totalScore?: number;
			breakdown?: {
				resolution?: { score: number; formats: string[] };
				source?: { score: number; formats: string[] };
				codec?: { score: number; formats: string[] };
				releaseGroupTier?: { score: number; formats: string[] };
				audio?: { score: number; formats: string[] };
				hdr?: { score: number; formats: string[] };
				streaming?: { score: number; formats: string[] };
				enhancement?: { score: number; formats: string[] };
				banned?: { score: number; formats: string[] };
			};
		};
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

	interface NntpServerStatus {
		enabled?: boolean;
	}

	export type SearchMode = 'all' | 'multiSeasonPack';

	interface Props {
		open: boolean;
		title: string;
		tmdbId?: number;
		imdbId?: string | null;
		tvdbId?: number | null;
		expectedEpisodeCount?: number | null;
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
		) => Promise<{ success: boolean; error?: string; errorCode?: string }>;
	}

	let {
		open,
		title,
		tmdbId,
		imdbId,
		tvdbId,
		expectedEpisodeCount,
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
	let usenetStreamingState = $state<
		'unknown' | 'available' | 'noConfiguredServers' | 'noEnabledServers' | 'unavailable'
	>('unknown');

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
				tvdbId,
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

	// Generate a unique key for a release (guid alone can collide across indexers)
	function releaseKey(release: Release): string {
		return `${release.guid}-${release.indexerId}`;
	}

	async function loadUsenetStreamingAvailability() {
		try {
			usenetStreamingState = 'unknown';
			const response = await fetch('/api/usenet/servers');

			if (!response.ok) {
				usenetStreamingState = 'unavailable';
				return;
			}

			const servers = (await response.json()) as NntpServerStatus[];

			if (servers.length === 0) {
				usenetStreamingState = 'noConfiguredServers';
				return;
			}

			if (!servers.some((server) => server.enabled)) {
				usenetStreamingState = 'noEnabledServers';
				return;
			}

			usenetStreamingState = 'available';
		} catch {
			usenetStreamingState = 'unavailable';
		}
	}

	function getGrabErrorMessage(errorCode?: string, error?: string): string {
		switch (errorCode) {
			case 'NNTP_NOT_CONFIGURED':
				return 'No NNTP server configured. Add one in Settings -> Integrations -> NNTP Servers.';
			case 'NNTP_NOT_ENABLED':
				return 'No enabled NNTP server. Enable at least one server to use Stream.';
			case 'NNTP_UNAVAILABLE':
				return 'NNTP streaming is unavailable right now. Check NNTP server connectivity.';
			case 'NO_ENABLED_DOWNLOAD_CLIENT':
				return 'No enabled download client is configured for this protocol.';
			default:
				return error || 'Failed to grab';
		}
	}

	const showUsenetStreamButton = $derived.by(() => usenetStreamingState !== 'noConfiguredServers');
	const canUsenetStream = $derived.by(() => usenetStreamingState === 'available');
	const usenetStreamUnavailableReason = $derived.by(() => {
		switch (usenetStreamingState) {
			case 'unknown':
				return 'Checking NNTP server availability...';
			case 'noEnabledServers':
				return 'NNTP servers are configured but disabled. Enable one to stream.';
			case 'unavailable':
				return 'Unable to verify NNTP server status right now.';
			default:
				return null;
		}
	});

	// Helper to check if a release is a multi-season pack
	function isMultiSeasonPack(release: Release): boolean {
		const largeEpisodeThreshold = expectedEpisodeCount
			? Math.max(50, Math.floor(expectedEpisodeCount * 0.8))
			: 70;

		// Check episodeMatch first (from enhanced search results)
		const episodeMatch = release.episodeMatch;
		if (episodeMatch) {
			// Complete series always counts as multi-season
			if (episodeMatch.isCompleteSeries) return true;
			// Multiple seasons in the array
			if (episodeMatch.seasons && episodeMatch.seasons.length > 1) return true;
			// Trackers may encode multi-season packs as S1E1-171 style ranges.
			if (
				episodeMatch.isSeasonPack &&
				episodeMatch.season === 1 &&
				(episodeMatch.episodes?.length ?? 0) >= largeEpisodeThreshold
			) {
				return true;
			}
		}

		// Fall back to parsed.episode info
		const episodeInfo = release.parsed?.episode;
		if (episodeInfo) {
			if (episodeInfo.isCompleteSeries) return true;
			if (episodeInfo.seasons && episodeInfo.seasons.length > 1) return true;
			// Tracker fallback: some complete/multi-season packs are encoded as S1E1-171.
			// Treat very large season-1 episode spans as multi-pack candidates.
			if (
				episodeInfo.isSeasonPack &&
				episodeInfo.season === 1 &&
				(episodeInfo.episodes?.length ?? 0) >= largeEpisodeThreshold
			) {
				return true;
			}
		}

		// Title-based fallback for tracker formats where parser metadata may be incomplete
		const title = release.title;
		if (/\bS\d{1,2}[\s._-]*[-–—][\s._-]*S?\d{1,2}\b/i.test(title)) return true;
		if (/\bS\d{1,2}[\s._-]?E\d{1,3}\s*[-–—]\s*S\d{1,2}[\s._-]?E\d{1,3}\b/i.test(title)) return true;
		if (/\b\d{1,2}x\d{1,3}\s*[-–—]\s*\d{1,2}x\d{1,3}\b/i.test(title)) return true;
		if (
			/\bSeasons?[\s:._-]*\d{1,2}\s*(?:[-–—]|to|through|thru)\s*\d{1,2}(?:\s*(?:of|\/)\s*\d{1,2})?\b/i.test(
				title
			)
		)
			return true;
		if (
			/\bСезоны?[\s:._-]*\d{1,2}\s*(?:[-–—]|до)\s*\d{1,2}(?:\s*(?:из|of|\/)\s*\d{1,2})?\b/i.test(
				title
			)
		)
			return true;
		if (
			/\b(?:every[\s._-]?season|all[\s._-]?seasons?|полный[\s._-]*сериал|все[\s._-]*сезоны)\b/i.test(
				title
			)
		)
			return true;

		// Guardrail for generic words like "collection"/"bundle": require TV context nearby.
		const hasTvContext =
			/\b(?:series|seasons?|episodes?|s\d{1,2}(?:e\d{1,3})?|(?:\d{1,2})x\d{1,3})\b/i.test(title);
		if (
			hasTvContext &&
			/\b(?:complete[\s._-]?collection|full[\s._-]?collection|mega[\s._-]?pack|bundle)\b/i.test(
				title
			)
		)
			return true;

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

	// Releases scoped to the active reporting mode
	const modeBaseReleases = $derived.by(() => {
		if (searchMode === 'multiSeasonPack') {
			return releases.filter(isMultiSeasonPack);
		}
		return releases;
	});

	const rawReleaseCount = $derived.by(() => releases.length);

	const modeRejectedCount = $derived.by(() => modeBaseReleases.filter((r) => r.rejected).length);

	const reportedIndexerResults = $derived.by(() => {
		if (!meta?.indexerResults) {
			return [];
		}

		const modeCountsByIndexer = new SvelteMap<string, number>();
		if (searchMode === 'multiSeasonPack') {
			for (const release of modeBaseReleases) {
				modeCountsByIndexer.set(
					release.indexerId,
					(modeCountsByIndexer.get(release.indexerId) ?? 0) + 1
				);
			}
		}

		return Object.entries(meta.indexerResults).map(([indexerId, result]) => ({
			indexerId,
			...result,
			rawCount: result.count,
			displayCount:
				searchMode === 'multiSeasonPack' ? (modeCountsByIndexer.get(indexerId) ?? 0) : result.count
		}));
	});

	// Auto-search when modal opens
	$effect(() => {
		if (open && releases.length === 0 && !searching && !searchTriggered) {
			searchTriggered = true;
			void loadUsenetStreamingAvailability();
			void performSearch();
		}
	});

	// Reset state when modal closes
	$effect(() => {
		if (!open) {
			releases = [];
			meta = null;
			searchError = null;
			showRejected = false;
			grabbingIds.clear();
			grabbedIds.clear();
			streamingIds.clear();
			grabErrors.clear();
			filterQuery = '';
			searchTriggered = false;
			usenetStreamingState = 'unknown';
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

			if (searchMode) params.set('searchMode', searchMode);

			if (tmdbId) params.set('tmdbId', tmdbId.toString());
			if (imdbId) params.set('imdbId', imdbId);
			if (tvdbId) params.set('tvdbId', tvdbId.toString());
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
		if (streaming && !canUsenetStream) {
			const reason = usenetStreamUnavailableReason ?? 'NNTP streaming is unavailable';
			grabErrors.set(releaseKey(release), reason);
			return;
		}

		const key = releaseKey(release);
		grabbingIds.add(key);
		if (streaming) {
			streamingIds.add(key);
		}
		grabErrors.delete(key);

		try {
			const result = await onGrab(release, streaming);
			if (result.success) {
				grabbedIds.add(key);
			} else {
				grabErrors.set(key, getGrabErrorMessage(result.errorCode, result.error));
			}
		} catch (err) {
			grabErrors.set(key, err instanceof Error ? err.message : 'Failed');
		} finally {
			grabbingIds.delete(key);
			streamingIds.delete(key);
		}
	}
</script>

<ModalWrapper
	{open}
	{onClose}
	maxWidth="5xl"
	labelledBy="interactive-search-modal-title"
	flexContent
>
	<!-- Fixed top controls -->
	<div class="shrink-0">
		<!-- Header -->
		<div class="mb-3 flex items-start justify-between gap-2">
			<div class="min-w-0 flex-1">
				<h3
					id="interactive-search-modal-title"
					class="flex items-center gap-2 text-base font-bold sm:text-lg"
				>
					{#if searchMode === 'multiSeasonPack'}
						<Package size={18} class="shrink-0 text-primary" />
						<span class="truncate">Multi-Season Pack Search</span>
					{:else}
						Interactive Search
					{/if}
				</h3>
				<p class="truncate text-xs text-base-content/60 sm:text-sm">
					{title}
					{#if searchMode === 'multiSeasonPack'}
						<span class="ml-1 badge badge-xs badge-primary sm:badge-sm"
							>Complete Series / Multi-Season Only</span
						>
					{/if}
				</p>
			</div>
			<div class="flex shrink-0 items-center gap-1">
				<button class="btn btn-ghost btn-sm" onclick={performSearch} disabled={searching}>
					{#if searching}
						<Loader2 size={16} class="animate-spin" />
					{:else}
						<RefreshCw size={16} />
					{/if}
					<span class="hidden sm:inline">Refresh</span>
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
					{#if searchMode === 'multiSeasonPack'}
						<span>{filteredReleases.length} of {modeBaseReleases.length} multi-pack matches</span>
						{#if modeRejectedCount}
							<span class="text-warning">{modeRejectedCount} rejected</span>
						{/if}
					{:else}
						<span
							>{filteredReleases.length} of {meta.afterEnrichment ?? meta.totalResults} results</span
						>
						{#if meta.rejectedCount}
							<span class="text-warning">{meta.rejectedCount} rejected</span>
						{/if}
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
					{#if searchMode === 'multiSeasonPack' || meta.afterDedup || meta.afterFiltering || meta.afterEnrichment}
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
				{#if showPipelineDetails && (searchMode === 'multiSeasonPack' || meta.afterDedup || meta.afterFiltering || meta.afterEnrichment)}
					<div class="rounded-lg bg-base-200 p-3 text-sm">
						<div class="mb-2 font-medium text-base-content/80">
							{searchMode === 'multiSeasonPack' ? 'Multi-Pack Pipeline:' : 'Filtering Pipeline:'}
						</div>
						{#if searchMode === 'multiSeasonPack'}
							<div class="space-y-1">
								<div class="flex justify-between">
									<span>1. Multi-pack candidates:</span>
									<span class="font-mono">{modeBaseReleases.length}</span>
								</div>
								{#if modeRejectedCount}
									<div class="flex justify-between text-warning">
										<span>2. Quality rejected (hidden by default):</span>
										<span class="font-mono">{modeRejectedCount}</span>
									</div>
								{/if}
								<div class="mt-1 flex justify-between border-t border-base-300 pt-1">
									<span class="font-medium">3. Displayed (after limit):</span>
									<span class="font-mono font-medium">{filteredReleases.length}</span>
								</div>
							</div>
						{:else}
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
										<span>3. After relevance filters (season/category/ID/title/year):</span>
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
												<span class="text-error"
													>(-{meta.afterFiltering - meta.afterEnrichment})</span
												>
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
									<span class="font-mono font-medium">{filteredReleases.length}</span>
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Indexer details panel -->
				{#if showIndexerDetails && (meta.indexerResults || meta.rejectedIndexers?.length)}
					<div class="rounded-lg bg-base-200 p-3 text-sm">
						<!-- Searched indexers -->
						{#if reportedIndexerResults.length > 0}
							<div class="mb-2">
								<span class="font-medium text-base-content/80"
									>{searchMode === 'multiSeasonPack'
										? 'Searched (multi-pack matches / raw):'
										: 'Searched:'}</span
								>
								<div class="mt-1 flex flex-wrap gap-2">
									{#each reportedIndexerResults as result (result.indexerId)}
										<div
											class="badge gap-1 {result.error
												? 'badge-error'
												: result.displayCount > 0
													? 'badge-success'
													: 'badge-ghost'}"
										>
											{#if result.error}
												<XCircle size={12} />
											{:else if result.displayCount > 0}
												<CheckCircle2 size={12} />
											{/if}
											{#if searchMode === 'multiSeasonPack'}
												{result.name}: {result.displayCount}/{result.rawCount}
											{:else}
												{result.name}: {result.displayCount}
											{/if}
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

		<!-- Search & Sort -->
		<div class="mb-3 flex flex-wrap items-center gap-2 sm:gap-4">
			<div class="form-control w-full sm:w-auto">
				<input
					type="text"
					placeholder={m.search_placeholder_filterResults()}
					class="input input-sm w-full rounded-full border-base-content/20 bg-base-200/60 px-4 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none sm:w-48"
					bind:value={filterQuery}
				/>
			</div>

			<label class="label cursor-pointer gap-2">
				<input type="checkbox" class="checkbox checkbox-sm" bind:checked={showRejected} />
				<span class="label-text text-xs sm:text-sm">{m.search_label_showRejected()}</span>
			</label>

			<!-- Mobile sort control -->
			<div class="ml-auto flex items-center gap-1 sm:hidden">
				<span class="text-xs text-base-content/60">{m.search_label_sort()}</span>
				<select
					class="select-bordered select select-xs"
					value={sortBy}
					onchange={(e) => {
						sortBy = e.currentTarget.value as typeof sortBy;
					}}
				>
					<option value="score">{m.search_sort_score()}</option>
					<option value="seeders">{m.search_sort_seeders()}</option>
					<option value="size">{m.search_sort_size()}</option>
					<option value="age">Age</option>
				</select>
				<button
					class="btn btn-ghost btn-xs"
					onclick={() => (sortDir = sortDir === 'desc' ? 'asc' : 'desc')}
				>
					{sortDir === 'desc' ? '↓' : '↑'}
				</button>
			</div>
		</div>
	</div>

	<!-- Scrollable results -->
	<div class="min-h-0 flex-1 overflow-y-auto">
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
					{#if rawReleaseCount > 0}
						<div
							class="mb-4 max-w-xl rounded-lg border border-base-300 bg-base-200 p-3 text-center text-sm"
						>
							<p class="mt-1 text-base-content/60">
								{rawReleaseCount} releases matched the title, but none matched complete/multi-season rules.
							</p>
						</div>
					{/if}
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
			<!-- Results list - unified card layout (works on all screen sizes) -->
			<div class="space-y-3">
				{#each filteredReleases as release (releaseKey(release))}
					<SearchResultRow
						{release}
						onGrab={handleGrab}
						grabbing={grabbingIds.has(releaseKey(release))}
						grabbed={grabbedIds.has(releaseKey(release))}
						streaming={streamingIds.has(releaseKey(release))}
						error={grabErrors.get(releaseKey(release))}
						{showUsenetStreamButton}
						{canUsenetStream}
						{usenetStreamUnavailableReason}
					/>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Fixed footer -->
	<div class="modal-action shrink-0 border-t border-base-300 pt-3">
		<button class="btn" onclick={onClose}>Close</button>
	</div>
</ModalWrapper>
