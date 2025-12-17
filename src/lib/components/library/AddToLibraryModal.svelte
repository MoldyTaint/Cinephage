<script lang="ts">
	import {
		X,
		FolderOpen,
		BarChart3,
		Eye,
		Loader2,
		Search,
		Calendar,
		Tv,
		Film,
		ChevronDown,
		ChevronUp,
		Subtitles
	} from 'lucide-svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { resolve } from '$app/paths';

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
		freeSpaceBytes?: number | null;
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

	// Monitor type options for TV shows (similar to Sonarr)
	type MonitorType =
		| 'all'
		| 'future'
		| 'missing'
		| 'existing'
		| 'firstSeason'
		| 'lastSeason'
		| 'recent'
		| 'pilot'
		| 'none';

	// Monitor New Items - how to handle new seasons/episodes added after initial add
	type MonitorNewItems = 'all' | 'none';

	const monitorTypeOptions: { value: MonitorType; label: string; description: string }[] = [
		{ value: 'all', label: 'All Episodes', description: 'Monitor all episodes except specials' },
		{
			value: 'future',
			label: 'Future Episodes',
			description: 'Monitor episodes that have not aired yet'
		},
		{
			value: 'missing',
			label: 'Missing Episodes',
			description: 'Monitor episodes without files (excludes specials)'
		},
		{
			value: 'existing',
			label: 'Existing Episodes',
			description: 'Monitor episodes that already have files on disk'
		},
		{
			value: 'firstSeason',
			label: 'First Season',
			description: 'Monitor only the first season'
		},
		{
			value: 'lastSeason',
			label: 'Latest Season',
			description: 'Monitor only the most recent season'
		},
		{
			value: 'recent',
			label: 'Recent Episodes',
			description: 'Monitor episodes from the last 90 days + all future episodes'
		},
		{
			value: 'pilot',
			label: 'Pilot Episode',
			description: 'Monitor only the first episode (S01E01)'
		},
		{ value: 'none', label: 'None', description: 'Do not monitor any episodes automatically' }
	];

	const monitorNewItemsOptions: { value: MonitorNewItems; label: string; description: string }[] = [
		{
			value: 'all',
			label: 'All',
			description: 'Automatically monitor new seasons and episodes when they are added'
		},
		{
			value: 'none',
			label: 'None',
			description: 'Do not automatically monitor new seasons or episodes'
		}
	];

	// Minimum availability options for movies (similar to Radarr)
	type MinimumAvailability = 'announced' | 'inCinemas' | 'released' | 'preDb';

	const availabilityOptions: { value: MinimumAvailability; label: string; description: string }[] =
		[
			{
				value: 'announced',
				label: 'Announced',
				description: 'Search as soon as movie is announced'
			},
			{ value: 'inCinemas', label: 'In Cinemas', description: 'Search when movie is in cinemas' },
			{
				value: 'released',
				label: 'Released',
				description: 'Search when movie is released on disc/streaming'
			},
			{ value: 'preDb', label: 'PreDB', description: 'Search when movie appears on PreDB' }
		];

	// Series type options (similar to Sonarr)
	type SeriesType = 'standard' | 'anime' | 'daily';

	const seriesTypeOptions: { value: SeriesType; label: string; description: string }[] = [
		{ value: 'standard', label: 'Standard', description: 'Episodes with S##E## numbering' },
		{ value: 'anime', label: 'Anime', description: 'Episodes with absolute numbering' },
		{ value: 'daily', label: 'Daily', description: 'Episodes with date-based numbering' }
	];

	// State
	let rootFolders = $state<RootFolder[]>([]);
	let scoringProfiles = $state<ScoringProfile[]>([]);
	let seasons = $state<Season[]>([]);
	let isLoading = $state(false);
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);
	let showAdvanced = $state(false);

	// Collection state (for movies only)
	let collection = $state<CollectionInfo | null>(null);
	let addEntireCollection = $state(false);

	// Form state - Common
	let selectedRootFolder = $state('');
	let selectedScoringProfile = $state('');
	let monitored = $state(true);
	let searchOnAdd = $state(true);
	let wantsSubtitles = $state(true);

	// Form state - Movie specific
	let minimumAvailability = $state<MinimumAvailability>('released');

	// Form state - TV specific
	let monitorType = $state<MonitorType>('all');
	let monitorNewItems = $state<MonitorNewItems>('all');
	let monitorSpecials = $state(false);
	let seriesType = $state<SeriesType>('standard');
	let seasonFolder = $state(true);
	let monitoredSeasons = new SvelteSet<number>();
	let showSeasonSelection = $state(false);

	// Derived: Filter root folders by media type
	const filteredRootFolders = $derived(rootFolders.filter((f) => f.mediaType === mediaType));

	// Derived: Collection movies not in library (excluding current movie)
	const missingCollectionMovies = $derived(
		collection?.parts?.filter((p) => !p.inLibrary && p.id !== tmdbId) ?? []
	);

	// Derived: Check if all seasons are monitored
	const allSeasonsMonitored = $derived(
		seasons.length > 0 && seasons.every((s) => monitoredSeasons.has(s.season_number))
	);

	// Derived: Whether the item will be monitored (for TV, depends on monitorType)
	const willBeMonitored = $derived(mediaType === 'tv' ? monitorType !== 'none' : monitored);

	// Derived: Whether search will happen on add
	const willSearchOnAdd = $derived(searchOnAdd && willBeMonitored);

	// Derived: Calculate monitoring summary for preview
	const monitoringSummary = $derived(() => {
		if (mediaType !== 'tv' || seasons.length === 0) return null;

		const regularSeasons = seasons.filter((s) => s.season_number > 0);
		const specials = seasons.find((s) => s.season_number === 0);
		const totalEpisodes = seasons.reduce((sum, s) => sum + s.episode_count, 0);
		const specialsEpisodes = specials?.episode_count ?? 0;
		const regularEpisodes = totalEpisodes - specialsEpisodes;

		// Calculate monitored seasons count
		const monitoredRegularSeasons = regularSeasons.filter((s) =>
			monitoredSeasons.has(s.season_number)
		).length;
		const monitoredSpecials = specials && monitoredSeasons.has(0);

		// Estimate monitored episodes based on monitor type
		let estimatedMonitoredEpisodes = 0;
		let monitorDescription = '';

		switch (monitorType) {
			case 'all':
				estimatedMonitoredEpisodes = regularEpisodes + (monitorSpecials ? specialsEpisodes : 0);
				monitorDescription = monitorSpecials
					? 'All episodes including specials'
					: 'All regular episodes';
				break;
			case 'future':
				monitorDescription = "Only episodes that haven't aired yet";
				estimatedMonitoredEpisodes = -1; // Unknown without air dates
				break;
			case 'missing':
				monitorDescription = 'Episodes without files (after import)';
				estimatedMonitoredEpisodes = -1;
				break;
			case 'existing':
				monitorDescription = 'Episodes with files (after import)';
				estimatedMonitoredEpisodes = -1;
				break;
			case 'firstSeason': {
				const firstSeason = regularSeasons.find((s) => s.season_number === 1);
				estimatedMonitoredEpisodes = firstSeason?.episode_count ?? 0;
				monitorDescription = 'First season only';
				break;
			}
			case 'lastSeason': {
				const lastSeason = regularSeasons[regularSeasons.length - 1];
				estimatedMonitoredEpisodes = lastSeason?.episode_count ?? 0;
				monitorDescription = 'Latest season only';
				break;
			}
			case 'recent':
				monitorDescription = 'Episodes from last 90 days + future';
				estimatedMonitoredEpisodes = -1;
				break;
			case 'pilot':
				estimatedMonitoredEpisodes = 1;
				monitorDescription = 'Pilot episode only (S01E01)';
				break;
			case 'none':
				estimatedMonitoredEpisodes = 0;
				monitorDescription = 'No automatic monitoring';
				break;
		}

		return {
			totalSeasons: regularSeasons.length,
			monitoredSeasons: monitoredRegularSeasons,
			hasSpecials: !!specials,
			specialsMonitored: monitoredSpecials,
			totalEpisodes,
			regularEpisodes,
			specialsEpisodes,
			estimatedMonitoredEpisodes,
			monitorDescription
		};
	});

	// Format bytes to human readable
	function formatBytes(bytes: number | null | undefined): string {
		if (!bytes) return '';
		const gb = bytes / (1024 * 1024 * 1024);
		if (gb >= 1000) return `${(gb / 1024).toFixed(1)} TB`;
		return `${gb.toFixed(1)} GB`;
	}

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
			monitoredSeasons = new SvelteSet();
			showSeasonSelection = false;
			showAdvanced = false;
			error = null;

			// Reset collection state
			collection = null;
			addEntireCollection = false;

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

	function updateMonitoredSeasonsFromType(type: MonitorType) {
		const newMonitored = new SvelteSet<number>();

		// Helper to check if a season should be included (respects monitorSpecials)
		const shouldIncludeSeason = (s: Season) => {
			if (s.season_number === 0) return monitorSpecials;
			return true;
		};

		switch (type) {
			case 'all':
				seasons.filter(shouldIncludeSeason).forEach((s) => newMonitored.add(s.season_number));
				break;
			case 'firstSeason': {
				const firstSeason =
					seasons.find((s) => s.season_number === 1) ?? seasons.find((s) => s.season_number > 0);
				if (firstSeason) newMonitored.add(firstSeason.season_number);
				break;
			}
			case 'lastSeason': {
				const regularSeasons = seasons.filter((s) => s.season_number > 0);
				const lastSeason =
					regularSeasons.length > 0
						? regularSeasons[regularSeasons.length - 1]
						: seasons[seasons.length - 1];
				if (lastSeason) newMonitored.add(lastSeason.season_number);
				break;
			}
			case 'recent':
				// Recent monitors all seasons that have recent or future episodes
				// The actual episode filtering happens server-side, but we monitor all non-specials
				seasons.filter(shouldIncludeSeason).forEach((s) => newMonitored.add(s.season_number));
				break;
			case 'none':
				// Empty set
				break;
			default:
				// For 'future', 'missing', 'existing', 'pilot' - monitor all seasons but episode filtering is handled server-side
				seasons.filter(shouldIncludeSeason).forEach((s) => newMonitored.add(s.season_number));
				break;
		}

		monitoredSeasons = newMonitored;
	}

	async function loadData() {
		isLoading = true;
		error = null;

		try {
			const requests: Promise<Response>[] = [
				fetch('/api/root-folders'),
				fetch('/api/scoring-profiles')
			];

			// Fetch seasons for TV shows
			if (mediaType === 'tv') {
				requests.push(fetch(`/api/tmdb/tv/${tmdbId}`));
			}

			const responses = await Promise.all(requests);
			const [foldersRes, profilesRes] = responses;

			if (!foldersRes.ok || !profilesRes.ok) {
				throw new Error('Failed to load configuration');
			}

			const foldersData = await foldersRes.json();
			const profilesData = await profilesRes.json();

			rootFolders = Array.isArray(foldersData) ? foldersData : (foldersData.folders ?? []);
			scoringProfiles = profilesData.profiles ?? [];

			// Handle TV seasons
			if (mediaType === 'tv' && responses[2]) {
				const tvRes = responses[2];
				if (tvRes.ok) {
					const tvData = await tvRes.json();
					seasons = tvData.seasons?.filter((s: Season) => s.episode_count > 0) ?? [];
					// Initialize all seasons as monitored by default
					monitoredSeasons = new SvelteSet(seasons.map((s) => s.season_number));
				}
			}

			// Fetch collection data for movies (non-blocking, don't fail if it errors)
			if (mediaType === 'movie') {
				fetchCollectionData();
			}

			// Set defaults
			const defaultFolder = filteredRootFolders.find((f) => f.mediaType === mediaType);
			if (defaultFolder) {
				selectedRootFolder = defaultFolder.id;
			} else if (filteredRootFolders.length > 0) {
				selectedRootFolder = filteredRootFolders[0].id;
			}

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

	/**
	 * Fetch collection data for movies (non-blocking)
	 * Checks if the movie belongs to a collection and fetches collection parts with library status
	 */
	async function fetchCollectionData() {
		try {
			// First fetch the movie to check if it belongs to a collection
			const movieRes = await fetch(`/api/tmdb/movie/${tmdbId}`);
			if (!movieRes.ok) return;

			const movieData = await movieRes.json();
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
		} catch (e) {
			// Collection fetch is non-critical, just log and continue
			console.warn('Failed to fetch collection data:', e);
		}
	}

	function toggleSeason(seasonNumber: number) {
		const newSet = new SvelteSet(monitoredSeasons);
		if (newSet.has(seasonNumber)) {
			newSet.delete(seasonNumber);
		} else {
			newSet.add(seasonNumber);
		}
		monitoredSeasons = newSet;
	}

	function toggleAllSeasons() {
		if (allSeasonsMonitored) {
			monitoredSeasons = new SvelteSet();
		} else {
			monitoredSeasons = new SvelteSet(seasons.map((s) => s.season_number));
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
				const data = await response.json();
				throw new Error(data.error || `Failed to add ${mediaType}`);
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

	/**
	 * Handle bulk add for an entire collection
	 */
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
				const data = await response.json();
				throw new Error(data.error || 'Failed to add collection');
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

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleClose();
		}
	}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
	<div class="modal-open modal">
		<div class="modal-box max-h-[90vh] max-w-2xl overflow-y-auto">
			<!-- Header -->
			<div class="mb-6 flex items-center justify-between">
				<h3 class="text-xl font-bold">Add to Library</h3>
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
			<div class="space-y-5">
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
								class="mt-1 badge badge-sm {mediaType === 'movie'
									? 'badge-info'
									: 'badge-secondary'}"
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

					<!-- Root Folder Select -->
					<div class="form-control">
						<label class="label" for="root-folder">
							<span class="label-text flex items-center gap-2 font-medium">
								<FolderOpen class="h-4 w-4" />
								Root Folder
							</span>
						</label>
						{#if filteredRootFolders.length === 0}
							<div class="alert text-sm alert-warning">
								<span
									>No root folders configured for {mediaType === 'movie' ? 'movies' : 'TV shows'}.
									<a href={resolve('/settings/general')} class="link">Add one in settings.</a>
								</span>
							</div>
						{:else}
							<select
								id="root-folder"
								class="select-bordered select w-full"
								bind:value={selectedRootFolder}
							>
								{#each filteredRootFolders as folder (folder.id)}
									<option value={folder.id}>
										{folder.name} ({folder.path})
										{#if folder.freeSpaceBytes}
											- {formatBytes(folder.freeSpaceBytes)} free
										{/if}
									</option>
								{/each}
							</select>
						{/if}
					</div>

					<!-- Quality Profile Select -->
					<div class="form-control">
						<label class="label" for="scoring-profile">
							<span class="label-text flex items-center gap-2 font-medium">
								<BarChart3 class="h-4 w-4" />
								Quality Profile
							</span>
						</label>
						<select
							id="scoring-profile"
							class="select-bordered select w-full"
							bind:value={selectedScoringProfile}
						>
							{#each scoringProfiles as profile (profile.id)}
								<option value={profile.id}>
									{profile.name}
									{#if profile.description}
										- {profile.description}
									{/if}
								</option>
							{/each}
						</select>
					</div>

					<!-- Movie-specific: Minimum Availability -->
					{#if mediaType === 'movie'}
						<div class="form-control">
							<label class="label" for="minimum-availability">
								<span class="label-text flex items-center gap-2 font-medium">
									<Calendar class="h-4 w-4" />
									Minimum Availability
								</span>
							</label>
							<select
								id="minimum-availability"
								class="select-bordered select w-full"
								bind:value={minimumAvailability}
							>
								{#each availabilityOptions as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
							<div class="label">
								<span class="label-text-alt text-base-content/60">
									{availabilityOptions.find((o) => o.value === minimumAvailability)?.description}
								</span>
							</div>
						</div>

						<!-- Collection Option -->
						{#if collection && missingCollectionMovies.length > 0}
							<div class="form-control">
								<label
									class="label cursor-pointer justify-start gap-4 rounded-lg bg-base-300/50 p-4"
								>
									<input
										type="checkbox"
										class="checkbox checkbox-primary"
										bind:checked={addEntireCollection}
									/>
									<div class="flex-1">
										<span class="label-text font-medium">
											Add entire {collection.name}
										</span>
										<span class="label-text-alt block text-base-content/60">
											Also add {missingCollectionMovies.length} other movie{missingCollectionMovies.length >
											1
												? 's'
												: ''} from this collection
										</span>
									</div>
								</label>
							</div>
						{/if}

						<!-- Movie-specific: Monitored Toggle -->
						<div class="form-control">
							<label class="label cursor-pointer justify-start gap-4">
								<input type="checkbox" class="toggle toggle-primary" bind:checked={monitored} />
								<div>
									<span class="label-text flex items-center gap-2 font-medium">
										<Eye class="h-4 w-4" />
										Monitored
									</span>
									<span class="label-text-alt text-base-content/60">
										{monitored
											? 'Will search for releases and upgrades automatically'
											: 'Will not search for releases automatically'}
									</span>
								</div>
							</label>
						</div>
					{/if}

					<!-- TV-specific options -->
					{#if mediaType === 'tv'}
						<!-- Monitored Toggle -->
						<div class="form-control">
							<label class="label cursor-pointer justify-start gap-4">
								<input
									type="checkbox"
									class="toggle toggle-primary"
									checked={monitorType !== 'none'}
									onchange={(e) => {
										if (!e.currentTarget.checked) {
											monitorType = 'none';
										} else {
											monitorType = 'all';
										}
									}}
								/>
								<div>
									<span class="label-text flex items-center gap-2 font-medium">
										<Eye class="h-4 w-4" />
										Monitored
									</span>
									<span class="label-text-alt text-base-content/60">
										{monitorType !== 'none'
											? 'Will search for releases and upgrades automatically'
											: 'Will not search for releases automatically'}
									</span>
								</div>
							</label>
						</div>

						<!-- Monitor Type -->
						<div class="form-control">
							<label class="label" for="monitor-type">
								<span class="label-text flex items-center gap-2 font-medium">
									<Tv class="h-4 w-4" />
									Monitor
								</span>
							</label>
							<select
								id="monitor-type"
								class="select-bordered select w-full"
								bind:value={monitorType}
							>
								{#each monitorTypeOptions as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
							<div class="label">
								<span class="label-text-alt text-base-content/60">
									{monitorTypeOptions.find((o) => o.value === monitorType)?.description}
								</span>
							</div>
						</div>

						<!-- Monitor New Items dropdown -->
						<div class="form-control">
							<label class="label" for="monitor-new-items">
								<span class="label-text flex items-center gap-2 font-medium">
									<Calendar class="h-4 w-4" />
									Monitor New Items
								</span>
							</label>
							<select
								id="monitor-new-items"
								class="select-bordered select w-full"
								bind:value={monitorNewItems}
							>
								{#each monitorNewItemsOptions as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
							<div class="label">
								<span class="label-text-alt text-base-content/60">
									{monitorNewItemsOptions.find((o) => o.value === monitorNewItems)?.description}
								</span>
							</div>
						</div>

						<!-- Monitor Specials Toggle -->
						<div class="form-control">
							<label class="label cursor-pointer justify-start gap-4">
								<input
									type="checkbox"
									class="toggle toggle-primary toggle-sm"
									bind:checked={monitorSpecials}
								/>
								<div>
									<span class="label-text flex items-center gap-2 font-medium">
										Monitor Specials
									</span>
									<span class="label-text-alt text-base-content/60">
										{monitorSpecials
											? 'Specials (Season 0) will be monitored'
											: 'Specials (Season 0) will not be monitored'}
									</span>
								</div>
							</label>
						</div>

						<!-- Season Selection (Expandable) -->
						{#if seasons.length > 0}
							<div class="form-control">
								<button
									type="button"
									class="btn w-full justify-between btn-ghost btn-sm"
									onclick={() => (showSeasonSelection = !showSeasonSelection)}
								>
									<span class="flex items-center gap-2">
										<Film class="h-4 w-4" />
										Season Selection
										<span class="badge badge-sm badge-primary"
											>{monitoredSeasons.size}/{seasons.length}</span
										>
									</span>
									{#if showSeasonSelection}
										<ChevronUp class="h-4 w-4" />
									{:else}
										<ChevronDown class="h-4 w-4" />
									{/if}
								</button>

								{#if showSeasonSelection}
									<div class="mt-2 space-y-2 rounded-lg bg-base-300/50 p-3">
										<!-- Toggle All -->
										<label
											class="flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-base-300"
										>
											<input
												type="checkbox"
												class="checkbox checkbox-sm checkbox-primary"
												checked={allSeasonsMonitored}
												onchange={toggleAllSeasons}
											/>
											<span class="text-sm font-medium">Select All</span>
										</label>

										<div class="divider my-1"></div>

										<!-- Individual Seasons -->
										<div class="max-h-48 space-y-1 overflow-y-auto">
											{#each seasons as season (season.season_number)}
												<label
													class="flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-base-300"
												>
													<input
														type="checkbox"
														class="checkbox checkbox-sm checkbox-primary"
														checked={monitoredSeasons.has(season.season_number)}
														onchange={() => toggleSeason(season.season_number)}
													/>
													<div class="min-w-0 flex-1">
														<span class="text-sm font-medium">
															{season.season_number === 0
																? 'Specials'
																: `Season ${season.season_number}`}
														</span>
														<span class="ml-2 text-xs text-base-content/60">
															{season.episode_count} episode{season.episode_count !== 1 ? 's' : ''}
														</span>
													</div>
													{#if season.air_date}
														<span class="text-xs text-base-content/50">
															{new Date(season.air_date).getFullYear()}
														</span>
													{/if}
												</label>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/if}

						<!-- Monitoring Preview -->
						{@const summary = monitoringSummary()}
						{#if summary}
							<div class="rounded-lg border border-primary/20 bg-primary/5 p-4">
								<h4 class="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
									<Eye class="h-4 w-4" />
									Monitoring Preview
								</h4>
								<p class="mb-3 text-sm text-base-content/70">{summary.monitorDescription}</p>
								<div class="grid grid-cols-2 gap-2 text-xs">
									<div class="rounded bg-base-200 px-2 py-1">
										<span class="text-base-content/50">Seasons:</span>
										<span class="ml-1 font-medium"
											>{summary.monitoredSeasons}/{summary.totalSeasons}</span
										>
									</div>
									{#if summary.estimatedMonitoredEpisodes >= 0}
										<div class="rounded bg-base-200 px-2 py-1">
											<span class="text-base-content/50">Episodes:</span>
											<span class="ml-1 font-medium">~{summary.estimatedMonitoredEpisodes}</span>
										</div>
									{:else}
										<div class="rounded bg-base-200 px-2 py-1">
											<span class="text-base-content/50">Episodes:</span>
											<span class="ml-1 font-medium italic">Dynamic</span>
										</div>
									{/if}
									{#if summary.hasSpecials}
										<div class="col-span-2 rounded bg-base-200 px-2 py-1">
											<span class="text-base-content/50">Specials:</span>
											<span class="ml-1 font-medium">
												{summary.specialsMonitored
													? `Monitored (${summary.specialsEpisodes} eps)`
													: 'Not monitored'}
											</span>
										</div>
									{/if}
								</div>
							</div>
						{/if}
					{/if}

					<!-- Search on Add Toggle -->
					<div class="form-control">
						<label class="label cursor-pointer justify-start gap-4">
							<input type="checkbox" class="toggle toggle-success" bind:checked={searchOnAdd} />
							<div>
								<span class="label-text flex items-center gap-2 font-medium">
									<Search class="h-4 w-4" />
									Search Immediately
								</span>
								<span class="label-text-alt text-base-content/60">
									{searchOnAdd
										? 'Search and grab best release right now'
										: 'Let scheduler find releases later'}
								</span>
							</div>
						</label>
					</div>

					<!-- Auto-Download Subtitles Toggle -->
					<div class="form-control">
						<label class="label cursor-pointer justify-start gap-4">
							<input type="checkbox" class="toggle toggle-primary" bind:checked={wantsSubtitles} />
							<div>
								<span class="label-text flex items-center gap-2 font-medium">
									<Subtitles class="h-4 w-4" />
									Auto-Download Subtitles
								</span>
								<span class="label-text-alt text-base-content/60">
									{wantsSubtitles
										? 'Will automatically search and download subtitles when available'
										: 'Subtitles will not be downloaded automatically'}
								</span>
							</div>
						</label>
					</div>

					<!-- Advanced Options (TV only) -->
					{#if mediaType === 'tv'}
						<div
							class="divider cursor-pointer text-xs text-base-content/50"
							onclick={() => (showAdvanced = !showAdvanced)}
						>
							{showAdvanced ? 'Hide' : 'Show'} Advanced Options
							{#if showAdvanced}
								<ChevronUp class="ml-1 inline h-3 w-3" />
							{:else}
								<ChevronDown class="ml-1 inline h-3 w-3" />
							{/if}
						</div>

						{#if showAdvanced}
							<!-- Series Type -->
							<div class="form-control">
								<label class="label" for="series-type">
									<span class="label-text font-medium">Series Type</span>
								</label>
								<select
									id="series-type"
									class="select-bordered select w-full select-sm"
									bind:value={seriesType}
								>
									{#each seriesTypeOptions as option (option.value)}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>
								<div class="label">
									<span class="label-text-alt text-base-content/60">
										{seriesTypeOptions.find((o) => o.value === seriesType)?.description}
									</span>
								</div>
							</div>

							<!-- Season Folder Toggle -->
							<div class="form-control">
								<label class="label cursor-pointer justify-start gap-4">
									<input
										type="checkbox"
										class="toggle toggle-primary toggle-sm"
										bind:checked={seasonFolder}
									/>
									<div>
										<span class="label-text font-medium">Use Season Folders</span>
										<span class="label-text-alt text-base-content/60">
											{seasonFolder
												? 'Episodes organized in Season ## folders'
												: 'All episodes in series folder'}
										</span>
									</div>
								</label>
							</div>
						{/if}
					{/if}
				{/if}
			</div>

			<!-- Footer -->
			<div class="modal-action mt-6 border-t border-base-300 pt-4">
				<button class="btn btn-ghost" onclick={handleClose} disabled={isSubmitting}>
					Cancel
				</button>
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
		</div>
		<button
			type="button"
			class="modal-backdrop cursor-default border-none bg-black/50"
			onclick={handleClose}
			aria-label="Close modal"
		></button>
	</div>
{/if}
