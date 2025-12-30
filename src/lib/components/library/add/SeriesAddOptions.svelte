<script lang="ts">
	import { Eye, Tv, Calendar, Film, ChevronDown, ChevronUp } from 'lucide-svelte';
	import { SvelteSet } from 'svelte/reactivity';

	export type MonitorType =
		| 'all'
		| 'future'
		| 'missing'
		| 'existing'
		| 'firstSeason'
		| 'lastSeason'
		| 'recent'
		| 'pilot'
		| 'none';

	export type MonitorNewItems = 'all' | 'none';
	export type SeriesType = 'standard' | 'anime' | 'daily';

	interface Season {
		season_number: number;
		name: string;
		episode_count: number;
		air_date?: string;
		poster_path?: string;
	}

	interface Props {
		seasons: Season[];
		monitorType: MonitorType;
		monitorNewItems: MonitorNewItems;
		monitorSpecials: boolean;
		seriesType: SeriesType;
		seasonFolder: boolean;
		monitoredSeasons: SvelteSet<number>;
		showAdvanced: boolean;
	}

	let {
		seasons,
		monitorType = $bindable(),
		monitorNewItems = $bindable(),
		monitorSpecials = $bindable(),
		seriesType = $bindable(),
		seasonFolder = $bindable(),
		monitoredSeasons,
		showAdvanced = $bindable()
	}: Props = $props();

	let showSeasonSelection = $state(false);

	const monitorTypeOptions: { value: MonitorType; label: string; description: string }[] = [
		{ value: 'all', label: 'All Episodes', description: 'Monitor all episodes except specials' },
		{
			value: 'future',
			label: 'Future Episodes',
			description: 'Monitor episodes that have not aired yet'
		},
		{
			value: 'missing',
			label: 'Missing Episodes',
			description: 'Monitor episodes without files (excludes specials)'
		},
		{
			value: 'existing',
			label: 'Existing Episodes',
			description: 'Monitor episodes that already have files on disk'
		},
		{
			value: 'firstSeason',
			label: 'First Season',
			description: 'Monitor only the first season'
		},
		{
			value: 'lastSeason',
			label: 'Latest Season',
			description: 'Monitor only the most recent season'
		},
		{
			value: 'recent',
			label: 'Recent Episodes',
			description: 'Monitor episodes from the last 90 days + all future episodes'
		},
		{
			value: 'pilot',
			label: 'Pilot Episode',
			description: 'Monitor only the first episode (S01E01)'
		},
		{ value: 'none', label: 'None', description: 'Do not monitor any episodes automatically' }
	];

	const monitorNewItemsOptions: { value: MonitorNewItems; label: string; description: string }[] = [
		{
			value: 'all',
			label: 'All',
			description: 'Automatically monitor new seasons and episodes when they are added'
		},
		{
			value: 'none',
			label: 'None',
			description: 'Do not automatically monitor new seasons or episodes'
		}
	];

	const seriesTypeOptions: { value: SeriesType; label: string; description: string }[] = [
		{ value: 'standard', label: 'Standard', description: 'Episodes with S##E## numbering' },
		{ value: 'anime', label: 'Anime', description: 'Episodes with absolute numbering' },
		{ value: 'daily', label: 'Daily', description: 'Episodes with date-based numbering' }
	];

	// Check if all seasons are monitored
	const allSeasonsMonitored = $derived(
		seasons.length > 0 && seasons.every((s) => monitoredSeasons.has(s.season_number))
	);

	// Calculate monitoring summary for preview
	const monitoringSummary = $derived.by(() => {
		if (seasons.length === 0) return null;

		const regularSeasons = seasons.filter((s) => s.season_number > 0);
		const specials = seasons.find((s) => s.season_number === 0);
		const totalEpisodes = seasons.reduce((sum, s) => sum + s.episode_count, 0);
		const specialsEpisodes = specials?.episode_count ?? 0;
		const regularEpisodes = totalEpisodes - specialsEpisodes;

		// Calculate monitored seasons count
		const monitoredRegularSeasons = regularSeasons.filter((s) =>
			monitoredSeasons.has(s.season_number)
		).length;
		const monitoredSpecialsFlag = specials && monitoredSeasons.has(0);

		// Estimate monitored episodes based on monitor type
		let estimatedMonitoredEpisodes = 0;
		let monitorDescription = '';

		switch (monitorType) {
			case 'all':
				estimatedMonitoredEpisodes = regularEpisodes + (monitorSpecials ? specialsEpisodes : 0);
				monitorDescription = monitorSpecials
					? 'All episodes including specials'
					: 'All regular episodes';
				break;
			case 'future':
				monitorDescription = "Only episodes that haven't aired yet";
				estimatedMonitoredEpisodes = -1; // Unknown without air dates
				break;
			case 'missing':
				monitorDescription = 'Episodes without files (after import)';
				estimatedMonitoredEpisodes = -1;
				break;
			case 'existing':
				monitorDescription = 'Episodes with files (after import)';
				estimatedMonitoredEpisodes = -1;
				break;
			case 'firstSeason': {
				const firstSeason = regularSeasons.find((s) => s.season_number === 1);
				estimatedMonitoredEpisodes = firstSeason?.episode_count ?? 0;
				monitorDescription = 'First season only';
				break;
			}
			case 'lastSeason': {
				const lastSeason = regularSeasons[regularSeasons.length - 1];
				estimatedMonitoredEpisodes = lastSeason?.episode_count ?? 0;
				monitorDescription = 'Latest season only';
				break;
			}
			case 'recent':
				monitorDescription = 'Episodes from last 90 days + future';
				estimatedMonitoredEpisodes = -1;
				break;
			case 'pilot':
				estimatedMonitoredEpisodes = 1;
				monitorDescription = 'Pilot episode only (S01E01)';
				break;
			case 'none':
				estimatedMonitoredEpisodes = 0;
				monitorDescription = 'No automatic monitoring';
				break;
		}

		return {
			totalSeasons: regularSeasons.length,
			monitoredSeasons: monitoredRegularSeasons,
			hasSpecials: !!specials,
			specialsMonitored: monitoredSpecialsFlag,
			totalEpisodes,
			regularEpisodes,
			specialsEpisodes,
			estimatedMonitoredEpisodes,
			monitorDescription
		};
	});

	function toggleSeason(seasonNumber: number) {
		if (monitoredSeasons.has(seasonNumber)) {
			monitoredSeasons.delete(seasonNumber);
		} else {
			monitoredSeasons.add(seasonNumber);
		}
	}

	function toggleAllSeasons() {
		if (allSeasonsMonitored) {
			monitoredSeasons.clear();
		} else {
			for (const s of seasons) {
				monitoredSeasons.add(s.season_number);
			}
		}
	}
</script>

<!-- Monitored Toggle -->
<div class="form-control">
	<label class="label cursor-pointer justify-start gap-4">
		<input
			type="checkbox"
			class="toggle toggle-primary"
			checked={monitorType !== 'none'}
			onchange={(e) => {
				if (!e.currentTarget.checked) {
					monitorType = 'none';
				} else {
					monitorType = 'all';
				}
			}}
		/>
		<div>
			<span class="label-text flex items-center gap-2 font-medium">
				<Eye class="h-4 w-4" />
				Monitored
			</span>
			<span class="label-text-alt text-base-content/60">
				{monitorType !== 'none'
					? 'Will search for releases and upgrades automatically'
					: 'Will not search for releases automatically'}
			</span>
		</div>
	</label>
</div>

<!-- Monitor Type -->
<div class="form-control">
	<label class="label" for="monitor-type">
		<span class="label-text flex items-center gap-2 font-medium">
			<Tv class="h-4 w-4" />
			Monitor
		</span>
	</label>
	<select id="monitor-type" class="select-bordered select w-full" bind:value={monitorType}>
		{#each monitorTypeOptions as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
	<div class="label">
		<span class="label-text-alt text-base-content/60">
			{monitorTypeOptions.find((o) => o.value === monitorType)?.description}
		</span>
	</div>
</div>

<!-- Monitor New Items dropdown -->
<div class="form-control">
	<label class="label" for="monitor-new-items">
		<span class="label-text flex items-center gap-2 font-medium">
			<Calendar class="h-4 w-4" />
			Monitor New Items
		</span>
	</label>
	<select id="monitor-new-items" class="select-bordered select w-full" bind:value={monitorNewItems}>
		{#each monitorNewItemsOptions as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
	<div class="label">
		<span class="label-text-alt text-base-content/60">
			{monitorNewItemsOptions.find((o) => o.value === monitorNewItems)?.description}
		</span>
	</div>
</div>

<!-- Monitor Specials Toggle -->
<div class="form-control">
	<label class="label cursor-pointer justify-start gap-4">
		<input type="checkbox" class="toggle toggle-primary toggle-sm" bind:checked={monitorSpecials} />
		<div>
			<span class="label-text flex items-center gap-2 font-medium"> Monitor Specials </span>
			<span class="label-text-alt text-base-content/60">
				{monitorSpecials
					? 'Specials (Season 0) will be monitored'
					: 'Specials (Season 0) will not be monitored'}
			</span>
		</div>
	</label>
</div>

<!-- Season Selection (Expandable) -->
{#if seasons.length > 0}
	<div class="form-control">
		<button
			type="button"
			class="btn w-full justify-between btn-ghost btn-sm"
			onclick={() => (showSeasonSelection = !showSeasonSelection)}
		>
			<span class="flex items-center gap-2">
				<Film class="h-4 w-4" />
				Season Selection
				<span class="badge badge-sm badge-primary">{monitoredSeasons.size}/{seasons.length}</span>
			</span>
			{#if showSeasonSelection}
				<ChevronUp class="h-4 w-4" />
			{:else}
				<ChevronDown class="h-4 w-4" />
			{/if}
		</button>

		{#if showSeasonSelection}
			<div class="mt-2 space-y-2 rounded-lg bg-base-300/50 p-3">
				<!-- Toggle All -->
				<label class="flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-base-300">
					<input
						type="checkbox"
						class="checkbox checkbox-sm checkbox-primary"
						checked={allSeasonsMonitored}
						onchange={toggleAllSeasons}
					/>
					<span class="text-sm font-medium">Select All</span>
				</label>

				<div class="divider my-1"></div>

				<!-- Individual Seasons -->
				<div class="max-h-48 space-y-1 overflow-y-auto">
					{#each seasons as season (season.season_number)}
						<label class="flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-base-300">
							<input
								type="checkbox"
								class="checkbox checkbox-sm checkbox-primary"
								checked={monitoredSeasons.has(season.season_number)}
								onchange={() => toggleSeason(season.season_number)}
							/>
							<div class="min-w-0 flex-1">
								<span class="text-sm font-medium">
									{season.season_number === 0 ? 'Specials' : `Season ${season.season_number}`}
								</span>
								<span class="ml-2 text-xs text-base-content/60">
									{season.episode_count} episode{season.episode_count !== 1 ? 's' : ''}
								</span>
							</div>
							{#if season.air_date}
								<span class="text-xs text-base-content/50">
									{new Date(season.air_date).getFullYear()}
								</span>
							{/if}
						</label>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}

<!-- Monitoring Preview -->
{#if monitoringSummary}
	{@const summary = monitoringSummary}
	<div class="rounded-lg border border-primary/20 bg-primary/5 p-4">
		<h4 class="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
			<Eye class="h-4 w-4" />
			Monitoring Preview
		</h4>
		<p class="mb-3 text-sm text-base-content/70">{summary.monitorDescription}</p>
		<div class="grid grid-cols-2 gap-2 text-xs">
			<div class="rounded bg-base-200 px-2 py-1">
				<span class="text-base-content/50">Seasons:</span>
				<span class="ml-1 font-medium">{summary.monitoredSeasons}/{summary.totalSeasons}</span>
			</div>
			{#if summary.estimatedMonitoredEpisodes >= 0}
				<div class="rounded bg-base-200 px-2 py-1">
					<span class="text-base-content/50">Episodes:</span>
					<span class="ml-1 font-medium">~{summary.estimatedMonitoredEpisodes}</span>
				</div>
			{:else}
				<div class="rounded bg-base-200 px-2 py-1">
					<span class="text-base-content/50">Episodes:</span>
					<span class="ml-1 font-medium italic">Dynamic</span>
				</div>
			{/if}
			{#if summary.hasSpecials}
				<div class="col-span-2 rounded bg-base-200 px-2 py-1">
					<span class="text-base-content/50">Specials:</span>
					<span class="ml-1 font-medium">
						{summary.specialsMonitored
							? `Monitored (${summary.specialsEpisodes} eps)`
							: 'Not monitored'}
					</span>
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Advanced Options -->
<button
	type="button"
	class="divider cursor-pointer text-xs text-base-content/50"
	onclick={() => (showAdvanced = !showAdvanced)}
>
	{showAdvanced ? 'Hide' : 'Show'} Advanced Options
	{#if showAdvanced}
		<ChevronUp class="ml-1 inline h-3 w-3" />
	{:else}
		<ChevronDown class="ml-1 inline h-3 w-3" />
	{/if}
</button>

{#if showAdvanced}
	<!-- Series Type -->
	<div class="form-control">
		<label class="label" for="series-type">
			<span class="label-text font-medium">Series Type</span>
		</label>
		<select
			id="series-type"
			class="select-bordered select w-full select-sm"
			bind:value={seriesType}
		>
			{#each seriesTypeOptions as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
		<div class="label">
			<span class="label-text-alt text-base-content/60">
				{seriesTypeOptions.find((o) => o.value === seriesType)?.description}
			</span>
		</div>
	</div>

	<!-- Season Folder Toggle -->
	<div class="form-control">
		<label class="label cursor-pointer justify-start gap-4">
			<input type="checkbox" class="toggle toggle-primary toggle-sm" bind:checked={seasonFolder} />
			<div>
				<span class="label-text font-medium">Use Season Folders</span>
				<span class="label-text-alt text-base-content/60">
					{seasonFolder
						? 'Episodes organized in Season ## folders'
						: 'All episodes in series folder'}
				</span>
			</div>
		</label>
	</div>
{/if}
