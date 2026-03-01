<script lang="ts">
	import { FolderOpen, BarChart3, Search, Subtitles } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import { sortRootFoldersForMediaType } from '$lib/utils/root-folders.js';

	interface RootFolder {
		id: string;
		name: string;
		path: string;
		mediaType: string;
		isDefault?: boolean;
		freeSpaceBytes?: number | null;
	}

	interface ScoringProfile {
		id: string;
		name: string;
		description?: string;
		isBuiltIn: boolean;
		isDefault?: boolean;
	}

	interface Props {
		mediaType: 'movie' | 'tv';
		rootFolders: RootFolder[];
		scoringProfiles: ScoringProfile[];
		selectedRootFolder: string;
		selectedScoringProfile: string;
		searchOnAdd: boolean;
		wantsSubtitles: boolean;
	}

	let {
		mediaType,
		rootFolders,
		scoringProfiles,
		selectedRootFolder = $bindable(),
		selectedScoringProfile = $bindable(),
		searchOnAdd = $bindable(),
		wantsSubtitles = $bindable()
	}: Props = $props();

	const filteredRootFolders = $derived(sortRootFoldersForMediaType(rootFolders, mediaType));
	const selectedRootFolderObj = $derived(
		filteredRootFolders.find((f) => f.id === selectedRootFolder)
	);
	const selectedProfileObj = $derived(scoringProfiles.find((p) => p.id === selectedScoringProfile));

	function formatBytes(bytes: number | null | undefined): string {
		if (!bytes) return '';
		const gb = bytes / (1024 * 1024 * 1024);
		if (gb >= 1000) return `${(gb / 1024).toFixed(1)} TB`;
		return `${gb.toFixed(1)} GB`;
	}
</script>

<!-- Root Folder Select -->
<div class="form-control min-w-0">
	<label class="label" for="root-folder">
		<span class="label-text flex items-center gap-2 font-medium">
			<FolderOpen class="h-4 w-4 shrink-0" />
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
			class="select-bordered select w-full max-w-full"
			bind:value={selectedRootFolder}
		>
			{#each filteredRootFolders as folder (folder.id)}
				<option value={folder.id}>
					{folder.name}
					{#if folder.freeSpaceBytes}
						({formatBytes(folder.freeSpaceBytes)} free)
					{/if}
				</option>
			{/each}
		</select>
		{#if selectedRootFolderObj}
			<p class="mt-1 truncate text-xs text-base-content/60" title={selectedRootFolderObj.path}>
				{selectedRootFolderObj.path}
			</p>
		{/if}
	{/if}
</div>

<!-- Quality Profile Select -->
<div class="form-control min-w-0">
	<label class="label" for="scoring-profile">
		<span class="label-text flex items-center gap-2 font-medium">
			<BarChart3 class="h-4 w-4 shrink-0" />
			Quality Profile
		</span>
	</label>
	<select
		id="scoring-profile"
		class="select-bordered select w-full max-w-full"
		bind:value={selectedScoringProfile}
	>
		{#each scoringProfiles as profile (profile.id)}
			<option value={profile.id}>
				{profile.name}
			</option>
		{/each}
	</select>
	{#if selectedProfileObj?.description}
		<p class="mt-1 text-xs text-base-content/60">
			{selectedProfileObj.description}
		</p>
	{/if}
</div>

<!-- Search on Add Toggle -->
<label class="flex cursor-pointer items-start gap-4 py-2">
	<input type="checkbox" class="toggle mt-0.5 shrink-0 toggle-success" bind:checked={searchOnAdd} />
	<div class="min-w-0">
		<span class="flex items-center gap-2 text-sm font-medium">
			<Search class="h-4 w-4 shrink-0" />
			Search Immediately
		</span>
		<p class="text-xs text-base-content/60">
			{searchOnAdd ? 'Search and grab best release right now' : 'Let scheduler find releases later'}
		</p>
	</div>
</label>

<!-- Auto-Download Subtitles Toggle -->
<label class="flex cursor-pointer items-start gap-4 py-2">
	<input
		type="checkbox"
		class="toggle mt-0.5 shrink-0 toggle-primary"
		bind:checked={wantsSubtitles}
	/>
	<div class="min-w-0">
		<span class="flex items-center gap-2 text-sm font-medium">
			<Subtitles class="h-4 w-4 shrink-0" />
			Auto-Download Subtitles
		</span>
		<p class="text-xs text-base-content/60">
			{wantsSubtitles
				? 'Will automatically search and download subtitles when available'
				: 'Subtitles will not be downloaded automatically'}
		</p>
	</div>
</label>
