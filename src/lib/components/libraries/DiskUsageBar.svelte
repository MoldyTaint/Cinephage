<script lang="ts">
	import type { RootFolderBreakdownItem } from './storage-utils.js';
	import {
		DISK_SEGMENT_STYLES,
		getUsedRatio,
		getFreeRatio,
		getNonCinephageUsedBytes,
		getNonCinephageRatio,
		segmentWidth,
		formatPercent
	} from './storage-utils.js';

	interface Props {
		item: RootFolderBreakdownItem;
		formatBytes: (value: number) => string;
		compact?: boolean;
		bgClass?: string;
	}

	let { item, formatBytes, compact = false, bgClass = 'bg-base-200' }: Props = $props();
</script>

{#if getUsedRatio(item) !== null}
	<div>
		<div class={`flex h-2 overflow-hidden rounded-full ${bgClass}`}>
			<div
				class="h-2"
				style={`${DISK_SEGMENT_STYLES.cinephage} width: ${segmentWidth(getUsedRatio(item))}`}
				title={`Cinephage: ${formatBytes(item.usedBytes)}`}
			></div>
			<div
				class="h-2"
				style={`${DISK_SEGMENT_STYLES.other} width: ${segmentWidth(getNonCinephageRatio(item))}`}
				title={`Other: ${formatBytes(getNonCinephageUsedBytes(item) ?? 0)}`}
			></div>
			<div
				class="h-2"
				style={`${DISK_SEGMENT_STYLES.free} width: ${segmentWidth(getFreeRatio(item))}`}
				title={`Free: ${item.freeSpaceFormatted ?? 'N/A'}`}
			></div>
		</div>
		{#if compact}
			<div class="mt-1 flex gap-3 text-[10px] text-base-content/50">
				<span class="inline-flex items-center gap-1">
					<span class="h-2 w-2 rounded-full" style={DISK_SEGMENT_STYLES.cinephage}></span>
					{formatPercent(getUsedRatio(item))}
				</span>
				<span class="inline-flex items-center gap-1">
					<span class="h-2 w-2 rounded-full" style={DISK_SEGMENT_STYLES.other}></span>
					{formatPercent(getNonCinephageRatio(item))}
				</span>
				<span class="inline-flex items-center gap-1">
					<span class="h-2 w-2 rounded-full" style={DISK_SEGMENT_STYLES.free}></span>
					{formatPercent(getFreeRatio(item))}
				</span>
			</div>
		{/if}
	</div>
{:else}
	<span class="text-xs text-base-content/40">—</span>
{/if}
