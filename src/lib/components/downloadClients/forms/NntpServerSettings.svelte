<script lang="ts">
	import { SectionHeader } from '$lib/components/ui/modal';

	interface Props {
		maxConnections: number;
		priority: number;
	}

	let { maxConnections = $bindable(), priority = $bindable() }: Props = $props();
</script>

<SectionHeader title="Server Settings" />

<div class="form-control">
	<label class="label py-1" for="maxConnections">
		<span class="label-text">Max Connections</span>
	</label>
	<input
		id="maxConnections"
		type="number"
		class="input-bordered input input-sm"
		bind:value={maxConnections}
		min="1"
		max="50"
	/>
	<div class="label py-1">
		<span class="label-text-alt text-xs">
			Check your usenet provider for connection limits (usually 10-50)
		</span>
	</div>
</div>

<div class="form-control">
	<label class="label py-1" for="priority">
		<span class="label-text">Priority</span>
	</label>
	<input
		id="priority"
		type="number"
		class="input-bordered input input-sm"
		bind:value={priority}
		min="0"
		max="99"
	/>
	<div class="label py-1">
		<span class="label-text-alt text-xs">
			Lower values = higher priority. Use for server failover.
		</span>
	</div>
</div>
