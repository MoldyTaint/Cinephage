<script lang="ts">
	import { FolderOpen, BarChart3, Search, Subtitles } from 'lucide-svelte';
	import { resolve } from '$app/paths';

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

	const filteredRootFolders = $derived(rootFolders.filter((f) => f.mediaType === mediaType));

	function formatBytes(bytes: number | null | undefined): string {
		if (!bytes) return '';
		const gb = bytes / (1024 * 1024 * 1024);
		if (gb >= 1000) return `${(gb / 1024).toFixed(1)} TB`;
		return `${gb.toFixed(1)} GB`;
	}
</script>

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
		<select id="root-folder" class="select-bordered select w-full" bind:value={selectedRootFolder}>
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
