<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { FolderOpen } from 'lucide-svelte';
	import type { RootFolderBreakdownItem } from './storage-utils.js';
	import { getRootFolderScanLabel, getRootFolderScanBadgeClass } from './storage-utils.js';
	import DiskUsageBar from './DiskUsageBar.svelte';

	interface Props {
		item: RootFolderBreakdownItem;
		scanning: boolean;
		formatBytes: (value: number) => string;
		hasRootFolder: boolean;
		onEditRootFolder: (rootFolderId: string) => void;
		onScanRootFolder: (rootFolderId: string) => void;
	}

	let { item, scanning, formatBytes, hasRootFolder, onEditRootFolder, onScanRootFolder }: Props =
		$props();
</script>

<div class="rounded-lg border border-base-200 bg-base-200/50 p-2.5">
	<div class="flex items-start justify-between gap-2">
		<div class="flex items-center gap-1.5 text-sm font-medium">
			<FolderOpen class="h-3 w-3 text-base-content/40" />
			{item.name}
		</div>
		<div class="flex flex-wrap justify-end gap-1">
			{#if item.accessible === false}
				<span class="badge border-none bg-error/15 badge-sm text-error">
					{m.settings_general_inaccessible()}
				</span>
			{/if}
			{#if item.readOnly}
				<span class="badge border-none bg-info/15 badge-sm text-info">
					{m.rootFolders_badgeReadOnly()}
				</span>
			{/if}
		</div>
	</div>
	<div class="mt-0.5 truncate text-xs text-base-content/50">{item.path}</div>
	<div class="mt-2 grid grid-cols-3 gap-2 text-xs">
		<div>
			<div class="text-base-content/50">{m.settings_general_columnItems()}</div>
			<div class="font-medium">{item.itemCount}</div>
		</div>
		<div>
			<div class="text-base-content/50">{m.settings_general_columnUsed()}</div>
			<div class="font-medium">{formatBytes(item.usedBytes)}</div>
		</div>
		<div>
			<div class="text-base-content/50">{m.settings_general_diskFree()}</div>
			<div class="font-medium">{item.freeSpaceFormatted ?? 'N/A'}</div>
		</div>
	</div>
	<div class="mt-2">
		<DiskUsageBar {item} {formatBytes} compact={true} bgClass="bg-base-300" />
	</div>
	<div class="mt-2 flex flex-wrap items-center gap-1">
		<span class={`badge border-none badge-sm ${getRootFolderScanBadgeClass(item)}`}>
			{getRootFolderScanLabel(item)}
		</span>
		{#if (item.accessible === false || item.needsScan) && hasRootFolder}
			<div class="ml-auto flex gap-1">
				<button class="btn btn-outline btn-xs" onclick={() => onEditRootFolder(item.id)}>
					{m.settings_general_editFolder()}
				</button>
				{#if item.needsScan}
					<button
						class="btn btn-outline btn-xs"
						onclick={() => onScanRootFolder(item.id)}
						disabled={scanning}
					>
						{m.settings_general_scanNow()}
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
