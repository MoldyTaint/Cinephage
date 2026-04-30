<script lang="ts">
	import { Loader2, Trash2, Clock } from 'lucide-svelte';

	interface Props {
		selectedCount: number;
		loading: boolean;
		onDelete: () => void;
		onPurgeExpired: () => void;
	}

	let { selectedCount, loading, onDelete, onPurgeExpired }: Props = $props();
</script>

<div class="mb-4 rounded-lg bg-base-200 p-3">
	<div class="mb-2 flex items-center justify-between gap-2">
		<span class="text-sm font-medium">{selectedCount} selected</span>
	</div>

	<div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
		<button class="btn gap-1 text-error btn-ghost btn-sm" onclick={onDelete} disabled={loading}>
			{#if loading}
				<Loader2 class="h-4 w-4 animate-spin" />
			{:else}
				<Trash2 class="h-4 w-4" />
			{/if}
			Delete Selected
		</button>

		<button class="btn gap-1 btn-ghost btn-sm" onclick={onPurgeExpired} disabled={loading}>
			{#if loading}
				<Loader2 class="h-4 w-4 animate-spin" />
			{:else}
				<Clock class="h-4 w-4" />
			{/if}
			Purge Expired
		</button>
	</div>
</div>
