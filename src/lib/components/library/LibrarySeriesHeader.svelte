<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import type { TVShowDetails } from '$lib/types/tmdb';
	import TmdbImage from '$lib/components/tmdb/TmdbImage.svelte';
	import CrewList from '$lib/components/tmdb/CrewList.svelte';
	import WatchProviders from '$lib/components/tmdb/WatchProviders.svelte';
	import MonitorToggle from './MonitorToggle.svelte';
	import {
		Settings,
		Trash2,
		ExternalLink,
		RefreshCw,
		Package,
		Download,
		Zap,
		Loader2,
		Ban,
		Captions,
		Play,
		MoreHorizontal
	} from 'lucide-svelte';
	import { formatLanguage, formatDateShort, getStatusColor } from '$lib/utils/format.js';
	import { formatSeriesStatus } from '$lib/utils/format-status.js';
	import { ConfirmationModal } from '$lib/components/ui/modal';
	import { toasts } from '$lib/stores/toast.svelte';
	import { blockMedia } from '$lib/api/settings.js';
	import { TMDB } from '$lib/config/constants.js';

	interface SeriesData {
		tmdbId: number;
		tvdbId: number | null;
		imdbId: string | null;
		metadataProvider?: 'auto' | 'tmdb' | 'anilist' | 'mal' | null;
		providerRefs?: Partial<Record<'tmdb' | 'anilist' | 'mal', string>> | null;
		title: string;
		year: number | null;
		overview: string | null;
		status: string | null;
		network: string | null;
		genres: string[] | null;
		posterPath: string | null;
		backdropPath: string | null;
		monitored: boolean | null;
		rootFolderPath: string | null;
		added: string;
		episodeCount: number | null;
		episodeFileCount: number | null;
		percentComplete: number;
	}

	interface MissingSearchProgress {
		current: number;
		total: number;
	}

	interface MissingSearchResult {
		searched: number;
		found: number;
		grabbed: number;
	}

	interface RefreshProgress {
		current: number;
		total: number;
		message: string;
	}

	interface Props {
		series: SeriesData;
		tmdbSeries?: TVShowDetails | null;
		defaultRegion?: string;
		configuredProviders?: { anilist: boolean; mal: boolean };
		refreshing?: boolean;
		refreshProgress?: RefreshProgress | null;
		missingEpisodeCount?: number;
		searchingMissing?: boolean;
		missingSearchProgress?: MissingSearchProgress | null;
		missingSearchResult?: MissingSearchResult | null;
		onMonitorToggle?: (newValue: boolean) => void;
		onSearch?: () => void;
		onSearchMissing?: () => void;
		onSubtitleAutoSearch?: () => void;
		subtitleAutoSearching?: boolean;
		onImport?: () => void;
		onEdit?: () => void;
		onDelete?: () => void;
		onRefresh?: () => void;
	}

	let {
		series,
		tmdbSeries = null,
		defaultRegion = TMDB.DEFAULT_REGION,
		configuredProviders = { anilist: false, mal: false },
		refreshing = false,
		refreshProgress = null,
		missingEpisodeCount = 0,
		searchingMissing = false,
		missingSearchProgress = null,
		missingSearchResult = null,
		onMonitorToggle,
		onSearch,
		onSearchMissing,
		onSubtitleAutoSearch,
		subtitleAutoSearching = false,
		onImport,
		onEdit,
		onDelete,
		onRefresh
	}: Props = $props();

	let showBlockConfirm = $state(false);

	async function handleBlock() {
		try {
			await blockMedia({
				tmdbId: series.tmdbId,
				mediaType: 'tv',
				title: series.title,
				posterPath: series.posterPath ?? null,
				year: series.year ?? null
			});
			toasts.success(m.blockedMedia_blocked({ title: series.title }));
			window.location.href = '/settings/blocklist/blocked-media';
		} catch (err) {
			toasts.error(err instanceof Error ? err.message : 'Failed to block media');
		}
	}

	function openTrailer() {
		const trailer = tmdbSeries?.videos?.results?.find(
			(v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
		);
		if (trailer) {
			window.open(`https://www.youtube.com/watch?v=${trailer.key}`, '_blank');
		}
	}

	const providerLinks = $derived.by(() => {
		const refs = series.providerRefs ?? {};
		const links: Array<{ label: string; href: string }> = [];
		if (configuredProviders.anilist && refs.anilist) {
			links.push({
				label: 'AniList',
				href: `https://anilist.co/anime/${refs.anilist}`
			});
		}
		if (configuredProviders.mal && refs.mal) {
			links.push({
				label: 'MAL',
				href: `https://myanimelist.net/anime/${refs.mal}`
			});
		}
		return links;
	});

	const usesAnimeMetadataProvider = $derived(
		(series.metadataProvider === 'anilist' && Boolean(series.providerRefs?.anilist)) ||
			(series.metadataProvider === 'mal' && Boolean(series.providerRefs?.mal))
	);

	const overview = $derived(tmdbSeries?.overview ?? series.overview);
	const hasTrailer = $derived(
		tmdbSeries?.videos?.results?.some(
			(v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
		) ?? false
	);

	const contentRating = $derived.by(() => {
		if (!tmdbSeries?.content_ratings?.results) return null;
		const rating =
			tmdbSeries.content_ratings.results.find((r) => r.iso_3166_1 === defaultRegion) ||
			tmdbSeries.content_ratings.results.find((r) => r.iso_3166_1 === 'US');
		return rating?.rating || null;
	});
</script>

<div class="relative w-full overflow-hidden rounded-xl bg-base-200 shadow-xl">
	<!-- Backdrop -->
	<div class="absolute inset-0 h-full w-full">
		{#if series.backdropPath}
			<TmdbImage
				path={series.backdropPath}
				size="original"
				alt={series.title}
				class="h-full w-full object-cover opacity-40 blur-sm"
			/>
		{/if}
		<div class="absolute inset-0 bg-linear-to-t from-base-200 via-base-200/80 to-transparent"></div>
		<div class="absolute inset-0 bg-linear-to-r from-base-200 via-base-200/60 to-transparent"></div>
	</div>

	<!-- Content -->
	<div class="relative z-10">
		<!-- Main content -->
		<div class="flex flex-col gap-6 p-6 md:flex-row md:p-8">
			<!-- Poster -->
			<div class="hidden shrink-0 sm:block">
				<div class="w-32 overflow-hidden rounded-lg shadow-lg md:w-40">
					<TmdbImage
						path={series.posterPath}
						size="w342"
						alt={series.title}
						class="h-auto w-full object-cover"
					/>
				</div>
			</div>

			<!-- Main Info -->
			<div class="flex min-w-0 flex-1 flex-col gap-4">
				<!-- Title and actions -->
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<h1 class="text-2xl font-bold md:text-3xl">
							{series.title}
							{#if series.year}
								<span class="font-normal text-base-content/60">({series.year})</span>
							{/if}
						</h1>

						<div
							class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-base-content/70"
						>
							{#if tmdbSeries?.vote_average}
								<span class="flex items-center gap-1 font-semibold text-warning">
									★ {tmdbSeries.vote_average.toFixed(1)}
								</span>
							{/if}
							{#if series.status}
								<span class="badge {getStatusColor(series.status)} badge-sm">
									{formatSeriesStatus(series.status)}
								</span>
							{/if}
							{#if usesAnimeMetadataProvider && series.network}
								<span class="hidden sm:inline">•</span>
								<span class="hidden sm:inline min-w-0 truncate">Studios: {series.network}</span>
							{:else if series.network}
								<span class="hidden sm:inline">•</span>
								<span class="hidden sm:inline">{series.network}</span>
							{/if}
							{#if series.genres && series.genres.length > 0}
								<span class="hidden sm:inline">•</span>
								<span class="hidden sm:inline">{series.genres.slice(0, 3).join(', ')}</span>
							{/if}
						</div>
					</div>
					<div class="flex shrink-0 items-center gap-1">
						<MonitorToggle
							monitored={series.monitored ?? false}
							onToggle={onMonitorToggle}
							size="md"
						/>
						<div class="dropdown dropdown-end">
							<button tabindex="0" class="btn btn-ghost btn-sm">
								<MoreHorizontal size={18} />
							</button>
							<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
							<ul
								tabindex="0"
								class="dropdown-content menu z-50 w-56 rounded-box border border-base-content/10 bg-base-200 p-2 shadow-lg"
							>
								<li>
									<button
										onclick={onSearchMissing}
										disabled={searchingMissing || missingEpisodeCount === 0}
									>
										<Zap size={16} />
										{m.library_seriesHeader_autoGrab()}
										{#if missingEpisodeCount > 0}
											<span class="badge badge-sm badge-secondary">{missingEpisodeCount}</span>
										{/if}
									</button>
								</li>
								{#if onSubtitleAutoSearch}
									<li>
										<button onclick={onSubtitleAutoSearch} disabled={subtitleAutoSearching}>
											<Captions size={16} />
											{m.library_seriesHeader_autoDownloadSubs()}
										</button>
									</li>
								{/if}
								<li>
									<button onclick={onSearch}>
										<Package size={16} />
										{m.library_seriesHeader_seasonPacks()}
									</button>
								</li>
								{#if onImport}
									<li>
										<button onclick={onImport}>
											<Download size={16} />
											{m.action_import()}
										</button>
									</li>
								{/if}
								<li>
									<button onclick={onRefresh} disabled={refreshing}>
										<RefreshCw size={16} />
										{#if refreshing}
											{m.common_loading()}
										{:else}
											{m.library_seriesHeader_refreshTooltip()}
										{/if}
									</button>
								</li>
								<div class="divider my-1"></div>
								<li>
									<button onclick={onEdit}>
										<Settings size={16} />
										{m.action_edit()}
									</button>
								</li>
								<li>
									<button class="text-error" onclick={onDelete}>
										<Trash2 size={16} />
										{m.action_delete()}
									</button>
								</li>
								<li>
									<button class="text-error" onclick={() => (showBlockConfirm = true)}>
										<Ban size={16} />
										{m.library_blockMediaTooltip()}
									</button>
								</li>
							</ul>
						</div>
					</div>
				</div>

				{#if tmdbSeries?.tagline}
					<p class="text-base text-base-content/50 italic">"{tmdbSeries.tagline}"</p>
				{/if}

				{#if overview}
					<p class="text-base leading-relaxed text-base-content/90">{overview}</p>
				{/if}

				{#if tmdbSeries?.credits?.crew?.length || tmdbSeries?.created_by?.length}
					<div class="text-sm">
						<CrewList
							crew={tmdbSeries?.credits?.crew ?? []}
							creators={tmdbSeries?.created_by ?? []}
						/>
					</div>
				{/if}

				<!-- External links -->
				<div class="mt-auto flex flex-wrap items-center gap-2">
					{#if series.tmdbId}
						<a
							href="https://www.themoviedb.org/tv/{series.tmdbId}"
							target="_blank"
							rel="noopener noreferrer"
							class="btn shrink-0 gap-1 btn-ghost btn-xs"
						>
							TMDB
							<ExternalLink size={12} />
						</a>
					{/if}
					{#if series.tvdbId}
						<a
							href="https://thetvdb.com/series/{series.tvdbId}"
							target="_blank"
							rel="noopener noreferrer"
							class="btn shrink-0 gap-1 btn-ghost btn-xs"
						>
							TVDB
							<ExternalLink size={12} />
						</a>
					{/if}
					{#if series.imdbId}
						<a
							href="https://www.imdb.com/title/{series.imdbId}"
							target="_blank"
							rel="noopener noreferrer"
							class="btn shrink-0 gap-1 btn-ghost btn-xs"
						>
							IMDb
							<ExternalLink size={12} />
						</a>
					{/if}
					{#each providerLinks as provider (provider.label)}
						<a
							href={provider.href}
							target="_blank"
							rel="noopener noreferrer"
							class="btn shrink-0 gap-1 btn-ghost btn-xs"
						>
							{provider.label}
							<ExternalLink size={12} />
						</a>
					{/each}
					{#if hasTrailer}
						<button class="btn shrink-0 gap-1 btn-ghost btn-xs" onclick={openTrailer}>
							<Play size={12} />
							{m.hero_trailer()}
						</button>
					{/if}
				</div>
			</div>

			<!-- Right side metadata panel -->
			{#if tmdbSeries}
				<div
					class="hidden w-64 shrink-0 rounded-lg bg-base-100/30 p-4 backdrop-blur-sm md:block lg:w-80 lg:p-5"
				>
					<div class="grid grid-cols-2 gap-x-4 gap-y-2 lg:gap-x-6 lg:gap-y-3">
						<div>
							<div class="text-sm text-base-content/50">{m.hero_metadata_status()}</div>
							<div class="font-medium">{tmdbSeries.status}</div>
						</div>

						<div>
							<div class="text-sm text-base-content/50">{m.hero_metadata_language()}</div>
							<div class="font-medium">{formatLanguage(tmdbSeries.original_language)}</div>
						</div>

						{#if contentRating}
							<div>
								<div class="text-sm text-base-content/50">{m.hero_metadata_rated()}</div>
								<div>
									<span class="badge badge-outline badge-sm">{contentRating}</span>
								</div>
							</div>
						{/if}

						<div>
							<div class="text-sm text-base-content/50">{m.hero_metadata_released()}</div>
							<div class="font-medium">{formatDateShort(tmdbSeries.first_air_date)}</div>
						</div>

						{#if tmdbSeries.last_air_date}
							<div>
								<div class="text-sm text-base-content/50">Last Aired</div>
								<div class="font-medium">{formatDateShort(tmdbSeries.last_air_date)}</div>
							</div>
						{/if}

						{#if tmdbSeries.type}
							<div>
								<div class="text-sm text-base-content/50">Type</div>
								<div class="font-medium">{tmdbSeries.type}</div>
							</div>
						{/if}

						{#if tmdbSeries.number_of_seasons}
							<div>
								<div class="text-sm text-base-content/50">Seasons</div>
								<div class="font-medium">{tmdbSeries.number_of_seasons}</div>
							</div>
						{/if}

						{#if tmdbSeries.networks && tmdbSeries.networks.length > 0}
							<div class="col-span-2">
								<div class="text-sm text-base-content/50">Network</div>
								<div class="font-medium">
									{tmdbSeries.networks
										.slice(0, 2)
										.map((n) => n.name)
										.join(', ')}
								</div>
							</div>
						{/if}
					</div>

					{#if tmdbSeries['watch/providers']}
						<div class="mt-4 border-t border-base-content/10 pt-4">
							<div class="mb-2 text-sm text-base-content/50">{m.hero_metadata_whereToWatch()}</div>
							<WatchProviders
								providers={tmdbSeries['watch/providers']}
								countryCode={defaultRegion}
							/>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<ConfirmationModal
	open={showBlockConfirm}
	onCancel={() => (showBlockConfirm = false)}
	onConfirm={handleBlock}
	title={m.blockedMedia_confirmBlockTitle()}
	message={m.blockedMedia_confirmBlockMessage({ title: series.title })}
	confirmLabel={m.blockedMedia_confirmBlockLabel()}
	confirmVariant="error"
/>
