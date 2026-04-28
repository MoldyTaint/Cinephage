<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { X } from 'lucide-svelte';
	import { ModalWrapper, ModalFooter } from '$lib/components/ui/modal';
	import { FormCheckbox } from '$lib/components/ui/form';
	import { sortRootFoldersForMediaType } from '$lib/utils/root-folders.js';
	import { isLikelyAnimeMedia } from '$lib/shared/anime-classification.js';
	import { toasts } from '$lib/stores/toast.svelte';
	import { formatBytes } from '$lib/utils/format.js';
	import type { RootFolderWithSpace as RootFolder } from '$lib/types/downloadClient.js';

	interface SeriesData {
		tmdbId: number;
		title: string;
		year: number | null;
		monitored: boolean | null;
		scoringProfileId: string | null;
		rootFolderId: string | null;
		episodeFileCount?: number | null;
		seasonFolder: boolean | null;
		wantsSubtitles: boolean | null;
		seriesType: string | null;
	}

	interface QualityProfileOption {
		id: string;
		name: string;
		description: string;
		isBuiltIn: boolean;
		isDefault: boolean;
	}

	interface TmdbTvDetails {
		name?: string | null;
		original_name?: string | null;
		original_language?: string | null;
		origin_country?: string[] | null;
		production_countries?: Array<{ iso_3166_1?: string }> | null;
		genres?: Array<{ id?: number; name?: string }> | null;
	}

	interface Props {
		open: boolean;
		series: SeriesData;
		qualityProfiles: QualityProfileOption[];
		rootFolders: RootFolder[];
		saving: boolean;
		onClose: () => void;
		onSave: (data: SeriesEditData) => void;
	}

	export interface SeriesEditData {
		monitored: boolean;
		scoringProfileId: string | null;
		rootFolderId: string | null;
		moveFilesOnRootChange: boolean;
		seasonFolder: boolean;
		wantsSubtitles: boolean;
		seriesType: 'standard' | 'anime' | 'daily';
	}

	let { open, series, qualityProfiles, rootFolders, saving, onClose, onSave }: Props = $props();

	// Form state (defaults only, effect syncs from props)
	let monitored = $state(true);
	let qualityProfileId = $state('');
	let rootFolderId = $state('');
	let seasonFolder = $state(true);
	let wantsSubtitles = $state(true);
	let seriesType = $state<'standard' | 'anime' | 'daily'>('standard');
	let moveFilesOnRootChange = $state(false);
	let moveOptionTouched = $state(false);
	let animeRootWarningShown = $state(false);
	let enforceAnimeSubtype = $state(false);
	let detectedAnime = $state(false);

	const requiredMediaSubType = $derived(
		enforceAnimeSubtype ? (detectedAnime ? ('anime' as const) : ('standard' as const)) : undefined
	);
	const eligibleRootFolders = $derived(
		sortRootFoldersForMediaType(rootFolders, 'tv', requiredMediaSubType)
	);
	const selectedRootFolderObj = $derived(rootFolders.find((folder) => folder.id === rootFolderId));
	const selectedRootFolderOutOfPolicy = $derived(
		requiredMediaSubType === 'anime' &&
			!!selectedRootFolderObj &&
			(selectedRootFolderObj.mediaSubType ?? 'standard') !== 'anime'
	);
	const hasExistingFiles = $derived((series.episodeFileCount ?? 0) > 0);
	const rootFolderChanged = $derived((rootFolderId || null) !== (series.rootFolderId ?? null));
	const canMoveExistingFiles = $derived(hasExistingFiles && rootFolderChanged && !!rootFolderId);

	async function loadAnimeRoutingContext(tmdbId: number) {
		try {
			const [classificationRes, tvRes] = await Promise.all([
				fetch('/api/settings/library/classification'),
				fetch(`/api/tmdb/tv/${tmdbId}`)
			]);

			let nextEnforceAnimeSubtype = false;
			let nextDetectedAnime = false;

			if (classificationRes.ok) {
				const classificationData = await classificationRes.json();
				nextEnforceAnimeSubtype = classificationData?.enforceAnimeSubtype === true;
			}

			if (tvRes.ok) {
				const details: TmdbTvDetails = await tvRes.json();
				nextDetectedAnime = isLikelyAnimeMedia({
					genres: details.genres,
					originalLanguage: details.original_language,
					originCountries: details.origin_country,
					productionCountries: details.production_countries,
					title: details.name,
					originalTitle: details.original_name
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

	const seriesTypeOptions: Array<{
		value: 'standard' | 'anime' | 'daily';
		label: string;
		description: string;
	}> = [
		{
			value: 'standard',
			label: m.library_seriesEdit_standard(),
			description: m.library_seriesEdit_standardDesc()
		},
		{
			value: 'anime',
			label: m.library_seriesEdit_anime(),
			description: m.library_seriesEdit_animeDesc()
		},
		{
			value: 'daily',
			label: m.library_seriesEdit_daily(),
			description: m.library_seriesEdit_dailyDesc()
		}
	];

	function normalizeSeriesType(value: string | null | undefined): 'standard' | 'anime' | 'daily' {
		return value === 'anime' || value === 'daily' ? value : 'standard';
	}

	// Reset form when modal opens
	$effect(() => {
		if (open) {
			monitored = series.monitored ?? true;
			const defaultProfileId = qualityProfiles.find((p) => p.isDefault)?.id;
			qualityProfileId =
				series.scoringProfileId && series.scoringProfileId !== defaultProfileId
					? series.scoringProfileId
					: '';
			rootFolderId = series.rootFolderId ?? '';
			seasonFolder = series.seasonFolder ?? true;
			wantsSubtitles = series.wantsSubtitles ?? true;
			seriesType = normalizeSeriesType(series.seriesType);
			moveFilesOnRootChange = false;
			moveOptionTouched = false;
			animeRootWarningShown = false;
			enforceAnimeSubtype = false;
			detectedAnime = false;
			void loadAnimeRoutingContext(series.tmdbId);
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

		toasts.warning(m.library_seriesEdit_animeRootWarningTitle(), {
			description: m.library_seriesEdit_animeRootWarningDesc()
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
			seasonFolder,
			wantsSubtitles,
			seriesType
		});
	}
</script>

<ModalWrapper {open} {onClose} maxWidth="lg" labelledBy="series-edit-modal-title">
	<!-- Header -->
	<div class="mb-4 flex items-center justify-between">
		<h3 id="series-edit-modal-title" class="text-lg font-bold">{m.library_seriesEdit_title()}</h3>
		<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
			<X class="h-4 w-4" />
		</button>
	</div>

	<!-- Series info -->
	<div class="mb-6 rounded-lg bg-base-200 p-3">
		<div class="font-medium">{series.title}</div>
		{#if series.year}
			<div class="text-sm text-base-content/60">{series.year}</div>
		{/if}
	</div>

	<!-- Form -->
	<div class="space-y-4">
		<!-- Monitored -->
		<FormCheckbox
			bind:checked={monitored}
			label={m.common_monitored()}
			description={m.library_seriesEdit_monitoredDesc()}
			variant="toggle"
		/>

		<!-- Season Folder -->
		<FormCheckbox
			bind:checked={seasonFolder}
			label={m.library_seriesEdit_seasonFolders()}
			description={m.library_seriesEdit_seasonFoldersDesc()}
			variant="toggle"
			color="secondary"
		/>

		<!-- Wants Subtitles -->
		<FormCheckbox
			bind:checked={wantsSubtitles}
			label={m.library_seriesEdit_autoDownloadSubtitles()}
			description={m.library_seriesEdit_autoDownloadSubtitlesDesc()}
			variant="toggle"
		/>

		<!-- Series Type -->
		<div class="form-control">
			<label class="label" for="series-type">
				<span class="label-text font-medium">{m.library_seriesEdit_seriesType()}</span>
			</label>
			<select id="series-type" bind:value={seriesType} class="select-bordered select w-full">
				{#each seriesTypeOptions as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
			<div class="label">
				<span class="label-text-alt wrap-break-word whitespace-normal text-base-content/60">
					{seriesTypeOptions.find((option) => option.value === seriesType)?.description}
				</span>
			</div>
		</div>

		<!-- Quality Profile -->
		<div class="form-control">
			<label class="label" for="series-quality-profile">
				<span class="label-text font-medium">{m.library_seriesEdit_qualityProfile()}</span>
			</label>
			<select
				id="series-quality-profile"
				bind:value={qualityProfileId}
				class="select-bordered select w-full"
			>
				<option value="">{defaultProfile?.name ?? m.common_default()} ({m.common_default()})</option
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
						{m.library_seriesEdit_qualityProfileDesc()}
					{/if}
				</span>
			</div>
		</div>

		<!-- Root Folder -->
		<div class="form-control">
			<label class="label" for="series-root-folder">
				<span class="label-text font-medium">{m.library_seriesEdit_rootFolder()}</span>
			</label>
			<select
				id="series-root-folder"
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
							({formatBytes(folder.freeSpaceBytes)} {m.library_seriesEdit_free()})
						{/if}
					</option>
				{/each}
			</select>
			<div class="label">
				<span class="label-text-alt wrap-break-word whitespace-normal text-base-content/60">
					{m.library_seriesEdit_rootFolderDesc()}
				</span>
			</div>
			{#if enforceAnimeSubtype}
				<div class="text-xs text-base-content/70">
					Anime root folder enforcement is enabled. New folder selections are limited to <strong
						>{requiredMediaSubType === 'anime' ? 'Anime' : 'Standard'}
					</strong> root folders for this series.
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
				description="Moves the existing series folder after saving. Same-disk moves are instant; cross-disk moves copy then delete."
				variant="toggle"
				color="warning"
			/>
		{/if}
	</div>

	<!-- Actions -->
	<ModalFooter
		onCancel={onClose}
		onSave={handleSave}
		{saving}
		saveLabel={m.library_seriesEdit_saveChanges()}
	/>
</ModalWrapper>
