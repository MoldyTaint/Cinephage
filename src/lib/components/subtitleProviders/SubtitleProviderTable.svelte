<script lang="ts">
	import {
		ChevronUp,
		ChevronDown,
		Subtitles,
		GripVertical,
		Loader2,
		FlaskConical,
		ToggleLeft,
		ToggleRight,
		Settings,
		Trash2
	} from 'lucide-svelte';
	import SubtitleProviderRow from './SubtitleProviderRow.svelte';
	import SubtitleProviderStatusBadge from './SubtitleProviderStatusBadge.svelte';
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

	function getProviderLabel(provider: SubtitleProviderWithDefinition): string {
		return provider.definitionName ?? provider.definition?.name ?? provider.implementation;
	}

	function getSurfacedFeatures(provider: SubtitleProviderWithDefinition): string[] {
		const features = [...(provider.definition?.features ?? [])];

		if (features.length < 3) {
			if (provider.definition?.supportsHashSearch) {
				features.push('Hash matching');
			}
			if (provider.definition?.requiresApiKey || provider.definition?.accessType === 'api-key') {
				features.push('API access');
			}
			if (
				provider.definition?.requiresCredentials ||
				provider.definition?.accessType === 'free-account' ||
				provider.definition?.accessType === 'paid' ||
				provider.definition?.accessType === 'vip'
			) {
				features.push('Account auth');
			}
		}

		const unique = Array.from(new Set(features));
		const defaults = ['Subtitle search', 'Language matching', 'Provider API'];
		let idx = 0;
		while (unique.length < 3 && idx < defaults.length) {
			if (!unique.includes(defaults[idx])) {
				unique.push(defaults[idx]);
			}
			idx += 1;
		}

		return unique.slice(0, 3);
	}

	function getCompactFeatureLabel(feature: string): string {
		const normalized = feature.trim();
		const compactMap: Record<string, string> = {
			'No API key required': 'No API key',
			'API key required': 'API key',
			'Movies & TV subtitles': 'Movies & TV',
			'Multi-language subtitles': 'Multi-language'
		};
		const compact = compactMap[normalized] ?? normalized;
		return compact.length > 16 ? `${compact.slice(0, 15)}...` : compact;
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
			const newOrder = [...providers];
			const [removed] = newOrder.splice(draggedIndex, 1);
			newOrder.splice(dropIndex, 0, removed);
			onReorder(newOrder.map((p) => p.id));
		}

		draggedIndex = null;
		dragOverIndex = null;
	}

	function handleDragEnd() {
		draggedIndex = null;
		dragOverIndex = null;
	}

	function moveProvider(fromIndex: number, toIndex: number) {
		if (!onReorder || !reorderMode) return;
		if (toIndex < 0 || toIndex >= providers.length || fromIndex === toIndex) return;

		const reordered = [...providers];
		const [moved] = reordered.splice(fromIndex, 1);
		reordered.splice(toIndex, 0, moved);
		onReorder(reordered.map((p) => p.id));
	}

	function toggleReorderMode() {
		if (!onReorder) return;
		reorderMode = !reorderMode;
		draggedIndex = null;
		dragOverIndex = null;
		if (reorderMode) {
			onSort('priority');
		}
	}

	$effect(() => {
		if (!onReorder && reorderMode) {
			reorderMode = false;
			draggedIndex = null;
			dragOverIndex = null;
		}
	});
</script>

{#if providers.length === 0}
	<div class="flex flex-col items-center justify-center py-12 text-base-content/50">
		<Subtitles class="mb-4 h-12 w-12" />
		<p class="text-lg font-medium">No subtitle providers configured</p>
		<p class="text-sm">Add a provider to start searching for subtitles</p>
	</div>
{:else}
	<div class="space-y-3 sm:hidden">
		<div class="rounded-lg border border-base-300/80 bg-base-100 px-3 py-2 shadow-sm">
			<div class="flex items-center justify-between gap-2">
				<label class="flex items-center gap-2 text-xs font-medium">
					<input
						type="checkbox"
						class="checkbox checkbox-sm"
						checked={allSelected}
						indeterminate={someSelected}
						onchange={(e) => onSelectAll(e.currentTarget.checked)}
					/>
					Select all
				</label>
				<span class="text-xs text-base-content/60">{selectedIds.size} selected</span>
			</div>

			{#if onReorder}
				<div class="mt-2 border-t border-base-300/70 pt-2">
					<div class="flex items-center justify-between gap-2">
						<div
							class="text-xs font-medium {reorderMode ? 'text-primary' : 'text-base-content/70'}"
						>
							{reorderMode ? 'Reorder mode is active' : 'Priority reordering'}
						</div>
						<button
							class="btn gap-1 btn-xs {reorderMode ? 'btn-primary' : 'btn-ghost'}"
							onclick={toggleReorderMode}
						>
							<GripVertical class="h-3.5 w-3.5" />
							{reorderMode ? 'Done' : 'Reorder'}
						</button>
					</div>
					<p class="mt-1 text-xs text-base-content/60">
						{reorderMode
							? 'Drag cards or use the up/down arrows to change priority.'
							: 'Enable reorder mode to change Provider priority.'}
					</p>
				</div>
			{/if}
		</div>

		{#each providers as provider, index (provider.id)}
			<div
				role="listitem"
				class="rounded-xl border bg-base-100 p-3 transition-all duration-150 {selectedIds.has(
					provider.id
				)
					? 'border-primary/50 ring-1 ring-primary/30'
					: 'border-base-300/80'} {dragOverIndex === index
					? 'border-primary/70 bg-primary/5'
					: ''} {draggedIndex === index ? 'opacity-60' : ''}"
				draggable={reorderMode}
				ondragstart={(e) => handleDragStart(e, index)}
				ondragover={(e) => handleDragOver(e, index)}
				ondragleave={handleDragLeave}
				ondrop={(e) => handleDrop(e, index)}
				ondragend={handleDragEnd}
			>
				<div class="mb-2 flex items-start justify-between gap-2">
					<div class="flex min-w-0 items-start gap-2.5">
						{#if reorderMode}
							<div class="mt-0.5 flex h-5 w-5 items-center justify-center">
								<GripVertical class="h-4 w-4 text-base-content/50" />
							</div>
						{:else}
							<input
								type="checkbox"
								class="checkbox checkbox-sm"
								checked={selectedIds.has(provider.id)}
								onchange={(e) => onSelect(provider.id, e.currentTarget.checked)}
							/>
						{/if}
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<button class="link text-sm font-bold link-hover" onclick={() => onEdit(provider)}>
									{provider.name}
								</button>
								<SubtitleProviderStatusBadge
									enabled={provider.enabled}
									healthy={provider.consecutiveFailures === 0}
									consecutiveFailures={provider.consecutiveFailures}
									lastError={provider.lastError}
									throttledUntil={provider.throttledUntil}
								/>
							</div>
							<div class="truncate text-xs text-base-content/60">{getProviderLabel(provider)}</div>
						</div>
					</div>
					<div class="flex shrink-0 items-center gap-1">
						{#if reorderMode}
							<button
								class="btn btn-ghost btn-xs"
								onclick={() => moveProvider(index, index - 1)}
								disabled={index === 0}
								title="Move up"
								aria-label="Move up"
							>
								<ChevronUp class="h-3.5 w-3.5" />
							</button>
							<button
								class="btn btn-ghost btn-xs"
								onclick={() => moveProvider(index, index + 1)}
								disabled={index === providers.length - 1}
								title="Move down"
								aria-label="Move down"
							>
								<ChevronDown class="h-3.5 w-3.5" />
							</button>
						{/if}
						<span class="badge shrink-0 gap-1 badge-ghost badge-sm">
							{provider.requestsPerMinute}/min
						</span>
						<span class="badge shrink-0 badge-outline badge-sm">{provider.priority}</span>
					</div>
				</div>

				<div class="mb-3 flex flex-wrap items-center gap-1">
					{#each getSurfacedFeatures(provider) as feature (feature)}
						<span class="badge max-w-36 truncate badge-ghost badge-sm" title={feature}>
							{getCompactFeatureLabel(feature)}
						</span>
					{/each}
				</div>

				<div class="grid grid-cols-4 gap-1.5">
					<button
						class="btn btn-ghost btn-xs"
						onclick={() => onTest(provider)}
						disabled={testingIds.has(provider.id) || reorderMode}
						title="Test connection"
						aria-label="Test connection"
					>
						{#if testingIds.has(provider.id)}
							<Loader2 class="h-4 w-4 animate-spin" />
						{:else}
							<FlaskConical class="h-4 w-4" />
						{/if}
					</button>
					<button
						class="btn btn-ghost btn-xs"
						onclick={() => onToggle(provider)}
						disabled={testingIds.has(provider.id) || reorderMode}
						title={provider.enabled ? 'Disable' : 'Enable'}
						aria-label={provider.enabled ? 'Disable provider' : 'Enable provider'}
					>
						{#if provider.enabled}
							<ToggleRight class="h-4 w-4 text-success" />
						{:else}
							<ToggleLeft class="h-4 w-4" />
						{/if}
					</button>
					<button
						class="btn btn-ghost btn-xs"
						onclick={() => onEdit(provider)}
						disabled={reorderMode}
						title="Edit provider"
						aria-label="Edit provider"
					>
						<Settings class="h-4 w-4" />
					</button>
					<button
						class="btn text-error btn-ghost btn-xs"
						onclick={() => onDelete(provider)}
						disabled={reorderMode}
						title="Delete provider"
						aria-label="Delete provider"
					>
						<Trash2 class="h-4 w-4" />
					</button>
				</div>
			</div>
		{/each}
	</div>

	<div class="hidden overflow-x-auto sm:block">
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
