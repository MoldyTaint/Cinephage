<script lang="ts">
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';
	import type { ScoreComponents } from '$lib/server/quality/types.js';
	import SearchHeader from './SearchHeader.svelte';
	import SearchStats from './SearchStats.svelte';
	import SearchFilters from './SearchFilters.svelte';
	import SearchResultsList from './SearchResultsList.svelte';
	import { getUsenetServers } from '$lib/api/usenet.js';
	import { searchReleases } from '$lib/api/indexers.js';

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

	let sortBy = $state<'score' | 'seeders' | 'size' | 'age'>('score');
	let sortDir = $state<'asc' | 'desc'>('desc');

	let showRejected = $state(false);
	let filterQuery = $state('');

	let showIndexerDetails = $state(false);
	let showPipelineDetails = $state(false);
	let showDebugPanel = $state(false);
	let selectedDebugRelease = $state<Release | null>(null);

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

	function releaseKey(release: Release): string {
		return `${release.guid}-${release.indexerId}`;
	}

	async function loadUsenetStreamingAvailability() {
		try {
			usenetStreamingState = 'unknown';
			const servers = await getUsenetServers();

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

	function isMultiSeasonPack(release: Release): boolean {
		const largeEpisodeThreshold = expectedEpisodeCount
			? Math.max(50, Math.floor(expectedEpisodeCount * 0.8))
			: 70;

		const episodeMatch = release.episodeMatch;
		if (episodeMatch) {
			if (episodeMatch.isCompleteSeries) return true;
			if (episodeMatch.seasons && episodeMatch.seasons.length > 1) return true;
			if (
				episodeMatch.isSeasonPack &&
				episodeMatch.season === 1 &&
				(episodeMatch.episodes?.length ?? 0) >= largeEpisodeThreshold
			) {
				return true;
			}
		}

		const episodeInfo = release.parsed?.episode;
		if (episodeInfo) {
			if (episodeInfo.isCompleteSeries) return true;
			if (episodeInfo.seasons && episodeInfo.seasons.length > 1) return true;
			if (
				episodeInfo.isSeasonPack &&
				episodeInfo.season === 1 &&
				(episodeInfo.episodes?.length ?? 0) >= largeEpisodeThreshold
			) {
				return true;
			}
		}

		const t = release.title;
		if (/\bS\d{1,2}[\s._-]*[-–—][\s._-]*S?\d{1,2}\b/i.test(t)) return true;
		if (/\bS\d{1,2}[\s._-]?E\d{1,3}\s*[-–—]\s*S\d{1,2}[\s._-]?E\d{1,3}\b/i.test(t)) return true;
		if (/\b\d{1,2}x\d{1,3}\s*[-–—]\s*\d{1,2}x\d{1,3}\b/i.test(t)) return true;
		if (
			/\bSeasons?[\s:._-]*\d{1,2}\s*(?:[-–—]|to|through|thru)\s*\d{1,2}(?:\s*(?:of|\/)\s*\d{1,2})?\b/i.test(
				t
			)
		)
			return true;
		if (
			/\bСезоны?[\s:._-]*\d{1,2}\s*(?:[-–—]|до)\s*\d{1,2}(?:\s*(?:из|of|\/)\s*\d{1,2})?\b/i.test(t)
		)
			return true;
		if (
			/\b(?:every[\s._-]?season|all[\s._-]?seasons?|полный[\s._-]*сериал|все[\s._-]*сезоны)\b/i.test(
				t
			)
		)
			return true;

		const hasTvContext =
			/\b(?:series|seasons?|episodes?|s\d{1,2}(?:e\d{1,3})?|(?:\d{1,2})x\d{1,3})\b/i.test(t);
		if (
			hasTvContext &&
			/\b(?:complete[\s._-]?collection|full[\s._-]?collection|mega[\s._-]?pack|bundle)\b/i.test(t)
		)
			return true;

		return false;
	}

	const filteredReleases = $derived.by(() => {
		let result = [...releases];

		if (searchMode === 'multiSeasonPack') {
			result = result.filter(isMultiSeasonPack);
		}

		if (!showRejected) {
			result = result.filter((r) => !r.rejected);
		}

		if (filterQuery) {
			const q = filterQuery.toLowerCase();
			result = result.filter((r) => r.title.toLowerCase().includes(q));
		}

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

	$effect(() => {
		if (open && releases.length === 0 && !searching && !searchTriggered) {
			searchTriggered = true;
			void loadUsenetStreamingAvailability();
			void performSearch();
		}
	});

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
			const params: Record<string, string> = {
				searchType: mediaType,
				enrich: 'true',
				filterRejected: 'false'
			};

			if (searchMode) params.searchMode = searchMode;

			if (tmdbId) params.tmdbId = tmdbId.toString();
			if (imdbId) params.imdbId = imdbId;
			if (tvdbId) params.tvdbId = tvdbId.toString();
			if (year) params.year = year.toString();
			if (scoringProfileId) params.scoringProfileId = scoringProfileId;
			if (season !== undefined) params.season = season.toString();
			if (episode !== undefined) params.episode = episode.toString();

			params.q = title;

			const data = await searchReleases(params);

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
	<div class="shrink-0">
		<SearchHeader {title} {searchMode} {searching} onRefresh={performSearch} {onClose} />

		{#if meta}
			<SearchStats
				{meta}
				{searchMode}
				{filteredReleases}
				{modeBaseReleases}
				{modeRejectedCount}
				{reportedIndexerResults}
				{showIndexerDetails}
				{showPipelineDetails}
				{showDebugPanel}
				{selectedDebugRelease}
				{releases}
				onToggleIndexerDetails={() => (showIndexerDetails = !showIndexerDetails)}
				onTogglePipelineDetails={() => (showPipelineDetails = !showPipelineDetails)}
				onToggleDebugPanel={() => (showDebugPanel = !showDebugPanel)}
				onDownloadDebugJson={downloadDebugJson}
				onSelectDebugRelease={(r: Release | null) => (selectedDebugRelease = r)}
			/>
		{/if}

		<SearchFilters
			{filterQuery}
			{showRejected}
			{sortBy}
			{sortDir}
			onFilterChange={(v) => (filterQuery = v)}
			onShowRejectedChange={(v) => (showRejected = v)}
			onSortByChange={(v) => (sortBy = v)}
			onSortDirToggle={() => (sortDir = sortDir === 'desc' ? 'asc' : 'desc')}
		/>
	</div>

	<SearchResultsList
		{searching}
		{searchError}
		{filteredReleases}
		{rawReleaseCount}
		{searchMode}
		getReleaseKey={releaseKey}
		{grabbingIds}
		{grabbedIds}
		{streamingIds}
		{grabErrors}
		{showUsenetStreamButton}
		{canUsenetStream}
		{usenetStreamUnavailableReason}
		onGrab={handleGrab}
	/>

	<div class="modal-action shrink-0 border-t border-base-300 pt-3">
		<button class="btn" onclick={onClose}>Close</button>
	</div>
</ModalWrapper>
