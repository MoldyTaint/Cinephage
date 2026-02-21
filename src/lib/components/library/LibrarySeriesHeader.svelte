<script lang="ts">
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
		Loader2
	} from 'lucide-svelte';
	import { formatBytes } from '$lib/utils/format.js';

	interface SeriesData {
		tmdbId: number;
		tvdbId: number | null;
		imdbId: string | null;
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
		onEdit?: () => void;
		onDelete?: () => void;
		onRefresh?: () => void;
	}

	let {
		series,
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
		onEdit,
		onDelete,
		onRefresh
	}: Props = $props();

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function getStatusColor(status: string | null): string {
		if (!status) return 'badge-ghost';
		const s = status.toLowerCase();
		if (s.includes('returning') || s.includes('production')) return 'badge-success';
		if (s.includes('ended')) return 'badge-error';
		if (s.includes('canceled')) return 'badge-warning';
		return 'badge-ghost';
	}

	function formatStatus(status: string | null): string {
		if (!status) return 'Unknown';
		const s = status.toLowerCase();
		if (s.includes('returning')) return 'Continuing';
		if (s.includes('production')) return 'In Production';
		if (s.includes('ended')) return 'Ended';
		if (s.includes('canceled')) return 'Cancelled';
		return status;
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
								{formatStatus(series.status)}
							</span>
						{/if}
						{#if series.network}
							<span>{series.network}</span>
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
							? `Automatically search for ${missingEpisodeCount} missing episodes and download`
							: 'No missing episodes'}
					>
						{#if searchingMissing}
							<Loader2 size={16} class="animate-spin" />
							{#if missingSearchProgress}
								<span class="hidden sm:inline"
									>{missingSearchProgress.current}/{missingSearchProgress.total}</span
								>
							{:else}
								<span class="hidden sm:inline">Searching...</span>
							{/if}
						{:else if missingSearchResult}
							<Zap size={16} />
							<span class="hidden sm:inline"
								>Grabbed {missingSearchResult.grabbed}/{missingSearchResult.searched}</span
							>
						{:else}
							<Zap size={16} />
							<span class="hidden sm:inline">Auto Grab</span>
							{#if missingEpisodeCount > 0}
								<span class="badge badge-sm badge-secondary">{missingEpisodeCount}</span>
							{/if}
						{/if}
					</button>

					<!-- Season Packs (Interactive Search) -->
					<button
						class="btn gap-2 btn-ghost btn-sm"
						onclick={onSearch}
						title="Search for complete series or multi-season packs"
					>
						<Package size={16} />
						<span class="hidden sm:inline">Season Packs</span>
					</button>
					<button
						class="btn gap-2 btn-ghost btn-sm"
						onclick={onRefresh}
						disabled={refreshing}
						title="Refresh from TMDB"
					>
						{#if refreshing}
							<Loader2 size={16} class="animate-spin" />
							{#if refreshProgress}
								<span class="hidden sm:inline"
									>Season {refreshProgress.current}/{refreshProgress.total}</span
								>
							{:else}
								<span class="hidden sm:inline">Refreshing...</span>
							{/if}
						{:else}
							<RefreshCw size={16} />
						{/if}
					</button>
					<button class="btn btn-ghost btn-sm" onclick={onEdit} title="Edit">
						<Settings size={16} />
					</button>
					<button class="btn text-error btn-ghost btn-sm" onclick={onDelete} title="Delete">
						<Trash2 size={16} />
					</button>
				</div>
			</div>

			<!-- Middle row: Episode progress -->
			<div class="flex flex-col gap-2">
				<div class="flex items-center gap-4 text-sm">
					<span class="font-medium">
						{series.episodeFileCount ?? 0} / {series.episodeCount ?? 0} Episodes
					</span>
					<span class="text-base-content/60">
						({series.percentComplete}% complete)
					</span>
					{#if totalSize > 0}
						<span class="text-base-content/40">·</span>
						<span class="font-medium">{formatBytes(totalSize)}</span>
					{/if}
					{#if downloadingCount > 0}
						<span class="flex items-center gap-1 text-warning">
							<Download size={14} class="animate-pulse" />
							{downloadingCount} downloading
						</span>
					{/if}
				</div>
				<div class="h-2 w-full max-w-md overflow-hidden rounded-full bg-base-300">
					<div
						class="h-full transition-all duration-500 {series.percentComplete === 100
							? 'bg-success'
							: series.percentComplete > 0
								? 'bg-primary'
								: 'bg-base-300'}"
						style="width: {series.percentComplete}%"
					></div>
				</div>
			</div>

			<!-- Settings info -->
			<div class="flex flex-wrap gap-x-3 gap-y-2 text-sm md:gap-x-6">
				<div class="shrink-0">
					<span class="text-base-content/50">Quality Profile:</span>
					<span class="ml-1 font-medium">{qualityProfileName || 'Default'}</span>
				</div>
				<div class="max-w-full min-w-0">
					<span class="shrink-0 text-base-content/50">Root Folder:</span>
					<span
						class="ml-1 truncate font-medium {series.rootFolderPath
							? ''
							: 'rounded-md bg-warning/20 px-2 py-0.5 text-warning'}"
						title={series.rootFolderPath || 'Not set'}
					>
						{series.rootFolderPath || 'Not set'}
					</span>
				</div>
				<div>
					<span class="text-base-content/50">Added:</span>
					<span class="ml-1 font-medium">{formatDate(series.added)}</span>
				</div>
			</div>

			<!-- Bottom row: External links -->
			<div class="flex items-center gap-2">
				{#if series.tmdbId}
					<a
						href="https://www.themoviedb.org/tv/{series.tmdbId}"
						target="_blank"
						rel="noopener noreferrer"
						class="btn gap-1 btn-ghost btn-xs"
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
						class="btn gap-1 btn-ghost btn-xs"
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
						class="btn gap-1 btn-ghost btn-xs"
					>
						IMDb
						<ExternalLink size={12} />
					</a>
				{/if}
			</div>
		</div>
	</div>
</div>
