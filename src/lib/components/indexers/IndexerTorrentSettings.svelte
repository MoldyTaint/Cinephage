<script lang="ts">
	interface Props {
		minimumSeeders: number;
		seedRatio: string;
		seedTime: number | '';
		packSeedTime: number | '';
		rejectDeadTorrents: boolean;
	}

	let {
		minimumSeeders = $bindable(),
		seedRatio = $bindable(),
		seedTime = $bindable(),
		packSeedTime = $bindable(),
		rejectDeadTorrents = $bindable()
	}: Props = $props();
</script>

<div class="divider text-sm text-base-content/60">Torrent Settings</div>

<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
	<div class="form-control">
		<label class="label" for="minimumSeeders">
			<span class="label-text">Min Seeders</span>
		</label>
		<input
			type="number"
			id="minimumSeeders"
			class="input-bordered input input-sm w-full"
			min="0"
			bind:value={minimumSeeders}
		/>
	</div>

	<div class="form-control">
		<label class="label" for="seedRatio">
			<span class="label-text">Seed Ratio</span>
		</label>
		<input
			type="text"
			id="seedRatio"
			class="input-bordered input input-sm w-full"
			placeholder="e.g., 1.0"
			bind:value={seedRatio}
		/>
	</div>

	<div class="form-control">
		<label class="label" for="seedTime">
			<span class="label-text">Seed Time (min)</span>
		</label>
		<input
			type="number"
			id="seedTime"
			class="input-bordered input input-sm w-full"
			min="0"
			placeholder="Minutes"
			bind:value={seedTime}
		/>
	</div>

	<div class="form-control">
		<label class="label" for="packSeedTime">
			<span class="label-text">Pack Seed Time</span>
		</label>
		<input
			type="number"
			id="packSeedTime"
			class="input-bordered input input-sm w-full"
			min="0"
			placeholder="Minutes"
			bind:value={packSeedTime}
		/>
	</div>
</div>

<label class="flex cursor-pointer items-center gap-2 py-2">
	<input type="checkbox" class="checkbox shrink-0 checkbox-sm" bind:checked={rejectDeadTorrents} />
	<span class="text-sm">Reject Dead Torrents</span>
	<span class="text-xs text-base-content/50">(0 seeders)</span>
</label>
