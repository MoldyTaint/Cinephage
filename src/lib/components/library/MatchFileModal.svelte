<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { Search, X, Clapperboard, Tv, Check, Loader2 } from 'lucide-svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';
	import TmdbImage from '$lib/components/tmdb/TmdbImage.svelte';
	import { getFileName } from '$lib/utils/format.js';

	interface UnmatchedFile {
		id: string;
		path: string;
		mediaType: string | null;
		parsedTitle: string | null;
		parsedYear: number | null;
		parsedSeason: number | null;
		parsedEpisode: number | null;
		suggestedMatches: unknown;
	}

	interface TmdbSearchResult {
		id: number;
		name?: string;
		title?: string;
		poster_path: string | null;
		first_air_date?: string;
		release_date?: string;
		overview?: string;
	}

	interface Props {
		open: boolean;
		file: UnmatchedFile;
		onClose: () => void;
		onSuccess: (fileId: string) => void;
	}

	let { open, file, onClose, onSuccess }: Props = $props();

	// Form state (defaults only, effect syncs from props)
	let searchQuery = $state('');
	let searchType = $state<'movie' | 'tv'>('movie');
	let searchResults = $state<TmdbSearchResult[]>([]);
	let isSearching = $state(false);
	let isMatching = $state(false);

	// For TV shows - season/episode selection
	let selectedShow = $state<TmdbSearchResult | null>(null);
	let season = $state(1);
	let episode = $state(1);

	// Reset state when file changes
	$effect(() => {
		if (file) {
			searchQuery = file.parsedTitle || '';
			searchType = file.mediaType === 'tv' ? 'tv' : 'movie';
			selectedShow = null;
			season = file.parsedSeason ?? 1;
			episode = file.parsedEpisode ?? 1;
			searchResults = [];
		}
	});

	// Search TMDB
	async function search() {
		if (!searchQuery.trim()) return;

		isSearching = true;
		try {
			const response = await fetch(
				`/api/discover/search?query=${encodeURIComponent(searchQuery)}&type=${searchType}`
			);
			const data = await response.json();
			searchResults = data.results || [];
		} catch {
			toasts.error(m.library_matchFile_searchFailed());
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}

	// Handle search on enter
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			search();
		}
	}

	// Match to a movie
	async function matchToMovie(movie: TmdbSearchResult) {
		isMatching = true;
		try {
			const response = await fetch(`/api/library/unmatched/${file.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tmdbId: movie.id,
					mediaType: 'movie'
				})
			});
			const result = await response.json();

			if (result.success) {
				toasts.success(m.library_matchFile_matchedTo({ title: movie.title || movie.name || '' }));
				onSuccess(file.id);
			} else {
				toasts.error(m.library_matchFile_failedToMatch(), { description: result.error });
			}
		} catch {
			toasts.error(m.library_matchFile_errorMatching());
		} finally {
			isMatching = false;
		}
	}

	// Select a TV show (step 1)
	function selectShow(show: TmdbSearchResult) {
		selectedShow = show;
	}

	// Match to a TV episode (step 2)
	async function matchToEpisode() {
		if (!selectedShow) return;

		isMatching = true;
		try {
			const response = await fetch(`/api/library/unmatched/${file.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tmdbId: selectedShow.id,
					mediaType: 'tv',
					season,
					episode
				})
			});
			const result = await response.json();

			if (result.success) {
				toasts.success(
					m.library_matchFile_matchedToEpisode({
						title: selectedShow.name || '',
						episode: `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
					})
				);
				onSuccess(file.id);
			} else {
				toasts.error(m.library_matchFile_failedToMatch(), { description: result.error });
			}
		} catch {
			toasts.error(m.library_matchFile_errorMatching());
		} finally {
			isMatching = false;
		}
	}

	// Close modal
	function close() {
		onClose();
		selectedShow = null;
	}
</script>

<ModalWrapper {open} onClose={close} maxWidth="2xl" labelledBy="match-file-modal-title">
	<!-- Header -->
	<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<h3 id="match-file-modal-title" class="text-lg font-bold">{m.library_matchFile_title()}</h3>
		<button
			class="btn btn-circle self-end btn-ghost btn-sm sm:self-auto"
			onclick={close}
			aria-label={m.action_close()}
		>
			<X class="h-4 w-4" />
		</button>
	</div>
	<p class="mt-1 text-sm wrap-break-word text-base-content/70" title={file.path}>
		{getFileName(file.path)}
	</p>

	<!-- Search Type Toggle -->
	<div class="mt-4 flex gap-2">
		<button
			class="btn btn-sm {searchType === 'movie' ? 'btn-primary' : 'btn-ghost'}"
			onclick={() => {
				searchType = 'movie';
				selectedShow = null;
			}}
		>
			<Clapperboard class="h-4 w-4" />
			{m.common_movie()}
		</button>
		<button
			class="btn btn-sm {searchType === 'tv' ? 'btn-primary' : 'btn-ghost'}"
			onclick={() => {
				searchType = 'tv';
				selectedShow = null;
			}}
		>
			<Tv class="h-4 w-4" />
			{m.common_tvShow()}
		</button>
	</div>

	{#if searchType === 'tv' && selectedShow}
		<!-- TV Show Selected - Season/Episode Input -->
		<div class="mt-4 rounded-lg bg-base-200 p-4">
			<div class="flex items-center gap-3">
				<div class="h-16 w-12 shrink-0 overflow-hidden rounded">
					<TmdbImage
						path={selectedShow.poster_path}
						alt={selectedShow.name ?? 'Show poster'}
						size="w92"
						class="h-full w-full object-cover"
					/>
				</div>
				<div class="flex-1">
					<p class="font-medium">{selectedShow.name ?? m.common_unknown()}</p>
					<p class="text-sm text-base-content/70">
						{selectedShow.first_air_date?.substring(0, 4) || m.common_unknown()}
					</p>
				</div>
				<button class="btn btn-ghost btn-sm" onclick={() => (selectedShow = null)}>
					{m.action_change()}
				</button>
			</div>

			<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div class="form-control">
					<label class="label" for="season-input">
						<span class="label-text">{m.common_season()}</span>
					</label>
					<input
						id="season-input"
						type="number"
						min="0"
						class="input-bordered input"
						bind:value={season}
					/>
				</div>
				<div class="form-control">
					<label class="label" for="episode-input">
						<span class="label-text">{m.common_episode()}</span>
					</label>
					<input
						id="episode-input"
						type="number"
						min="1"
						class="input-bordered input"
						bind:value={episode}
					/>
				</div>
			</div>

			<button class="btn mt-4 w-full btn-primary" onclick={matchToEpisode} disabled={isMatching}>
				{#if isMatching}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<Check class="h-4 w-4" />
				{/if}
				{m.library_matchFile_matchTo({ title: selectedShow?.name || 'Unknown' })}
			</button>
		</div>
	{:else}
		<!-- Search Input -->
		<div class="mt-4 flex flex-col gap-2 sm:flex-row">
			<input
				type="text"
				class="input-bordered input w-full sm:flex-1"
				placeholder={m.library_matchFile_searchPlaceholder({
					type:
						searchType === 'movie'
							? m.common_movies().toLowerCase()
							: m.common_tvShows().toLowerCase()
				})}
				bind:value={searchQuery}
				onkeydown={handleKeydown}
			/>
			<button class="btn w-full btn-primary sm:w-auto" onclick={search} disabled={isSearching}>
				{#if isSearching}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<Search class="h-4 w-4" />
				{/if}
			</button>
		</div>

		<!-- Search Results -->
		{#if searchResults.length > 0}
			<div class="mt-4 max-h-80 space-y-2 overflow-y-auto">
				{#each searchResults as result (result.id)}
					<button
						class="flex w-full items-start gap-3 rounded-lg p-2 text-left transition-colors hover:bg-base-200"
						onclick={() => (searchType === 'movie' ? matchToMovie(result) : selectShow(result))}
						disabled={isMatching}
					>
						<div class="h-16 w-12 shrink-0 overflow-hidden rounded bg-base-300">
							{#if result.poster_path}
								<TmdbImage
									path={result.poster_path}
									alt={result.title ?? result.name ?? 'Poster'}
									size="w92"
									class="h-full w-full object-cover"
								/>
							{:else}
								<div class="flex h-full w-full items-center justify-center">
									{#if searchType === 'movie'}
										<Clapperboard class="h-6 w-6 text-base-content/30" />
									{:else}
										<Tv class="h-6 w-6 text-base-content/30" />
									{/if}
								</div>
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<p class="font-medium wrap-break-word sm:truncate">{result.title || result.name}</p>
							<p class="text-sm text-base-content/70">
								{(result.release_date || result.first_air_date)?.substring(0, 4) || 'Unknown year'}
							</p>
						</div>
						<div class="hidden text-sm text-base-content/50 sm:block">
							{#if searchType === 'movie'}
								{m.library_matchFile_clickToMatch()}
							{:else}
								{m.action_select()}
							{/if}
						</div>
					</button>
				{/each}
			</div>
		{:else if searchQuery && !isSearching}
			<div class="mt-4 py-8 text-center text-base-content/50">
				{#if searchResults.length === 0 && searchQuery}
					<p>{m.common_noResults()}</p>
				{:else}
					<p>
						{m.library_matchFile_searchHint({
							type:
								searchType === 'movie'
									? m.common_movie().toLowerCase()
									: m.common_tvShow().toLowerCase()
						})}
					</p>
				{/if}
			</div>
		{/if}
	{/if}
</ModalWrapper>
