<script lang="ts">
	import { Loader2, CheckCircle, XCircle, Trash2, FlaskConical } from 'lucide-svelte';

	interface Props {
		selectedCount: number;
		loading: boolean;
		onEnable: () => void;
		onDisable: () => void;
		onDelete: () => void;
		onTestAll: () => void;
	}

	let { selectedCount, loading, onEnable, onDisable, onDelete, onTestAll }: Props = $props();
</script>

<div class="mb-4 flex items-center gap-2 rounded-lg bg-base-200 p-3">
	<span class="text-sm font-medium">{selectedCount} selected</span>

	<div class="divider mx-1 divider-horizontal"></div>

	<button class="btn gap-1 btn-ghost btn-sm" onclick={onEnable} disabled={loading}>
		{#if loading}
			<Loader2 class="h-4 w-4 animate-spin" />
		{:else}
			<CheckCircle class="h-4 w-4" />
		{/if}
		Enable
	</button>

	<button class="btn gap-1 btn-ghost btn-sm" onclick={onDisable} disabled={loading}>
		{#if loading}
			<Loader2 class="h-4 w-4 animate-spin" />
		{:else}
			<XCircle class="h-4 w-4" />
		{/if}
		Disable
	</button>

	<button class="btn gap-1 btn-ghost btn-sm" onclick={onTestAll} disabled={loading}>
		{#if loading}
			<Loader2 class="h-4 w-4 animate-spin" />
		{:else}
			<FlaskConical class="h-4 w-4" />
		{/if}
		Test
	</button>

	<button class="btn gap-1 text-error btn-ghost btn-sm" onclick={onDelete} disabled={loading}>
		{#if loading}
			<Loader2 class="h-4 w-4 animate-spin" />
		{:else}
			<Trash2 class="h-4 w-4" />
		{/if}
		Delete
	</button>
</div>
