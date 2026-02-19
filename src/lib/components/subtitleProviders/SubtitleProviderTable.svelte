<script lang="ts">
	import { ChevronUp, ChevronDown, Subtitles, GripVertical } from 'lucide-svelte';
	import SubtitleProviderRow from './SubtitleProviderRow.svelte';
	import type { SubtitleProviderConfig } from '$lib/server/subtitles/types';
	import type { ProviderDefinition } from '$lib/server/subtitles/providers/interfaces';

	interface SubtitleProviderWithDefinition extends SubtitleProviderConfig {
		definitionName?: string;
		definition?: ProviderDefinition;
	}

	type SortColumn = 'name' | 'priority' | 'enabled';
	type SortDirection = 'asc' | 'desc';

	interface Props {
		providers: SubtitleProviderWithDefinition[];
		selectedIds: Set<string>;
		sort: { column: SortColumn; direction: SortDirection };
		testingIds: Set<string>;
		onSelect: (id: string, selected: boolean) => void;
		onSelectAll: (selected: boolean) => void;
		onSort: (column: SortColumn) => void;
		onEdit: (provider: SubtitleProviderWithDefinition) => void;
		onDelete: (provider: SubtitleProviderWithDefinition) => void;
		onTest: (provider: SubtitleProviderWithDefinition) => void;
		onToggle: (provider: SubtitleProviderWithDefinition) => void;
		onReorder?: (providerIds: string[]) => void;
	}

	let {
		providers,
		selectedIds,
		sort,
		testingIds,
		onSelect,
		onSelectAll,
		onSort,
		onEdit,
		onDelete,
		onTest,
		onToggle,
		onReorder
	}: Props = $props();

	// Drag and drop state
	let draggedIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);
	let reorderMode = $state(false);

	const allSelected = $derived(
		providers.length > 0 && providers.every((p) => selectedIds.has(p.id))
	);
	const someSelected = $derived(providers.some((p) => selectedIds.has(p.id)) && !allSelected);

	function isSortedBy(column: SortColumn): boolean {
		return sort.column === column;
	}

	function isAscending(): boolean {
		return sort.direction === 'asc';
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
		if (!reorderMode || draggedIndex === null) return;
		event.preventDefault();

		if (draggedIndex !== dropIndex && onReorder) {
			// Create new order
			const newOrder = [...providers];
			const [removed] = newOrder.splice(draggedIndex, 1);
			newOrder.splice(dropIndex, 0, removed);

			// Call reorder callback with new ID order
			onReorder(newOrder.map((p) => p.id));
		}

		draggedIndex = null;
		dragOverIndex = null;
	}

	function handleDragEnd() {
		draggedIndex = null;
		dragOverIndex = null;
	}

	function toggleReorderMode() {
		reorderMode = !reorderMode;
		if (reorderMode) {
			// Switch to priority sort when entering reorder mode
			onSort('priority');
		}
	}
</script>

{#if providers.length === 0}
	<div class="flex flex-col items-center justify-center py-12 text-base-content/50">
		<Subtitles class="mb-4 h-12 w-12" />
		<p class="text-lg font-medium">No subtitle providers configured</p>
		<p class="text-sm">Add a provider to start searching for subtitles</p>
	</div>
{:else}
	<div class="overflow-x-auto">
		{#if onReorder}
			<div class="flex items-center justify-end border-b border-base-300 px-4 py-2">
				<button
					class="btn btn-sm {reorderMode ? 'btn-primary' : 'btn-ghost'}"
					onclick={toggleReorderMode}
				>
					<GripVertical class="h-4 w-4" />
					{reorderMode ? 'Done Reordering' : 'Reorder Priorities'}
				</button>
			</div>
		{/if}

		{#if reorderMode}
			<div class="flex items-center gap-2 bg-info/10 px-4 py-2 text-sm text-info">
				<GripVertical class="h-4 w-4" />
				Drag providers to reorder. Lower priority numbers are searched first.
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
					<th>Provider</th>
					<th>Features</th>
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
					<th class="text-center">Rate Limit</th>
					<th class="pl-4! text-start">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each providers as provider, index (provider.id)}
					<tr
						class="hover transition-colors {draggedIndex === index
							? 'opacity-70'
							: ''} {dragOverIndex === index ? 'bg-primary/5' : ''}"
						draggable={reorderMode}
						ondragstart={(e) => handleDragStart(e, index)}
						ondragover={(e) => handleDragOver(e, index)}
						ondragleave={handleDragLeave}
						ondrop={(e) => handleDrop(e, index)}
						ondragend={handleDragEnd}
					>
						<td class="w-10">
							{#if reorderMode}
								<div class="flex justify-center">
									<GripVertical class="h-4 w-4 cursor-grab text-base-content/50" />
								</div>
							{:else}
								<input
									type="checkbox"
									class="checkbox checkbox-sm"
									checked={selectedIds.has(provider.id)}
									onchange={(e) => onSelect(provider.id, e.currentTarget.checked)}
								/>
							{/if}
						</td>
						<SubtitleProviderRow
							{provider}
							testing={testingIds.has(provider.id)}
							{onEdit}
							{onDelete}
							{onTest}
							{onToggle}
						/>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
