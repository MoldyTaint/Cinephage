<script lang="ts">
	import type { LibraryMovie } from '$lib/types/library';
	import type { MovieDetails, ReleaseDate } from '$lib/types/tmdb';
	import { getBestQualityFromFiles } from '$lib/types/library';
	import TmdbImage from '$lib/components/tmdb/TmdbImage.svelte';
	import CrewList from '$lib/components/tmdb/CrewList.svelte';
	import WatchProviders from '$lib/components/tmdb/WatchProviders.svelte';
	import MonitorToggle from './MonitorToggle.svelte';
	import StatusIndicator from './StatusIndicator.svelte';
	import QualityBadge from './QualityBadge.svelte';
	import ScoreBadge from './ScoreBadge.svelte';
	import { getMovieAvailabilityLevel } from '$lib/utils/movieAvailability';
	import {
		Search,
		Download,
		Settings,
		Trash2,
		ExternalLink,
		Clock,
		Loader2,
		Check,
		X,
		Zap,
		Ban,
		Play,
		MoreHorizontal
	} from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages.js';
	import {
		formatBytes,
		formatCurrency,
		formatLanguage,
		formatDateShort
	} from '$lib/utils/format.js';
	import { ConfirmationModal } from '$lib/components/ui/modal';
	import { toasts } from '$lib/stores/toast.svelte';
	import { blockMedia } from '$lib/api/settings.js';
	import { SvelteMap } from 'svelte/reactivity';
	import { TMDB } from '$lib/config/constants.js';

	const RELEASE_TYPE_LABELS: Record<number, () => string> = {
		1: () => m.hero_releaseType_premiere(),
		2: () => m.hero_releaseType_limitedTheatrical(),
		3: () => m.hero_releaseType_theatrical(),
		4: () => m.hero_releaseType_digital(),
		5: () => m.hero_releaseType_physical(),
		6: () => m.hero_releaseType_tv()
	};

	interface AutoSearchResult {
		found: boolean;
		grabbed: boolean;
		releaseName?: string;
		error?: string;
	}

	interface ScoreInfo {
		score: number;
		isAtCutoff: boolean;
		upgradesAllowed: boolean;
	}

	interface Props {
		movie: LibraryMovie;
		tmdbMovie?: MovieDetails | null;
		defaultRegion?: string;
		configuredProviders?: { anilist: boolean; mal: boolean };
		isDownloading?: boolean;
		autoSearching?: boolean;
		autoSearchResult?: AutoSearchResult | null;
		scoreInfo?: ScoreInfo | null;
		scoreLoading?: boolean;
		onMonitorToggle?: (newValue: boolean) => void;
		onAutoSearch?: () => void;
		onSearch?: () => void;
		onImport?: () => void;
		onEdit?: () => void;
		onDelete?: () => void;
		onScoreClick?: () => void;
	}

	let {
		movie,
		tmdbMovie = null,
		defaultRegion = TMDB.DEFAULT_REGION,
		configuredProviders = { anilist: false, mal: false },
		isDownloading = false,
		autoSearching = false,
		autoSearchResult = null,
		scoreInfo = null,
		scoreLoading = false,
		onMonitorToggle,
		onAutoSearch,
		onSearch,
		onImport,
		onEdit,
		onDelete,
		onScoreClick
	}: Props = $props();

	let showBlockConfirm = $state(false);

	async function handleBlock() {
		try {
			await blockMedia({
				tmdbId: movie.tmdbId,
				mediaType: 'movie',
				title: movie.title,
				posterPath: movie.posterPath ?? null,
				year: movie.year ?? null
			});
			toasts.success(m.blockedMedia_blocked({ title: movie.title }));
			window.location.href = '/settings/blocklist/blocked-media';
		} catch (err) {
			toasts.error(err instanceof Error ? err.message : 'Failed to block media');
		}
	}

	function openTrailer() {
		const trailer = tmdbMovie?.videos?.results?.find(
			(v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
		);
		if (trailer) {
			window.open(`https://www.youtube.com/watch?v=${trailer.key}`, '_blank');
		}
	}

	const providerLinks = $derived.by(() => {
		const refs = movie.providerRefs ?? {};
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
		(movie.metadataProvider === 'anilist' && Boolean(movie.providerRefs?.anilist)) ||
			(movie.metadataProvider === 'mal' && Boolean(movie.providerRefs?.mal))
	);

	const bestQuality = $derived(getBestQualityFromFiles(movie.files));
	const isStreamerProfile = $derived(movie.scoringProfileId === 'streamer');
	const fileStatus = $derived.by(() => {
		if (movie.hasFile) return 'downloaded';
		if (isDownloading) return 'downloading';
		return 'missing';
	});
	const totalSize = $derived(movie.files.reduce((sum, f) => sum + (f.size || 0), 0));
	const movieAvailability = $derived(
		getMovieAvailabilityLevel({
			year: movie.year,
			added: movie.added,
			tmdbStatus: movie.tmdbStatus,
			releaseDate: movie.releaseDate,
			releaseDates: movie.downloadReleaseDate
				? [
						{
							type:
								movie.downloadReleaseType === 'physical'
									? 5
									: movie.downloadReleaseType === 'tv'
										? 6
										: 4,
							release_date: movie.downloadReleaseDate
						}
					]
				: null
		})
	);
	const showUnreleasedBadge = $derived(
		!movie.hasFile && Boolean(movie.monitored) && movieAvailability !== 'released'
	);
	const unreleasedLabel = $derived.by(() => {
		if (movieAvailability === 'announced') return m.common_unreleased();
		if (movieAvailability === 'inCinemas') return m.common_inTheaters();
		return m.common_unreleased();
	});
	const unreleasedBadgeStyle = $derived(
		movieAvailability === 'inCinemas'
			? 'bg-info/5 text-info/80 ring-info/25'
			: 'bg-error/5 text-error/80 ring-error/25'
	);
	const statusQualityText = $derived.by(() => {
		if (isStreamerProfile && movie.hasFile) return 'Auto';
		if (!bestQuality.quality) return null;
		return `${bestQuality.quality}${bestQuality.hdr ? ` ${bestQuality.hdr}` : ''}`;
	});

	const overview = $derived(tmdbMovie?.overview ?? movie.overview);
	const hasTrailer = $derived(
		tmdbMovie?.videos?.results?.some(
			(v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
		) ?? false
	);

	const releaseInfo = $derived.by(() => {
		if (!tmdbMovie?.release_dates?.results) return null;

		const countryReleases =
			tmdbMovie.release_dates.results.find((r) => r.iso_3166_1 === defaultRegion) ||
			tmdbMovie.release_dates.results.find((r) => r.iso_3166_1 === 'US');

		if (!countryReleases?.release_dates?.length) return null;

		const certification =
			countryReleases.release_dates.find((r) => r.certification)?.certification || '';

		const releasesByType = new SvelteMap<number, ReleaseDate>();
		for (const release of countryReleases.release_dates) {
			if (!releasesByType.has(release.type)) {
				releasesByType.set(release.type, release);
			}
		}

		const priorityOrder = [3, 4, 5, 2, 6, 1];
		const releases: Array<{ type: string; date: string; isPast: boolean }> = [];
		const now = new Date();

		for (const typeNum of priorityOrder) {
			const release = releasesByType.get(typeNum);
			if (release) {
				const releaseDate = new Date(release.release_date);
				releases.push({
					type: RELEASE_TYPE_LABELS[typeNum]!(),
					date: formatDateShort(release.release_date),
					isPast: releaseDate <= now
				});
			}
		}

		return { certification, releases };
	});

	function formatRuntime(minutes: number | null): string {
		if (!minutes) return '';
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
	}
</script>

<div class="relative w-full overflow-hidden rounded-xl bg-base-200 shadow-xl">
	<!-- Backdrop -->
	<div class="absolute inset-0 h-full w-full">
		{#if movie.backdropPath}
			<TmdbImage
				path={movie.backdropPath}
				size="original"
				alt={movie.title}
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
						path={movie.posterPath}
						size="w342"
						alt={movie.title}
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
							{movie.title}
							{#if movie.year}
								<span class="font-normal text-base-content/60">({movie.year})</span>
							{/if}
						</h1>

						<div
							class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-base-content/70"
						>
							{#if tmdbMovie?.vote_average}
								<span class="flex items-center gap-1 font-semibold text-warning">
									★ {tmdbMovie.vote_average.toFixed(1)}
								</span>
							{/if}
							{#if movie.runtime}
								{#if tmdbMovie?.vote_average}
									<span class="hidden sm:inline">•</span>
								{/if}
								<span>{formatRuntime(movie.runtime)}</span>
							{/if}
							{#if usesAnimeMetadataProvider && movie.studios && movie.studios.length > 0}
								<span class="hidden sm:inline">•</span>
								<span class="hidden sm:inline min-w-0 truncate"
									>Studios: {movie.studios.slice(0, 2).join(', ')}</span
								>
							{/if}
							{#if movie.genres && movie.genres.length > 0}
								<span class="hidden sm:inline">•</span>
								<span class="hidden sm:inline">{movie.genres.slice(0, 3).join(', ')}</span>
							{/if}
						</div>
					</div>
					<div class="flex shrink-0 items-center gap-1">
						<MonitorToggle
							monitored={movie.monitored ?? false}
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
								class="dropdown-content menu z-50 w-52 rounded-box border border-base-content/10 bg-base-200 p-2 shadow-lg"
							>
								<li>
									<button onclick={onAutoSearch} disabled={autoSearching}>
										<Zap size={16} />
										{m.library_movieHeader_autoGrab()}
									</button>
								</li>
								<li>
									<button onclick={onSearch}>
										<Search size={16} />
										{m.library_movieHeader_manual()}
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

				{#if tmdbMovie?.tagline}
					<p class="text-base text-base-content/50 italic">"{tmdbMovie.tagline}"</p>
				{/if}

				{#if overview}
					<p class="text-base leading-relaxed text-base-content/90">{overview}</p>
				{/if}

				{#if tmdbMovie?.credits?.crew?.length}
					<div class="text-sm">
						<CrewList crew={tmdbMovie.credits.crew} />
					</div>
				{/if}

				<!-- Status and external links -->
				<div class="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div class="flex flex-wrap items-center gap-2 sm:gap-4">
						<StatusIndicator status={fileStatus} qualityText={statusQualityText} />
						{#if showUnreleasedBadge}
							<div
								class="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ring-1 {unreleasedBadgeStyle}"
							>
								<Clock size={16} />
								<span class="font-medium">{unreleasedLabel}</span>
							</div>
						{/if}
						{#if movie.hasFile && totalSize > 0}
							<span class="badge badge-sm badge-info">
								{formatBytes(totalSize)}
							</span>
						{/if}
						{#if movie.hasFile && movie.files.length > 0}
							{#if isStreamerProfile}
								<span class="badge badge-sm badge-secondary">{m.status_streaming()}</span>
							{:else}
								<QualityBadge
									quality={movie.files[0].quality}
									mediaInfo={movie.files[0].mediaInfo}
									size="md"
								/>
							{/if}
							{#if !isStreamerProfile}
								<ScoreBadge
									score={scoreInfo?.score ?? null}
									isAtCutoff={scoreInfo?.isAtCutoff ?? false}
									upgradesAllowed={scoreInfo?.upgradesAllowed ?? true}
									loading={scoreLoading}
									size="md"
									onclick={onScoreClick}
								/>
							{/if}
						{/if}
					</div>

					<!-- External links -->
					<div class="flex items-center gap-2 sm:shrink-0">
						{#if movie.tmdbId}
							<a
								href="https://www.themoviedb.org/movie/{movie.tmdbId}"
								target="_blank"
								rel="noopener noreferrer"
								class="btn gap-1 btn-ghost btn-xs"
							>
								{m.library_movieHeader_tmdbLink()}
								<ExternalLink size={12} />
							</a>
						{/if}
						{#if movie.imdbId}
							<a
								href="https://www.imdb.com/title/{movie.imdbId}"
								target="_blank"
								rel="noopener noreferrer"
								class="btn gap-1 btn-ghost btn-xs"
							>
								{m.library_movieHeader_imdbLink()}
								<ExternalLink size={12} />
							</a>
						{/if}
						{#each providerLinks as providerLink (providerLink.label)}
							<a
								href={providerLink.href}
								target="_blank"
								rel="noopener noreferrer"
								class="btn gap-1 btn-ghost btn-xs"
							>
								{providerLink.label}
								<ExternalLink size={12} />
							</a>
						{/each}
						{#if hasTrailer}
							<button class="btn gap-1 btn-ghost btn-xs" onclick={openTrailer}>
								<Play size={12} />
								{m.hero_trailer()}
							</button>
						{/if}
					</div>
				</div>
			</div>

			<!-- Right side metadata panel -->
			{#if tmdbMovie}
				<div
					class="hidden w-64 shrink-0 rounded-lg bg-base-100/30 p-4 backdrop-blur-sm md:block lg:w-80 lg:p-5"
				>
					<div class="grid grid-cols-2 gap-x-4 gap-y-2 lg:gap-x-6 lg:gap-y-3">
						<div>
							<div class="text-sm text-base-content/50">{m.hero_metadata_status()}</div>
							<div class="font-medium">{tmdbMovie.status}</div>
						</div>

						<div>
							<div class="text-sm text-base-content/50">{m.hero_metadata_language()}</div>
							<div class="font-medium">{formatLanguage(tmdbMovie.original_language)}</div>
						</div>

						{#if releaseInfo?.certification}
							<div>
								<div class="text-sm text-base-content/50">{m.hero_metadata_rated()}</div>
								<div>
									<span class="badge badge-outline badge-sm">{releaseInfo.certification}</span>
								</div>
							</div>
						{/if}

						<div>
							<div class="text-sm text-base-content/50">{m.hero_metadata_released()}</div>
							<div class="font-medium">{formatDateShort(tmdbMovie.release_date)}</div>
						</div>

						{#if tmdbMovie.budget > 0}
							<div>
								<div class="text-sm text-base-content/50">{m.hero_metadata_budget()}</div>
								<div class="font-medium">{formatCurrency(tmdbMovie.budget)}</div>
							</div>
						{/if}

						{#if tmdbMovie.revenue > 0}
							<div>
								<div class="text-sm text-base-content/50">{m.hero_metadata_revenue()}</div>
								<div class="font-medium">{formatCurrency(tmdbMovie.revenue)}</div>
							</div>
						{/if}

						{#if releaseInfo?.releases && releaseInfo.releases.length > 1}
							{#each releaseInfo.releases
								.filter((r) => r.type !== m.hero_releaseType_theatrical())
								.slice(0, 2) as release (release.type)}
								<div>
									<div class="text-sm text-base-content/50">{release.type}</div>
									<div class="font-medium {release.isPast ? '' : 'text-primary'}">
										{release.date}
									</div>
								</div>
							{/each}
						{/if}

						{#if tmdbMovie.production_companies && tmdbMovie.production_companies.length > 0}
							<div class="col-span-2">
								<div class="text-sm text-base-content/50">{m.hero_metadata_studio()}</div>
								<div class="font-medium">{tmdbMovie.production_companies[0].name}</div>
							</div>
						{/if}
					</div>

					{#if tmdbMovie['watch/providers']}
						<div class="mt-4 border-t border-base-content/10 pt-4">
							<div class="mb-2 text-sm text-base-content/50">{m.hero_metadata_whereToWatch()}</div>
							<WatchProviders
								providers={tmdbMovie['watch/providers']}
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
	message={m.blockedMedia_confirmBlockMessage({ title: movie.title })}
	confirmLabel={m.blockedMedia_confirmBlockLabel()}
	confirmVariant="error"
/>
