<script lang="ts">
	import { X, FolderOpen, Layers, Pencil, Trash2, Search, RefreshCw } from 'lucide-svelte';
	import { FolderBrowser, DesiredQualitiesPicker } from '$lib/components/library';
	import type { LibraryMovie, DesiredQuality } from '$lib/types/library';
	import { ModalWrapper, ModalFooter } from '$lib/components/ui/modal';
	import { FormCheckbox } from '$lib/components/ui/form';
	import { sortRootFoldersForMediaType } from '$lib/utils/root-folders.js';
	import { isLikelyAnimeMedia } from '$lib/shared/anime-classification.js';
	import { effectiveResolutions, redundantMovieFileIds } from '$lib/shared/best-file.js';
	import { toasts } from '$lib/stores/toast.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { formatBytes } from '$lib/utils/format.js';
	import type { RootFolderWithSpace as RootFolder } from '$lib/types/downloadClient.js';
	import { getLibraryClassificationSettings } from '$lib/api/settings.js';
	import { getTmdb } from '$lib/api/discover.js';

	interface QualityProfileOption {
		id: string;
		name: string;
		description: string;
		isBuiltIn: boolean;
		isDefault: boolean;
		minResolution?: string | null;
		maxResolution?: string | null;
	}

	interface TmdbMovieDetails {
		title?: string | null;
		original_title?: string | null;
		original_language?: string | null;
		production_countries?: Array<{ iso_3166_1?: string }> | null;
		genres?: Array<{ id?: number; name?: string }> | null;
	}

	interface DelayProfileOption {
		id: string;
		name: string;
	}

	interface Props {
		open: boolean;
		movie: LibraryMovie;
		qualityProfiles: QualityProfileOption[];
		delayProfiles: DelayProfileOption[];
		rootFolders: RootFolder[];
		saving: boolean;
		onClose: () => void;
		onSave: (data: MovieEditData) => void;
	}

	export interface MovieEditData {
		monitored: boolean;
		scoringProfileId: string | null;
		desiredQualities: DesiredQuality[] | null;
		delayProfileId: string | null;
		rootFolderId: string | null;
		moveFilesOnRootChange: boolean;
		minimumAvailability: string;
		availabilityDelay: number;
		wantsSubtitles: boolean;
		folderPath?: string;
		removeUnwantedFiles?: boolean;
		tmdbCollectionId?: number | null;
		collectionName?: string | null;
	}

	let { open, movie, qualityProfiles, delayProfiles, rootFolders, saving, onClose, onSave }: Props =
		$props();

	// Form state (defaults only, effect syncs from props)
	let monitored = $state(true);
	let qualityProfileId = $state('');
	let delayProfileId = $state<string | null>(null);
	let rootFolderId = $state('');
	let minimumAvailability = $state('released');
	let availabilityDelay = $state(0);
	let wantsSubtitles = $state(true);
	let desiredQualities = $state<DesiredQuality[]>([]);
	let moveFilesOnRootChange = $state(false);
	let moveOptionTouched = $state(false);
	let removeUnwantedFiles = $state(false);
	let folderPath = $state('');
	let showFolderPicker = $state(false);
	let collectionId = $state<number | null>(null);
	let collectionName = $state<string | null>(null);
	let collectionSearchOpen = $state(false);
	let collectionQuery = $state('');
	let collectionResults = $state<
		{ id: number; name: string; poster_path: string | null; overview: string }[]
	>([]);
	let collectionSearching = $state(false);
	let collectionSearchTimer: ReturnType<typeof setTimeout> | null = null;
	let animeRootWarningShown = $state(false);
	let enforceAnimeSubtype = $state(false);
	let detectedAnime = $state(false);

	const requiredMediaSubType = $derived(
		enforceAnimeSubtype ? (detectedAnime ? ('anime' as const) : ('standard' as const)) : undefined
	);
	const eligibleRootFolders = $derived(
		sortRootFoldersForMediaType(rootFolders, 'movie', requiredMediaSubType)
	);
	const selectedRootFolderObj = $derived(rootFolders.find((folder) => folder.id === rootFolderId));
	const selectedRootFolderOutOfPolicy = $derived(
		requiredMediaSubType === 'anime' &&
			!!selectedRootFolderObj &&
			(selectedRootFolderObj.mediaSubType ?? 'standard') !== 'anime'
	);
	const hasExistingFiles = $derived(movie.hasFile === true);
	const rootFolderChanged = $derived((rootFolderId || null) !== (movie.rootFolderId ?? null));
	const canMoveExistingFiles = $derived(hasExistingFiles && rootFolderChanged && !!rootFolderId);

	async function loadAnimeRoutingContext(tmdbId: number) {
		try {
			const [classificationData, details] = await Promise.all([
				getLibraryClassificationSettings(),
				getTmdb(`movie/${tmdbId}`)
			]);

			let nextEnforceAnimeSubtype = false;
			let nextDetectedAnime = false;

			nextEnforceAnimeSubtype = classificationData?.enforceAnimeSubtype === true;

			const movieDetails = details as TmdbMovieDetails;
			nextDetectedAnime = isLikelyAnimeMedia({
				genres: movieDetails.genres,
				originalLanguage: movieDetails.original_language,
				productionCountries: movieDetails.production_countries,
				originCountries: movieDetails.production_countries
					?.map((country) => country.iso_3166_1)
					.filter((country): country is string => Boolean(country)),
				title: movieDetails.title,
				originalTitle: movieDetails.original_title
			});

			// Apply detection before enabling enforcement to avoid transient standard-folder re-selection.
			detectedAnime = nextDetectedAnime;
			enforceAnimeSubtype = nextEnforceAnimeSubtype;
		} catch {
			enforceAnimeSubtype = false;
			detectedAnime = false;
		}
	}

	// Reset form when modal opens
	$effect(() => {
		if (open) {
			monitored = movie.monitored ?? true;
			const defaultProfileId = qualityProfiles.find((p) => p.isDefault)?.id;
			qualityProfileId =
				movie.scoringProfileId && movie.scoringProfileId !== defaultProfileId
					? movie.scoringProfileId
					: '';
			delayProfileId = (movie as { delayProfileId?: string | null }).delayProfileId ?? null;
			rootFolderId = movie.rootFolderId ?? '';
			minimumAvailability = movie.minimumAvailability ?? 'released';
			availabilityDelay = movie.availabilityDelay ?? 0;
			wantsSubtitles = movie.wantsSubtitles ?? true;
			desiredQualities = [...(movie.desiredQualities ?? [])];
			moveFilesOnRootChange = false;
			moveOptionTouched = false;
			animeRootWarningShown = false;
			enforceAnimeSubtype = false;
			detectedAnime = false;
			folderPath = movie.path ?? '';
			collectionId = movie.tmdbCollectionId ?? null;
			collectionName = movie.collectionName ?? null;
			void loadAnimeRoutingContext(movie.tmdbId);
		}
	});

	$effect(() => {
		if (!open) return;
		if (!rootFolderId) return;
		const stillAllowed = eligibleRootFolders.some((folder) => folder.id === rootFolderId);
		if (!stillAllowed && !selectedRootFolderOutOfPolicy) {
			rootFolderId = '';
		}
	});

	$effect(() => {
		if (!open) return;
		if (rootFolderId) return;
		if (eligibleRootFolders.length > 0) {
			rootFolderId = eligibleRootFolders[0].id;
		}
	});

	$effect(() => {
		if (!open || animeRootWarningShown) return;
		if (!enforceAnimeSubtype || requiredMediaSubType !== 'anime') return;
		if (eligibleRootFolders.length > 0) return;

		toasts.warning(m.library_editMovie_animeRootWarningTitle(), {
			description: m.library_editMovie_animeRootWarningDesc()
		});
		animeRootWarningShown = true;
	});

	$effect(() => {
		if (!open) return;
		if (!canMoveExistingFiles) {
			moveFilesOnRootChange = false;
			moveOptionTouched = false;
			return;
		}
		if (!moveOptionTouched) {
			moveFilesOnRootChange = true;
		}
	});

	$effect(() => {
		if (!open || !showRemoveUnwantedFiles) {
			removeUnwantedFiles = false;
		}
	});

	const availabilityOptions = [
		{
			value: 'announced',
			label: m.library_availability_announcedLabel(),
			description: m.library_availability_announcedDesc()
		},
		{
			value: 'inCinemas',
			label: m.library_availability_inCinemasLabel(),
			description: m.library_availability_inCinemasDesc()
		},
		{
			value: 'released',
			label: m.library_availability_releasedLabel(),
			description: m.library_availability_releasedDesc()
		}
	];

	// Get profile data for labels/description
	let defaultProfile = $derived(qualityProfiles.find((p) => p.isDefault));
	let nonDefaultProfiles = $derived(qualityProfiles.filter((p) => p.id !== defaultProfile?.id));
	let currentProfile = $derived(
		qualityProfiles.find((p) => p.id === qualityProfileId) ?? defaultProfile
	);

	// --- Multi-quality resolution picker ---
	const profileForGating = $derived(
		qualityProfiles.find((p) => p.id === qualityProfileId) ?? defaultProfile ?? null
	);

	// --- Opt-in removal of now-redundant quality tiers (edit only) ---
	const effectiveDesiredResolutions = $derived(
		effectiveResolutions(
			desiredQualities,
			profileForGating?.minResolution,
			profileForGating?.maxResolution
		)
	);
	const redundantFileIdList = $derived(
		redundantMovieFileIds(movie.files, effectiveDesiredResolutions)
	);
	const desiredQualitiesReduced = $derived(
		(movie.desiredQualities ?? []).some((r) => !desiredQualities.includes(r))
	);
	const showRemoveUnwantedFiles = $derived(
		desiredQualitiesReduced && redundantFileIdList.length > 0
	);

	const folderPathChanged = $derived(folderPath.trim() !== (movie.path ?? '').trim());
	const resolvedFolderPath = $derived(
		selectedRootFolderObj?.path && folderPath.trim()
			? `${selectedRootFolderObj.path}/${folderPath.trim()}`
			: null
	);

	function handleCollectionQueryInput() {
		if (collectionSearchTimer) clearTimeout(collectionSearchTimer);
		const q = collectionQuery.trim();
		if (!q) {
			collectionResults = [];
			return;
		}
		collectionSearchTimer = setTimeout(async () => {
			collectionSearching = true;
			try {
				const res = await fetch(`/api/tmdb/collection/search?q=${encodeURIComponent(q)}`);
				if (res.ok) collectionResults = await res.json();
			} finally {
				collectionSearching = false;
			}
		}, 350);
	}

	function pickCollection(id: number, name: string) {
		collectionId = id;
		collectionName = name;
		collectionSearchOpen = false;
		collectionQuery = '';
		collectionResults = [];
	}

	function openCollectionSearch() {
		collectionSearchOpen = true;
		collectionQuery = '';
		collectionResults = [];
	}

	function handleSave() {
		onSave({
			monitored,
			scoringProfileId: qualityProfileId || null,
			desiredQualities: desiredQualities.length > 0 ? desiredQualities : null,
			delayProfileId,
			rootFolderId: rootFolderId || null,
			moveFilesOnRootChange,
			minimumAvailability,
			availabilityDelay,
			wantsSubtitles,
			...(folderPathChanged && folderPath.trim() ? { folderPath: folderPath.trim() } : {}),
			...(showRemoveUnwantedFiles && removeUnwantedFiles ? { removeUnwantedFiles: true } : {}),
			tmdbCollectionId: collectionId,
			collectionName
		});
	}
</script>

<ModalWrapper {open} {onClose} maxWidth="lg" labelledBy="movie-edit-modal-title">
	<!-- Header -->
	<div class="mb-4 flex items-center justify-between">
		<h3 id="movie-edit-modal-title" class="text-lg font-bold">{m.library_editMovie_title()}</h3>
		<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
			<X class="h-4 w-4" />
		</button>
	</div>

	<!-- Movie info -->
	<div class="mb-6 rounded-lg bg-base-200 p-3">
		<div class="font-medium">{movie.title}</div>
		{#if movie.year}
			<div class="text-sm text-base-content/60">{movie.year}</div>
		{/if}
	</div>

	<!-- Form -->
	<div class="space-y-4">
		<!-- Monitored -->
		<FormCheckbox
			bind:checked={monitored}
			label={m.common_monitored()}
			description={m.library_editMovie_monitoredDesc()}
			variant="toggle"
		/>

		<!-- Wants Subtitles -->
		<FormCheckbox
			bind:checked={wantsSubtitles}
			label={m.library_editMovie_autoDownloadSubtitles()}
			description={m.library_editMovie_autoDownloadSubtitlesDesc()}
			variant="toggle"
		/>

		<!-- Quality Profile -->
		<div class="form-control">
			<label class="label" for="movie-quality-profile">
				<span class="label-text font-medium">{m.common_qualityProfile()}</span>
			</label>
			<select
				id="movie-quality-profile"
				bind:value={qualityProfileId}
				class="select-bordered select w-full select-sm"
			>
				<option value=""
					>{m.library_movies_profileDefault({
						name: defaultProfile?.name ?? m.common_default()
					})}</option
				>
				{#each nonDefaultProfiles as profile (profile.id)}
					<option value={profile.id}>{profile.name}</option>
				{/each}
			</select>
			<div class="label">
				<span class="label-text-alt wrap-break-word whitespace-normal text-base-content/60">
					{#if currentProfile}
						{currentProfile.description}
					{:else}
						{m.library_editMovie_qualityProfileDesc()}
					{/if}
				</span>
			</div>
		</div>

		<!-- Desired Qualities (multi-quality mode) -->
		<DesiredQualitiesPicker
			bind:desiredQualities
			minResolution={profileForGating?.minResolution}
			maxResolution={profileForGating?.maxResolution}
		/>

		{#if showRemoveUnwantedFiles}
			<FormCheckbox
				bind:checked={removeUnwantedFiles}
				label="Remove {redundantFileIdList.length} file(s) for resolutions you no longer want"
				description="(sent to recycle bin if enabled)"
				variant="toggle"
				color="warning"
			/>
		{/if}

		<!-- Delay Profile -->
		{#if delayProfiles.length > 0}
			<div class="form-control">
				<label class="label" for="movie-delay-profile">
					<span class="label-text font-medium">Delay Profile</span>
				</label>
				<select
					id="movie-delay-profile"
					bind:value={delayProfileId}
					class="select-bordered select w-full select-sm"
				>
					<option value={null}>None (global default)</option>
					{#each delayProfiles as profile (profile.id)}
						<option value={profile.id}>{profile.name}</option>
					{/each}
				</select>
				<div class="label">
					<span class="label-text-alt wrap-break-word whitespace-normal text-base-content/60">
						Hold matching releases before grabbing. Configured in Quality Settings &gt; Delay
						Profiles.
					</span>
				</div>
			</div>
		{/if}

		<!-- Root Folder -->
		<div class="form-control">
			<label class="label" for="movie-root-folder">
				<span class="label-text font-medium">{m.common_rootFolder()}</span>
			</label>
			<select
				id="movie-root-folder"
				bind:value={rootFolderId}
				class="select-bordered select w-full select-sm"
			>
				{#if !rootFolderId}
					<option value="" disabled>{m.common_notSet()}</option>
				{/if}
				{#if selectedRootFolderOutOfPolicy && selectedRootFolderObj}
					<option value={selectedRootFolderObj.id}>{selectedRootFolderObj.path} (current)</option>
				{/if}
				{#each eligibleRootFolders as folder (folder.id)}
					<option value={folder.id}>
						{folder.path}
						{#if folder.freeSpaceBytes}
							({m.library_add_rootFolderFree({ free: formatBytes(folder.freeSpaceBytes) })})
						{/if}
					</option>
				{/each}
			</select>
			<div class="label">
				<span class="label-text-alt wrap-break-word whitespace-normal text-base-content/60">
					{m.library_add_rootFolderDesc()}
				</span>
			</div>
			{#if enforceAnimeSubtype}
				<div class="text-xs text-base-content/70">
					Anime root folder enforcement is enabled. New folder selections are limited to <strong
						>{requiredMediaSubType === 'anime' ? 'Anime' : 'Standard'}</strong
					> root folders for this movie.
				</div>
			{/if}
		</div>

		{#if canMoveExistingFiles}
			<FormCheckbox
				bind:checked={moveFilesOnRootChange}
				onchange={() => {
					moveOptionTouched = true;
				}}
				label="Move existing files to new root folder"
				description="Moves the existing movie folder after saving. Same-disk moves are instant; cross-disk moves copy then delete."
				variant="toggle"
				color="warning"
			/>
		{/if}

		<!-- Folder path correction -->
		{#if movie.path}
			<div class="form-control">
				<label class="label" for="movie-folder-path">
					<span class="label-text font-medium">Folder name</span>
				</label>
				{#if showFolderPicker}
					<FolderBrowser
						value={selectedRootFolderObj?.path ?? '/'}
						onSelect={(selected) => {
							const root = selectedRootFolderObj?.path ?? '';
							folderPath =
								root && selected.startsWith(root + '/')
									? selected.slice(root.length + 1)
									: selected;
							showFolderPicker = false;
						}}
						onCancel={() => (showFolderPicker = false)}
					/>
				{:else}
					<div class="join w-full">
						<input
							id="movie-folder-path"
							type="text"
							class="input-bordered input input-sm join-item flex-1 font-mono"
							bind:value={folderPath}
						/>
						<button
							type="button"
							class="btn join-item border border-base-300 btn-ghost btn-sm"
							onclick={() => (showFolderPicker = true)}
							title="Browse folders"
						>
							<FolderOpen class="h-4 w-4" />
						</button>
					</div>
					{#if resolvedFolderPath}
						<p class="mt-1 font-mono text-xs text-base-content/50">{resolvedFolderPath}</p>
					{/if}
					<p class="mt-1 text-xs text-base-content/60">
						Folder name relative to the root folder. Edit only if the name on disk no longer
						matches; saving will update the database and trigger a rescan to re-link existing files.
					</p>
					{#if folderPathChanged}
						<p class="mt-1 text-xs text-warning">
							Folder name changed. A rescan will run automatically after saving.
						</p>
					{/if}
				{/if}
			</div>
		{/if}

		<!-- Collection -->
		<div class="form-control">
			<div class="label">
				<span class="label-text font-medium">Collection</span>
			</div>

			{#if collectionSearchOpen}
				<!-- Inline search -->
				<div class="rounded-lg border border-base-300 bg-base-200 p-3 space-y-2">
					<div class="relative">
						<Search
							class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-base-content/40"
						/>
						<input
							type="text"
							placeholder="Search TMDB collections..."
							class="input input-sm w-full rounded-full border-base-content/20 bg-base-100 pl-9 pr-8 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200/60 focus:border-primary/50 focus:bg-base-200/60 focus:ring-1 focus:ring-primary/20 focus:outline-none"
							bind:value={collectionQuery}
							oninput={handleCollectionQueryInput}
						/>
						{#if collectionSearching}
							<RefreshCw
								class="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-base-content/40"
							/>
						{:else if collectionQuery}
							<button
								type="button"
								class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-base-content/40 hover:text-base-content"
								onclick={() => {
									collectionQuery = '';
									collectionResults = [];
								}}
								aria-label="Clear search">×</button
							>
						{/if}
					</div>
					{#if collectionResults.length > 0}
						<ul class="max-h-48 overflow-y-auto space-y-1">
							{#each collectionResults as col (col.id)}
								<li>
									<button
										type="button"
										class="flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm hover:bg-base-300 transition-colors"
										onclick={() => pickCollection(col.id, col.name)}
									>
										<div class="h-10 w-7 shrink-0 overflow-hidden rounded bg-base-300">
											{#if col.poster_path}
												<img
													src="https://image.tmdb.org/t/p/w92{col.poster_path}"
													alt={col.name}
													class="h-full w-full object-cover"
													loading="lazy"
												/>
											{:else}
												<div class="flex h-full w-full items-center justify-center">
													<Layers class="h-3 w-3 text-base-content/20" />
												</div>
											{/if}
										</div>
										<span class="truncate font-medium">{col.name}</span>
									</button>
								</li>
							{/each}
						</ul>
					{:else if collectionQuery.trim() && !collectionSearching}
						<p class="text-center text-xs text-base-content/50 py-2">No collections found</p>
					{/if}
					<button
						type="button"
						class="btn btn-ghost btn-xs w-full"
						onclick={() => {
							collectionSearchOpen = false;
							collectionQuery = '';
							collectionResults = [];
						}}
					>
						Cancel
					</button>
				</div>
			{:else}
				<!-- Current value display -->
				<div
					class="flex items-center gap-2 rounded-lg border border-base-300 bg-base-200 px-3 py-2 text-sm"
				>
					<Layers class="h-4 w-4 shrink-0 text-primary" />
					<span
						class="min-w-0 flex-1 truncate {collectionName ? '' : 'italic text-base-content/40'}"
					>
						{collectionName ?? 'No collection assigned'}
					</span>
					{#if collectionName}
						<button
							type="button"
							class="btn btn-ghost btn-xs text-error"
							onclick={() => {
								collectionId = null;
								collectionName = null;
							}}
							title="Remove collection"
						>
							<Trash2 class="h-3.5 w-3.5" />
						</button>
					{/if}
					<button
						type="button"
						class="btn btn-ghost btn-xs"
						onclick={openCollectionSearch}
						title="Change collection"
					>
						<Pencil class="h-3.5 w-3.5" />
					</button>
				</div>
			{/if}

			<div class="label">
				<span class="label-text-alt wrap-break-word whitespace-normal text-base-content/60">
					Used by the <code class="font-mono">{'{Collection}'}</code> naming token to organize movies
					into collection folders.
				</span>
			</div>
		</div>

		<!-- Minimum Availability -->
		<div class="form-control">
			<label class="label" for="movie-min-availability">
				<span class="label-text font-medium">{m.library_minimumAvailability()}</span>
			</label>
			<select
				id="movie-min-availability"
				bind:value={minimumAvailability}
				class="select-bordered select w-full select-sm"
			>
				{#each availabilityOptions as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
			<div class="label">
				<span class="label-text-alt wrap-break-word whitespace-normal text-base-content/60">
					{availabilityOptions.find((o) => o.value === minimumAvailability)?.description}
				</span>
			</div>
		</div>

		<!-- Availability Delay -->
		<div class="form-control">
			<label class="label" for="movie-availability-delay">
				<span class="label-text font-medium">{m.library_availabilityDelay_label()}</span>
			</label>
			<div class="flex items-center gap-2">
				<input
					id="movie-availability-delay"
					type="number"
					class="input-bordered input w-24 input-sm"
					min="0"
					max="365"
					bind:value={availabilityDelay}
				/>
				<span class="text-sm text-base-content/60">{m.library_availabilityDelay_unit()}</span>
			</div>
			<div class="label">
				<span class="label-text-alt wrap-break-word whitespace-normal text-base-content/60">
					{m.library_availabilityDelay_desc()}
				</span>
			</div>
		</div>
	</div>

	<!-- Actions -->
	<ModalFooter onCancel={onClose} onSave={handleSave} {saving} saveLabel={m.action_saveChanges()} />
</ModalWrapper>
