<script lang="ts">
	import { ChevronUp, ChevronDown, Database, GripVertical } from 'lucide-svelte';
	import IndexerRow from './IndexerRow.svelte';
	import type { IndexerWithStatus, IndexerSort } from '$lib/types/indexer';

	interface Props {
		indexers: IndexerWithStatus[];
		selectedIds: Set<string>;
		sort: IndexerSort;
		canReorder: boolean;
		testingIds: Set<string>;
		togglingIds: Set<string>;
		onSelect: (id: string, selected: boolean) => void;
		onSelectAll: (selected: boolean) => void;
		onSort: (column: IndexerSort['column']) => void;
		onPrioritySortForReorder: () => void;
		onEdit: (indexer: IndexerWithStatus) => void;
		onDelete: (indexer: IndexerWithStatus) => void;
		onTest: (indexer: IndexerWithStatus) => void;
		onToggle: (indexer: IndexerWithStatus) => void;
		onReorder?: (indexerIds: string[]) => void;
	}

	let {
		indexers,
		selectedIds,
		sort,
		canReorder,
		testingIds,
		togglingIds,
		onSelect,
		onSelectAll,
		onSort,
		onPrioritySortForReorder,
		onEdit,
		onDelete,
		onTest,
		onToggle,
		onReorder
	}: Props = $props();

	let draggedIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);
	let reorderMode = $state(false);

	const allSelected = $derived(indexers.length > 0 && indexers.every((i) => selectedIds.has(i.id)));
	const someSelected = $derived(indexers.some((i) => selectedIds.has(i.id)) && !allSelected);
	const reorderDisabledReason = $derived(
		canReorder ? '' : 'Clear filters to reorder all indexers by priority'
	);

	function isSortedBy(column: IndexerSort['column']): boolean {
		return sort.column === column;
	}

	function isAscending(): boolean {
		return sort.direction === 'asc';
	}

	function toggleReorderMode() {
		if (!reorderMode && !canReorder) return;

		reorderMode = !reorderMode;
		draggedIndex = null;
		dragOverIndex = null;

		if (reorderMode) {
			onPrioritySortForReorder();
		}
	}

	function handleDragStart(event: DragEvent, index: number) {
		if (!reorderMode) return;
		draggedIndex = index;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', String(index));
		}
	}

	function handleDragOver(event: DragEvent, index: number) {
		if (!reorderMode || draggedIndex === null) return;
		event.preventDefault();
		dragOverIndex = index;
	}

	function handleDragLeave() {
		dragOverIndex = null;
	}

	function handleDrop(event: DragEvent, dropIndex: number) {
		if (!reorderMode || draggedIndex === null || !onReorder) return;
		event.preventDefault();

		if (draggedIndex !== dropIndex) {
			const reordered = [...indexers];
			const [moved] = reordered.splice(draggedIndex, 1);
			reordered.splice(dropIndex, 0, moved);
			onReorder(reordered.map((i) => i.id));
		}

		draggedIndex = null;
		dragOverIndex = null;
	}

	function handleDragEnd() {
		draggedIndex = null;
		dragOverIndex = null;
	}

	$effect(() => {
		if (!canReorder && reorderMode) {
			reorderMode = false;
			draggedIndex = null;
			dragOverIndex = null;
		}
	});
</script>

{#if indexers.length === 0}
	<div class="flex flex-col items-center justify-center py-12 text-base-content/50">
		<Database class="mb-4 h-12 w-12" />
		<p class="text-lg font-medium">No indexers configured</p>
		<p class="text-sm">Add an indexer to start searching for content</p>
	</div>
{:else}
	<div class="overflow-x-auto">
		{#if onReorder}
			<div class="flex items-center justify-end border-b border-base-300 px-4 py-2">
				<button
					class="btn btn-sm {reorderMode ? 'btn-primary' : 'btn-ghost'}"
					onclick={toggleReorderMode}
					disabled={!canReorder}
					title={reorderDisabledReason}
				>
					<GripVertical class="h-4 w-4" />
					{reorderMode ? 'Done Reordering' : 'Reorder Priorities'}
				</button>
			</div>
		{/if}

		{#if reorderMode}
			<div class="flex items-center gap-2 bg-info/10 px-4 py-2 text-sm text-info">
				<GripVertical class="h-4 w-4" />
				Drag indexers to reorder. Lower priority numbers are searched first.
			</div>
		{/if}

		<table class="table table-sm">
			<thead>
				<tr>
					<th class="w-10">
						{#if reorderMode}
							<GripVertical class="mx-auto h-4 w-4 text-base-content/50" />
						{:else}
							<input
								type="checkbox"
								class="checkbox checkbox-sm"
								checked={allSelected}
								indeterminate={someSelected}
								onchange={(e) => onSelectAll(e.currentTarget.checked)}
							/>
						{/if}
					</th>
					<th class="w-24">
						<button
							class="flex items-center gap-1 hover:text-primary"
							onclick={() => onSort('enabled')}
							disabled={reorderMode}
						>
							Status
							{#if isSortedBy('enabled') && !reorderMode}
								{#if isAscending()}
									<ChevronUp class="h-3 w-3" />
								{:else}
									<ChevronDown class="h-3 w-3" />
								{/if}
							{/if}
						</button>
					</th>
					<th>
						<button
							class="flex items-center gap-1 hover:text-primary"
							onclick={() => onSort('name')}
							disabled={reorderMode}
						>
							Name
							{#if isSortedBy('name') && !reorderMode}
								{#if isAscending()}
									<ChevronUp class="h-3 w-3" />
								{:else}
									<ChevronDown class="h-3 w-3" />
								{/if}
							{/if}
						</button>
					</th>
					<th>Definition</th>
					<th>
						<button
							class="flex items-center gap-1 hover:text-primary"
							onclick={() => onSort('protocol')}
							disabled={reorderMode}
						>
							Protocol
							{#if isSortedBy('protocol') && !reorderMode}
								{#if isAscending()}
									<ChevronUp class="h-3 w-3" />
								{:else}
									<ChevronDown class="h-3 w-3" />
								{/if}
							{/if}
						</button>
					</th>
					<th class="text-center">Search</th>
					<th class="text-center">
						<button
							class="mx-auto flex items-center gap-1 hover:text-primary"
							onclick={() => onSort('priority')}
							disabled={reorderMode}
						>
							Priority
							{#if isSortedBy('priority') && !reorderMode}
								{#if isAscending()}
									<ChevronUp class="h-3 w-3" />
								{:else}
									<ChevronDown class="h-3 w-3" />
								{/if}
							{/if}
						</button>
					</th>
					<th>URL</th>
					<th class="pl-4! text-start">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each indexers as indexer, index (indexer.id)}
					<IndexerRow
						{indexer}
						selected={selectedIds.has(indexer.id)}
						testing={testingIds.has(indexer.id)}
						toggling={togglingIds.has(indexer.id)}
						{reorderMode}
						isDragOver={dragOverIndex === index}
						isDragging={draggedIndex === index}
						{onSelect}
						{onEdit}
						{onDelete}
						{onTest}
						{onToggle}
						onDragStart={(e) => handleDragStart(e, index)}
						onDragOver={(e) => handleDragOver(e, index)}
						onDragLeave={handleDragLeave}
						onDrop={(e) => handleDrop(e, index)}
						onDragEnd={handleDragEnd}
					/>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
