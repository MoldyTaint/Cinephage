<script lang="ts">
	import { AlertTriangle, RefreshCw } from 'lucide-svelte';
	import InteractiveSearchModal from './InteractiveSearchModal.svelte';
	import type { SearchMode } from './InteractiveSearchModal.svelte';
	import type { Release } from './SearchResultRow.svelte';
	import { getMovie, getSeries } from '$lib/api/library.js';
	import { grabRelease } from '$lib/api/downloads.js';

	interface Props {
		open: boolean;
		movieId?: string;
		seriesId?: string;
		season?: number;
		episode?: number;
		searchMode?: SearchMode;
		/** TV-only: resolves season/episode numbers to local episode row IDs */
		resolveEpisodeIds?: (season: number, episodes: number[]) => string[];
		onClose: () => void;
	}

	let {
		open,
		movieId,
		seriesId,
		season,
		episode,
		searchMode = 'all',
		resolveEpisodeIds,
		onClose
	}: Props = $props();

	/** Resolve the season/episode targeting for a TV grab from the release's parsed episode info. */
	function resolveTvTarget(release: Release): { seasonNumber?: number; episodeIds?: string[] } {
		const match = release.episodeMatch ?? release.parsed?.episode;
		let seasonNumber: number | undefined;
		let episodeIds: string[] | undefined;

		if (match) {
			if (match.isSeasonPack && match.season !== undefined) {
				seasonNumber = match.season;
			} else if (match.seasons && match.seasons.length === 1) {
				seasonNumber = match.seasons[0];
			} else if (match.season !== undefined && match.episodes?.length) {
				seasonNumber = match.season;
				if (resolveEpisodeIds) {
					episodeIds = resolveEpisodeIds(match.season, match.episodes);
				}
			}
		}

		// Fall back to the search context when the release had no usable episode match
		if (seasonNumber === undefined && season !== undefined) {
			seasonNumber = season;
			if (episode !== undefined && resolveEpisodeIds) {
				episodeIds = resolveEpisodeIds(season, [episode]);
			}
		}

		return { seasonNumber, episodeIds };
	}

	type Metadata = {
		title: string;
		tmdbId: number | null;
		imdbId: string | null;
		tvdbId: number | null;
		year: number | null;
		scoringProfileId: string | null;
		episodeCount: number | null;
	};

	let loading = $state(false);
	let error = $state<string | null>(null);
	let meta = $state<Metadata | null>(null);

	$effect(() => {
		if (open) {
			loading = true;
			error = null;
			meta = null;
			void (async () => {
				try {
					if (movieId) {
						const res = (await getMovie(movieId)) as {
							success: boolean;
							error?: string;
							movie?: {
								title: string;
								tmdbId: number;
								imdbId: string | null;
								year: number | null;
								scoringProfileId: string | null;
							};
						};
						if (res.success && res.movie) {
							meta = {
								title: res.movie.title,
								tmdbId: res.movie.tmdbId,
								imdbId: res.movie.imdbId ?? null,
								tvdbId: null,
								year: res.movie.year ?? null,
								scoringProfileId: res.movie.scoringProfileId ?? null,
								episodeCount: null
							};
						} else {
							error = res.error || 'Failed to load movie';
						}
					} else if (seriesId) {
						const res = (await getSeries(seriesId)) as {
							success: boolean;
							error?: string;
							series?: {
								title: string;
								tmdbId: number;
								imdbId: string | null;
								tvdbId: number | null;
								year: number | null;
								scoringProfileId: string | null;
								episodeCount: number | null;
							};
						};
						if (res.success && res.series) {
							meta = {
								title: res.series.title,
								tmdbId: res.series.tmdbId,
								imdbId: res.series.imdbId ?? null,
								tvdbId: res.series.tvdbId ?? null,
								year: res.series.year ?? null,
								scoringProfileId: res.series.scoringProfileId ?? null,
								episodeCount: res.series.episodeCount ?? null
							};
						} else {
							error = res.error || 'Failed to load series';
						}
					} else {
						error = 'No media ID provided';
					}
				} catch (e) {
					error = e instanceof Error ? e.message : 'Failed to load media';
				} finally {
					loading = false;
				}
			})();
		}
	});

	async function handleGrab(
		release: Release,
		streaming?: boolean
	): Promise<{ success: boolean; error?: string; errorCode?: string }> {
		try {
			const result = await grabRelease({
				guid: release.guid,
				downloadUrl: release.downloadUrl,
				magnetUrl: release.magnetUrl,
				infoHash: release.infoHash,
				title: release.title,
				indexerId: release.indexerId,
				indexerName: release.indexerName,
				protocol: release.protocol,
				size: release.size,
				publishDate:
					release.publishDate instanceof Date
						? release.publishDate.toISOString()
						: release.publishDate,
				...(movieId
					? { movieId, mediaType: 'movie' as const }
					: (() => {
							const target = resolveTvTarget(release);
							return {
								seriesId: seriesId!,
								mediaType: 'tv' as const,
								seasonNumber: target.seasonNumber,
								...(target.episodeIds?.length ? { episodeIds: target.episodeIds } : {})
							};
						})()),
				streamUsenet: streaming && release.protocol === 'usenet',
				commentsUrl: release.commentsUrl
			});
			return { success: result.success, error: result.error, errorCode: result.errorCode };
		} catch (e) {
			return {
				success: false,
				error: e instanceof Error ? e.message : 'Failed to grab release'
			};
		}
	}
</script>

{#if loading}
	<dialog class="modal modal-open">
		<div class="modal-box flex items-center justify-center py-16">
			<RefreshCw class="h-6 w-6 animate-spin text-base-content/50" />
		</div>
	</dialog>
{:else if error}
	<dialog class="modal modal-open" onclick={(e) => e.target === e.currentTarget && onClose()}>
		<div class="modal-box">
			<div class="flex flex-col items-center gap-3 py-8 text-center">
				<AlertTriangle class="h-8 w-8 text-error" />
				<p class="text-sm text-error">{error}</p>
				<button class="btn btn-ghost btn-sm" onclick={onClose}>Close</button>
			</div>
		</div>
	</dialog>
{:else if meta}
	<InteractiveSearchModal
		{open}
		title={meta.title}
		tmdbId={meta.tmdbId ?? undefined}
		imdbId={meta.imdbId ?? undefined}
		tvdbId={meta.tvdbId ?? undefined}
		expectedEpisodeCount={meta.episodeCount ?? undefined}
		year={meta.year ?? undefined}
		mediaType={movieId ? 'movie' : 'tv'}
		scoringProfileId={meta.scoringProfileId ?? undefined}
		{season}
		{episode}
		{searchMode}
		{onClose}
		onGrab={handleGrab}
	/>
{/if}
