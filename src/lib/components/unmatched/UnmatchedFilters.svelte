<script lang="ts">
	import { Clapperboard, Tv, Folder, List, Square, SquareCheck, RefreshCw } from 'lucide-svelte';
	import { unmatchedFilesStore } from '$lib/stores/unmatched-files.svelte.js';

	let filter = $derived(unmatchedFilesStore.filters.mediaType || 'all');
	let viewMode = $derived(unmatchedFilesStore.viewMode);
	let showCheckboxes = $state(false);
	let isProcessing = $state(false);

	function setFilter(value: 'all' | 'movie' | 'tv') {
		if (value === 'all') {
			unmatchedFilesStore.setFilter('mediaType', undefined);
		} else {
			unmatchedFilesStore.setFilter('mediaType', value);
		}
	}

	function setViewMode(mode: 'list' | 'folder') {
		unmatchedFilesStore.setViewMode(mode);
	}

	interface Props {
		onToggleCheckboxes?: (showing: boolean) => void;
	}

	let { onToggleCheckboxes }: Props = $props();

	function toggleCheckboxes() {
		showCheckboxes = !showCheckboxes;
		onToggleCheckboxes?.(showCheckboxes);
		if (!showCheckboxes) {
			unmatchedFilesStore.clearSelection();
		}
	}

	async function reprocessAll() {
		if (unmatchedFilesStore.files.length === 0) return;
		isProcessing = true;
		try {
			await unmatchedFilesStore.processAll();
		} finally {
			isProcessing = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<!-- Filters -->
		<div class="flex gap-2">
			<button
				class="btn btn-sm {filter === 'all' ? 'btn-primary' : 'btn-ghost'}"
				onclick={() => setFilter('all')}
			>
				All
			</button>
			<button
				class="btn btn-sm {filter === 'movie' ? 'btn-primary' : 'btn-ghost'}"
				onclick={() => setFilter('movie')}
			>
				<Clapperboard class="h-4 w-4" />
				Movies
			</button>
			<button
				class="btn btn-sm {filter === 'tv' ? 'btn-primary' : 'btn-ghost'}"
				onclick={() => setFilter('tv')}
			>
				<Tv class="h-4 w-4" />
				TV Shows
			</button>
		</div>

		<div class="flex gap-2">
			<!-- View Mode Toggle -->
			<div class="flex gap-1 rounded-lg bg-base-200 p-1">
				<button
					class="btn btn-sm {viewMode === 'list' ? 'btn-primary' : 'btn-ghost'}"
					onclick={() => setViewMode('list')}
					title="List View"
				>
					<List class="h-4 w-4" />
				</button>
				<button
					class="btn btn-sm {viewMode === 'folder' ? 'btn-primary' : 'btn-ghost'}"
					onclick={() => setViewMode('folder')}
					title="Folder View"
				>
					<Folder class="h-4 w-4" />
				</button>
			</div>

			<!-- Selection Toggle -->
			<button
				class="btn btn-sm {showCheckboxes ? 'btn-primary' : 'btn-ghost'}"
				onclick={toggleCheckboxes}
				disabled={unmatchedFilesStore.files.length === 0}
			>
				{#if showCheckboxes}
					<SquareCheck class="h-4 w-4" />
				{:else}
					<Square class="h-4 w-4" />
				{/if}
			</button>
		</div>
	</div>

	<!-- Reprocess Button -->
	<div class="flex justify-end">
		<button
			class="btn btn-outline btn-sm"
			onclick={reprocessAll}
			disabled={isProcessing || unmatchedFilesStore.files.length === 0}
		>
			<RefreshCw class="h-4 w-4 {isProcessing ? 'animate-spin' : ''}" />
			Re-process Files
		</button>
	</div>
</div>
