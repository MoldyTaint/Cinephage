<script lang="ts">
	import { X, FolderOpen, Search, Layers, Trash2, Pencil, Info } from 'lucide-svelte';
	import { FolderBrowser } from '$lib/components/library';
	import type { LibraryMovie, DesiredQuality } from '$lib/types/library';
	import { ModalWrapper, ModalFooter } from '$lib/components/ui/modal';
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
		metadataLanguage?: string | null;
		preferOriginalTitle?: boolean;
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
	let collectionSearchTimer: ReturnType<typeof setTimeout> | null = null;
	let animeRootWarningShown = $state(false);
	let enforceAnimeSubtype = $state(false);
	let detectedAnime = $state(false);
	let metadataLanguage = $state<string | null>(null);
	let preferOriginalTitle = $state(false);

	const resolutionOptions = [
		{ value: '2160p' as DesiredQuality, label: '4K' },
		{ value: '1080p' as DesiredQuality, label: '1080p' },
		{ value: '720p' as DesiredQuality, label: '720p' },
		{ value: '480p' as DesiredQuality, label: '480p' }
	];

	function toggleDesiredQuality(value: DesiredQuality) {
		if (desiredQualities.includes(value)) {
			desiredQualities = desiredQualities.filter((r) => r !== value);
		} else {
			desiredQualities = [...desiredQualities, value];
		}
	}

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
			qualityProfileId = movie.scoringProfileId ?? '';
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
			metadataLanguage = movie.metadataLanguage ?? null;
			preferOriginalTitle = movie.preferOriginalTitle === true;
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
			try {
				const res = await fetch(`/api/tmdb/collection/search?q=${encodeURIComponent(q)}`);
				if (res.ok) collectionResults = await res.json();
			} catch {
				// ignore
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
			collectionName,
			metadataLanguage,
			preferOriginalTitle
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
	<div class="space-y-6">
		<!-- Monitoring -->
		<section>
			<h4
				class="mb-3 border-b border-base-300 pb-1.5 text-xs font-semibold tracking-wider text-base-content/50 uppercase"
			>
				Monitoring
			</h4>
			<div class="space-y-3">
				<div class="grid grid-cols-2 gap-3">
					<label class="label cursor-pointer">
						<span class="label-text text-xs text-base-content/80">{m.common_monitored()}</span>
						<input
							type="checkbox"
							class="toggle toggle-primary toggle-sm"
							bind:checked={monitored}
						/>
					</label>
					<label class="label cursor-pointer">
						<span class="label-text text-xs text-base-content/80"
							>{m.library_editMovie_autoDownloadSubtitles()}</span
						>
						<input
							type="checkbox"
							class="toggle toggle-primary toggle-sm"
							bind:checked={wantsSubtitles}
						/>
					</label>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div class="form-control w-full">
						<label class="label py-0.5" for="movie-quality-profile">
							<span class="label-text text-xs text-base-content/80"
								>{m.common_qualityProfile()}</span
							>
						</label>
						<select
							id="movie-quality-profile"
							bind:value={qualityProfileId}
							class="select-bordered select w-full select-sm"
						>
							{#if defaultProfile}
								<option value="" hidden
									>{m.library_movies_profileDefault({
										name: defaultProfile?.name ?? m.common_default()
									})}</option
								>
							{/if}
							<option value={defaultProfile?.id ?? ''}
								>{m.library_movies_profileDefault({
									name: defaultProfile?.name ?? m.common_default()
								})}</option
							>
							{#each nonDefaultProfiles as profile (profile.id)}
								<option value={profile.id}>{profile.name}</option>
							{/each}
						</select>
					</div>
					<div class="form-control w-full">
						<div class="label py-0.5">
							<span class="label-text text-xs text-base-content/80">Desired Qualities</span>
						</div>
						<div class="flex flex-wrap gap-1.5 pt-0.5">
							{#each resolutionOptions as option (option.value)}
								<button
									type="button"
									class="btn btn-xs {desiredQualities.includes(option.value)
										? 'btn-primary'
										: 'border border-base-300 btn-ghost'}"
									onclick={() => toggleDesiredQuality(option.value)}
								>
									{option.label}
								</button>
							{/each}
						</div>
					</div>
				</div>
				{#if showRemoveUnwantedFiles}
					<label class="label cursor-pointer">
						<span class="label-text text-warning"
							>Remove {redundantFileIdList.length} file(s) for unused resolutions</span
						>
						<input
							type="checkbox"
							class="toggle toggle-primary toggle-sm"
							bind:checked={removeUnwantedFiles}
						/>
					</label>
				{/if}
			</div>
		</section>

		<!-- Scheduling -->
		<section>
			<h4
				class="mb-3 border-b border-base-300 pb-1.5 text-xs font-semibold tracking-wider text-base-content/50 uppercase"
			>
				Scheduling
			</h4>
			<div class="grid grid-cols-3 gap-3">
				<div class="form-control w-full">
					<label class="label py-0.5" for="movie-delay-profile">
						<span class="label-text text-xs text-base-content/80">Delay Profile</span>
					</label>
					<select
						id="movie-delay-profile"
						bind:value={delayProfileId}
						class="select-bordered select w-full select-sm"
					>
						<option value={null}>None</option>
						{#each delayProfiles as profile (profile.id)}
							<option value={profile.id}>{profile.name}</option>
						{/each}
					</select>
				</div>
				<div class="form-control w-full">
					<label class="label py-0.5" for="movie-min-availability">
						<span class="label-text text-xs text-base-content/80"
							>{m.library_minimumAvailability()}</span
						>
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
				</div>
				<div class="form-control w-full">
					<label class="label py-0.5" for="movie-availability-delay">
						<span class="label-text text-xs text-base-content/80"
							>{m.library_availabilityDelay_label()}</span
						>
					</label>
					<div class="flex items-center gap-2">
						<input
							id="movie-availability-delay"
							type="number"
							class="input-bordered input w-20 input-sm"
							min="0"
							max="365"
							bind:value={availabilityDelay}
						/>
						<span class="text-xs text-base-content/80">{m.library_availabilityDelay_unit()}</span>
					</div>
				</div>
			</div>
		</section>

		<!-- Files -->
		<section>
			<h4
				class="mb-3 border-b border-base-300 pb-1.5 text-xs font-semibold tracking-wider text-base-content/50 uppercase"
			>
				Files
			</h4>
			<div class="space-y-3">
				<div class="form-control w-full">
					<label class="label py-0.5" for="movie-root-folder">
						<span class="label-text text-xs text-base-content/80">{m.common_rootFolder()}</span>
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
							<option value={selectedRootFolderObj.id}
								>{selectedRootFolderObj.path} (current)</option
							>
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
					{#if enforceAnimeSubtype}
						<div class="mt-1 text-xs text-base-content/70">
							Limited to <strong>{requiredMediaSubType === 'anime' ? 'Anime' : 'Standard'}</strong> root
							folders.
						</div>
					{/if}
				</div>
				<div class="form-control w-full">
					<div class="label py-0.5">
						<span class="label-text text-xs text-base-content/80">Collection</span>
					</div>
					{#if collectionSearchOpen}
						<div class="space-y-1.5 rounded-lg border border-base-300 bg-base-200 p-2">
							<div class="relative">
								<input
									type="text"
									placeholder="Search TMDB collections..."
									class="input w-full rounded-full border-base-content/20 bg-base-100 pr-7 pl-8 input-xs"
									bind:value={collectionQuery}
									oninput={handleCollectionQueryInput}
								/>
								<Search
									class="pointer-events-none absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2 text-base-content/40"
								/>
								{#if collectionQuery}
									<button
										type="button"
										class="absolute top-1/2 right-1.5 -translate-y-1/2 text-xs text-base-content/40 hover:text-base-content"
										onclick={() => {
											collectionQuery = '';
											collectionResults = [];
										}}>x</button
									>
								{/if}
							</div>
							{#if collectionResults.length > 0}
								<ul class="max-h-32 space-y-0.5 overflow-y-auto">
									{#each collectionResults as col (col.id)}
										<li>
											<button
												type="button"
												class="flex w-full items-center gap-1.5 rounded p-1 text-left text-xs hover:bg-base-300"
												onclick={() => pickCollection(col.id, col.name)}
											>
												<span class="truncate">{col.name}</span>
											</button>
										</li>
									{/each}
								</ul>
							{/if}
							<button
								type="button"
								class="btn w-full btn-ghost btn-xs"
								onclick={() => {
									collectionSearchOpen = false;
									collectionQuery = '';
									collectionResults = [];
								}}>Cancel</button
							>
						</div>
					{:else}
						<div
							class="flex items-center gap-2 rounded-lg border border-base-300 bg-base-200 px-3 py-2 text-sm"
						>
							<Layers class="h-4 w-4 shrink-0 text-primary" />
							<span
								class="min-w-0 flex-1 truncate {collectionName
									? ''
									: 'text-base-content/40 italic'}"
							>
								{collectionName ?? 'No collection'}
							</span>
							{#if collectionName}
								<button
									type="button"
									class="btn btn-ghost text-error btn-xs"
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
				</div>

				{#if canMoveExistingFiles}
					<label class="label cursor-pointer">
						<span class="label-text text-xs text-warning"
							>Move existing files to new root folder</span
						>
						<input
							type="checkbox"
							class="toggle toggle-primary toggle-sm"
							bind:checked={moveFilesOnRootChange}
							onchange={() => {
								moveOptionTouched = true;
							}}
						/>
					</label>
				{/if}

				{#if movie.path}
					<div class="form-control w-full">
						<label class="label py-0.5" for="movie-folder-path">
							<span class="label-text flex items-center gap-1 text-xs text-base-content/80">
								Folder name
								<span
									class="tooltip tooltip-right"
									data-tip="Folder name relative to the root folder. Edit only if the name on disk no longer matches; saving will update the database and trigger a rescan to re-link existing files."
								>
									<Info class="h-3 w-3 text-base-content/40" />
								</span>
							</span>
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
									class="input-bordered input join-item flex-1 font-mono input-sm"
									bind:value={folderPath}
								/>
								<button
									type="button"
									class="btn join-item border border-base-300 btn-ghost btn-sm"
									onclick={() => (showFolderPicker = true)}
									title="Browse"
								>
									<FolderOpen class="h-4 w-4" />
								</button>
							</div>
						{/if}
						{#if resolvedFolderPath}
							<p class="mt-1 font-mono text-xs text-base-content/50">{resolvedFolderPath}</p>
						{/if}
						{#if folderPathChanged}
							<p class="mt-1 text-xs text-warning">
								Folder name changed. A rescan will run after saving.
							</p>
						{/if}
					</div>
				{/if}
			</div>
		</section>

		<!-- Metadata -->
		<section>
			<h4
				class="mb-3 border-b border-base-300 pb-1.5 text-xs font-semibold tracking-wider text-base-content/50 uppercase"
			>
				Metadata
			</h4>
			<div class="grid grid-cols-2 gap-3">
				<div class="form-control w-full">
					<label class="label py-0.5" for="movie-metadata-language">
						<span class="label-text text-xs text-base-content/80">Language</span>
					</label>
					<select
						id="movie-metadata-language"
						bind:value={metadataLanguage}
						class="select-bordered select w-full select-sm"
					>
						<option value={null}>Inherit Global</option>
						<option value="original">Original Language</option>
						<option value="ar-SA">Arabic</option>
						<option value="zh-CN">Chinese (zh-CN)</option>
						<option value="zh-TW">Chinese (zh-TW)</option>
						<option value="da-DK">Danish</option>
						<option value="nl-NL">Dutch</option>
						<option value="en-US">English</option>
						<option value="fi-FI">Finnish</option>
						<option value="fr-FR">French</option>
						<option value="de-DE">German</option>
						<option value="he-IL">Hebrew</option>
						<option value="hi-IN">Hindi</option>
						<option value="it-IT">Italian</option>
						<option value="ja-JP">Japanese</option>
						<option value="ko-KR">Korean</option>
						<option value="no-NO">Norwegian</option>
						<option value="pl-PL">Polish</option>
						<option value="pt-BR">Portuguese</option>
						<option value="ru-RU">Russian</option>
						<option value="es-ES">Spanish</option>
						<option value="sv-SE">Swedish</option>
						<option value="th-TH">Thai</option>
						<option value="tr-TR">Turkish</option>
					</select>
				</div>
				<label class="label cursor-pointer">
					<span class="label-text text-xs text-base-content/80">Prefer Original Title</span>
					<input
						type="checkbox"
						class="toggle toggle-primary toggle-sm"
						bind:checked={preferOriginalTitle}
					/>
				</label>
			</div>
		</section>
	</div>

	<!-- Actions -->
	<ModalFooter onCancel={onClose} onSave={handleSave} {saving} saveLabel={m.action_saveChanges()} />
</ModalWrapper>
