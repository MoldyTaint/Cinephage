<script lang="ts">
	import { X, Loader2, Search } from 'lucide-svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';
	import { getResponseErrorMessage, readResponsePayload } from '$lib/utils/http';
	import CommonOptions from './add/CommonOptions.svelte';
	import { sortRootFoldersForMediaType } from '$lib/utils/root-folders.js';
	import { isLikelyAnimeMedia } from '$lib/shared/anime-classification.js';
	import MovieAddOptions, { type MinimumAvailability } from './add/MovieAddOptions.svelte';
	import SeriesAddOptions, {
		type MonitorType,
		type MonitorNewItems,
		type SeriesType
	} from './add/SeriesAddOptions.svelte';

	// Props
	interface Props {
		open: boolean;
		mediaType: 'movie' | 'tv';
		tmdbId: number;
		title: string;
		year?: number;
		posterPath?: string | null;
		onClose: () => void;
		onSuccess?: () => void;
	}

	let { open, mediaType, tmdbId, title, year, posterPath, onClose, onSuccess }: Props = $props();

	// Types
	interface RootFolder {
		id: string;
		name: string;
		path: string;
		mediaType: string;
		mediaSubType?: 'standard' | 'anime';
		isDefault?: boolean;
		freeSpaceBytes?: number | null;
	}

	interface LibraryEntity {
		id: string;
		mediaType: 'movie' | 'tv';
		defaultMonitored: boolean;
		defaultSearchOnAdd: boolean;
		defaultWantsSubtitles: boolean;
		rootFolders: Array<{ id: string }>;
	}

	interface ScoringProfile {
		id: string;
		name: string;
		description?: string;
		isBuiltIn: boolean;
		isDefault?: boolean;
	}

	interface Season {
		season_number: number;
		name: string;
		episode_count: number;
		air_date?: string;
		poster_path?: string;
	}

	interface CollectionPart {
		id: number;
		title: string;
		release_date?: string;
		poster_path?: string;
		inLibrary?: boolean;
	}

	interface CollectionInfo {
		id: number;
		name: string;
		parts: CollectionPart[];
	}

	interface TmdbMovieDetails {
		title: string;
		original_title?: string | null;
		original_language?: string | null;
		origin_country?: string[] | null;
		production_countries?: Array<{ iso_3166_1?: string }> | null;
		genres?: Array<{ id?: number; name?: string }> | null;
		belongs_to_collection?: { id: number } | null;
	}

	interface TmdbTvDetails {
		name: string;
		original_name?: string | null;
		original_language?: string | null;
		origin_country?: string[] | null;
		production_countries?: Array<{ iso_3166_1?: string }> | null;
		genres?: Array<{ id?: number; name?: string }> | null;
		seasons?: Season[];
	}

	// State
	let rootFolders = $state<RootFolder[]>([]);
	let libraries = $state<LibraryEntity[]>([]);
	let scoringProfiles = $state<ScoringProfile[]>([]);
	let seasons = $state<Season[]>([]);
	let isLoading = $state(false);
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);
	let showAdvanced = $state(false);

	// Collection state (for movies only)
	let collection = $state<CollectionInfo | null>(null);
	let addEntireCollection = $state(false);
	let enforceAnimeSubtype = $state(false);
	let detectedAnime = $state(false);

	// Form state - Common
	let selectedRootFolder = $state('');
	let selectedScoringProfile = $state('');
	let searchOnAdd = $state(true);
	let wantsSubtitles = $state(true);
	let monitoredTouched = $state(false);
	let searchOnAddTouched = $state(false);
	let wantsSubtitlesTouched = $state(false);

	// Form state - Movie specific
	let minimumAvailability = $state<MinimumAvailability>('released');
	let monitored = $state(true);

	// Form state - TV specific
	let monitorType = $state<MonitorType>('all');
	let monitorNewItems = $state<MonitorNewItems>('all');
	let monitorSpecials = $state(false);
	let seriesType = $state<SeriesType>('standard');
	let seasonFolder = $state(true);
	let monitoredSeasons = new SvelteSet<number>();

	// Derived: Filter root folders by media type
	const requiredMediaSubType = $derived(
		enforceAnimeSubtype ? (detectedAnime ? ('anime' as const) : ('standard' as const)) : undefined
	);
	const filteredRootFolders = $derived(
		sortRootFoldersForMediaType(rootFolders, mediaType, requiredMediaSubType)
	);
	const rootFolderLibraryMap = $derived.by(() => {
		const assignments = new SvelteMap<string, LibraryEntity>();
		for (const library of libraries) {
			for (const rootFolder of library.rootFolders ?? []) {
				assignments.set(rootFolder.id, library);
			}
		}
		return assignments;
	});
	const selectedRootFolderLibrary = $derived(
		selectedRootFolder ? rootFolderLibraryMap.get(selectedRootFolder) : undefined
	);

	function getRecommendedRootFolderId(folders: RootFolder[]): string | undefined {
		if (folders.length === 0) return undefined;

		// Enforcement path: list is already filtered to required subtype, so pick that default if present.
		if (requiredMediaSubType) {
			return (
				folders.find(
					(folder) =>
						folder.isDefault && (folder.mediaSubType ?? 'standard') === requiredMediaSubType
				)?.id ?? folders[0].id
			);
		}

		// Smart recommendation path (enforcement disabled).
		if (detectedAnime) {
			return (
				folders.find(
					(folder) => folder.isDefault && (folder.mediaSubType ?? 'standard') === 'anime'
				)?.id ??
				folders.find(
					(folder) => folder.isDefault && (folder.mediaSubType ?? 'standard') === 'standard'
				)?.id ??
				folders.find((folder) => folder.isDefault)?.id ??
				folders[0].id
			);
		}

		return (
			folders.find(
				(folder) => folder.isDefault && (folder.mediaSubType ?? 'standard') === 'standard'
			)?.id ??
			folders.find((folder) => folder.isDefault)?.id ??
			folders[0].id
		);
	}

	// Derived: Collection movies not in library (excluding current movie)
	const missingCollectionMovies = $derived(
		collection?.parts?.filter((p) => !p.inLibrary && p.id !== tmdbId) ?? []
	);

	// Derived: Whether the item will be monitored (for TV, depends on monitorType)
	const willBeMonitored = $derived(mediaType === 'tv' ? monitorType !== 'none' : monitored);

	// Derived: Whether search will happen on add
	const willSearchOnAdd = $derived(searchOnAdd && willBeMonitored);

	// Reset form state when modal opens/closes or media type changes
	$effect(() => {
		if (open) {
			// Reset to defaults
			monitored = true;
			searchOnAdd = true;
			wantsSubtitles = true;
			minimumAvailability = 'released';
			monitorType = 'all';
			monitorNewItems = 'all';
			monitorSpecials = false;
			seriesType = 'standard';
			seasonFolder = true;
			monitoredSeasons.clear();
			showAdvanced = false;
			error = null;

			// Reset collection state
			collection = null;
			addEntireCollection = false;
			enforceAnimeSubtype = false;
			detectedAnime = false;
			monitoredTouched = false;
			searchOnAddTouched = false;
			wantsSubtitlesTouched = false;

			loadData();
		}
	});

	// Update monitored seasons when monitor type or monitorSpecials changes
	$effect(() => {
		if (mediaType === 'tv' && seasons.length > 0) {
			// Track both monitorType and monitorSpecials to trigger updates
			void [monitorType, monitorSpecials];
			updateMonitoredSeasonsFromType(monitorType);
		}
	});

	// Keep selected root folder aligned with current subtype filter/enforcement rules.
	$effect(() => {
		if (!open) return;
		if (filteredRootFolders.length === 0) {
			selectedRootFolder = '';
			return;
		}

		const stillValid = filteredRootFolders.some((folder) => folder.id === selectedRootFolder);
		if (!stillValid) {
			selectedRootFolder = getRecommendedRootFolderId(filteredRootFolders) ?? '';
		}
	});

	$effect(() => {
		if (!open || !selectedRootFolderLibrary) return;

		if (!searchOnAddTouched) {
			searchOnAdd = selectedRootFolderLibrary.defaultSearchOnAdd;
		}
		if (!wantsSubtitlesTouched) {
			wantsSubtitles = selectedRootFolderLibrary.defaultWantsSubtitles;
		}
		if (!monitoredTouched) {
			if (mediaType === 'movie') {
				monitored = selectedRootFolderLibrary.defaultMonitored;
			} else {
				monitorType = selectedRootFolderLibrary.defaultMonitored ? 'all' : 'none';
			}
		}
	});

	function handleMonitoredInput() {
		monitoredTouched = true;
	}

	function handleSearchOnAddInput() {
		searchOnAddTouched = true;
	}

	function handleWantsSubtitlesInput() {
		wantsSubtitlesTouched = true;
	}

	function updateMonitoredSeasonsFromType(type: MonitorType) {
		monitoredSeasons.clear();

		// Helper to check if a season should be included (respects monitorSpecials)
		const shouldIncludeSeason = (s: Season) => {
			if (s.season_number === 0) return monitorSpecials;
			return true;
		};

		switch (type) {
			case 'all':
				seasons.filter(shouldIncludeSeason).forEach((s) => monitoredSeasons.add(s.season_number));
				break;
			case 'firstSeason': {
				const firstSeason =
					seasons.find((s) => s.season_number === 1) ?? seasons.find((s) => s.season_number > 0);
				if (firstSeason) monitoredSeasons.add(firstSeason.season_number);
				break;
			}
			case 'lastSeason': {
				const regularSeasons = seasons.filter((s) => s.season_number > 0);
				const lastSeason =
					regularSeasons.length > 0
						? regularSeasons[regularSeasons.length - 1]
						: seasons[seasons.length - 1];
				if (lastSeason) monitoredSeasons.add(lastSeason.season_number);
				break;
			}
			case 'recent':
				// Recent monitors all seasons that have recent or future episodes
				// The actual episode filtering happens server-side, but we monitor all non-specials
				seasons.filter(shouldIncludeSeason).forEach((s) => monitoredSeasons.add(s.season_number));
				break;
			case 'none':
				// Empty set - already cleared
				break;
			default:
				// For 'future', 'missing', 'existing', 'pilot' - monitor all seasons but episode filtering is handled server-side
				seasons.filter(shouldIncludeSeason).forEach((s) => monitoredSeasons.add(s.season_number));
				break;
		}
	}

	function updateAnimeDetectionFromMovie(movieDetails: TmdbMovieDetails | null | undefined) {
		detectedAnime = isLikelyAnimeMedia({
			genres: movieDetails?.genres,
			originalLanguage: movieDetails?.original_language,
			originCountries: movieDetails?.origin_country,
			productionCountries: movieDetails?.production_countries,
			title: movieDetails?.title,
			originalTitle: movieDetails?.original_title
		});
	}

	function updateAnimeDetectionFromSeries(tvDetails: TmdbTvDetails | null | undefined) {
		detectedAnime = isLikelyAnimeMedia({
			genres: tvDetails?.genres,
			originalLanguage: tvDetails?.original_language,
			originCountries: tvDetails?.origin_country,
			productionCountries: tvDetails?.production_countries,
			title: tvDetails?.name,
			originalTitle: tvDetails?.original_name
		});
	}

	async function loadData() {
		isLoading = true;
		error = null;

		try {
			const requests: Promise<Response>[] = [
				fetch('/api/root-folders'),
				fetch(`/api/libraries?mediaType=${mediaType}`),
				fetch('/api/scoring-profiles'),
				fetch('/api/settings/library/classification')
			];

			// Fetch seasons for TV shows
			if (mediaType === 'tv') {
				requests.push(fetch(`/api/tmdb/tv/${tmdbId}`));
			} else {
				requests.push(fetch(`/api/tmdb/movie/${tmdbId}`));
			}

			const responses = await Promise.all(requests);
			const [foldersRes, librariesRes, profilesRes, classificationRes] = responses;

			if (!foldersRes.ok || !librariesRes.ok || !profilesRes.ok || !classificationRes.ok) {
				throw new Error('Failed to load configuration');
			}

			const foldersData = await foldersRes.json();
			const librariesData = await librariesRes.json();
			const profilesData = await profilesRes.json();
			const classificationData = await classificationRes.json();

			rootFolders = Array.isArray(foldersData) ? foldersData : (foldersData.folders ?? []);
			libraries = librariesData.libraries ?? [];
			scoringProfiles = profilesData.profiles ?? [];
			enforceAnimeSubtype = classificationData?.enforceAnimeSubtype === true;

			// Handle TV seasons
			if (mediaType === 'tv' && responses[4]) {
				const tvRes = responses[4];
				if (tvRes.ok) {
					const tvData: TmdbTvDetails = await tvRes.json();
					seasons = tvData.seasons?.filter((s: Season) => s.episode_count > 0) ?? [];
					// Initialize all seasons as monitored by default
					monitoredSeasons.clear();
					for (const s of seasons) {
						monitoredSeasons.add(s.season_number);
					}
					updateAnimeDetectionFromSeries(tvData);
				}
			}

			// Fetch collection data for movies (non-blocking, don't fail if it errors)
			if (mediaType === 'movie') {
				const movieRes = responses[4];
				if (movieRes?.ok) {
					const movieData: TmdbMovieDetails = await movieRes.json();
					updateAnimeDetectionFromMovie(movieData);
					fetchCollectionData();
				} else {
					fetchCollectionData();
				}
			}

			// Set defaults
			selectedRootFolder = getRecommendedRootFolderId(filteredRootFolders) ?? '';

			// Use API-provided default profile ID, fallback to first profile
			const defaultProfileId = profilesData.defaultProfileId;
			const defaultProfile =
				(defaultProfileId && scoringProfiles.find((p) => p.id === defaultProfileId)) ??
				scoringProfiles.find((p) => p.isDefault) ??
				scoringProfiles[0];
			if (defaultProfile) {
				selectedScoringProfile = defaultProfile.id;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load data';
		} finally {
			isLoading = false;
		}
	}

	async function fetchCollectionData() {
		try {
			let movieData: TmdbMovieDetails;
			// First fetch the movie to check if it belongs to a collection
			const movieRes = await fetch(`/api/tmdb/movie/${tmdbId}`);
			if (!movieRes.ok) return;

			movieData = await movieRes.json();
			if (!movieData.belongs_to_collection) return;

			// Fetch the collection details
			const collectionRes = await fetch(
				`/api/tmdb/collection/${movieData.belongs_to_collection.id}`
			);
			if (!collectionRes.ok) return;

			const collectionData = await collectionRes.json();
			if (!collectionData.parts || collectionData.parts.length <= 1) return;

			// Fetch library status for all collection parts
			const tmdbIds = collectionData.parts.map((p: CollectionPart) => p.id);
			const statusRes = await fetch('/api/library/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tmdbIds, mediaType: 'movie' })
			});

			let statusMap: Record<number, { inLibrary: boolean }> = {};
			if (statusRes.ok) {
				const statusData = await statusRes.json();
				statusMap = statusData.status ?? {};
			}

			// Enrich collection parts with library status
			collection = {
				id: collectionData.id,
				name: collectionData.name,
				parts: collectionData.parts.map((p: CollectionPart) => ({
					...p,
					inLibrary: statusMap[p.id]?.inLibrary ?? false
				}))
			};
		} catch (_e) {
			// Collection fetch is non-critical, just continue without collection extras
		}
	}

	async function handleSubmit() {
		if (!selectedRootFolder) {
			error = 'Please select a root folder';
			return;
		}

		isSubmitting = true;
		error = null;

		try {
			// Check if we're doing a bulk add for a collection
			if (mediaType === 'movie' && addEntireCollection && missingCollectionMovies.length > 0) {
				await handleBulkCollectionAdd();
				return;
			}

			const endpoint = mediaType === 'movie' ? '/api/library/movies' : '/api/library/series';

			const payload: Record<string, unknown> = {
				tmdbId,
				rootFolderId: selectedRootFolder,
				scoringProfileId: selectedScoringProfile || undefined,
				monitored: willBeMonitored,
				searchOnAdd: willSearchOnAdd,
				wantsSubtitles
			};

			if (mediaType === 'movie') {
				payload.minimumAvailability = minimumAvailability;
			} else {
				payload.monitorType = monitorType;
				payload.monitorNewItems = monitorNewItems;
				payload.monitorSpecials = monitorSpecials;
				payload.seriesType = seriesType;
				payload.seasonFolder = seasonFolder;
				payload.monitoredSeasons = Array.from(monitoredSeasons);
			}

			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				const payload = await readResponsePayload(response);
				throw new Error(getResponseErrorMessage(payload, `Failed to add ${mediaType}`));
			}

			const result = await response.json();

			// Success - show toast
			toasts.success(`${title} added to library`, {
				description: willSearchOnAdd ? 'Searching for releases...' : undefined,
				action: result.id
					? {
							label: 'View',
							href:
								mediaType === 'movie' ? `/library/movie/${result.id}` : `/library/tv/${result.id}`
						}
					: undefined
			});

			onClose();
			onSuccess?.();
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : 'Failed to add to library';
			error = errorMessage;
			toasts.error(errorMessage);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleBulkCollectionAdd() {
		try {
			// Include the current movie plus all missing collection movies
			const allTmdbIds = [tmdbId, ...missingCollectionMovies.map((m) => m.id)];

			const payload = {
				tmdbIds: allTmdbIds,
				rootFolderId: selectedRootFolder,
				scoringProfileId: selectedScoringProfile || undefined,
				monitored: willBeMonitored,
				minimumAvailability,
				searchOnAdd: willSearchOnAdd,
				wantsSubtitles
			};

			const response = await fetch('/api/library/movies/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				const payload = await readResponsePayload(response);
				throw new Error(getResponseErrorMessage(payload, 'Failed to add collection'));
			}

			const result = await response.json();

			// Show success message with count
			const addedCount = result.added ?? 0;
			const errorCount = result.errors?.length ?? 0;

			if (addedCount > 0) {
				toasts.success(
					`Added ${addedCount} movie${addedCount > 1 ? 's' : ''} from ${collection?.name}`,
					{
						description: willSearchOnAdd ? 'Searching for releases...' : undefined
					}
				);
			}

			if (errorCount > 0) {
				toasts.error(`Failed to add ${errorCount} movie${errorCount > 1 ? 's' : ''}`);
			}

			onClose();
			onSuccess?.();
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : 'Failed to add collection';
			error = errorMessage;
			toasts.error(errorMessage);
		} finally {
			isSubmitting = false;
		}
	}

	function handleClose() {
		if (!isSubmitting) {
			onClose();
		}
	}
</script>

<ModalWrapper {open} onClose={handleClose} maxWidth="2xl" labelledBy="add-library-modal-title">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<h3 id="add-library-modal-title" class="text-xl font-bold">Add to Library</h3>
		<button
			class="btn btn-circle btn-ghost btn-sm"
			onclick={handleClose}
			disabled={isSubmitting}
			aria-label="Close"
		>
			<X class="h-4 w-4" />
		</button>
	</div>

	<!-- Body -->
	<div class="min-w-0 space-y-5 overflow-hidden">
		{#if isLoading}
			<div class="flex items-center justify-center py-12">
				<Loader2 class="h-8 w-8 animate-spin text-primary" />
			</div>
		{:else}
			<!-- Media Info Preview -->
			<div class="flex items-start gap-4">
				{#if posterPath}
					<img
						src={`https://image.tmdb.org/t/p/w92${posterPath}`}
						alt={title}
						class="w-16 rounded-md shadow-md"
					/>
				{:else}
					<div class="flex h-24 w-16 items-center justify-center rounded-md bg-base-300">
						<span class="text-xs text-base-content/30">No Image</span>
					</div>
				{/if}
				<div>
					<h3 class="text-lg font-bold">{title}</h3>
					{#if year}
						<p class="text-sm text-base-content/70">{year}</p>
					{/if}
					<span
						class="mt-1 badge badge-sm {mediaType === 'movie' ? 'badge-info' : 'badge-secondary'}"
					>
						{mediaType === 'movie' ? 'Movie' : 'TV Series'}
					</span>
				</div>
			</div>

			<!-- Error Display -->
			{#if error}
				<div class="alert alert-error">
					<span>{error}</span>
				</div>
			{/if}

			{#if enforceAnimeSubtype}
				<div class="alert text-sm alert-info">
					<span
						>{requiredMediaSubType === 'anime'
							? 'Anime detected. Only folders with subtype Anime are available.'
							: 'Anime root folder enforcement is enabled. Only Standard folders are available.'}</span
					>
				</div>
			{/if}

			<!-- Common Options (Root Folder, Profile) -->
			<CommonOptions
				{mediaType}
				{rootFolders}
				{scoringProfiles}
				{requiredMediaSubType}
				onSearchOnAddInput={handleSearchOnAddInput}
				onWantsSubtitlesInput={handleWantsSubtitlesInput}
				bind:selectedRootFolder
				bind:selectedScoringProfile
				bind:searchOnAdd
				bind:wantsSubtitles
			/>

			<!-- Movie-specific options -->
			{#if mediaType === 'movie'}
				<MovieAddOptions
					{tmdbId}
					onMonitoredInput={handleMonitoredInput}
					bind:minimumAvailability
					bind:monitored
					{collection}
					bind:addEntireCollection
				/>
			{/if}

			<!-- TV-specific options -->
			{#if mediaType === 'tv'}
				<SeriesAddOptions
					{seasons}
					onMonitoredInput={handleMonitoredInput}
					bind:monitorType
					bind:monitorNewItems
					bind:monitorSpecials
					bind:seriesType
					bind:seasonFolder
					{monitoredSeasons}
					bind:showAdvanced
				/>
			{/if}
		{/if}
	</div>

	<!-- Footer -->
	<div class="modal-action mt-6 border-t border-base-300 pt-4">
		<button class="btn btn-ghost" onclick={handleClose} disabled={isSubmitting}> Cancel </button>
		<button
			class="btn btn-primary"
			onclick={handleSubmit}
			disabled={isLoading || isSubmitting || filteredRootFolders.length === 0}
		>
			{#if isSubmitting}
				<Loader2 class="mr-2 h-4 w-4 animate-spin" />
				Adding...
			{:else if willSearchOnAdd}
				<Search class="mr-2 h-4 w-4" />
				Add + Search
			{:else}
				Add to Library
			{/if}
		</button>
	</div>
</ModalWrapper>
