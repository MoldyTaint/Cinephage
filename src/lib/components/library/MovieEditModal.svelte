<script lang="ts">
	import { X } from 'lucide-svelte';
	import type { LibraryMovie } from '$lib/types/library';
	import { ModalWrapper, ModalFooter } from '$lib/components/ui/modal';
	import { FormCheckbox } from '$lib/components/ui/form';
	import { sortRootFoldersForMediaType } from '$lib/utils/root-folders.js';
	import { isLikelyAnimeMedia } from '$lib/shared/anime-classification.js';
	import { toasts } from '$lib/stores/toast.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { formatBytes } from '$lib/utils/format.js';

	interface QualityProfile {
		id: string;
		name: string;
		description: string;
		isBuiltIn: boolean;
		isDefault: boolean;
	}

	interface RootFolder {
		id: string;
		name: string;
		path: string;
		mediaType: string;
		mediaSubType?: string | null;
		freeSpaceBytes: number | null;
	}

	interface TmdbMovieDetails {
		title?: string | null;
		original_title?: string | null;
		original_language?: string | null;
		production_countries?: Array<{ iso_3166_1?: string }> | null;
		genres?: Array<{ id?: number; name?: string }> | null;
	}

	interface Props {
		open: boolean;
		movie: LibraryMovie;
		qualityProfiles: QualityProfile[];
		rootFolders: RootFolder[];
		saving: boolean;
		onClose: () => void;
		onSave: (data: MovieEditData) => void;
	}

	export interface MovieEditData {
		monitored: boolean;
		scoringProfileId: string | null;
		rootFolderId: string | null;
		moveFilesOnRootChange: boolean;
		minimumAvailability: string;
		wantsSubtitles: boolean;
	}

	let { open, movie, qualityProfiles, rootFolders, saving, onClose, onSave }: Props = $props();

	// Form state (defaults only, effect syncs from props)
	let monitored = $state(true);
	let qualityProfileId = $state('');
	let rootFolderId = $state('');
	let minimumAvailability = $state('released');
	let wantsSubtitles = $state(true);
	let moveFilesOnRootChange = $state(false);
	let moveOptionTouched = $state(false);
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
			const [classificationRes, movieRes] = await Promise.all([
				fetch('/api/settings/library/classification'),
				fetch(`/api/tmdb/movie/${tmdbId}`)
			]);

			let nextEnforceAnimeSubtype = false;
			let nextDetectedAnime = false;

			if (classificationRes.ok) {
				const classificationData = await classificationRes.json();
				nextEnforceAnimeSubtype = classificationData?.enforceAnimeSubtype === true;
			}

			if (movieRes.ok) {
				const details: TmdbMovieDetails = await movieRes.json();
				nextDetectedAnime = isLikelyAnimeMedia({
					genres: details.genres,
					originalLanguage: details.original_language,
					productionCountries: details.production_countries,
					originCountries: details.production_countries
						?.map((country) => country.iso_3166_1)
						.filter((country): country is string => Boolean(country)),
					title: details.title,
					originalTitle: details.original_title
				});
			}

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
			rootFolderId = movie.rootFolderId ?? '';
			minimumAvailability = movie.minimumAvailability ?? 'released';
			wantsSubtitles = movie.wantsSubtitles ?? true;
			moveFilesOnRootChange = false;
			moveOptionTouched = false;
			animeRootWarningShown = false;
			enforceAnimeSubtype = false;
			detectedAnime = false;
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
		},
		{
			value: 'preDb',
			label: m.library_availability_preDbLabel(),
			description: m.library_availability_preDbDesc()
		}
	];

	// Get profile data for labels/description
	let defaultProfile = $derived(qualityProfiles.find((p) => p.isDefault));
	let nonDefaultProfiles = $derived(qualityProfiles.filter((p) => p.id !== defaultProfile?.id));
	let currentProfile = $derived(
		qualityProfiles.find((p) => p.id === qualityProfileId) ?? defaultProfile
	);

	function handleSave() {
		onSave({
			monitored,
			scoringProfileId: qualityProfileId || null,
			rootFolderId: rootFolderId || null,
			moveFilesOnRootChange,
			minimumAvailability,
			wantsSubtitles
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
				class="select-bordered select w-full"
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

		<!-- Root Folder -->
		<div class="form-control">
			<label class="label" for="movie-root-folder">
				<span class="label-text font-medium">{m.common_rootFolder()}</span>
			</label>
			<select
				id="movie-root-folder"
				bind:value={rootFolderId}
				class="select-bordered select w-full"
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

		<!-- Minimum Availability -->
		<div class="form-control">
			<label class="label" for="movie-min-availability">
				<span class="label-text font-medium">{m.library_minimumAvailability()}</span>
			</label>
			<select
				id="movie-min-availability"
				bind:value={minimumAvailability}
				class="select-bordered select w-full"
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
	</div>

	<!-- Actions -->
	<ModalFooter onCancel={onClose} onSave={handleSave} {saving} saveLabel={m.action_saveChanges()} />
</ModalWrapper>
