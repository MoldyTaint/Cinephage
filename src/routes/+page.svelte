<script lang="ts">
	import {
		Clapperboard,
		Tv,
		Download,
		AlertCircle,
		AlertTriangle,
		Clock,
		CheckCircle,
		XCircle,
		Search,
		Plus,
		FileQuestion,
		Calendar,
		Activity,
		TrendingUp,
		PlayCircle,
		ArrowRight,
		Loader2,
		Minus
	} from 'lucide-svelte';
	import TmdbImage from '$lib/components/tmdb/TmdbImage.svelte';
	import { resolve } from '$app/paths';
	import { resolvePath } from '$lib/utils/routing';
	import type { UnifiedActivity } from '$lib/types/activity';

	let { data } = $props();

	// Format relative time
	function formatRelativeTime(dateStr: string | null): string {
		if (!dateStr) return 'Unknown';
		const date = new Date(dateStr);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;
		return date.toLocaleDateString();
	}

	// Format date
	function formatDate(dateStr: string | null): string {
		if (!dateStr) return 'Unknown';
		return new Date(dateStr).toLocaleDateString();
	}

	// Status config for activity
	const statusConfig: Record<string, { label: string; variant: string; icon: typeof CheckCircle }> =
		{
			imported: { label: 'Imported', variant: 'badge-success', icon: CheckCircle },
			streaming: { label: 'Streaming', variant: 'badge-info', icon: CheckCircle },
			downloading: { label: 'Downloading', variant: 'badge-info', icon: Loader2 },
			failed: { label: 'Failed', variant: 'badge-error', icon: XCircle },
			rejected: { label: 'Rejected', variant: 'badge-warning', icon: AlertCircle },
			removed: { label: 'Removed', variant: 'badge-ghost', icon: XCircle },
			no_results: { label: 'No Results', variant: 'badge-ghost', icon: Minus },
			searching: { label: 'Searching', variant: 'badge-info', icon: Loader2 }
		};

	// Get media link
	function getMediaLink(activity: UnifiedActivity): string {
		if (activity.mediaType === 'movie') {
			return resolvePath(`/library/movie/${activity.mediaId}`);
		}
		return resolvePath(`/library/tv/${activity.seriesId || activity.mediaId}`);
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">Dashboard</h1>
			<p class="text-base-content/70">Welcome to Cinephage</p>
		</div>
		<div class="flex gap-2">
			<a href={resolve('/discover')} class="btn btn-primary">
				<Plus class="h-4 w-4" />
				Add Content
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
						<div class="text-2xl font-bold">{data.stats.movies.total}</div>
						<div class="text-sm text-base-content/70">Movies</div>
					</div>
				</div>
				<div class="mt-2 flex flex-wrap gap-2 text-xs">
					<span class="badge badge-sm badge-success">{data.stats.movies.withFile} files</span>
					{#if data.stats.movies.missing > 0}
						<span class="badge badge-sm badge-warning">{data.stats.movies.missing} missing</span>
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
						<div class="text-2xl font-bold">{data.stats.series.total}</div>
						<div class="text-sm text-base-content/70">TV Shows</div>
					</div>
				</div>
				<div class="mt-2 flex flex-wrap gap-2 text-xs">
					<span class="badge badge-sm badge-info">{data.stats.episodes.withFile} files</span>
					{#if data.stats.episodes.missing > 0}
						<span class="badge badge-sm badge-warning">{data.stats.episodes.missing} missing</span>
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
						<div class="text-2xl font-bold">{data.stats.activeDownloads}</div>
						<div class="text-sm text-base-content/70">Downloads</div>
					</div>
				</div>
				<div class="mt-2 text-xs">
					{#if data.stats.activeDownloads > 0}
						<span class="badge badge-sm badge-accent">Active</span>
					{:else}
						<span class="text-base-content/50">No active downloads</span>
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
						<div class="text-2xl font-bold">{data.missingEpisodes.length}</div>
						<div class="text-sm text-base-content/70">Missing Episodes</div>
					</div>
				</div>
				<div class="mt-2 text-xs text-base-content/50">Aired but not downloaded</div>
			</div>
		</div>

		<!-- Unmatched Files -->
		{#if data.stats.unmatchedFiles > 0}
			<a
				href={resolve('/library/unmatched')}
				class="card bg-base-200 transition-colors hover:bg-base-300"
			>
				<div class="card-body p-4">
					<div class="flex items-center gap-3">
						<div class="rounded-lg bg-error/10 p-2">
							<FileQuestion class="h-6 w-6 text-error" />
						</div>
						<div>
							<div class="text-2xl font-bold">{data.stats.unmatchedFiles}</div>
							<div class="text-sm text-base-content/70">Unmatched</div>
						</div>
						{#if data.stats.missingRootFolders > 0}
							<div class="ml-auto rounded-full bg-warning/10 p-1">
								<AlertTriangle class="h-4 w-4 text-warning" />
							</div>
						{/if}
					</div>
					<div class="mt-2 text-xs text-base-content/50">Files need attention</div>
					{#if data.stats.missingRootFolders > 0}
						<div class="mt-2 text-xs">
							<span class="badge badge-sm badge-warning">Root folder issues</span>
						</div>
					{/if}
				</div>
			</a>
		{:else if data.stats.missingRootFolders > 0}
			<a
				href={resolve('/library/unmatched')}
				class="card bg-base-200 transition-colors hover:bg-base-300"
			>
				<div class="card-body p-4">
					<div class="flex items-center gap-3">
						<div class="rounded-lg bg-warning/10 p-2">
							<AlertCircle class="h-6 w-6 text-warning" />
						</div>
						<div>
							<div class="text-2xl font-bold">0</div>
							<div class="text-sm text-base-content/70">Unmatched</div>
						</div>
						<div class="ml-auto rounded-full bg-warning/10 p-1">
							<AlertTriangle class="h-4 w-4 text-warning" />
						</div>
					</div>
					<div class="mt-2 text-xs">
						<span class="badge badge-sm badge-warning">Root folder issues</span>
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
							<div class="text-sm text-base-content/70">Unmatched</div>
						</div>
					</div>
					<div class="mt-2 text-xs text-base-content/50">All files matched</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Main Content Grid -->
	<div class="grid gap-6 lg:grid-cols-3">
		<!-- Recently Added Section (2/3 width) -->
		<div class="space-y-6 lg:col-span-2">
			<!-- Recently Added Movies -->
			{#if data.recentlyAdded.movies.length > 0}
				<div class="card bg-base-200">
					<div class="card-body">
						<div class="flex items-center justify-between">
							<h2 class="card-title">
								<Clapperboard class="h-5 w-5" />
								Recently Added Movies
							</h2>
							<a href={resolve('/library/movies')} class="btn btn-ghost btn-sm">View All</a>
						</div>
						<div
							class="grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-6"
						>
							{#each data.recentlyAdded.movies as movie (movie.id)}
								<a
									href={resolve(`/library/movie/${movie.id}`)}
									class="group relative aspect-2/3 overflow-hidden rounded-lg"
								>
									<TmdbImage
										path={movie.posterPath}
										alt={movie.title}
										size="w185"
										class="h-full w-full object-cover transition-transform group-hover:scale-105"
									/>
									<div
										class="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100"
									>
										<div class="absolute right-0 bottom-0 left-0 p-2">
											<p class="truncate text-xs font-medium text-white">{movie.title}</p>
											<p class="text-xs text-white/70">{movie.year}</p>
										</div>
									</div>
									{#if !movie.hasFile}
										<div class="absolute top-1 right-1">
											<span class="badge badge-xs badge-warning">Missing</span>
										</div>
									{/if}
								</a>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- Recently Added TV Shows -->
			{#if data.recentlyAdded.series.length > 0}
				<div class="card bg-base-200">
					<div class="card-body">
						<div class="flex items-center justify-between">
							<h2 class="card-title">
								<Tv class="h-5 w-5" />
								Recently Added TV Shows
							</h2>
							<a href={resolve('/library/tv')} class="btn btn-ghost btn-sm">View All</a>
						</div>
						<div
							class="grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-6"
						>
							{#each data.recentlyAdded.series as show (show.id)}
								<a
									href={resolve(`/library/tv/${show.id}`)}
									class="group relative aspect-2/3 overflow-hidden rounded-lg"
								>
									<TmdbImage
										path={show.posterPath}
										alt={show.title}
										size="w185"
										class="h-full w-full object-cover transition-transform group-hover:scale-105"
									/>
									<div
										class="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100"
									>
										<div class="absolute right-0 bottom-0 left-0 p-2">
											<p class="truncate text-xs font-medium text-white">{show.title}</p>
											<p class="text-xs text-white/70">
												{show.episodeFileCount ?? 0}/{show.episodeCount ?? 0} episodes
											</p>
										</div>
									</div>
									{#if (show.episodeFileCount ?? 0) < (show.episodeCount ?? 0)}
										<div class="absolute top-1 right-1">
											<span class="badge badge-xs badge-warning">
												{(show.episodeCount ?? 0) - (show.episodeFileCount ?? 0)} missing
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
			{#if data.missingEpisodes.length > 0}
				<div class="card bg-base-200">
					<div class="card-body">
						<h2 class="card-title">
							<Calendar class="h-5 w-5" />
							Missing Episodes
						</h2>
						<div class="divide-y divide-base-300">
							{#each data.missingEpisodes.slice(0, 5) as episode (episode.id)}
								<div class="flex items-center gap-3 py-2">
									{#if episode.series?.posterPath}
										<div class="h-12 w-8 shrink-0 overflow-hidden rounded">
											<TmdbImage
												path={episode.series.posterPath}
												alt={episode.series.title || ''}
												size="w92"
												class="h-full w-full object-cover"
											/>
										</div>
									{/if}
									<div class="min-w-0 flex-1">
										<p class="truncate font-medium">
											{episode.series?.title || 'Unknown Series'}
										</p>
										<p class="text-sm text-base-content/70">
											S{String(episode.seasonNumber).padStart(2, '0')}E{String(
												episode.episodeNumber
											).padStart(2, '0')}
											{episode.title ? ` - ${episode.title}` : ''}
										</p>
									</div>
									<div class="text-right text-sm text-base-content/50">
										{formatDate(episode.airDate)}
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- Empty State -->
			{#if data.recentlyAdded.movies.length === 0 && data.recentlyAdded.series.length === 0}
				<div class="card bg-base-200">
					<div class="card-body items-center text-center">
						<div class="rounded-full bg-base-300 p-4">
							<Plus class="h-8 w-8 text-base-content/50" />
						</div>
						<h2 class="card-title">No Content Yet</h2>
						<p class="text-base-content/70">
							Start by discovering movies and TV shows to add to your library.
						</p>
						<a href={resolve('/discover')} class="btn btn-primary">
							<Search class="h-4 w-4" />
							Discover Content
						</a>
					</div>
				</div>
			{/if}
		</div>

		<!-- Recent Activity Sidebar (1/3 width) -->
		<div class="card bg-base-200">
			<div class="card-body">
				<div class="flex items-center justify-between">
					<h2 class="card-title">
						<Activity class="h-5 w-5" />
						Recent Activity
					</h2>
					<a href={resolvePath('/activity')} class="btn gap-1 btn-ghost btn-xs">
						View all
						<ArrowRight class="h-3 w-3" />
					</a>
				</div>
				{#if data.recentActivity.length > 0}
					<div class="-mx-4 overflow-x-auto">
						<table class="table table-xs">
							<thead>
								<tr>
									<th>Status</th>
									<th>Media</th>
									<th>Progress</th>
									<th>Time</th>
								</tr>
							</thead>
							<tbody>
								{#each data.recentActivity as activity (activity.id)}
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
										</td>
										<td>
											{#if activity.status === 'downloading' && activity.downloadProgress !== undefined}
												<progress
													class="progress w-12 progress-info"
													value={activity.downloadProgress}
													max="100"
												></progress>
											{:else if activity.statusReason}
												<span
													class="max-w-16 truncate text-xs text-base-content/50"
													title={activity.statusReason}
												>
													{activity.statusReason}
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
						<p class="mt-2 text-sm">No recent activity</p>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Quick Actions -->
	<div class="card bg-base-200">
		<div class="card-body">
			<h2 class="card-title">Quick Actions</h2>
			<div class="flex flex-wrap gap-2">
				<a href={resolve('/discover')} class="btn btn-outline btn-sm">
					<Search class="h-4 w-4" />
					Discover
				</a>
				<a href={resolve('/activity')} class="btn btn-outline btn-sm">
					<Download class="h-4 w-4" />
					View Activity
				</a>
				<a href={resolve('/settings/integrations/indexers')} class="btn btn-outline btn-sm">
					<TrendingUp class="h-4 w-4" />
					Indexers
				</a>
				<a href={resolve('/settings/tasks')} class="btn btn-outline btn-sm">
					<PlayCircle class="h-4 w-4" />
					Tasks
				</a>
			</div>
		</div>
	</div>
</div>
