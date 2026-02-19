<script lang="ts">
	import { X, Link, Trash2 } from 'lucide-svelte';
	import { unmatchedFilesStore } from '$lib/stores/unmatched-files.svelte.js';

	interface Props {
		onMatch?: () => void;
		onDelete?: () => void;
	}

	let { onMatch, onDelete }: Props = $props();

	let selectedCount = $derived(unmatchedFilesStore.selectedCount);

	function selectAll() {
		unmatchedFilesStore.selectAllFiles();
	}

	function clearSelection() {
		unmatchedFilesStore.clearSelection();
	}
</script>

{#if selectedCount > 0}
	<div class="sticky top-4 z-10 rounded-lg bg-primary p-3 shadow-lg">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex items-center gap-2 text-primary-content">
				<span class="font-semibold">
					{selectedCount} file{selectedCount !== 1 ? 's' : ''} selected
				</span>
			</div>
			<div class="flex flex-wrap gap-2">
				<button class="btn text-primary-content btn-ghost btn-sm" onclick={selectAll}>
					Select All
				</button>
				<button class="btn text-primary-content btn-ghost btn-sm" onclick={clearSelection}>
					<X class="h-4 w-4" />
					Clear
				</button>
				<div
					class="divider mx-0 divider-horizontal before:bg-primary-content/30 after:bg-primary-content/30"
				></div>
				<button class="btn bg-white text-primary btn-sm hover:bg-white/90" onclick={onMatch}>
					<Link class="h-4 w-4" />
					Match Selected
				</button>
				<button class="btn bg-white/20 text-white btn-sm hover:bg-white/30" onclick={onDelete}>
					<Trash2 class="h-4 w-4" />
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}
