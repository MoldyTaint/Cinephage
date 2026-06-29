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

	const collapsed = $state<Record<string, boolean>>({});

	function toggle(id: string) {
		collapsed[id] = !collapsed[id];
	}
</script>

<div class="space-y-3 md:hidden">
	{#each libraryBreakdown as libItem (libItem.id)}
		{@const libRootFolders = (libItem.rootFolderIds ?? [])
			.map((id) => rootFolderMap.get(id))
			.filter(Boolean)}
		<div class="rounded-lg border border-base-300 bg-base-100 overflow-hidden">
			<div
				class="border-l-4 p-3 border-l-[oklch(var(--p))] {libRootFolders.length > 0
					? 'cursor-pointer select-none active:bg-base-200/40'
					: ''}"
				onclick={libRootFolders.length > 0 ? () => toggle(libItem.id) : undefined}
			>
				<div class="flex items-start justify-between gap-2">
					<div class="flex items-center gap-1.5 min-w-0">
						<Library class="h-3.5 w-3.5 shrink-0 text-primary/60" />
						{#if libRootFolders.length > 0}
							{#if collapsed[libItem.id]}
								<ChevronRight class="h-3.5 w-3.5 shrink-0 text-base-content/40" />
							{:else}
								<ChevronDown class="h-3.5 w-3.5 shrink-0 text-base-content/40" />
							{/if}
						{/if}
						<span class="font-semibold truncate">{libItem.name}</span>
						<a
							href={libraryHref(libItem)}
							onclick={(e) => e.stopPropagation()}
							class="shrink-0 text-base-content/40 hover:text-base-content/70"
							title="Open library"
						>
							<ExternalLink class="h-3 w-3" />
						</a>
					</div>
					<div class="flex flex-wrap justify-end gap-1 shrink-0">
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
				</div>

				<div class="mt-1.5 flex flex-wrap gap-1.5">
					<span
						class={`inline-flex items-center gap-1 badge border-none badge-sm ${getStatusBadgeClass(libItem.defaultMonitored ?? false)}`}
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
						>
							<Search class="h-3 w-3" /><span>Auto-search</span>
						</span>
					{/if}
					{#if libItem.defaultWantsSubtitles}
						<span
							class={`inline-flex items-center gap-1 badge border-none badge-sm ${getStatusBadgeClass(true)}`}
						>
							<Captions class="h-3 w-3" /><span>Subtitles</span>
						</span>
					{/if}
				</div>

				<div class="mt-2 grid grid-cols-3 gap-2 text-sm">
					<div>
						<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
							{m.settings_general_classShort()}
						</div>
						<div class="text-xs">{libItem.mediaType} / {libItem.mediaSubType}</div>
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
					<div class="mt-2">
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
			</div>

			{#if libRootFolders.length > 0 && !collapsed[libItem.id]}
				<div class="space-y-2 border-t border-base-200 bg-base-200/30 p-3">
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
			<div class="space-y-2">
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
		</div>
	{/if}
</div>
