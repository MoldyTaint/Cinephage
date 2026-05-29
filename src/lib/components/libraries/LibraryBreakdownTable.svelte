<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { Library, Eye, EyeOff, Search, SearchSlash, Captions, CaptionsOff } from 'lucide-svelte';
	import type { LibraryBreakdownItem, RootFolderBreakdownItem } from './storage-utils.js';
	import { getStatusBadgeClass } from './storage-utils.js';
	import RootFolderDesktopRow from './RootFolderDesktopRow.svelte';

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

<div class="hidden overflow-x-auto rounded-lg border border-base-300 md:block">
	<table class="table table-sm">
		<thead>
			<tr>
				<th>{m.settings_general_columnLibrary()}</th>
				<th>{m.settings_general_columnClassification()}</th>
				<th>{m.settings_general_columnItems()}</th>
				<th>{m.settings_general_columnUsed()}</th>
				<th>Disk</th>
				<th>Status</th>
			</tr>
		</thead>
		<tbody>
			{#each libraryBreakdown as libItem (libItem.id)}
				{@const libRootFolders = (libItem.rootFolderIds ?? [])
					.map((id) => rootFolderMap.get(id))
					.filter(Boolean)}
				<tr class="bg-base-200/40 font-medium">
					<td>
						<div class="flex items-center gap-2">
							<Library class="h-3.5 w-3.5 text-base-content/40" />
							<span class="font-semibold">{libItem.name}</span>
							{#if libItem.hasRootFolder === false}
								<span class="badge border-none bg-warning badge-sm text-warning-content">
									{m.settings_general_noRootFolder()}
								</span>
							{/if}
							{#if libItem.mediaSubType === 'anime'}
								<span class="badge border-none bg-warning/20 badge-sm text-warning-content">
									{m.settings_general_badgeAnime()}
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
						<div class="text-xs text-base-content/50">
							{libItem.path ?? m.settings_general_noRootFolderAssigned()}
						</div>
						<div class="mt-1 flex flex-wrap gap-1">
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
						{#if (libItem.hasRootFolder === false || (libItem.detachedItemCount ?? 0) > 0) && hasLibrary(libItem.id)}
							<div class="mt-1">
								<button class="btn btn-outline btn-xs" onclick={() => onEditLibrary(libItem.id)}>
									{m.settings_general_reviewLibrary()}
								</button>
							</div>
						{/if}
					</td>
					<td>{libItem.mediaType} / {libItem.mediaSubType}</td>
					<td>{libItem.itemCount}</td>
					<td>{formatBytes(libItem.usedBytes)}</td>
					<td colspan="2"></td>
				</tr>
				{#each libRootFolders as rf (rf!.id)}
					<RootFolderDesktopRow
						item={rf!}
						{scanning}
						{formatBytes}
						hasRootFolder={hasRootFolder(rf!.id)}
						{onEditRootFolder}
						{onScanRootFolder}
					/>
				{/each}
			{/each}

			{#if unassignedRootFolders.length > 0}
				<tr class="bg-base-300/30">
					<td colspan="6" class="text-xs font-medium tracking-wide text-base-content/50 uppercase">
						Unassigned Root Folders
					</td>
				</tr>
				{#each unassignedRootFolders as rf (rf.id)}
					<RootFolderDesktopRow
						item={rf}
						{scanning}
						{formatBytes}
						hasRootFolder={hasRootFolder(rf.id)}
						{onEditRootFolder}
						{onScanRootFolder}
					/>
				{/each}
			{/if}
		</tbody>
	</table>
</div>
