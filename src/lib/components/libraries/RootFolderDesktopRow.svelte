<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { FolderOpen } from 'lucide-svelte';
	import type { RootFolderBreakdownItem } from './storage-utils.js';
	import {
		formatTimestamp,
		getRootFolderTotalBytes,
		getUsedRatio,
		getRootFolderScanLabel,
		getRootFolderScanBadgeClass
	} from './storage-utils.js';
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

<tr class="text-sm hover:bg-base-200/30 transition-colors">
	<td class="pl-2">
		<div class="border-l border-base-300 pl-3 ml-2">
			<div class="flex items-center gap-2 pl-6">
				<FolderOpen class="h-3 w-3 text-base-content/30" />
				<span class="text-base-content/80">{item.name}</span>
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
				{#if (item.unmatchedCount ?? 0) > 0}
					<span class="badge border-none bg-info/15 badge-sm text-info">
						{m.settings_general_unmatchedCount({ count: item.unmatchedCount ?? 0 })}
					</span>
				{/if}
			</div>
			<div class="truncate pl-10 text-xs text-base-content/50">{item.path}</div>
			<div class="pl-10 text-xs text-base-content/50">
				{m.settings_general_lastScanLabel({
					value: formatTimestamp(item.lastScannedAt ?? null)
				})}
			</div>
			{#if (item.accessible === false || item.needsScan) && hasRootFolder}
				<div class="mt-1 flex flex-wrap gap-2 pl-10">
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
	</td>
	<td><span class="text-xs text-base-content/50">{item.mediaType} / {item.mediaSubType}</span></td>
	<td>{item.itemCount}</td>
	<td>
		<div>{m.settings_general_trackedUsed({ used: formatBytes(item.usedBytes) })}</div>
		<div class="text-xs text-base-content/50">
			{#if getRootFolderTotalBytes(item)}
				{m.settings_general_diskFreeOfTotal({
					free: item.freeSpaceFormatted ?? m.common_na(),
					total: formatBytes(getRootFolderTotalBytes(item) ?? 0)
				})}
			{:else}
				{m.settings_general_capacityUnknown()}
			{/if}
		</div>
	</td>
	<td>
		{#if getUsedRatio(item) !== null}
			<div class="w-32">
				<DiskUsageBar {item} {formatBytes} compact={true} />
			</div>
		{:else}
			<span class="text-xs text-base-content/40">—</span>
		{/if}
	</td>
	<td>
		<span class={`badge border-none badge-sm ${getRootFolderScanBadgeClass(item)}`}>
			{getRootFolderScanLabel(item)}
		</span>
	</td>
</tr>
