<script lang="ts">
	import { X, Eye, EyeOff, Sliders, Trash2, Loader2 } from 'lucide-svelte';
	import { mediaTypeCountLabel, type MediaType } from '$lib/utils/media-type';

	interface Props {
		selectedCount: number;
		loading: boolean;
		currentAction: 'monitor' | 'unmonitor' | 'quality' | 'delete' | null;
		mediaType: MediaType;
		onMonitor: () => void;
		onUnmonitor: () => void;
		onChangeQuality: () => void;
		onDelete: () => void;
		onClear: () => void;
	}

	let {
		selectedCount,
		loading,
		currentAction,
		mediaType,
		onMonitor,
		onUnmonitor,
		onChangeQuality,
		onDelete,
		onClear
	}: Props = $props();

	const itemLabel = $derived(mediaTypeCountLabel(mediaType, selectedCount));
</script>

{#if selectedCount > 0}
	<div
		class="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-50 mx-auto max-w-fit"
	>
		<div
			class="flex items-center gap-2 rounded-full border border-base-content/10 bg-base-300 px-3 py-2 shadow-xl sm:gap-3 sm:px-4 sm:py-2.5"
		>
			<span class="text-sm font-medium">
				{selectedCount}
				{itemLabel} selected
			</span>

			<div class="h-4 w-px bg-base-content/20"></div>

			<div class="flex items-center gap-1">
				<button
					class="btn gap-1.5 btn-ghost btn-sm"
					onclick={onMonitor}
					disabled={loading}
					title="Monitor selected"
				>
					{#if loading && currentAction === 'monitor'}
						<Loader2 size={16} class="animate-spin" />
					{:else}
						<Eye size={16} />
					{/if}
					<span class="hidden sm:inline">Monitor</span>
				</button>

				<button
					class="btn gap-1.5 btn-ghost btn-sm"
					onclick={onUnmonitor}
					disabled={loading}
					title="Unmonitor selected"
				>
					{#if loading && currentAction === 'unmonitor'}
						<Loader2 size={16} class="animate-spin" />
					{:else}
						<EyeOff size={16} />
					{/if}
					<span class="hidden sm:inline">Unmonitor</span>
				</button>

				<button
					class="btn gap-1.5 btn-ghost btn-sm"
					onclick={onChangeQuality}
					disabled={loading}
					title="Change quality profile"
				>
					{#if loading && currentAction === 'quality'}
						<Loader2 size={16} class="animate-spin" />
					{:else}
						<Sliders size={16} />
					{/if}
					<span class="hidden sm:inline">Quality</span>
				</button>

				<button
					class="btn gap-1.5 text-error btn-ghost btn-sm hover:bg-error/10"
					onclick={onDelete}
					disabled={loading}
					title="Delete files"
				>
					{#if loading && currentAction === 'delete'}
						<Loader2 size={16} class="animate-spin" />
					{:else}
						<Trash2 size={16} />
					{/if}
					<span class="hidden sm:inline">Delete</span>
				</button>
			</div>

			<div class="h-4 w-px bg-base-content/20"></div>

			<button
				class="btn btn-circle btn-ghost btn-sm"
				onclick={onClear}
				disabled={loading}
				title="Clear selection"
			>
				<X size={16} />
			</button>
		</div>
	</div>
{/if}
