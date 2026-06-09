<script lang="ts">
	import {
		Loader2,
		FlaskConical,
		Trash2,
		Search,
		Zap,
		GripVertical,
		ToggleLeft,
		ToggleRight,
		Settings
	} from 'lucide-svelte';
	import IndexerStatusBadge from './IndexerStatusBadge.svelte';
	import type { IndexerWithStatus } from '$lib/types/indexer';

	interface Props {
		indexer: IndexerWithStatus;
		selected: boolean;
		testing: boolean;
		toggling: boolean;
		reorderMode: boolean;
		isDragOver: boolean;
		isDragging: boolean;
		prowlarrBaseUrl?: string | null;
		jackettBaseUrl?: string | null;
		onSelect: (id: string, selected: boolean) => void;
		onEdit: (indexer: IndexerWithStatus) => void;
		onDelete: (indexer: IndexerWithStatus) => void;
		onTest: (indexer: IndexerWithStatus) => void;
		onToggle: (indexer: IndexerWithStatus) => void;
		onDragStart: (event: DragEvent) => void;
		onDragOver: (event: DragEvent) => void;
		onDragLeave: () => void;
		onDrop: (event: DragEvent) => void;
		onDragEnd: () => void;
	}

	let {
		indexer,
		selected,
		testing,
		toggling,
		reorderMode,
		isDragOver,
		isDragging,
		prowlarrBaseUrl = null,
		jackettBaseUrl = null,
		onSelect,
		onEdit,
		onDelete,
		onTest,
		onToggle,
		onDragStart,
		onDragOver,
		onDragLeave,
		onDrop,
		onDragEnd
	}: Props = $props();

	function isProwlarrIndexer(): boolean {
		if (!prowlarrBaseUrl) return false;
		const base = prowlarrBaseUrl.replace(/\/+$/, '');
		if (!indexer.baseUrl.startsWith(base + '/')) return false;
		const suffix = indexer.baseUrl.slice(base.length + 1).replace(/\/+$/, '');
		return /^\d+$/.test(suffix);
	}

	function isJackettIndexer(): boolean {
		if (!jackettBaseUrl) return false;
		const base = jackettBaseUrl.replace(/\/+$/, '');
		return (
			indexer.baseUrl.startsWith(base + '/api/v2.0/indexers/') &&
			indexer.baseUrl.includes('/results/torznab')
		);
	}

	function truncateUrl(url: string, maxLength: number = 30): string {
		if (url.length <= maxLength) return url;
		return url.substring(0, maxLength) + '...';
	}
</script>

<tr
	class="hover transition-colors {isDragging ? 'opacity-50' : ''} {isDragOver
		? 'bg-primary/10'
		: ''}"
	draggable={reorderMode}
	ondragstart={onDragStart}
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	ondrop={onDrop}
	ondragend={onDragEnd}
>
	<!-- Checkbox -->
	<td class="w-10">
		{#if reorderMode}
			<div class="flex justify-center">
				<GripVertical class="h-4 w-4 cursor-grab text-base-content/50" />
			</div>
		{:else}
			<input
				type="checkbox"
				class="checkbox checkbox-sm"
				checked={selected}
				onchange={(e) => onSelect(indexer.id, e.currentTarget.checked)}
			/>
		{/if}
	</td>

	<!-- Status -->
	<td class="w-24">
		<IndexerStatusBadge
			enabled={indexer.enabled}
			consecutiveFailures={indexer.status?.consecutiveFailures ?? 0}
			lastFailure={indexer.status?.lastFailure}
			disabledUntil={indexer.status?.disabledUntil}
			jackettManaged={isJackettIndexer()}
		/>
	</td>

	<!-- Name -->
	<td>
		<div class="flex flex-wrap items-center gap-1.5">
			<button class="link font-bold link-hover" onclick={() => onEdit(indexer)}>
				{indexer.name}
			</button>
			{#if isProwlarrIndexer()}
				<span class="badge badge-primary badge-xs">Prowlarr</span>
				{#if indexer.settings?.prowlarrEnabled === 'false'}
					<span class="badge badge-warning badge-xs">Disabled in Prowlarr</span>
				{/if}
			{:else if isJackettIndexer()}
				<span class="badge badge-secondary badge-xs">Jackett</span>
			{/if}
		</div>
	</td>

	<!-- Definition -->
	<td class="text-base-content/70">
		{indexer.definitionName ?? indexer.definitionId}
	</td>

	<!-- Protocol -->
	<td>
		<div class="badge badge-outline badge-sm capitalize">
			{indexer.protocol}
		</div>
	</td>

	<!-- Search Capabilities -->
	<td>
		<div class="flex justify-center gap-1">
			<div
				class="tooltip"
				data-tip="Auto Search {indexer.enableAutomaticSearch ? 'enabled' : 'disabled'}"
			>
				<Zap
					class="h-3.5 w-3.5 {indexer.enableAutomaticSearch
						? 'text-success'
						: 'text-base-content/30'}"
				/>
			</div>
			<div
				class="tooltip"
				data-tip="Interactive Search {indexer.enableInteractiveSearch ? 'enabled' : 'disabled'}"
			>
				<Search
					class="h-3.5 w-3.5 {indexer.enableInteractiveSearch
						? 'text-success'
						: 'text-base-content/30'}"
				/>
			</div>
		</div>
	</td>

	<!-- Priority -->
	<td class="text-center">
		<span class="badge badge-outline badge-sm">{indexer.priority}</span>
	</td>

	<!-- URL -->
	<td class="max-w-50">
		<div class="tooltip block w-full" data-tip={indexer.baseUrl}>
			<span class="block truncate text-sm text-base-content/70">
				{truncateUrl(indexer.baseUrl)}
			</span>
		</div>
	</td>

	<!-- Actions -->
	<td class="pl-2!">
		<div class="flex gap-0">
			<button
				class="btn btn-ghost btn-xs"
				onclick={() => onTest(indexer)}
				disabled={testing || reorderMode}
				title="Test connection"
			>
				{#if testing}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<FlaskConical class="h-4 w-4" />
				{/if}
			</button>
			<button
				class="btn btn-ghost btn-xs"
				onclick={() => onToggle(indexer)}
				disabled={testing || toggling || reorderMode}
				title={indexer.enabled ? 'Disable' : 'Enable'}
			>
				{#if toggling}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else if indexer.enabled}
					<ToggleRight class="h-4 w-4 text-success" />
				{:else}
					<ToggleLeft class="h-4 w-4" />
				{/if}
			</button>
			<button
				class="btn btn-ghost btn-xs"
				onclick={() => onEdit(indexer)}
				disabled={reorderMode}
				title="Edit indexer"
			>
				<Settings class="h-4 w-4" />
			</button>
			<button
				class="btn text-error btn-ghost btn-xs"
				onclick={() => onDelete(indexer)}
				disabled={reorderMode}
				title="Delete indexer"
			>
				<Trash2 class="h-4 w-4" />
			</button>
		</div>
	</td>
</tr>
