<script lang="ts">
	import { Calendar, Eye } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages.js';

	export type MinimumAvailability = 'announced' | 'inCinemas' | 'released' | 'preDb';

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
		tmdbId: number;
		minimumAvailability: MinimumAvailability;
		monitored: boolean;
		collection: CollectionInfo | null;
		addEntireCollection: boolean;
		onMonitoredInput?: () => void;
	}

	let {
		tmdbId,
		minimumAvailability = $bindable(),
		monitored = $bindable(),
		collection,
		addEntireCollection = $bindable(),
		onMonitoredInput
	}: Props = $props();

	const availabilityOptions: { value: MinimumAvailability; label: string; description: string }[] =
		[
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

	// Collection movies not in library (excluding current movie)
	const missingCollectionMovies = $derived(
		collection?.parts?.filter((p) => !p.inLibrary && p.id !== tmdbId) ?? []
	);
</script>

<!-- Minimum Availability -->
<div class="form-control min-w-0">
	<label class="label" for="minimum-availability">
		<span class="label-text flex items-center gap-2 font-medium">
			<Calendar class="h-4 w-4 shrink-0" />
			{m.library_minimumAvailability()}
		</span>
	</label>
	<select
		id="minimum-availability"
		class="select-bordered select w-full max-w-full"
		bind:value={minimumAvailability}
	>
		{#each availabilityOptions as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
	<p class="mt-1 text-xs text-base-content/60">
		{availabilityOptions.find((o) => o.value === minimumAvailability)?.description}
	</p>
</div>

<!-- Collection Option -->
{#if collection && missingCollectionMovies.length > 0}
	<div class="form-control min-w-0">
		<label class="label cursor-pointer justify-start gap-4 rounded-lg bg-base-300/50 p-4">
			<input
				type="checkbox"
				class="checkbox shrink-0 checkbox-primary"
				bind:checked={addEntireCollection}
			/>
			<div class="min-w-0 flex-1">
				<span
					class="label-text block truncate font-medium"
					title={m.library_add_addEntireCollection({ name: collection.name })}
				>
					{m.library_add_addEntireCollection({ name: collection.name })}
				</span>
				<span class="label-text-alt block text-base-content/60">
					{m.library_add_alsoAddFromCollection({ count: missingCollectionMovies.length })}
				</span>
			</div>
		</label>
	</div>
{/if}

<!-- Monitored Toggle -->
<label class="flex cursor-pointer items-start gap-4 py-2">
	<input
		type="checkbox"
		class="toggle mt-0.5 shrink-0 toggle-primary"
		bind:checked={monitored}
		onchange={() => onMonitoredInput?.()}
	/>
	<div class="min-w-0">
		<span class="flex items-center gap-2 text-sm font-medium">
			<Eye class="h-4 w-4 shrink-0" />
			{m.common_monitored()}
		</span>
		<p class="text-xs text-base-content/60">
			{monitored ? m.library_add_monitoredDescYes() : m.library_add_monitoredDescNo()}
		</p>
	</div>
</label>
