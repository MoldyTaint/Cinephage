<script lang="ts">
	import { FolderOpen, BarChart3, Search, Captions } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import { sortRootFoldersForMediaType } from '$lib/utils/root-folders.js';
	import * as m from '$lib/paraglide/messages.js';
	import { formatBytes } from '$lib/utils/format.js';
	import type { RootFolderWithSpaceAndDefault as RootFolder } from '$lib/types/downloadClient.js';

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
		requiredMediaSubType?: 'standard' | 'anime';
		onSearchOnAddInput?: () => void;
		onWantsSubtitlesInput?: () => void;
	}

	let {
		mediaType,
		rootFolders,
		scoringProfiles,
		selectedRootFolder = $bindable(),
		selectedScoringProfile = $bindable(),
		searchOnAdd = $bindable(),
		wantsSubtitles = $bindable(),
		requiredMediaSubType,
		onSearchOnAddInput,
		onWantsSubtitlesInput
	}: Props = $props();

	const filteredRootFolders = $derived(
		sortRootFoldersForMediaType(rootFolders, mediaType, requiredMediaSubType)
	);
	const selectedRootFolderObj = $derived(
		filteredRootFolders.find((f) => f.id === selectedRootFolder)
	);
	const selectedProfileObj = $derived(scoringProfiles.find((p) => p.id === selectedScoringProfile));
</script>

<!-- Root Folder Select -->
<div class="form-control min-w-0">
	<label class="label" for="root-folder">
		<span class="label-text flex items-center gap-2 font-medium">
			<FolderOpen class="h-4 w-4 shrink-0" />
			{m.common_rootFolder()}
		</span>
	</label>
	{#if filteredRootFolders.length === 0}
		<div class="alert text-sm alert-warning">
			<span
				>{#if requiredMediaSubType === 'anime'}
					No Anime root folders are available for this media type.
				{:else if requiredMediaSubType === 'standard'}
					No Standard root folders are available for this media type.
				{:else}
					{m.library_add_noRootFoldersConfigured({
						mediaType:
							mediaType === 'movie'
								? m.common_movies().toLowerCase()
								: m.common_tvShows().toLowerCase()
					})}
				{/if}
				<a href={resolve('/settings/general/libraries')} class="link"
					>{m.library_add_addOneInSettings()}</a
				>
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
						({m.library_add_rootFolderFree({ free: formatBytes(folder.freeSpaceBytes) })})
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
			{m.common_qualityProfile()}
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
	<input
		type="checkbox"
		class="toggle mt-0.5 shrink-0 toggle-success"
		bind:checked={searchOnAdd}
		onchange={() => onSearchOnAddInput?.()}
	/>
	<div class="min-w-0">
		<span class="flex items-center gap-2 text-sm font-medium">
			<Search class="h-4 w-4 shrink-0" />
			{m.library_add_searchImmediately()}
		</span>
		<p class="text-xs text-base-content/60">
			{searchOnAdd
				? m.library_add_searchImmediatelyDescYes()
				: m.library_add_searchImmediatelyDescNo()}
		</p>
	</div>
</label>

<!-- Auto-Download Subtitles Toggle -->
<label class="flex cursor-pointer items-start gap-4 py-2">
	<input
		type="checkbox"
		class="toggle mt-0.5 shrink-0 toggle-primary"
		bind:checked={wantsSubtitles}
		onchange={() => onWantsSubtitlesInput?.()}
	/>
	<div class="min-w-0">
		<span class="flex items-center gap-2 text-sm font-medium">
			<Captions class="h-4 w-4 shrink-0" />
			{m.library_add_autoDownloadSubtitles()}
		</span>
		<p class="text-xs text-base-content/60">
			{wantsSubtitles
				? m.library_add_autoDownloadSubtitlesYes()
				: m.library_add_autoDownloadSubtitlesNo()}
		</p>
	</div>
</label>
