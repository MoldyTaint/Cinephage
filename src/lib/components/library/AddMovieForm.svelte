<script lang="ts">
	import CommonOptions from './add/CommonOptions.svelte';
	import MovieAddOptions, { type MinimumAvailability } from './add/MovieAddOptions.svelte';
	import type { RootFolderWithSpaceAndDefault as RootFolder } from '$lib/types/downloadClient.js';

	interface ScoringProfile {
		id: string;
		name: string;
		description?: string;
		isBuiltIn: boolean;
		isDefault?: boolean;
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

	interface Props {
		title: string;
		year?: number;
		posterPath?: string | null;
		tmdbId: number;
		rootFolders: RootFolder[];
		scoringProfiles: ScoringProfile[];
		selectedRootFolder: string;
		selectedScoringProfile: string;
		searchOnAdd: boolean;
		wantsSubtitles: boolean;
		minimumAvailability: MinimumAvailability;
		monitored: boolean;
		collection: CollectionInfo | null;
		addEntireCollection: boolean;
		error: string | null;
		enforceAnimeSubtype: boolean;
		requiredMediaSubType?: 'standard' | 'anime';
		onSearchOnAddInput?: () => void;
		onWantsSubtitlesInput?: () => void;
		onMonitoredInput?: () => void;
	}

	let {
		title,
		year,
		posterPath,
		tmdbId,
		rootFolders,
		scoringProfiles,
		selectedRootFolder = $bindable(),
		selectedScoringProfile = $bindable(),
		searchOnAdd = $bindable(),
		wantsSubtitles = $bindable(),
		minimumAvailability = $bindable(),
		monitored = $bindable(),
		collection,
		addEntireCollection = $bindable(),
		error,
		enforceAnimeSubtype,
		requiredMediaSubType,
		onSearchOnAddInput,
		onWantsSubtitlesInput,
		onMonitoredInput
	}: Props = $props();
</script>

<div class="space-y-5">
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
			<span class="mt-1 badge badge-sm badge-info">Movie</span>
		</div>
	</div>

	{#if error}
		<div class="alert alert-error">
			<span>{error}</span>
		</div>
	{/if}

	{#if enforceAnimeSubtype}
		<div class="alert text-sm alert-info">
			<span
				>{requiredMediaSubType === 'anime'
					? 'Anime detected. Only folders with subtype Anime are available.'
					: 'Anime root folder enforcement is enabled. Only Standard folders are available.'}</span
			>
		</div>
	{/if}

	<CommonOptions
		mediaType="movie"
		{rootFolders}
		{scoringProfiles}
		{requiredMediaSubType}
		{onSearchOnAddInput}
		{onWantsSubtitlesInput}
		bind:selectedRootFolder
		bind:selectedScoringProfile
		bind:searchOnAdd
		bind:wantsSubtitles
	/>

	<MovieAddOptions
		{tmdbId}
		{onMonitoredInput}
		bind:minimumAvailability
		bind:monitored
		{collection}
		bind:addEntireCollection
	/>
</div>
