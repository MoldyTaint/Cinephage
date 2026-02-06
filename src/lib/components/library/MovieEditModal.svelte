<script lang="ts">
	import { X } from 'lucide-svelte';
	import type { LibraryMovie } from '$lib/types/library';
	import { ModalWrapper, ModalFooter } from '$lib/components/ui/modal';
	import { FormCheckbox } from '$lib/components/ui/form';

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
		}
	});

	const availabilityOptions = [
		{ value: 'announced', label: 'Announced', description: 'Search as soon as movie is announced' },
		{ value: 'inCinemas', label: 'In Cinemas', description: 'Search when movie is in cinemas' },
		{
			value: 'released',
			label: 'Released',
			description: 'Search when movie is released on disc/streaming'
		},
		{ value: 'preDb', label: 'PreDB', description: 'Search when movie appears on PreDB' }
	];

	// Get profile data for labels/description
	let defaultProfile = $derived(qualityProfiles.find((p) => p.isDefault));
	let nonDefaultProfiles = $derived(qualityProfiles.filter((p) => p.id !== defaultProfile?.id));
	let currentProfile = $derived(
		qualityProfiles.find((p) => p.id === qualityProfileId) ?? defaultProfile
	);

	function formatBytes(bytes: number | null): string {
		if (!bytes) return 'Unknown';
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
			minimumAvailability,
			wantsSubtitles
		});
	}
</script>

<ModalWrapper {open} {onClose} maxWidth="lg" labelledBy="movie-edit-modal-title">
	<!-- Header -->
	<div class="mb-4 flex items-center justify-between">
		<h3 id="movie-edit-modal-title" class="text-lg font-bold">Edit Movie</h3>
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
			label="Monitored"
			description="Search for new releases and upgrades"
			variant="toggle"
		/>

		<!-- Wants Subtitles -->
		<FormCheckbox
			bind:checked={wantsSubtitles}
			label="Auto-Download Subtitles"
			description="Automatically search and download subtitles"
			variant="toggle"
		/>

		<!-- Quality Profile -->
		<div class="form-control">
			<label class="label" for="movie-quality-profile">
				<span class="label-text font-medium">Quality Profile</span>
			</label>
			<select
				id="movie-quality-profile"
				bind:value={qualityProfileId}
				class="select-bordered select w-full"
			>
				<option value="">{defaultProfile?.name ?? 'System Default'} (Default)</option>
				{#each nonDefaultProfiles as profile (profile.id)}
					<option value={profile.id}>{profile.name}</option>
				{/each}
			</select>
			<div class="label">
				<span class="label-text-alt break-words whitespace-normal text-base-content/60">
					{#if currentProfile}
						{currentProfile.description}
					{:else}
						Controls quality scoring and upgrade behavior
					{/if}
				</span>
			</div>
		</div>

		<!-- Root Folder -->
		<div class="form-control">
			<label class="label" for="movie-root-folder">
				<span class="label-text font-medium">Root Folder</span>
			</label>
			<select
				id="movie-root-folder"
				bind:value={rootFolderId}
				class="select-bordered select w-full"
			>
				<option value="">Not set</option>
				{#each rootFolders as folder (folder.id)}
					<option value={folder.id}>
						{folder.path}
						{#if folder.freeSpaceBytes}
							({formatBytes(folder.freeSpaceBytes)} free)
						{/if}
					</option>
				{/each}
			</select>
			<div class="label">
				<span class="label-text-alt break-words whitespace-normal text-base-content/60">
					Where downloaded files will be stored
				</span>
			</div>
		</div>

		<!-- Minimum Availability -->
		<div class="form-control">
			<label class="label" for="movie-min-availability">
				<span class="label-text font-medium">Minimum Availability</span>
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
				<span class="label-text-alt break-words whitespace-normal text-base-content/60">
					{availabilityOptions.find((o) => o.value === minimumAvailability)?.description}
				</span>
			</div>
		</div>
	</div>

	<!-- Actions -->
	<ModalFooter onCancel={onClose} onSave={handleSave} {saving} saveLabel="Save Changes" />
</ModalWrapper>
