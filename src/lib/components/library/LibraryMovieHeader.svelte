<script lang="ts">
	import type { LibraryMovie } from '$lib/types/library';
	import { getBestQualityFromFiles } from '$lib/types/library';
	import TmdbImage from '$lib/components/tmdb/TmdbImage.svelte';
	import MonitorToggle from './MonitorToggle.svelte';
	import StatusIndicator from './StatusIndicator.svelte';
	import QualityBadge from './QualityBadge.svelte';
	import ScoreBadge from './ScoreBadge.svelte';
	import { getMovieAvailabilityLevel } from '$lib/utils/movieAvailability';
	import {
		Search,
		Settings,
		Trash2,
		ExternalLink,
		Download,
		Clock,
		Loader2,
		Check,
		X
	} from 'lucide-svelte';

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
		qualityProfileName?: string | null;
		isDownloading?: boolean;
		autoSearching?: boolean;
		autoSearchResult?: AutoSearchResult | null;
		scoreInfo?: ScoreInfo | null;
		scoreLoading?: boolean;
		onMonitorToggle?: (newValue: boolean) => void;
		onAutoSearch?: () => void;
		onSearch?: () => void;
		onEdit?: () => void;
		onDelete?: () => void;
		onScoreClick?: () => void;
	}

	let {
		movie,
		qualityProfileName = null,
		isDownloading = false,
		autoSearching = false,
		autoSearchResult = null,
		scoreInfo = null,
		scoreLoading = false,
		onMonitorToggle,
		onAutoSearch,
		onSearch,
		onEdit,
		onDelete,
		onScoreClick
	}: Props = $props();

	const bestQuality = $derived(getBestQualityFromFiles(movie.files));
	const isStreamerProfile = $derived(movie.scoringProfileId === 'streamer');
	const fileStatus = $derived.by(() => {
		if (movie.hasFile) return 'downloaded';
		if (isDownloading) return 'downloading';
		return 'missing';
	});
	const totalSize = $derived(movie.files.reduce((sum, f) => sum + (f.size || 0), 0));
	const movieAvailability = $derived(getMovieAvailabilityLevel(movie));
	const showUnreleasedBadge = $derived(
		!movie.hasFile && Boolean(movie.monitored) && movieAvailability !== 'released'
	);
	const statusQualityText = $derived.by(() => {
		if (isStreamerProfile && movie.hasFile) return 'Auto';
		if (!bestQuality.quality) return null;
		return `${bestQuality.quality}${bestQuality.hdr ? ` ${bestQuality.hdr}` : ''}`;
	});

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	function formatRuntime(minutes: number | null): string {
		if (!minutes) return '';
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="relative w-full overflow-hidden rounded-xl bg-base-200">
	<!-- Backdrop (subtle) -->
	<div class="absolute inset-0 h-full w-full">
		{#if movie.backdropPath}
			<TmdbImage
				path={movie.backdropPath}
				size="w780"
				alt={movie.title}
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
					path={movie.posterPath}
					size="w342"
					alt={movie.title}
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
						{movie.title}
						{#if movie.year}
							<span class="font-normal text-base-content/60">({movie.year})</span>
						{/if}
					</h1>

					<!-- Meta row -->
					<div
						class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-base-content/70"
					>
						{#if movie.runtime}
							<span>{formatRuntime(movie.runtime)}</span>
						{/if}
						{#if movie.genres && movie.genres.length > 0}
							<span>•</span>
							<span class="min-w-0 truncate">{movie.genres.slice(0, 3).join(', ')}</span>
						{/if}
					</div>
				</div>

				<!-- Action buttons -->
				<div class="flex flex-wrap items-center gap-1 sm:justify-end sm:gap-2">
					<MonitorToggle
						monitored={movie.monitored ?? false}
						onToggle={onMonitorToggle}
						size="md"
					/>
					<!-- Auto Search Button -->
					<button
						class="btn gap-2 btn-sm btn-primary"
						onclick={onAutoSearch}
						disabled={autoSearching}
						title="Automatically search and download"
					>
						{#if autoSearching}
							<Loader2 size={16} class="animate-spin" />
							<span class="hidden sm:inline">Searching...</span>
						{:else if autoSearchResult?.grabbed}
							<Check size={16} />
							<span class="hidden sm:inline">Grabbed</span>
						{:else if autoSearchResult?.error}
							<X size={16} />
							<span class="hidden sm:inline">Failed</span>
						{:else}
							<Download size={16} />
							<span class="hidden sm:inline">Auto Search</span>
						{/if}
					</button>
					<!-- Manual/Interactive Search Button -->
					<button class="btn gap-2 btn-ghost btn-sm" onclick={onSearch} title="Manual search">
						<Search size={16} />
						<span class="hidden sm:inline">Manual</span>
					</button>
					<button class="btn btn-ghost btn-sm" onclick={onEdit} title="Edit">
						<Settings size={16} />
					</button>
					<button class="btn text-error btn-ghost btn-sm" onclick={onDelete} title="Delete">
						<Trash2 size={16} />
					</button>
				</div>
			</div>

			<!-- Middle row: Settings info -->
			<div class="flex flex-wrap gap-x-3 gap-y-2 text-sm md:gap-x-6">
				<div class="shrink-0">
					<span class="text-base-content/50">Quality Profile:</span>
					<span class="ml-1 font-medium">{qualityProfileName || 'Default'}</span>
				</div>
				<div class="max-w-full min-w-0">
					<span class="shrink-0 text-base-content/50">Root Folder:</span>
					<span
						class="ml-1 truncate font-medium {movie.rootFolderId
							? ''
							: 'rounded-md bg-warning/20 px-2 py-0.5 text-warning'}"
						title={movie.rootFolderPath || 'Not set'}
					>
						{movie.rootFolderPath || 'Not set'}
					</span>
				</div>
				<div>
					<span class="text-base-content/50">Added:</span>
					<span class="ml-1 font-medium">{formatDate(movie.added)}</span>
				</div>
			</div>

			<!-- Bottom row: Status and external links -->
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-wrap items-center gap-2 sm:gap-4">
					<StatusIndicator status={fileStatus} qualityText={statusQualityText} />
					{#if showUnreleasedBadge}
						<div
							class="inline-flex items-center gap-2 rounded-lg bg-error/5 px-3 py-1.5 text-sm text-error/80 ring-1 ring-error/25"
						>
							<Clock size={16} />
							<span class="font-medium">Unreleased</span>
						</div>
					{/if}
					{#if movie.hasFile && totalSize > 0}
						<span class="text-sm text-base-content/70">
							{formatBytes(totalSize)}
						</span>
					{/if}
					{#if movie.hasFile && movie.files.length > 0}
						{#if isStreamerProfile}
							<span class="badge badge-sm badge-secondary">Streaming</span>
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
							TMDB
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
							IMDb
							<ExternalLink size={12} />
						</a>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
