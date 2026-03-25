<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { X } from 'lucide-svelte';
	import { ModalWrapper, ModalFooter } from '$lib/components/ui/modal';
	import { FormCheckbox } from '$lib/components/ui/form';

	interface SeriesData {
		title: string;
		year: number | null;
		monitored: boolean | null;
		scoringProfileId: string | null;
		rootFolderId: string | null;
		seasonFolder: boolean | null;
		wantsSubtitles: boolean | null;
		seriesType: string | null;
	}

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
		freeSpaceBytes: number | null;
	}

	interface Props {
		open: boolean;
		series: SeriesData;
		qualityProfiles: QualityProfile[];
		rootFolders: RootFolder[];
		saving: boolean;
		onClose: () => void;
		onSave: (data: SeriesEditData) => void;
	}

	export interface SeriesEditData {
		monitored: boolean;
		scoringProfileId: string | null;
		rootFolderId: string | null;
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
		}
	});

	// Get profile data for labels/description
	let defaultProfile = $derived(qualityProfiles.find((p) => p.isDefault));
	let nonDefaultProfiles = $derived(qualityProfiles.filter((p) => p.id !== defaultProfile?.id));
	let currentProfile = $derived(
		qualityProfiles.find((p) => p.id === qualityProfileId) ?? defaultProfile
	);

	function formatBytes(bytes: number | null): string {
		if (!bytes) return m.common_unknown();
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	function handleSave() {
		onSave({
			monitored,
			scoringProfileId: qualityProfileId || null,
			rootFolderId: rootFolderId || null,
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
				<option value="">{m.library_seriesEdit_notSet()}</option>
				{#each rootFolders as folder (folder.id)}
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
		</div>
	</div>

	<!-- Actions -->
	<ModalFooter
		onCancel={onClose}
		onSave={handleSave}
		{saving}
		saveLabel={m.library_seriesEdit_saveChanges()}
	/>
</ModalWrapper>
