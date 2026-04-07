<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import {
		Clapperboard,
		Tv,
		Download,
		Upload,
		AlertCircle,
		PauseCircle,
		Clock,
		CheckCircle,
		XCircle,
		Search,
		Plus,
		FileQuestion,
		Calendar,
		Activity,
		TrendingUp,
		Compass,
		ArrowRight,
		Loader2,
		Minus,
		Wifi,
		ListTodo,
		HardDrive
	} from 'lucide-svelte';
	import TmdbImage from '$lib/components/tmdb/TmdbImage.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import { resolve } from '$app/paths';
	import { resolvePath } from '$lib/utils/routing';
	import type { UnifiedActivity } from '$lib/types/activity';
	import { createSSE } from '$lib/sse';
	import { layoutState, deriveMobileSseStatus } from '$lib/layout.svelte';

	let { data } = $props();

	// Type definitions for dashboard data
	interface RecentlyAddedMovie {
		id: string;
		tmdbId: number;
		title: string;
		year: number | null;
		posterPath: string | null;
		hasFile: boolean | null;
		monitored: boolean | null;
		added: string | null;
		availability?: string;
		isReleased?: boolean;
	}

	interface RecentlyAddedSeries {
		id: string;
		tmdbId: number;
		title: string;
		year: number | null;
		posterPath: string | null;
		episodeFileCount: number;
		episodeCount: number;
		airedMissingCount: number;
		added: string | null;
	}

	interface MissingEpisode {
		id: string;
		seriesId: string;
		seasonNumber: number;
		episodeNumber: number;
		title: string | null;
		airDate: string | null;
		series?: {
			id: string;
			title: string;
			posterPath: string | null;
		} | null;
	}

	// Resolve promises with initial empty state for smooth transitions
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let recentlyAddedResolved = $state<{ movies: any[]; series: any[] }>({ movies: [], series: [] });
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let missingEpisodesResolved = $state<any[]>([]);
	let recentActivityResolved = $state<UnifiedActivity[]>([]);
	let isRecentlyAddedLoading = $state(true);
	let isMissingEpisodesLoading = $state(true);
	let isActivityLoading = $state(true);

	// Local SSE-overridable state; derived values fall back to resolved server data or SSR/initial render.
	let statsState = $state<typeof data.stats | null>(null);
	let recentActivityState = $state<UnifiedActivity[] | null>(null);
	let recentlyAddedState = $state<typeof recentlyAddedResolved | null>(null);
	let missingEpisodesState = $state<typeof missingEpisodesResolved | null>(null);

	const stats = $derived(statsState ?? data.stats);
	const recentActivity = $derived(recentActivityState ?? recentActivityResolved);
	const recentlyAdded = $derived(recentlyAddedState ?? recentlyAddedResolved);
	const missingEpisodes = $derived(missingEpisodesState ?? missingEpisodesResolved);

	// Resolve promises when they resolve
	$effect(() => {
		// Handle recently added promise
		if (data.recentlyAdded instanceof Promise) {
			data.recentlyAdded
				.then((result) => {
					recentlyAddedResolved = result;
					isRecentlyAddedLoading = false;
				})
				.catch(() => {
					isRecentlyAddedLoading = false;
				});
		} else {
			recentlyAddedResolved = data.recentlyAdded;
			isRecentlyAddedLoading = false;
		}

		// Handle missing episodes promise
		if (data.missingEpisodes instanceof Promise) {
			data.missingEpisodes
				.then((result) => {
					missingEpisodesResolved = result;
					isMissingEpisodesLoading = false;
				})
				.catch(() => {
					isMissingEpisodesLoading = false;
				});
		} else {
			missingEpisodesResolved = data.missingEpisodes;
			isMissingEpisodesLoading = false;
		}

		// Handle activity promise
		if (data.recentActivity instanceof Promise) {
			data.recentActivity
				.then((result) => {
					recentActivityResolved = result;
					isActivityLoading = false;
				})
				.catch(() => {
					isActivityLoading = false;
				});
		} else {
			recentActivityResolved = data.recentActivity;
			isActivityLoading = false;
		}
	});

	// Sync from server data when it changes (e.g., on navigation)
	$effect(() => {
		statsState = data.stats;
	});

	// SSE Connection - automatically managed
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const sse = createSSE<Record<string, any>>(resolvePath('/api/dashboard/stream'), {
		'dashboard:stats': (newStats) => {
			statsState = newStats as typeof stats;
		},
		'dashboard:recentlyAdded': (newRecentlyAdded) => {
			recentlyAddedState = newRecentlyAdded as typeof recentlyAdded;
		},
		'dashboard:missingEpisodes': (newMissingEpisodes) => {
			missingEpisodesState = newMissingEpisodes as typeof missingEpisodes;
		},
		'dashboard:recentActivity': (newRecentActivity) => {
			recentActivityState = newRecentActivity as UnifiedActivity[];
		}
	});

	$effect(() => {
		layoutState.setMobileSseStatus(deriveMobileSseStatus(sse));
		return () => {
			layoutState.clearMobileSseStatus();
		};
	});

	// Format relative time
	function formatRelativeTime(dateStr: string | null): string {
		if (!dateStr) return m.common_unknown();
		const date = new Date(dateStr);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return m.dashboard_relativeTime_justNow();
		if (minutes < 60) return m.dashboard_relativeTime_minutesAgo({ count: minutes });
		if (hours < 24) return m.dashboard_relativeTime_hoursAgo({ count: hours });
		if (days < 7) return m.dashboard_relativeTime_daysAgo({ count: days });
		return date.toLocaleDateString();
	}

	// Format date
	function formatDate(dateStr: string | null): string {
		if (!dateStr) return m.common_unknown();
		return new Date(dateStr).toLocaleDateString();
	}

	// Status config for activity
	const statusConfig: Record<string, { label: string; variant: string; icon: typeof CheckCircle }> =
		{
			imported: { label: m.status_imported(), variant: 'badge-success', icon: CheckCircle },
			streaming: { label: m.status_streaming(), variant: 'badge-info', icon: CheckCircle },
			downloading: { label: m.status_downloading(), variant: 'badge-info', icon: Loader2 },
			seeding: { label: m.status_seeding(), variant: 'badge-success', icon: Upload },
			paused: { label: m.status_paused(), variant: 'badge-warning', icon: PauseCircle },
			failed: { label: m.status_failed(), variant: 'badge-error', icon: XCircle },
			search_error: { label: m.status_searchError(), variant: 'badge-warning', icon: AlertCircle },
			rejected: { label: m.status_rejected(), variant: 'badge-warning', icon: AlertCircle },
			removed: { label: m.status_removed(), variant: 'badge-ghost', icon: XCircle },
			no_results: { label: m.status_noResults(), variant: 'badge-ghost', icon: Minus },
			searching: { label: m.status_searching(), variant: 'badge-info', icon: Loader2 }
		};

	// Get media link
	function getMediaLink(activity: UnifiedActivity): string {
		if (activity.mediaType === 'movie') {
			return resolvePath(`/library/movie/${activity.mediaId}`);
		}
		return resolvePath(`/library/tv/${activity.seriesId || activity.mediaId}`);
	}

	function canLinkToMedia(activity: UnifiedActivity): boolean {
		if (activity.status === 'removed') return false;
		if (activity.mediaType === 'movie') return Boolean(activity.mediaId);
		return Boolean(activity.seriesId || activity.mediaId);
	}

	function getCompactProgressLabel(activity: UnifiedActivity): string | null {
		if (!activity.statusReason) {
			return null;
		}

		if (activity.status === 'failed') {
			return m.status_error();
		}

		if (activity.status === 'search_error') {
			return m.status_searchError();
		}

		return activity.statusReason;
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		const value = bytes / Math.pow(1024, i);
		return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
	}
</script>

<svelte:head>
	<title>{m.dashboard_pageTitle()}</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">{m.dashboard_title()}</h1>
			<p class="text-base-content/70">{m.dashboard_subtitle()}</p>
		</div>
		<div class="flex items-center gap-2">
			<div class="hidden items-center gap-2 lg:flex">
				{#if sse?.isConnected}
					<span class="badge gap-1 badge-success">
						<Wifi class="h-3 w-3" />
						{m.common_live()}
					</span>
				{:else if sse?.status === 'connecting' || sse?.status === 'error'}
					<span class="badge gap-1 {sse?.status === 'error' ? 'badge-error' : 'badge-warning'}">
						{sse?.status === 'error' ? m.common_reconnecting() : m.common_connecting()}
					</span>
				{/if}
			</div>
			<a href={resolve('/discover')} class="btn gap-2 btn-sm btn-primary sm:w-auto">
				<Plus class="h-4 w-4" />
				{m.dashboard_addContent()}
			</a>
		</div>
	</div>

	<!-- Stats Grid - Auto-fit for fluid column count based on available space -->
	<div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 sm:gap-4">
		<!-- Movies -->
		<a
			href={resolve('/library/movies')}
			class="card bg-base-200 transition-colors hover:bg-base-300"
		>
			<div class="card-body p-4">
				<div class="flex items-center gap-3">
					<div class="rounded-lg bg-primary/10 p-2">
						<Clapperboard class="h-6 w-6 text-primary" />
					</div>
					<div>
						<div class="text-2xl font-bold">{stats.movies.total}</div>
						<div class="text-sm text-base-content/70">{m.dashboard_stats_movies()}</div>
					</div>
				</div>
				<div class="mt-2 flex flex-wrap gap-2 text-xs">
					<span class="badge badge-sm badge-success"
						>{m.dashboard_stats_filesCount({ count: stats.movies.withFile })}</span
					>
					{#if stats.movies.missing > 0}
						<span class="badge badge-sm badge-warning"
							>{m.dashboard_stats_missingCount({ count: stats.movies.missing })}</span
						>
					{/if}
					{#if (stats.movies.unreleased || 0) > 0}
						<span class="badge badge-sm badge-secondary"
							>{m.dashboard_stats_unreleasedCount({ count: stats.movies.unreleased })}</span
						>
					{/if}
					{#if (stats.movies.unmonitoredMissing || 0) > 0}
						<span class="badge badge-sm badge-accent"
							>{m.dashboard_stats_ignoredCount({ count: stats.movies.unmonitoredMissing })}</span
						>
					{/if}
				</div>
			</div>
		</a>

		<!-- TV Shows -->
		<a href={resolve('/library/tv')} class="card bg-base-200 transition-colors hover:bg-base-300">
			<div class="card-body p-4">
				<div class="flex items-center gap-3">
					<div class="rounded-lg bg-secondary/10 p-2">
						<Tv class="h-6 w-6 text-secondary" />
					</div>
					<div>
						<div class="text-2xl font-bold">{stats.series.total}</div>
						<div class="text-sm text-base-content/70">{m.dashboard_stats_tvShows()}</div>
					</div>
				</div>
				<div class="mt-2 flex flex-wrap gap-2 text-xs">
					<span class="badge badge-sm badge-success"
						>{m.dashboard_stats_filesCount({ count: stats.episodes.withFile })}</span
					>
					{#if stats.episodes.missing > 0}
						<span class="badge badge-sm badge-warning"
							>{m.dashboard_stats_missingCount({ count: stats.episodes.missing })}</span
						>
					{/if}
					{#if (stats.episodes.unaired || 0) > 0}
						<span class="badge badge-sm badge-secondary"
							>{m.dashboard_stats_unairedCount({ count: stats.episodes.unaired })}</span
						>
					{/if}
					{#if (stats.episodes.unmonitoredMissing || 0) > 0}
						<span class="badge badge-sm badge-accent">
							{m.dashboard_stats_ignoredCount({ count: stats.episodes.unmonitoredMissing })}
						</span>
					{/if}
				</div>
			</div>
		</a>

		<!-- Active Downloads -->
		<a href={resolve('/activity')} class="card bg-base-200 transition-colors hover:bg-base-300">
			<div class="card-body p-4">
				<div class="flex items-center gap-3">
					<div class="rounded-lg bg-accent/10 p-2">
						<Download class="h-6 w-6 text-accent" />
					</div>
					<div>
						<div class="text-2xl font-bold">{stats.activeDownloads}</div>
						<div class="text-sm text-base-content/70">{m.dashboard_stats_downloads()}</div>
					</div>
				</div>
				<div class="mt-2 flex flex-wrap gap-2 text-xs">
					{#if stats.activeDownloads > 0}
						{@const downloadingCount =
							stats.activeDownloads - stats.stalledDownloads - stats.pausedDownloads}
						{#if downloadingCount > 0}
							<span class="badge badge-sm badge-success"
								>{m.dashboard_stats_downloadingCount({ count: downloadingCount })}</span
							>
						{/if}
						{#if stats.stalledDownloads > 0}
							<span class="badge badge-sm badge-warning"
								>{m.dashboard_stats_stalledCount({ count: stats.stalledDownloads })}</span
							>
						{/if}
						{#if stats.pausedDownloads > 0}
							<span class="badge badge-sm badge-secondary"
								>{m.dashboard_stats_pausedCount({ count: stats.pausedDownloads })}</span
							>
						{/if}
					{:else}
						<span class="text-base-content/50">{m.dashboard_stats_noActiveDownloads()}</span>
					{/if}
				</div>
			</div>
		</a>

		<!-- Missing Episodes -->
		<div class="card bg-base-200">
			<div class="card-body p-4">
				<div class="flex items-center gap-3">
					<div class="rounded-lg bg-warning/10 p-2">
						<Calendar class="h-6 w-6 text-warning" />
					</div>
					<div>
						{#if isMissingEpisodesLoading}
							<Skeleton variant="text" class="h-8 w-12" />
						{:else}
							<div class="text-2xl font-bold">{missingEpisodes.length}</div>
						{/if}
						<div class="text-sm text-base-content/70">
							<span class="sm:hidden">{m.dashboard_stats_missingEpisodesShort()}</span>
							<span class="hidden sm:inline">{m.dashboard_stats_missingEpisodes()}</span>
						</div>
					</div>
				</div>
				<div class="mt-2 text-xs text-base-content/50">
					{m.dashboard_stats_airedNotDownloaded()}
				</div>
			</div>
		</div>

		<!-- Unmatched Files -->
		{#if stats.unmatchedFiles > 0}
			<a
				href={resolve('/library/unmatched')}
				class="card overflow-hidden bg-base-200 transition-colors hover:bg-base-300"
			>
				<div class="card-body p-4">
					<div class="flex min-w-0 items-center gap-3">
						<div class="shrink-0 rounded-lg bg-error/10 p-2">
							<FileQuestion class="h-6 w-6 text-error" />
						</div>
						<div class="min-w-0">
							<div class="text-2xl font-bold">{stats.unmatchedFiles}</div>
							<div class="text-sm text-base-content/70">{m.dashboard_stats_unmatched()}</div>
						</div>
					</div>
					<div class="mt-2 text-xs text-base-content/50">
						{m.dashboard_stats_filesNeedAttention()}
					</div>
					{#if stats.missingRootFolders > 0}
						<div class="mt-2 text-xs">
							<span class="badge badge-sm badge-warning"
								>{m.dashboard_stats_rootFolderIssues()}</span
							>
						</div>
					{/if}
				</div>
			</a>
		{:else if stats.missingRootFolders > 0}
			<a
				href={resolve('/library/unmatched')}
				class="card overflow-hidden bg-base-200 transition-colors hover:bg-base-300"
			>
				<div class="card-body p-4">
					<div class="flex min-w-0 items-center gap-3">
						<div class="shrink-0 rounded-lg bg-warning/10 p-2">
							<AlertCircle class="h-6 w-6 text-warning" />
						</div>
						<div class="min-w-0">
							<div class="text-2xl font-bold">0</div>
							<div class="text-sm text-base-content/70">{m.dashboard_stats_unmatched()}</div>
						</div>
					</div>
					<div class="mt-2 text-xs">
						<span class="badge badge-sm badge-warning">{m.dashboard_stats_rootFolderIssues()}</span>
					</div>
				</div>
			</a>
		{:else}
			<div class="card bg-base-200">
				<div class="card-body p-4">
					<div class="flex items-center gap-3">
						<div class="rounded-lg bg-success/10 p-2">
							<CheckCircle class="h-6 w-6 text-success" />
						</div>
						<div>
							<div class="text-2xl font-bold">0</div>
							<div class="text-sm text-base-content/70">{m.dashboard_stats_unmatched()}</div>
						</div>
					</div>
					<div class="mt-2 text-xs text-base-content/50">{m.dashboard_stats_allFilesMatched()}</div>
				</div>
			</div>
		{/if}

		<!-- Storage -->
		<div class="card bg-base-200">
			<div class="card-body p-4">
				<div class="flex items-center gap-3">
					<div class="rounded-lg bg-info/10 p-2">
						<HardDrive class="h-6 w-6 text-info" />
					</div>
					<div>
						<div class="text-2xl font-bold">{formatBytes(stats.storage.totalBytes)}</div>
						<div class="text-sm text-base-content/70">{m.dashboard_stats_storage()}</div>
					</div>
				</div>
				<div class="mt-2 flex gap-2 text-xs">
					{#if stats.storage.movieBytes > 0}
						<span class="badge badge-sm whitespace-nowrap badge-primary">
							<Clapperboard class="mr-0 h-3 w-3" />
							{formatBytes(stats.storage.movieBytes)}
						</span>
					{/if}
					{#if stats.storage.tvBytes > 0}
						<span class="badge badge-sm whitespace-nowrap badge-secondary">
							<Tv class="mr-0 h-3 w-3" />
							{formatBytes(stats.storage.tvBytes)}
						</span>
					{/if}
					{#if stats.storage.totalBytes === 0}
						<span class="text-base-content/50">{m.dashboard_stats_noFilesOnDisk()}</span>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Quick Actions -->
	<div class="card bg-base-200">
		<div class="card-body items-center gap-4 py-5 text-center">
			<div class="space-y-1">
				<div class="text-sm font-medium tracking-[0.2em] text-base-content/45 uppercase">
					{m.dashboard_quickActions_title()}
				</div>
			</div>
			<div class="flex w-full flex-wrap justify-center gap-2.5">
				<a
					href={resolve('/discover')}
					class="btn min-w-34 justify-center border-info bg-info text-info-content btn-sm hover:border-info hover:bg-info/90"
				>
					<Compass class="h-4 w-4" />
					{m.dashboard_quickActions_discover()}
				</a>
				<a
					href={resolve('/library/import')}
					class="btn min-w-34 justify-center border-primary bg-primary text-primary-content btn-sm hover:border-primary hover:bg-primary/90"
				>
					<Download class="h-4 w-4" />
					{m.dashboard_quickActions_import()}
				</a>
				<a
					href={resolve('/activity')}
					class="btn min-w-34 justify-center border-secondary bg-secondary text-secondary-content btn-sm hover:border-secondary hover:bg-secondary/90"
				>
					<Activity class="h-4 w-4" />
					{m.dashboard_quickActions_viewActivity()}
				</a>
				<a
					href={resolve('/settings/integrations/indexers')}
					class="btn min-w-34 justify-center border-accent bg-accent text-accent-content btn-sm hover:border-accent hover:bg-accent/90"
				>
					<TrendingUp class="h-4 w-4" />
					{m.dashboard_quickActions_indexers()}
				</a>
				<a
					href={resolve('/settings/tasks')}
					class="btn min-w-34 justify-center border-warning bg-warning text-warning-content btn-sm hover:border-warning hover:bg-warning/90"
				>
					<ListTodo class="h-4 w-4" />
					{m.dashboard_quickActions_tasks()}
				</a>
			</div>
		</div>
	</div>

	<!-- Main Content Grid -->
	<div class="grid gap-6 lg:grid-cols-3">
		<!-- Recently Added Section (2/3 width) -->
		<div class="space-y-6 lg:col-span-2">
			<!-- Recently Added Movies -->
			{#if isRecentlyAddedLoading}
				<div class="card bg-base-200">
					<div class="card-body">
						<div class="flex items-center justify-between">
							<h2 class="card-title">
								<Clapperboard class="h-5 w-5" />
								{m.dashboard_recentMovies_title()}
							</h2>
							<Skeleton variant="text" class="h-8 w-20" />
						</div>
						<div
							class="grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-6"
						>
							{#each Array.from({ length: 6 }, (_, index) => index) as index (index)}
								<div class="aspect-2/3 overflow-hidden rounded-lg">
									<Skeleton class="h-full w-full" />
								</div>
							{/each}
						</div>
					</div>
				</div>
			{:else if recentlyAdded.movies.length > 0}
				<div class="card bg-base-200">
					<div class="card-body">
						<div class="flex items-center justify-between">
							<h2 class="card-title">
								<Clapperboard class="h-5 w-5" />
								{m.dashboard_recentMovies_title()}
							</h2>
							<a href={resolve('/library/movies')} class="btn btn-ghost btn-sm"
								>{m.dashboard_recentMovies_viewAll()}</a
							>
						</div>
						<div
							class="grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-6"
						>
							{#each recentlyAdded.movies as movie (movie.id)}
								{@const typedMovie = movie as RecentlyAddedMovie}
								<a
									href={resolve(`/library/movie/${typedMovie.id}`)}
									class="group relative aspect-2/3 overflow-hidden rounded-lg"
								>
									<TmdbImage
										path={typedMovie.posterPath}
										alt={typedMovie.title}
										size="w185"
										class="h-full w-full object-cover transition-transform group-hover:scale-105"
									/>
									<div
										class="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100"
									>
										<div class="absolute right-0 bottom-0 left-0 p-2">
											<p class="truncate text-xs font-medium text-white">{typedMovie.title}</p>
											<p class="text-xs text-white/70">{typedMovie.year}</p>
										</div>
									</div>
									{#if !typedMovie.hasFile && typedMovie.monitored}
										<div class="absolute top-1 right-1">
											<span
												class="badge badge-xs {typedMovie.isReleased
													? 'badge-warning'
													: 'badge-secondary'}"
											>
												{typedMovie.isReleased ? m.common_missing() : m.common_unreleased()}
											</span>
										</div>
									{/if}
								</a>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- Recently Added TV Shows -->
			{#if isRecentlyAddedLoading}
				<div class="card bg-base-200">
					<div class="card-body">
						<div class="flex items-center justify-between">
							<h2 class="card-title">
								<Tv class="h-5 w-5" />
								{m.dashboard_recentTvShows_title()}
							</h2>
							<Skeleton variant="text" class="h-8 w-20" />
						</div>
						<div
							class="grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-6"
						>
							{#each Array.from({ length: 6 }, (_, index) => index) as index (index)}
								<div class="aspect-2/3 overflow-hidden rounded-lg">
									<Skeleton class="h-full w-full" />
								</div>
							{/each}
						</div>
					</div>
				</div>
			{:else if recentlyAdded.series.length > 0}
				<div class="card bg-base-200">
					<div class="card-body">
						<div class="flex items-center justify-between">
							<h2 class="card-title">
								<Tv class="h-5 w-5" />
								{m.dashboard_recentTvShows_title()}
							</h2>
							<a href={resolve('/library/tv')} class="btn btn-ghost btn-sm"
								>{m.dashboard_recentTvShows_viewAll()}</a
							>
						</div>
						<div
							class="grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-6"
						>
							{#each recentlyAdded.series as show (show.id)}
								{@const typedShow = show as RecentlyAddedSeries}
								<a
									href={resolve(`/library/tv/${typedShow.id}`)}
									class="group relative aspect-2/3 overflow-hidden rounded-lg"
								>
									<TmdbImage
										path={typedShow.posterPath}
										alt={typedShow.title}
										size="w185"
										class="h-full w-full object-cover transition-transform group-hover:scale-105"
									/>
									<div
										class="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100"
									>
										<div class="absolute right-0 bottom-0 left-0 p-2">
											<p class="truncate text-xs font-medium text-white">{typedShow.title}</p>
											<p class="text-xs text-white/70">
												{m.dashboard_recentTvShows_episodes({
													fileCount: typedShow.episodeFileCount ?? 0,
													totalCount: typedShow.episodeCount ?? 0
												})}
											</p>
										</div>
									</div>
									{#if (typedShow.airedMissingCount ?? 0) > 0}
										<div class="absolute top-1 right-1">
											<span class="badge badge-xs badge-warning">
												{m.dashboard_recentTvShows_missingCount({
													count: typedShow.airedMissingCount
												})}
											</span>
										</div>
									{/if}
								</a>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- Missing Episodes Section -->
			{#if isMissingEpisodesLoading}
				<div class="card bg-base-200">
					<div class="card-body">
						<h2 class="card-title">
							<Calendar class="h-5 w-5" />
							{m.dashboard_missingEpisodes_title()}
						</h2>
						<div class="divide-y divide-base-300">
							{#each Array.from({ length: 5 }, (_, index) => index) as index (index)}
								<div class="flex items-center gap-3 py-2">
									<Skeleton variant="rect" class="h-12 w-8 shrink-0" />
									<div class="min-w-0 flex-1">
										<Skeleton variant="text" class="mb-1 w-32" />
										<Skeleton variant="text" class="w-24" />
									</div>
									<Skeleton variant="text" class="w-16" />
								</div>
							{/each}
						</div>
					</div>
				</div>
			{:else if missingEpisodes.length > 0}
				<div class="card bg-base-200">
					<div class="card-body">
						<h2 class="card-title">
							<Calendar class="h-5 w-5" />
							{m.dashboard_missingEpisodes_title()}
						</h2>
						<div class="divide-y divide-base-300">
							{#each missingEpisodes.slice(0, 5) as episode (episode.id)}
								{@const typedEpisode = episode as MissingEpisode}
								<div class="flex items-center gap-3 py-2">
									{#if typedEpisode.series?.posterPath}
										<div class="h-12 w-8 shrink-0 overflow-hidden rounded">
											<TmdbImage
												path={typedEpisode.series.posterPath}
												alt={typedEpisode.series.title || ''}
												size="w92"
												class="h-full w-full object-cover"
											/>
										</div>
									{/if}
									<div class="min-w-0 flex-1">
										<p class="font-medium wrap-break-word whitespace-normal">
											{typedEpisode.series?.title || m.dashboard_missingEpisodes_unknownSeries()}
										</p>
										<p class="wrap-break-words text-sm whitespace-normal text-base-content/70">
											S{String(typedEpisode.seasonNumber).padStart(2, '0')}E{String(
												typedEpisode.episodeNumber
											).padStart(2, '0')}
											{typedEpisode.title ? ` - ${typedEpisode.title}` : ''}
										</p>
									</div>
									<div class="text-right text-sm text-base-content/50">
										{formatDate(typedEpisode.airDate)}
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- Empty State -->
			{#if !isRecentlyAddedLoading && recentlyAdded.movies.length === 0 && recentlyAdded.series.length === 0}
				<div class="card bg-base-200">
					<div class="card-body items-center text-center">
						<div class="rounded-full bg-base-300 p-4">
							<Plus class="h-8 w-8 text-base-content/50" />
						</div>
						<h2 class="card-title">{m.dashboard_emptyState_title()}</h2>
						<p class="text-base-content/70">
							{m.dashboard_emptyState_description()}
						</p>
						<a href={resolve('/discover')} class="btn btn-primary">
							<Search class="h-4 w-4" />
							{m.dashboard_emptyState_discoverContent()}
						</a>
					</div>
				</div>
			{/if}
		</div>

		<!-- Recent History Sidebar (1/3 width) -->
		<div class="card bg-base-200">
			<div class="card-body">
				<div class="flex items-center justify-between">
					<h2 class="card-title">
						<Activity class="h-5 w-5" />
						{m.dashboard_recentHistory_title()}
					</h2>
					<a href={resolvePath('/activity?tab=history')} class="btn gap-1 btn-ghost btn-xs">
						{m.dashboard_recentHistory_viewAll()}
						<ArrowRight class="h-3 w-3" />
					</a>
				</div>
				{#if isActivityLoading}
					<div class="-mx-4 overflow-x-auto">
						<table class="table table-xs">
							<thead>
								<tr>
									<th>{m.dashboard_recentHistory_colStatus()}</th>
									<th>{m.dashboard_recentHistory_colMedia()}</th>
									<th>{m.dashboard_recentHistory_colProgress()}</th>
									<th>{m.dashboard_recentHistory_colTime()}</th>
								</tr>
							</thead>
							<tbody>
								{#each Array.from({ length: 6 }, (_, index) => index) as index (index)}
									<tr>
										<td><Skeleton variant="text" class="w-16" /></td>
										<td><Skeleton variant="text" class="w-24" /></td>
										<td><Skeleton variant="text" class="w-12" /></td>
										<td><Skeleton variant="text" class="w-10" /></td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else if recentActivity.length > 0}
					<div class="-mx-4 overflow-x-auto">
						<table class="table table-xs">
							<thead>
								<tr>
									<th>{m.dashboard_recentHistory_colStatus()}</th>
									<th>{m.dashboard_recentHistory_colMedia()}</th>
									<th>{m.dashboard_recentHistory_colProgress()}</th>
									<th>{m.dashboard_recentHistory_colTime()}</th>
								</tr>
							</thead>
							<tbody>
								{#each recentActivity as activity (activity.id)}
									{@const config = statusConfig[activity.status] || statusConfig.no_results}
									{@const StatusIcon = config.icon}
									<tr class="hover">
										<td>
											<span class="badge gap-1 {config.variant} badge-xs">
												<StatusIcon
													class="h-3 w-3 {activity.status === 'downloading' ||
													activity.status === 'searching'
														? 'animate-spin'
														: ''}"
												/>
												{#if activity.status === 'downloading' && activity.downloadProgress !== undefined}
													{activity.downloadProgress}%
												{:else}
													{config.label}
												{/if}
											</span>
										</td>
										<td>
											{#if canLinkToMedia(activity)}
												<a
													href={getMediaLink(activity)}
													class="flex items-center gap-1 hover:text-primary"
												>
													{#if activity.mediaType === 'movie'}
														<Clapperboard class="h-3 w-3 shrink-0" />
													{:else}
														<Tv class="h-3 w-3 shrink-0" />
													{/if}
													<span class="max-w-24 truncate text-xs" title={activity.mediaTitle}>
														{activity.mediaTitle}
													</span>
												</a>
											{:else}
												<div class="flex items-center gap-1">
													{#if activity.mediaType === 'movie'}
														<Clapperboard class="h-3 w-3 shrink-0" />
													{:else}
														<Tv class="h-3 w-3 shrink-0" />
													{/if}
													<span class="max-w-24 truncate text-xs" title={activity.mediaTitle}>
														{activity.mediaTitle}
													</span>
												</div>
											{/if}
										</td>
										<td>
											{#if activity.status === 'downloading' && activity.downloadProgress !== undefined}
												<progress
													class="progress w-12 progress-info"
													value={activity.downloadProgress}
													max="100"
												></progress>
											{:else if getCompactProgressLabel(activity)}
												<span
													class="max-w-16 truncate text-xs text-base-content/50"
													title={activity.statusReason}
												>
													{getCompactProgressLabel(activity)}
												</span>
											{:else}
												<span class="text-xs text-base-content/50">{config.label}</span>
											{/if}
										</td>
										<td>
											<span class="text-xs text-base-content/50">
												{formatRelativeTime(activity.startedAt)}
											</span>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div class="py-8 text-center text-base-content/50">
						<Clock class="mx-auto h-8 w-8 opacity-50" />
						<p class="mt-2 text-sm">{m.dashboard_recentHistory_noActivity()}</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
