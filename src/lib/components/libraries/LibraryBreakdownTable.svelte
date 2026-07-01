<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import {
		Library,
		Eye,
		EyeOff,
		Search,
		Captions,
		ChevronDown,
		ChevronRight,
		ExternalLink
	} from 'lucide-svelte';
	import type { LibraryBreakdownItem, RootFolderBreakdownItem } from './storage-utils.js';
	import { getStatusBadgeClass, libraryHref } from './storage-utils.js';
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

	const collapsed = $state<Record<string, boolean>>({});

	function toggle(id: string) {
		collapsed[id] = !collapsed[id];
	}
</script>

<div class="hidden overflow-x-auto rounded-lg border border-base-300 md:block">
	<table class="table table-sm">
		<thead>
			<tr class="text-xs uppercase tracking-wide text-base-content/50">
				<th>{m.settings_general_columnLibrary()}</th>
				<th>{m.settings_general_columnClassification()}</th>
				<th>{m.settings_general_columnItems()}</th>
				<th>{m.settings_general_columnUsed()}</th>
				<th>Disk</th>
				<th>Status</th>
			</tr>
		</thead>
		<tbody>
			{#each libraryBreakdown as libItem, i (libItem.id)}
				{@const libRootFolders = (libItem.rootFolderIds ?? [])
					.map((id) => rootFolderMap.get(id))
					.filter(Boolean)}
				{#if i > 0}
					<tr aria-hidden="true"><td colspan="6" class="h-2 p-0 bg-base-100"></td></tr>
				{/if}
				<tr
					class="group border-t-2 border-base-300 bg-base-200/60 {libRootFolders.length > 0
						? 'cursor-pointer select-none hover:bg-base-200'
						: ''}"
					onclick={libRootFolders.length > 0 ? () => toggle(libItem.id) : undefined}
				>
					<td class="border-l-4 border-primary pl-3">
						<div class="flex items-center gap-2">
							<Library class="h-3.5 w-3.5 shrink-0 text-primary/60" />
							{#if libRootFolders.length > 0}
								{#if collapsed[libItem.id]}
									<ChevronRight class="h-3.5 w-3.5 shrink-0 text-base-content/40" />
								{:else}
									<ChevronDown class="h-3.5 w-3.5 shrink-0 text-base-content/40" />
								{/if}
							{/if}
							<span class="font-semibold">{libItem.name}</span>
							<a
								href={libraryHref(libItem)}
								onclick={(e) => e.stopPropagation()}
								class="opacity-0 group-hover:opacity-100 transition-opacity text-base-content/40 hover:text-base-content/70"
								title="Open library"
							>
								<ExternalLink class="h-3 w-3" />
							</a>
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
						<div class="mt-1 flex flex-wrap gap-1.5">
							<span
								class={`inline-flex items-center gap-1 badge border-none badge-sm ${getStatusBadgeClass(libItem.defaultMonitored ?? false)}`}
								title={m.settings_general_statusTooltip({
									label: m.settings_general_monitorByDefault(),
									status: libItem.defaultMonitored ? m.common_enabled() : m.common_disabled()
								})}
							>
								{#if libItem.defaultMonitored}
									<Eye class="h-3 w-3" /><span>Monitored</span>
								{:else}
									<EyeOff class="h-3 w-3" /><span>Unmonitored</span>
								{/if}
							</span>
							{#if libItem.defaultSearchOnAdd}
								<span
									class={`inline-flex items-center gap-1 badge border-none badge-sm ${getStatusBadgeClass(true)}`}
									title={m.settings_general_statusTooltip({
										label: m.settings_general_searchOnAddLabel(),
										status: m.common_enabled()
									})}
								>
									<Search class="h-3 w-3" /><span>Auto-search</span>
								</span>
							{/if}
							{#if libItem.defaultWantsSubtitles}
								<span
									class={`inline-flex items-center gap-1 badge border-none badge-sm ${getStatusBadgeClass(true)}`}
									title={m.settings_general_statusTooltip({
										label: m.settings_general_wantSubtitles(),
										status: m.common_enabled()
									})}
								>
									<Captions class="h-3 w-3" /><span>Subtitles</span>
								</span>
							{/if}
						</div>
						{#if (libItem.hasRootFolder === false || (libItem.detachedItemCount ?? 0) > 0) && hasLibrary(libItem.id)}
							<div class="mt-1">
								<button
									class="btn btn-outline btn-xs"
									onclick={(e) => {
										e.stopPropagation();
										onEditLibrary(libItem.id);
									}}
								>
									{m.settings_general_reviewLibrary()}
								</button>
							</div>
						{/if}
					</td>
					<td
						><span class="badge badge-sm badge-ghost font-normal"
							>{libItem.mediaType} / {libItem.mediaSubType}</span
						></td
					>
					<td>{libItem.itemCount}</td>
					<td>{formatBytes(libItem.usedBytes)}</td>
					<td></td>
					<td>
						{#if libRootFolders.length > 0}
							<span class="badge badge-sm badge-ghost font-normal">
								{libRootFolders.length} folder{libRootFolders.length !== 1 ? 's' : ''}
							</span>
						{/if}
					</td>
				</tr>
				{#if !collapsed[libItem.id]}
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
				{/if}
			{/each}

			{#if unassignedRootFolders.length > 0}
				<tr class="border-t-2 border-base-300 bg-base-300/20">
					<td
						colspan="6"
						class="text-xs font-semibold tracking-wide text-base-content/50 uppercase"
					>
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
