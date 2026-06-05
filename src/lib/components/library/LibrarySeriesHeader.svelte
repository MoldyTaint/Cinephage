<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import TmdbImage from '$lib/components/tmdb/TmdbImage.svelte';
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
		Captions
	} from 'lucide-svelte';
	import { formatBytes, getStatusColor } from '$lib/utils/format.js';
	import { formatSeriesStatus } from '$lib/utils/format-status.js';
	import { ConfirmationModal } from '$lib/components/ui/modal';
	import { toasts } from '$lib/stores/toast.svelte';
	import { blockMedia } from '$lib/api/settings.js';

	interface SeriesData {
		tmdbId: number;
		tvdbId: number | null;
		imdbId: string | null;
		metadataProvider?: 'auto' | 'tmdb' | 'anilist' | 'mal' | null;
		providerRefs?: Partial<Record<'tmdb' | 'anilist' | 'mal', string>> | null;
		title: string;
		year: number | null;
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
		configuredProviders?: { anilist: boolean; mal: boolean };
		totalSize?: number;
		qualityProfileName?: string | null;
		refreshing?: boolean;
		refreshProgress?: RefreshProgress | null;
		missingEpisodeCount?: number;
		downloadingCount?: number;
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
		configuredProviders = { anilist: false, mal: false },
		totalSize = 0,
		qualityProfileName = null,
		refreshing = false,
		refreshProgress = null,
		missingEpisodeCount = 0,
		downloadingCount = 0,
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

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString(getLocale(), {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="relative w-full overflow-hidden rounded-xl bg-base-200">
	<!-- Backdrop (subtle) -->
	<div class="absolute inset-0 h-full w-full">
		{#if series.backdropPath}
			<TmdbImage
				path={series.backdropPath}
				size="w780"
				alt={series.title}
				class="h-full w-full object-cover opacity-40"
			/>
		{/if}
		<div
			class="absolute inset-0 bg-linear-to-r from-base-200/80 via-base-200/75 to-base-200/60 sm:from-base-200 sm:via-base-200/95 sm:to-base-200/80"
		></div>
	</div>

	<!-- Content -->
	<div class="relative z-10 flex gap-4 p-4 md:gap-6 md:p-6">
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

		<!-- Info -->
		<div class="flex min-w-0 flex-1 flex-col justify-between gap-4">
			<!-- Top row: Title and actions -->
			<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between md:gap-4">
				<div class="min-w-0 flex-1">
					<h1 class="text-2xl font-bold md:text-3xl">
						{series.title}
						{#if series.year}
							<span class="font-normal text-base-content/60">({series.year})</span>
						{/if}
					</h1>

					<!-- Meta row -->
					<div
						class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-base-content/70"
					>
						{#if series.status}
							<span class="badge {getStatusColor(series.status)} badge-sm">
								{formatSeriesStatus(series.status)}
							</span>
						{/if}
						{#if series.network}
							<span
								>{usesAnimeMetadataProvider ? `Studios: ${series.network}` : series.network}</span
							>
						{/if}
						{#if series.genres && series.genres.length > 0}
							<span>•</span>
							<span class="min-w-0 truncate">{series.genres.slice(0, 3).join(', ')}</span>
						{/if}
					</div>
				</div>

				<!-- Action buttons -->
				<div class="flex flex-wrap items-center gap-1 sm:justify-end sm:gap-2">
					<MonitorToggle
						monitored={series.monitored ?? false}
						onToggle={onMonitorToggle}
						size="md"
					/>

					<!-- Auto Grab Button -->
					<button
						class="btn gap-2 btn-sm btn-primary"
						onclick={onSearchMissing}
						disabled={searchingMissing || missingEpisodeCount === 0}
						title={missingEpisodeCount > 0
							? m.library_seriesHeader_autoGrabTooltip({ count: missingEpisodeCount })
							: m.library_seriesHeader_noMissingEpisodes()}
					>
						{#if searchingMissing}
							<Loader2 size={16} class="animate-spin" />
							{#if missingSearchProgress}
								<span class="hidden sm:inline"
									>{missingSearchProgress.current}/{missingSearchProgress.total}</span
								>
							{:else}
								<span class="hidden sm:inline">{m.common_searching()}</span>
							{/if}
						{:else if missingSearchResult}
							<Zap size={16} />
							<span class="hidden sm:inline"
								>{m.library_seriesHeader_grabbedCount({
									count: missingSearchResult.grabbed
								})}</span
							>
						{:else}
							<Zap size={16} />
							<span class="hidden sm:inline">{m.library_seriesHeader_autoGrab()}</span>
							{#if missingEpisodeCount > 0}
								<span class="badge badge-sm badge-secondary">{missingEpisodeCount}</span>
							{/if}
						{/if}
					</button>

					<!-- Auto-download subtitles series -->
					{#if onSubtitleAutoSearch}
						<button
							class="btn gap-2 btn-sm btn-secondary"
							onclick={onSubtitleAutoSearch}
							disabled={subtitleAutoSearching}
							title={m.library_seriesHeader_autoDownloadSubsTooltip()}
						>
							{#if subtitleAutoSearching}
								<Loader2 size={16} class="animate-spin" />
								<span class="hidden sm:inline">{m.common_downloading()}</span>
							{:else}
								<Captions size={16} />
								<span class="hidden sm:inline">{m.library_seriesHeader_autoDownloadSubs()}</span>
							{/if}
						</button>
					{/if}

					<!-- Season Packs (Interactive Search) -->
					<button
						class="btn gap-2 btn-ghost btn-sm"
						onclick={onSearch}
						title={m.library_seriesHeader_seasonPacksTooltip()}
					>
						<Package size={16} />
						<span class="hidden sm:inline">{m.library_seriesHeader_seasonPacks()}</span>
					</button>
					{#if onImport}
						<button
							class="btn gap-2 btn-ghost btn-sm"
							onclick={onImport}
							title={m.library_seriesHeader_importTooltip()}
						>
							<Download size={16} />
							<span class="hidden sm:inline">{m.action_import()}</span>
						</button>
					{/if}
					<button
						class="btn gap-2 btn-ghost btn-sm"
						onclick={onRefresh}
						disabled={refreshing}
						title={m.library_seriesHeader_refreshTooltip()}
					>
						{#if refreshing}
							<Loader2 size={16} class="animate-spin" />
							{#if refreshProgress}
								<span class="hidden sm:inline"
									>{m.common_season()} {refreshProgress.current}/{refreshProgress.total}</span
								>
							{:else}
								<span class="hidden sm:inline">{m.common_loading()}</span>
							{/if}
						{:else}
							<RefreshCw size={16} />
						{/if}
					</button>
					<button class="btn btn-ghost btn-sm" onclick={onEdit} title={m.action_edit()}>
						<Settings size={16} />
					</button>
					<button
						class="btn text-error btn-ghost btn-sm"
						onclick={onDelete}
						title={m.action_delete()}
					>
						<Trash2 size={16} />
					</button>
					<button
						class="btn text-error btn-ghost btn-sm"
						onclick={() => (showBlockConfirm = true)}
						title={m.library_blockMediaTooltip()}
					>
						<Ban size={16} />
					</button>
				</div>
			</div>

			<!-- Middle row: Episode progress -->
			<div class="flex flex-col gap-2">
				<div class="flex items-center gap-2 text-sm">
					<div class="flex min-w-0 items-center gap-3 sm:gap-4">
						<span class="font-medium whitespace-nowrap">
							{series.episodeFileCount ?? 0} / {series.episodeCount ?? 0}
							{m.common_episodes()} &nbsp;
							{#if series.episodeCount === 0}
								<span class="badge badge-ghost badge-xs">{m.library_seriesHeader_noEpisodes()}</span
								>
							{:else if series.episodeFileCount === 0}
								<span class="badge badge-xs badge-error">{m.library_seriesHeader_allMissing()}</span
								>
							{/if}
							{#if series.percentComplete === 100}
								<span class="badge badge-sm badge-success">{m.library_seriesHeader_complete()}</span
								>
							{:else if series.percentComplete > 0}
								<span class="badge badge-sm badge-primary">{series.percentComplete}%</span>
							{/if}
							&nbsp;
							{#if totalSize > 0}
								<span class="badge badge-sm badge-info">{formatBytes(totalSize)} </span>
							{/if}
							&nbsp;
							{#if downloadingCount > 0}
								<span class="text-bold badge badge-sm font-semibold badge-success">
									<Download size={16} class="animate-pulse" />
									<span>{downloadingCount}</span>
								</span>
							{/if}
						</span>
					</div>
				</div>
				<progress
					class="progress h-2 w-full max-w-md {series.percentComplete === 100
						? 'progress-success'
						: 'progress-primary'}"
					value={series.percentComplete}
					max="100"
				></progress>
			</div>

			<!-- Settings info -->
			<div class="flex flex-wrap gap-x-3 gap-y-2 text-sm md:gap-x-6">
				<div class="shrink-0">
					<span class="text-base-content/50">{m.library_seriesHeader_qualityProfileLabel()}:</span>
					<span class="ml-1 font-medium">{qualityProfileName || m.common_default()}</span>
				</div>
				<div class="max-w-full min-w-0">
					<span class="shrink-0 text-base-content/50"
						>{m.library_seriesHeader_rootFolderLabel()}:</span
					>
					<span
						class="ml-1 truncate font-medium {series.rootFolderPath
							? ''
							: 'rounded-md bg-warning/20 px-2 py-0.5 text-warning'}"
						title={series.rootFolderPath || m.library_seriesHeader_notSet()}
					>
						{series.rootFolderPath || m.library_seriesHeader_notSet()}
					</span>
				</div>
				<div>
					<span class="text-base-content/50">{m.common_added()}:</span>
					<span class="ml-1 font-medium">{formatDate(series.added)}</span>
				</div>
			</div>

			<!-- Bottom row: External links -->
			<div class="flex flex-wrap items-center gap-2">
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
			</div>
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
