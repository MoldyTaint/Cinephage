<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import {
		CheckCircle,
		AlertCircle,
		ExternalLink,
		Library,
		ShieldAlert,
		Server
	} from 'lucide-svelte';
	import type { StorageSummary, ScanProgress, ScanSuccess, ServerStatus } from './storage-utils.js';
	import {
		formatTimestamp,
		formatDuration,
		getScanTone,
		getServerTypeIcon,
		getSyncStatusColor
	} from './storage-utils.js';
	import LibraryBreakdownTable from './LibraryBreakdownTable.svelte';
	import LibraryBreakdownMobileList from './LibraryBreakdownMobileList.svelte';

	interface Props {
		storage: StorageSummary;
		libraries: Array<{ id: string }>;
		rootFolders: Array<{ id: string }>;
		rootFolderCount: number;
		scanning: boolean;
		scanProgress: ScanProgress | null;
		scanError: string | null;
		scanSuccess: ScanSuccess | null;
		serverStatuses: ServerStatus[];
		formatBytes: (value: number) => string;
		onEditLibrary: (libraryId: string) => void;
		onEditRootFolder: (rootFolderId: string) => void;
		onScanRootFolder: (rootFolderId: string) => void;
	}

	let {
		storage,
		libraries,
		rootFolders,
		rootFolderCount,
		scanning,
		scanProgress,
		scanError,
		scanSuccess,
		serverStatuses,
		formatBytes,
		onEditLibrary,
		onEditRootFolder,
		onScanRootFolder
	}: Props = $props();

	const attentionItems = $derived.by(() => {
		const items: Array<{ label: string; tone: 'warning' | 'error' | 'info'; href?: string }> = [];
		if (storage.health.librariesWithoutRootFolder > 0) {
			items.push({
				label: `${storage.health.librariesWithoutRootFolder} librar${storage.health.librariesWithoutRootFolder === 1 ? 'y has' : 'ies have'} no root folder`,
				tone: 'warning',
				href: '#libraries'
			});
		}
		if (storage.health.inaccessibleRootFolders > 0) {
			items.push({
				label: `${storage.health.inaccessibleRootFolders} root folder${storage.health.inaccessibleRootFolders === 1 ? ' is' : 's are'} inaccessible`,
				tone: 'error',
				href: '#libraries'
			});
		}
		if (storage.health.unmatchedFiles > 0) {
			items.push({
				label: `${storage.health.unmatchedFiles} unmatched file${storage.health.unmatchedFiles === 1 ? '' : 's'} need review`,
				tone: 'info',
				href: '/library/unmatched'
			});
		}
		if (storage.health.readOnlyRootFolders > 0) {
			items.push({
				label: `${storage.health.readOnlyRootFolders} read-only root folder${storage.health.readOnlyRootFolders === 1 ? '' : 's'} configured`,
				tone: 'info',
				href: '#libraries'
			});
		}
		if (storage.health.rootFoldersNeedingScan > 0) {
			items.push({
				label: `${storage.health.rootFoldersNeedingScan} root folder${storage.health.rootFoldersNeedingScan === 1 ? ' needs' : 's need'} a fresh scan`,
				tone: 'warning',
				href: '#libraries'
			});
		}
		return items;
	});

	const rootFolderMap = $derived(new Map(storage.rootFolderBreakdown.map((rf) => [rf.id, rf])));

	const assignedRootFolderIds = $derived(
		new Set(storage.libraryBreakdown.flatMap((lib) => lib.rootFolderIds ?? []))
	);

	const unassignedRootFolders = $derived(
		storage.rootFolderBreakdown.filter((rf) => !assignedRootFolderIds.has(rf.id))
	);

	function typeRatio(value: number): string {
		if (storage.totalUsedBytes <= 0) return '0%';
		return `${Math.round((value / storage.totalUsedBytes) * 100)}%`;
	}
</script>

{#if attentionItems.length > 0}
	<div class="mb-4 rounded-lg border border-base-300 bg-base-200 p-4">
		<div class="mb-3 flex items-center gap-2">
			<ShieldAlert class="h-4 w-4" />
			<h3 class="font-semibold">{m.settings_general_needsAttention()}</h3>
		</div>
		<div class="flex flex-wrap gap-2">
			{#each attentionItems as item (item.label)}
				{#if item.href}
					<a
						href={item.href}
						class={`badge gap-2 border-none badge-lg ${
							item.tone === 'error'
								? 'bg-error/15 text-error'
								: item.tone === 'warning'
									? 'bg-warning/20 text-warning-content'
									: 'bg-info/15 text-info'
						}`}
					>
						{item.label}
					</a>
				{:else}
					<span
						class={`badge gap-2 border-none badge-lg ${
							item.tone === 'error'
								? 'bg-error/15 text-error'
								: item.tone === 'warning'
									? 'bg-warning/20 text-warning-content'
									: 'bg-info/15 text-info'
						}`}
					>
						{item.label}
					</span>
				{/if}
			{/each}
		</div>
	</div>
{/if}

{#if rootFolderCount === 0}
	<div class="alert alert-warning">
		<AlertCircle class="h-5 w-5" />
		<span>{m.settings_general_addFolderFirst()}</span>
	</div>
{:else}
	<div class="card bg-base-200 p-4">
		<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
			<div class="shrink-0">
				<div class="text-3xl font-bold">{formatBytes(storage.totalUsedBytes)}</div>
				<div class="mt-1 text-sm text-base-content/70">
					{storage.movieCount} movies · {storage.seriesCount} series · {storage.subtitleCount} subtitles
				</div>
			</div>
			<div class="flex-1">
				<div class="flex h-4 overflow-hidden rounded-full bg-base-300">
					{#if storage.totalUsedBytes > 0}
						<div
							class="h-full bg-primary transition-all"
							style="width: {typeRatio(storage.moviesUsedBytes)}"
							title={`Movies: ${formatBytes(storage.moviesUsedBytes)}`}
						></div>
						<div
							class="h-full bg-secondary transition-all"
							style="width: {typeRatio(storage.tvUsedBytes)}"
							title={`TV: ${formatBytes(storage.tvUsedBytes)}`}
						></div>
						<div
							class="h-full bg-accent transition-all"
							style="width: {typeRatio(storage.subtitlesUsedBytes)}"
							title={`Subtitles: ${formatBytes(storage.subtitlesUsedBytes)}`}
						></div>
					{/if}
				</div>
				<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/60">
					<span class="inline-flex items-center gap-1.5">
						<span class="inline-block h-2.5 w-2.5 rounded-full bg-primary"></span>
						Movies ({formatBytes(storage.moviesUsedBytes)})
					</span>
					<span class="inline-flex items-center gap-1.5">
						<span class="inline-block h-2.5 w-2.5 rounded-full bg-secondary"></span>
						TV ({formatBytes(storage.tvUsedBytes)})
					</span>
					<span class="inline-flex items-center gap-1.5">
						<span class="inline-block h-2.5 w-2.5 rounded-full bg-accent"></span>
						Subtitles ({formatBytes(storage.subtitlesUsedBytes)})
					</span>
				</div>
			</div>
		</div>
	</div>
	<div class="mt-2 flex justify-end">
		<a href="/settings/general/status/media" class="btn gap-2 btn-ghost btn-sm">
			Browse all media
			<ExternalLink class="h-3.5 w-3.5" />
		</a>
	</div>
{/if}

{#if scanError}
	<div class="mt-4 alert alert-error">
		<AlertCircle class="h-5 w-5" />
		<span>{scanError}</span>
	</div>
{/if}

{#if scanSuccess}
	<div class="mt-4 alert alert-success">
		<CheckCircle class="h-5 w-5" />
		<div class="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<span>{scanSuccess.message}</span>
			{#if scanSuccess.unmatchedCount > 0}
				<a href="/library/unmatched" class="btn gap-1 btn-ghost btn-sm">
					{m.settings_general_viewUnmatchedFiles({ count: scanSuccess.unmatchedCount })}
					<ExternalLink class="h-3 w-3" />
				</a>
			{/if}
		</div>
	</div>
{/if}

{#if scanning && scanProgress}
	<div class="card mt-4 bg-base-200 p-3 sm:p-4">
		<div class="mb-2 flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
			<span class="max-w-md truncate">
				{scanProgress.phase === 'scanning' ? m.settings_general_discoveringFiles() : ''}
				{scanProgress.phase === 'processing' ? m.settings_general_processing() : ''}
				{scanProgress.phase === 'matching' ? m.settings_general_matchingFiles() : ''}
				{scanProgress.rootFolderPath ?? ''}
			</span>
			<span class="text-base-content/60">
				{scanProgress.filesProcessed} / {scanProgress.filesFound}
				{m.common_files()}
			</span>
		</div>
		<progress
			class="progress w-full progress-primary"
			value={scanProgress.filesProcessed}
			max={scanProgress.filesFound || 1}
		></progress>
		<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/60">
			<span>{m.settings_general_scanAdded()}: {scanProgress.filesAdded}</span>
			<span>{m.settings_general_scanUpdated()}: {scanProgress.filesUpdated}</span>
			<span>{m.settings_general_scanRemoved()}: {scanProgress.filesRemoved}</span>
			<span>{m.settings_general_scanUnmatched()}: {scanProgress.unmatchedCount}</span>
		</div>
		{#if scanProgress.currentFile}
			<div class="mt-2 truncate text-xs text-base-content/50">
				{scanProgress.currentFile}
			</div>
		{/if}
	</div>
{/if}

<div
	class="mt-4 flex flex-col gap-3 rounded-lg border border-base-300 bg-base-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
>
	<div class="flex items-center gap-3 text-sm">
		<span
			class="inline-block h-2 w-2 shrink-0 rounded-full {getScanTone(
				storage.health.lastScan?.status
			)}"
		></span>
		{#if storage.health.lastScan}
			<span class="text-base-content/70">
				{m.settings_general_lastScan()}:
				<strong class="text-base-content"
					>{formatTimestamp(
						storage.health.lastScan.completedAt ?? storage.health.lastScan.startedAt
					)}</strong
				>
				{#if storage.health.lastScan.durationMs}
					<span class="text-base-content/50"
						>({formatDuration(storage.health.lastScan.durationMs)})</span
					>
				{/if}
			</span>
			<span class="hidden text-base-content/50 sm:inline">
				— {storage.health.lastScan.filesScanned} scanned, {storage.health.lastScan.filesAdded} added
			</span>
		{:else}
			<span class="text-base-content/50">{m.settings_general_noScanHistory()}</span>
		{/if}
	</div>
	{#if serverStatuses.length > 0}
		<div class="flex flex-wrap gap-2">
			{#each serverStatuses as server (server.serverId)}
				<span class="inline-flex items-center gap-1.5 text-xs text-base-content/70">
					<span>{getServerTypeIcon(server.serverType)}</span>
					<span>{server.serverName}</span>
					<span
						class="badge badge-xs {getSyncStatusColor(server.lastSyncStatus, server.lastSyncAt)}"
					>
						{server.lastSyncStatus ?? 'pending'}
					</span>
				</span>
			{/each}
		</div>
	{:else}
		<div class="flex items-center gap-2 text-xs text-base-content/40">
			<Server class="h-3.5 w-3.5" />
			No media servers
		</div>
	{/if}
</div>

<div id="libraries" class="mt-6">
	<div class="mb-3 flex items-center gap-2">
		<Library class="h-4 w-4" />
		<h3 class="font-semibold">Libraries &amp; Storage</h3>
	</div>

	<LibraryBreakdownMobileList
		libraryBreakdown={storage.libraryBreakdown}
		{rootFolderMap}
		{unassignedRootFolders}
		{scanning}
		{formatBytes}
		{libraries}
		{rootFolders}
		{onEditLibrary}
		{onEditRootFolder}
		{onScanRootFolder}
	/>

	<LibraryBreakdownTable
		libraryBreakdown={storage.libraryBreakdown}
		{rootFolderMap}
		{unassignedRootFolders}
		{scanning}
		{formatBytes}
		{libraries}
		{rootFolders}
		{onEditLibrary}
		{onEditRootFolder}
		{onScanRootFolder}
	/>
</div>
