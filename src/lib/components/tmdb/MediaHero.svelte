<script lang="ts">
	import type { MovieDetails, TVShowDetails, ReleaseDate } from '$lib/types/tmdb';
	import TmdbImage from './TmdbImage.svelte';
	import CrewList from './CrewList.svelte';
	import WatchProviders from './WatchProviders.svelte';
	import AddToLibraryModal from '$lib/components/library/AddToLibraryModal.svelte';
	import { Plus, Check, Clock, Play, Film, ExternalLink } from 'lucide-svelte';
	import { formatCurrency, formatLanguage, formatDateShort } from '$lib/utils/format';
	import { resolvePath } from '$lib/utils/routing';
	import { SvelteMap } from 'svelte/reactivity';
	import { TMDB } from '$lib/config/constants';
	import { toasts } from '$lib/stores/toast.svelte';

	// Release type labels
	const RELEASE_TYPE_LABELS: Record<number, string> = {
		1: 'Premiere',
		2: 'Limited Theatrical',
		3: 'Theatrical',
		4: 'Digital',
		5: 'Physical',
		6: 'TV'
	};

	// Extended type that includes library status (added by enrichWithLibraryStatus)
	type MediaDetailsWithLibraryStatus = (MovieDetails | TVShowDetails) & {
		inLibrary?: boolean;
		hasFile?: boolean;
		libraryId?: string;
	};

	let { item }: { item: MediaDetailsWithLibraryStatus } = $props();

	// Library status state (defaults only, effect syncs from props)
	let inLibrary = $state(false);
	let hasFile = $state(false);
	let libraryId = $state<string | undefined>(undefined);
	let showAddModal = $state(false);

	// Update state when item changes
	$effect(() => {
		inLibrary = item.inLibrary ?? false;
		hasFile = item.hasFile ?? false;
		libraryId = item.libraryId;
	});

	function isMovieDetails(
		item: MediaDetailsWithLibraryStatus
	): item is MovieDetails & { inLibrary?: boolean; hasFile?: boolean; libraryId?: string } {
		return 'title' in item;
	}

	function getTitle(item: MediaDetailsWithLibraryStatus): string {
		return isMovieDetails(item) ? item.title : item.name;
	}

	function getDate(item: MediaDetailsWithLibraryStatus): string {
		return isMovieDetails(item) ? item.release_date : item.first_air_date;
	}

	function getRuntime(item: MediaDetailsWithLibraryStatus): string {
		if (isMovieDetails(item) && item.runtime) {
			const hours = Math.floor(item.runtime / 60);
			const minutes = item.runtime % 60;
			return `${hours}h ${minutes}m`;
		}
		if (!isMovieDetails(item) && item.episode_run_time && item.episode_run_time.length > 0) {
			return `${item.episode_run_time[0]}m`;
		}
		return '';
	}

	function getYear(dateString: string): number | string {
		if (!dateString) return '';
		return new Date(dateString).getFullYear();
	}

	const mediaType = $derived(isMovieDetails(item) ? 'movie' : 'tv');
	const title = $derived(getTitle(item));
	const date = $derived(getDate(item));
	const year = $derived(date ? new Date(date).getFullYear() : undefined);
	const libraryPageLink = $derived(
		libraryId
			? mediaType === 'movie'
				? `/library/movie/${libraryId}`
				: `/library/tv/${libraryId}`
			: null
	);

	// Get release info for movies (certification and release types)
	const releaseInfo = $derived.by(() => {
		if (!isMovieDetails(item) || !item.release_dates?.results) return null;

		// Find releases for user's region, fallback to US
		const countryCode = TMDB.DEFAULT_REGION;
		const countryReleases =
			item.release_dates.results.find((r) => r.iso_3166_1 === countryCode) ||
			item.release_dates.results.find((r) => r.iso_3166_1 === 'US');

		if (!countryReleases?.release_dates?.length) return null;

		// Get certification from first release with one
		const certification =
			countryReleases.release_dates.find((r) => r.certification)?.certification || '';

		// Group releases by type, sorted by date
		const releasesByType = new SvelteMap<number, ReleaseDate>();
		for (const release of countryReleases.release_dates) {
			if (!releasesByType.has(release.type)) {
				releasesByType.set(release.type, release);
			}
		}

		// Priority order: Theatrical (3), Digital (4), Physical (5), Limited (2), TV (6), Premiere (1)
		const priorityOrder = [3, 4, 5, 2, 6, 1];
		const releases: Array<{ type: string; date: string; isPast: boolean }> = [];
		const now = new Date();

		for (const typeNum of priorityOrder) {
			const release = releasesByType.get(typeNum);
			if (release) {
				const releaseDate = new Date(release.release_date);
				releases.push({
					type: RELEASE_TYPE_LABELS[typeNum],
					date: formatDateShort(release.release_date),
					isPast: releaseDate <= now
				});
			}
		}

		return { certification, releases };
	});

	// Get content rating for TV shows
	const tvRating = $derived.by(() => {
		if (isMovieDetails(item) || !item.content_ratings?.results) return '';

		const countryCode = TMDB.DEFAULT_REGION;
		const rating =
			item.content_ratings.results.find((r) => r.iso_3166_1 === countryCode) ||
			item.content_ratings.results.find((r) => r.iso_3166_1 === 'US');

		return rating?.rating || '';
	});

	async function refreshLibraryStatus() {
		try {
			const response = await fetch(`/api/library/status?tmdbId=${item.id}&mediaType=${mediaType}`);
			if (response.ok) {
				const data = await response.json();
				if (data.success && data.status) {
					inLibrary = data.status.inLibrary;
					hasFile = data.status.hasFile;
					libraryId = data.status.libraryId;
				}
			}
		} catch (e) {
			toasts.error('Failed to check library status', {
				description: e instanceof Error ? e.message : 'Failed to check library status'
			});
		}
	}

	function handleAddSuccess() {
		// Refresh library status after adding
		refreshLibraryStatus();
	}

	function openTrailer() {
		// Find a YouTube trailer in videos
		const trailer = item.videos?.results?.find(
			(v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
		);
		if (trailer) {
			window.open(`https://www.youtube.com/watch?v=${trailer.key}`, '_blank');
		}
	}
</script>

<div class="relative w-full overflow-hidden rounded-xl bg-base-200 shadow-xl">
	<!-- Backdrop -->
	<div class="absolute inset-0 h-full w-full">
		{#if item.backdrop_path}
			<TmdbImage
				path={item.backdrop_path}
				size="original"
				alt={title}
				class="h-full w-full object-cover opacity-40 blur-sm"
			/>
		{/if}
		<div class="absolute inset-0 bg-linear-to-t from-base-200 via-base-200/80 to-transparent"></div>
		<div class="absolute inset-0 bg-linear-to-r from-base-200 via-base-200/60 to-transparent"></div>
	</div>

	<!-- Content -->
	<div class="relative z-10 flex flex-col gap-6 p-6 md:flex-row md:p-8">
		<!-- Poster -->
		<div class="hidden shrink-0 sm:block">
			<div class="w-40 overflow-hidden rounded-lg shadow-lg md:w-48">
				<TmdbImage
					path={item.poster_path}
					size="w342"
					alt={title}
					class="h-auto w-full object-cover"
				/>
			</div>
		</div>

		<!-- Main Info -->
		<div class="flex min-w-0 flex-1 flex-col justify-between gap-4">
			<!-- Title and basic info -->
			<div>
				<h1 class="text-2xl font-bold md:text-3xl">
					{title}
					{#if getYear(date)}
						<span class="font-normal text-base-content/60">({getYear(date)})</span>
					{/if}
				</h1>

				<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-base-content/70">
					{#if item.vote_average}
						<span class="flex items-center gap-1 font-semibold text-warning">
							★ {item.vote_average.toFixed(1)}
						</span>
					{/if}
					{#if getRuntime(item)}
						<span>{getRuntime(item)}</span>
					{/if}
					{#if item.genres && item.genres.length > 0}
						<span class="hidden sm:inline">•</span>
						<span class="hidden sm:inline"
							>{item.genres
								.slice(0, 3)
								.map((g) => g.name)
								.join(', ')}</span
						>
					{/if}
				</div>
			</div>

			{#if item.tagline}
				<p class="text-base text-base-content/50 italic">"{item.tagline}"</p>
			{/if}

			<!-- Overview -->
			{#if item.overview}
				<p class="text-base leading-relaxed text-base-content/90">{item.overview}</p>
			{/if}

			<!-- Crew -->
			{#if item.credits?.crew?.length > 0 || (!isMovieDetails(item) && item.created_by?.length > 0)}
				<div class="text-sm">
					<CrewList
						crew={item.credits?.crew ?? []}
						creators={!isMovieDetails(item) ? item.created_by : []}
					/>
				</div>
			{/if}

			<!-- Actions row -->
			<div class="flex flex-wrap items-center justify-between gap-4">
				<div class="flex flex-wrap items-center gap-2">
					{#if inLibrary}
						{#if hasFile}
							<div
								class="flex items-center gap-2 rounded-lg bg-success/20 px-3 py-1.5 text-sm text-success"
							>
								<Check class="h-4 w-4" />
								<span>Available</span>
							</div>
							{#if libraryPageLink}
								<a
									href={resolvePath(libraryPageLink)}
									class="btn gap-1 btn-outline btn-sm btn-success"
								>
									<Film class="h-4 w-4" />
									View in Library
								</a>
							{/if}
						{:else}
							<div
								class="flex items-center gap-2 rounded-lg bg-warning/20 px-3 py-1.5 text-sm text-warning"
							>
								<Clock class="h-4 w-4" />
								<span>Monitored</span>
							</div>
							{#if libraryPageLink}
								<a
									href={resolvePath(libraryPageLink)}
									class="btn gap-1 btn-outline btn-sm btn-warning"
								>
									<Film class="h-4 w-4" />
									View in Library
								</a>
							{/if}
						{/if}
					{:else}
						<button class="btn gap-1 btn-sm btn-primary" onclick={() => (showAddModal = true)}>
							<Plus class="h-4 w-4" />
							Add to Library
						</button>
					{/if}

					{#if item.videos?.results?.some((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))}
						<button class="btn gap-1 btn-ghost btn-sm" onclick={openTrailer}>
							<Play class="h-4 w-4" />
							Trailer
						</button>
					{/if}
				</div>

				<!-- External links -->
				<div class="flex items-center gap-2">
					<a
						href={`https://www.themoviedb.org/${mediaType}/${item.id}`}
						target="_blank"
						rel="noopener noreferrer"
						class="btn gap-1 btn-ghost btn-xs"
					>
						TMDB
						<ExternalLink size={12} />
					</a>
					{#if isMovieDetails(item) && item.imdb_id}
						<a
							href={`https://www.imdb.com/title/${item.imdb_id}`}
							target="_blank"
							rel="noopener noreferrer"
							class="btn gap-1 btn-ghost btn-xs"
						>
							IMDb
							<ExternalLink size={12} />
						</a>
					{/if}
					{#if item.homepage}
						<!-- eslint-disable svelte/no-navigation-without-resolve -- External URL -->
						<a
							href={item.homepage}
							target="_blank"
							rel="noopener noreferrer"
							class="btn gap-1 btn-ghost btn-xs"
						>
							Website
							<ExternalLink size={12} />
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{/if}
				</div>
			</div>
		</div>

		<!-- Right side metadata -->
		<div
			class="hidden w-64 shrink-0 rounded-lg bg-base-100/30 p-4 backdrop-blur-sm md:block lg:w-80 lg:p-5"
		>
			<div class="grid grid-cols-2 gap-x-4 gap-y-2 lg:gap-x-6 lg:gap-y-3">
				<div>
					<div class="text-sm text-base-content/50">Status</div>
					<div class="font-medium">{item.status}</div>
				</div>

				<div>
					<div class="text-sm text-base-content/50">Language</div>
					<div class="font-medium">{formatLanguage(item.original_language)}</div>
				</div>

				{#if isMovieDetails(item)}
					{@const movie = item as MovieDetails}

					{#if releaseInfo?.certification}
						<div>
							<div class="text-sm text-base-content/50">Rated</div>
							<div>
								<span class="badge badge-outline badge-sm">{releaseInfo.certification}</span>
							</div>
						</div>
					{/if}

					<div>
						<div class="text-sm text-base-content/50">Released</div>
						<div class="font-medium">{formatDateShort(movie.release_date)}</div>
					</div>

					{#if movie.budget > 0}
						<div>
							<div class="text-sm text-base-content/50">Budget</div>
							<div class="font-medium">{formatCurrency(movie.budget)}</div>
						</div>
					{/if}

					{#if movie.revenue > 0}
						<div>
							<div class="text-sm text-base-content/50">Revenue</div>
							<div class="font-medium">{formatCurrency(movie.revenue)}</div>
						</div>
					{/if}

					{#if releaseInfo?.releases && releaseInfo.releases.length > 1}
						{#each releaseInfo.releases
							.filter((r) => r.type !== 'Theatrical')
							.slice(0, 2) as release (release.type)}
							<div>
								<div class="text-sm text-base-content/50">{release.type}</div>
								<div class="font-medium {release.isPast ? '' : 'text-primary'}">{release.date}</div>
							</div>
						{/each}
					{/if}
				{:else}
					{@const tv = item as TVShowDetails}

					{#if tvRating}
						<div>
							<div class="text-sm text-base-content/50">Rated</div>
							<div><span class="badge badge-outline badge-sm">{tvRating}</span></div>
						</div>
					{/if}

					{#if tv.networks && tv.networks.length > 0}
						<div>
							<div class="text-sm text-base-content/50">Network</div>
							<div class="font-medium">{tv.networks[0].name}</div>
						</div>
					{/if}

					<div>
						<div class="text-sm text-base-content/50">Seasons</div>
						<div class="font-medium">{tv.number_of_seasons}</div>
					</div>

					<div>
						<div class="text-sm text-base-content/50">Episodes</div>
						<div class="font-medium">{tv.number_of_episodes}</div>
					</div>

					{#if tv.first_air_date}
						<div>
							<div class="text-sm text-base-content/50">First Aired</div>
							<div class="font-medium">{formatDateShort(tv.first_air_date)}</div>
						</div>
					{/if}

					{#if tv.next_episode_to_air}
						<div>
							<div class="text-sm text-base-content/50">Next Episode</div>
							<div class="font-medium text-primary">
								S{tv.next_episode_to_air.season_number}E{tv.next_episode_to_air.episode_number}
							</div>
						</div>
					{/if}
				{/if}

				{#if item.production_companies && item.production_companies.length > 0}
					<div class="col-span-2">
						<div class="text-sm text-base-content/50">Studio</div>
						<div class="font-medium">{item.production_companies[0].name}</div>
					</div>
				{/if}
			</div>

			{#if item['watch/providers']}
				<div class="mt-4 border-t border-base-content/10 pt-4">
					<div class="mb-2 text-sm text-base-content/50">Where to Watch</div>
					<WatchProviders providers={item['watch/providers']} />
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Add to Library Modal -->
<AddToLibraryModal
	open={showAddModal}
	{mediaType}
	tmdbId={item.id}
	{title}
	{year}
	posterPath={item.poster_path}
	onClose={() => (showAddModal = false)}
	onSuccess={handleAddSuccess}
/>
