<script lang="ts">
	import { Calendar, Eye } from 'lucide-svelte';

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
	}

	let {
		tmdbId,
		minimumAvailability = $bindable(),
		monitored = $bindable(),
		collection,
		addEntireCollection = $bindable()
	}: Props = $props();

	const availabilityOptions: { value: MinimumAvailability; label: string; description: string }[] =
		[
			{
				value: 'announced',
				label: 'Announced',
				description: 'Search as soon as movie is announced'
			},
			{ value: 'inCinemas', label: 'In Cinemas', description: 'Search when movie is in cinemas' },
			{
				value: 'released',
				label: 'Released',
				description: 'Search when movie is released on disc/streaming'
			},
			{ value: 'preDb', label: 'PreDB', description: 'Search when movie appears on PreDB' }
		];

	// Collection movies not in library (excluding current movie)
	const missingCollectionMovies = $derived(
		collection?.parts?.filter((p) => !p.inLibrary && p.id !== tmdbId) ?? []
	);
</script>

<!-- Minimum Availability -->
<div class="form-control">
	<label class="label" for="minimum-availability">
		<span class="label-text flex items-center gap-2 font-medium">
			<Calendar class="h-4 w-4" />
			Minimum Availability
		</span>
	</label>
	<select
		id="minimum-availability"
		class="select-bordered select w-full"
		bind:value={minimumAvailability}
	>
		{#each availabilityOptions as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
	<div class="label">
		<span class="label-text-alt text-base-content/60">
			{availabilityOptions.find((o) => o.value === minimumAvailability)?.description}
		</span>
	</div>
</div>

<!-- Collection Option -->
{#if collection && missingCollectionMovies.length > 0}
	<div class="form-control">
		<label class="label cursor-pointer justify-start gap-4 rounded-lg bg-base-300/50 p-4">
			<input type="checkbox" class="checkbox checkbox-primary" bind:checked={addEntireCollection} />
			<div class="flex-1">
				<span class="label-text font-medium">
					Add entire {collection.name}
				</span>
				<span class="label-text-alt block text-base-content/60">
					Also add {missingCollectionMovies.length} other movie{missingCollectionMovies.length > 1
						? 's'
						: ''} from this collection
				</span>
			</div>
		</label>
	</div>
{/if}

<!-- Monitored Toggle -->
<div class="form-control">
	<label class="label cursor-pointer justify-start gap-4">
		<input type="checkbox" class="toggle toggle-primary" bind:checked={monitored} />
		<div>
			<span class="label-text flex items-center gap-2 font-medium">
				<Eye class="h-4 w-4" />
				Monitored
			</span>
			<span class="label-text-alt text-base-content/60">
				{monitored
					? 'Will search for releases and upgrades automatically'
					: 'Will not search for releases automatically'}
			</span>
		</div>
	</label>
</div>
