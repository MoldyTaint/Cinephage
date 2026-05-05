<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { Eye, EyeOff, Search, SearchSlash, Captions, CaptionsOff } from 'lucide-svelte';
	import type { LibraryBreakdownItem, RootFolderBreakdownItem } from './storage-utils.js';
	import { getStatusBadgeClass } from './storage-utils.js';
	import RootFolderMobileCard from './RootFolderMobileCard.svelte';

	interface Props {
		libraryBreakdown: LibraryBreakdownItem[];
		rootFolderMap: Map<string, RootFolderBreakdownItem>;
		unassignedRootFolders: RootFolderBreakdownItem[];
		scanning: boolean;
		formatBytes: (value: number) => string;
		libraries: Array<{ id: string }>;
		rootFolders: Array<{ id: string }>;
		onEditLibrary: (libraryId: string) => void;
		onEditRootFolder: (rootFolderId: string) => void;
		onScanRootFolder: (rootFolderId: string) => void;
	}

	let {
		libraryBreakdown,
		rootFolderMap,
		unassignedRootFolders,
		scanning,
		formatBytes,
		libraries,
		rootFolders,
		onEditLibrary,
		onEditRootFolder,
		onScanRootFolder
	}: Props = $props();

	function hasLibrary(id: string): boolean {
		return libraries.some((library) => library.id === id);
	}

	function hasRootFolder(id: string): boolean {
		return rootFolders.some((folder) => folder.id === id);
	}
</script>

<div class="space-y-4 md:hidden">
	{#each libraryBreakdown as libItem (libItem.id)}
		{@const libRootFolders = (libItem.rootFolderIds ?? [])
			.map((id) => rootFolderMap.get(id))
			.filter(Boolean)}
		<div class="rounded-lg border border-base-300 bg-base-100 p-3">
			<div class="flex items-start justify-between gap-3">
				<div class="font-medium">{libItem.name}</div>
				<div class="flex flex-wrap justify-end gap-1">
					{#if libItem.hasRootFolder === false}
						<span class="badge border-none bg-warning/20 badge-sm text-warning-content">
							{m.settings_general_noRootFolder()}
						</span>
					{/if}
					{#if libItem.mediaSubType === 'anime'}
						<span class="badge border-none bg-warning/20 badge-sm text-warning-content">
							{m.settings_general_badgeAnime()}
						</span>
					{/if}
					{#if libItem.needsScan}
						<span class="badge border-none bg-warning/20 badge-sm text-warning-content">
							{m.settings_general_needsScan()}
						</span>
					{/if}
					{#if (libItem.unmatchedCount ?? 0) > 0}
						<span class="badge border-none bg-info/15 badge-sm text-info">
							{m.settings_general_unmatchedCount({ count: libItem.unmatchedCount ?? 0 })}
						</span>
					{/if}
					{#if (libItem.detachedItemCount ?? 0) > 0}
						<span class="badge border-none bg-error/15 badge-sm text-error">
							{m.settings_general_detachedCount({ count: libItem.detachedItemCount ?? 0 })}
						</span>
					{/if}
				</div>
			</div>
			<div class="mt-1 text-xs text-base-content/50">
				{libItem.path ?? m.settings_general_noRootFolderAssigned()}
			</div>
			<div class="mt-2 flex flex-wrap gap-1">
				<span
					class={`badge border-none badge-sm ${getStatusBadgeClass(libItem.defaultMonitored ?? false)}`}
					title={m.settings_general_statusTooltip({
						label: m.settings_general_monitorByDefault(),
						status: libItem.defaultMonitored ? m.common_enabled() : m.common_disabled()
					})}
				>
					{#if libItem.defaultMonitored}
						<Eye class="h-3 w-3" />
					{:else}
						<EyeOff class="h-3 w-3" />
					{/if}
				</span>
				<span
					class={`badge border-none badge-sm ${getStatusBadgeClass(libItem.defaultSearchOnAdd ?? false)}`}
					title={m.settings_general_statusTooltip({
						label: m.settings_general_searchOnAddLabel(),
						status: libItem.defaultSearchOnAdd ? m.common_enabled() : m.common_disabled()
					})}
				>
					{#if libItem.defaultSearchOnAdd}
						<Search class="h-3 w-3" />
					{:else}
						<SearchSlash class="h-3 w-3" />
					{/if}
				</span>
				<span
					class={`badge border-none badge-sm ${getStatusBadgeClass(libItem.defaultWantsSubtitles ?? false)}`}
					title={m.settings_general_statusTooltip({
						label: m.settings_general_wantSubtitles(),
						status: libItem.defaultWantsSubtitles ? m.common_enabled() : m.common_disabled()
					})}
				>
					{#if libItem.defaultWantsSubtitles}
						<Captions class="h-3 w-3" />
					{:else}
						<CaptionsOff class="h-3 w-3" />
					{/if}
				</span>
			</div>
			<div class="mt-3 grid grid-cols-3 gap-2 text-sm">
				<div>
					<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
						{m.settings_general_classShort()}
					</div>
					<div>{libItem.mediaType} / {libItem.mediaSubType}</div>
				</div>
				<div>
					<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
						{m.settings_general_columnItems()}
					</div>
					<div>{libItem.itemCount}</div>
				</div>
				<div>
					<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
						{m.settings_general_columnUsed()}
					</div>
					<div>{formatBytes(libItem.usedBytes)}</div>
				</div>
			</div>
			{#if (libItem.hasRootFolder === false || (libItem.detachedItemCount ?? 0) > 0) && hasLibrary(libItem.id)}
				<div class="mt-3 flex flex-wrap gap-2">
					<button class="btn ml-auto btn-outline btn-xs" onclick={() => onEditLibrary(libItem.id)}>
						{m.settings_general_reviewLibrary()}
					</button>
				</div>
			{/if}
			{#if libRootFolders.length > 0}
				<div class="mt-3 space-y-2 border-t border-base-200 pt-3">
					{#each libRootFolders as rf (rf!.id)}
						<RootFolderMobileCard
							item={rf!}
							{scanning}
							{formatBytes}
							hasRootFolder={hasRootFolder(rf!.id)}
							{onEditRootFolder}
							{onScanRootFolder}
						/>
					{/each}
				</div>
			{/if}
		</div>
	{/each}

	{#if unassignedRootFolders.length > 0}
		<div class="rounded-lg border border-dashed border-base-300 bg-base-200/50 p-3">
			<div class="mb-2 text-xs font-medium tracking-wide text-base-content/50 uppercase">
				Unassigned Root Folders
			</div>
			{#each unassignedRootFolders as rf (rf.id)}
				<RootFolderMobileCard
					item={rf}
					{scanning}
					{formatBytes}
					hasRootFolder={hasRootFolder(rf.id)}
					{onEditRootFolder}
					{onScanRootFolder}
				/>
			{/each}
		</div>
	{/if}
</div>
