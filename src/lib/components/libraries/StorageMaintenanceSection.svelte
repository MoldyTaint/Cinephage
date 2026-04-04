<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import {
		CheckCircle,
		AlertCircle,
		ExternalLink,
		Film,
		Library,
		FolderOpen,
		Database,
		ShieldAlert,
		Link2Off,
		Clock3,
		RefreshCw,
		Eye,
		EyeOff,
		Captions,
		CaptionsOff,
		Search,
		SearchSlash,
		HardDrive
	} from 'lucide-svelte';

	type StorageSummary = {
		totalUsedBytes: number;
		moviesUsedBytes: number;
		tvUsedBytes: number;
		subtitlesUsedBytes: number;
		movieCount: number;
		seriesCount: number;
		subtitleCount: number;
		libraryBreakdown: Array<{
			id: string;
			name: string;
			mediaType: string;
			mediaSubType: string;
			itemCount: number;
			usedBytes: number;
			path?: string | null;
			hasRootFolder?: boolean;
			rootFolderCount?: number;
			detachedItemCount?: number;
			defaultMonitored?: boolean;
			defaultSearchOnAdd?: boolean;
			defaultWantsSubtitles?: boolean;
			unmatchedCount?: number;
			needsScan?: boolean;
		}>;
		rootFolderBreakdown: Array<{
			id: string;
			name: string;
			mediaType: string;
			mediaSubType: string;
			itemCount: number;
			usedBytes: number;
			path?: string | null;
			accessible?: boolean;
			readOnly?: boolean;
			freeSpaceBytes?: number | null;
			totalSpaceBytes?: number | null;
			freeSpaceFormatted?: string | null;
			unmatchedCount?: number;
			lastScannedAt?: string | null;
			lastScanStatus?: string | null;
			needsScan?: boolean;
			freeRatio?: number | null;
		}>;
		health: {
			librariesWithoutRootFolder: number;
			inaccessibleRootFolders: number;
			readOnlyRootFolders: number;
			unmatchedFiles: number;
			rootFoldersNeedingScan: number;
			totalDetachedItems: number;
			lastScan: {
				status: string;
				scanType: string;
				startedAt: string | null;
				completedAt: string | null;
				filesScanned: number;
				filesAdded: number;
				filesUpdated: number;
				filesRemoved: number;
				unmatchedFiles: number;
				errorMessage: string | null;
				durationMs: number | null;
			} | null;
		};
	};

	type ScanProgress = {
		phase: string;
		rootFolderId?: string;
		rootFolderPath?: string;
		filesFound: number;
		filesProcessed: number;
		filesAdded: number;
		filesUpdated: number;
		filesRemoved: number;
		unmatchedCount: number;
		currentFile?: string;
	};

	type ScanSuccess = {
		message: string;
		unmatchedCount: number;
	};

	interface Props {
		storage: StorageSummary;
		libraries: Array<{ id: string }>;
		rootFolders: Array<{ id: string }>;
		rootFolderCount: number;
		scanning: boolean;
		scanProgress: ScanProgress | null;
		scanError: string | null;
		scanSuccess: ScanSuccess | null;
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
				href: '#libraries-usage'
			});
		}
		if (storage.health.inaccessibleRootFolders > 0) {
			items.push({
				label: `${storage.health.inaccessibleRootFolders} root folder${storage.health.inaccessibleRootFolders === 1 ? ' is' : 's are'} inaccessible`,
				tone: 'error',
				href: '#root-folders-usage'
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
				href: '#root-folders-usage'
			});
		}
		if (storage.health.rootFoldersNeedingScan > 0) {
			items.push({
				label: `${storage.health.rootFoldersNeedingScan} root folder${storage.health.rootFoldersNeedingScan === 1 ? ' needs' : 's need'} a fresh scan`,
				tone: 'warning',
				href: '#root-folders-usage'
			});
		}
		return items;
	});

	const mediaDistribution = $derived([
		{
			label: 'Movies',
			value: storage.moviesUsedBytes,
			tone: 'bg-primary'
		},
		{
			label: 'TV',
			value: storage.tvUsedBytes,
			tone: 'bg-secondary'
		},
		{
			label: 'Subtitles',
			value: storage.subtitlesUsedBytes,
			tone: 'bg-accent'
		}
	]);

	const topLibraries = $derived(
		[...storage.libraryBreakdown].sort((a, b) => b.usedBytes - a.usedBytes).slice(0, 5)
	);

	const topRootFolders = $derived(
		[...storage.rootFolderBreakdown].sort((a, b) => b.usedBytes - a.usedBytes).slice(0, 5)
	);

	function formatDuration(durationMs: number | null): string {
		if (!durationMs || durationMs < 1000) return m.settings_general_underOneSecond();
		const totalSeconds = Math.round(durationMs / 1000);
		if (totalSeconds < 60) return `${totalSeconds}s`;
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
	}

	function formatTimestamp(timestamp: string | null): string {
		if (!timestamp) return m.settings_general_never();
		return new Date(timestamp).toLocaleString();
	}

	function getScanTone(status: string | null | undefined): string {
		if (status === 'completed') return 'text-success';
		if (status === 'failed') return 'text-error';
		if (status === 'running') return 'text-warning';
		return 'text-base-content/70';
	}

	function ratioWidth(value: number, total: number): string {
		if (total <= 0) return '0%';
		return `${Math.max(6, Math.round((value / total) * 100))}%`;
	}

	function getStatusBadgeClass(enabled: boolean): string {
		return enabled
			? 'border-success/30 bg-success/10 text-success'
			: 'border-error/30 bg-error/10 text-error';
	}

	function formatPercent(value: number | null | undefined): string {
		if (value === null || value === undefined) return 'N/A';
		return `${Math.round(value * 100)}%`;
	}

	function getRootFolderTotalBytes(
		item: StorageSummary['rootFolderBreakdown'][number]
	): number | null {
		if (item.totalSpaceBytes === null || item.totalSpaceBytes === undefined) return null;
		return item.totalSpaceBytes;
	}

	function getUsedRatio(item: StorageSummary['rootFolderBreakdown'][number]): number | null {
		const totalBytes = getRootFolderTotalBytes(item);
		if (!totalBytes || totalBytes <= 0) return null;
		return item.usedBytes / totalBytes;
	}

	function getFreeRatio(item: StorageSummary['rootFolderBreakdown'][number]): number | null {
		const totalBytes = getRootFolderTotalBytes(item);
		if (
			!totalBytes ||
			totalBytes <= 0 ||
			item.freeSpaceBytes === null ||
			item.freeSpaceBytes === undefined
		) {
			return null;
		}
		return Number(item.freeSpaceBytes) / totalBytes;
	}

	function getNonCinephageUsedBytes(
		item: StorageSummary['rootFolderBreakdown'][number]
	): number | null {
		const totalBytes = getRootFolderTotalBytes(item);
		if (!totalBytes || item.freeSpaceBytes === null || item.freeSpaceBytes === undefined)
			return null;
		return Math.max(0, totalBytes - Number(item.freeSpaceBytes) - item.usedBytes);
	}

	function getNonCinephageRatio(
		item: StorageSummary['rootFolderBreakdown'][number]
	): number | null {
		const totalBytes = getRootFolderTotalBytes(item);
		const bytes = getNonCinephageUsedBytes(item);
		if (!totalBytes || bytes === null) return null;
		return bytes / totalBytes;
	}

	function segmentWidth(ratio: number | null | undefined): string {
		if (ratio === null || ratio === undefined || ratio <= 0) return '0%';
		return `${Math.round(ratio * 100)}%`;
	}

	function getRootFolderScanLabel(item: StorageSummary['rootFolderBreakdown'][number]): string {
		if (item.lastScanStatus === 'completed') return m.settings_general_scanned();
		if (item.lastScanStatus === 'failed') return m.settings_general_scanFailed();
		if (item.lastScanStatus === 'running') return m.settings_general_scanning();
		if (item.needsScan) return m.settings_general_needsScan();
		return m.settings_general_pending();
	}

	function getRootFolderScanBadgeClass(
		item: StorageSummary['rootFolderBreakdown'][number]
	): string {
		if (item.lastScanStatus === 'completed') return 'bg-success/15 text-success';
		if (item.lastScanStatus === 'failed') return 'bg-error/15 text-error';
		if (item.lastScanStatus === 'running') return 'bg-warning/20 text-warning-content';
		if (item.needsScan) return 'bg-warning/20 text-warning-content';
		return 'bg-base-200 text-base-content/70';
	}

	function hasLibrary(id: string): boolean {
		return libraries.some((library) => library.id === id);
	}

	function hasRootFolder(id: string): boolean {
		return rootFolders.some((folder) => folder.id === id);
	}

	const DISK_SEGMENT_STYLES = {
		cinephage: 'background-color: #0ea5e9;',
		other: 'background-color: #f59e0b;',
		free: 'background-color: #22c55e;'
	} as const;
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
	<div class="mt-4 alert alert-warning">
		<AlertCircle class="h-5 w-5" />
		<span>{m.settings_general_addFolderFirst()}</span>
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

<div class="mt-6 space-y-4">
	<div class="rounded-lg border border-base-300 bg-base-100 p-4">
		<div class="mb-3 flex items-center gap-2">
			<RefreshCw class="h-4 w-4" />
			<h3 class="font-semibold">{m.settings_general_scanStatus()}</h3>
		</div>
		<div class="grid grid-cols-2 gap-3 xl:grid-cols-3">
			<div class="card bg-base-200 shadow-sm">
				<div class="card-body p-4">
					<div class="flex items-center gap-2 text-sm text-base-content/60">
						<Clock3 class="h-4 w-4" />
						{m.settings_general_lastScan()}
					</div>
					<div class="mt-2 text-base font-semibold">
						{storage.health.lastScan
							? formatTimestamp(
									storage.health.lastScan.completedAt ?? storage.health.lastScan.startedAt
								)
							: 'Never'}
					</div>
					<div class={`text-xs ${getScanTone(storage.health.lastScan?.status)}`}>
						{storage.health.lastScan
							? storage.health.lastScan.status
							: m.settings_general_noScanHistory()}
					</div>
				</div>
			</div>
			<div class="card bg-base-200 shadow-sm">
				<div class="card-body p-4">
					<div class="flex items-center gap-2 text-sm text-base-content/60">
						<RefreshCw class="h-4 w-4" />
						{m.settings_general_scanHealth()}
					</div>
					<div
						class={`mt-2 text-base font-semibold ${getScanTone(storage.health.lastScan?.status)}`}
					>
						{storage.health.lastScan?.status === 'completed'
							? m.settings_general_healthy()
							: storage.health.lastScan?.status === 'running'
								? m.settings_general_running()
								: storage.health.lastScan?.status === 'failed'
									? m.settings_general_attentionNeeded()
									: m.settings_general_pendingFirstScan()}
					</div>
					<div class="text-xs text-base-content/50">
						{formatDuration(storage.health.lastScan?.durationMs ?? null)}
					</div>
				</div>
			</div>
			<div class="card col-span-2 bg-base-200 shadow-sm xl:col-span-1">
				<div class="card-body p-4">
					<div class="flex items-center gap-2 text-sm text-base-content/60">
						<FolderOpen class="h-4 w-4" />
						{m.settings_general_unmatchedFiles()}
					</div>
					<div class="mt-2 text-xl font-semibold sm:text-2xl">{storage.health.unmatchedFiles}</div>
					<div class="text-xs text-base-content/50">{m.settings_general_unmatchedFilesHint()}</div>
				</div>
			</div>
		</div>
	</div>

	<div class="rounded-lg border border-base-300 bg-base-100 p-4">
		<div class="mb-3 flex items-center gap-2">
			<Database class="h-4 w-4" />
			<h3 class="font-semibold">{m.settings_general_storageOverview()}</h3>
		</div>
		<div class="grid grid-cols-2 gap-3 xl:grid-cols-3">
			<div class="card bg-base-200 shadow-sm">
				<div class="card-body p-4">
					<div class="flex items-center gap-2 text-sm text-base-content/60">
						<Link2Off class="h-4 w-4" />
						{m.settings_general_detachedItems()}
					</div>
					<div class="mt-2 text-xl font-semibold sm:text-2xl">
						{storage.health.totalDetachedItems}
					</div>
					<div class="text-xs text-base-content/50">{m.settings_general_detachedItemsHint()}</div>
				</div>
			</div>
			<div class="card bg-base-200 shadow-sm">
				<div class="card-body p-4">
					<div class="flex items-center gap-2 text-sm text-base-content/60">
						<AlertCircle class="h-4 w-4" />
						{m.settings_general_inaccessibleFolders()}
					</div>
					<div class="mt-2 text-xl font-semibold sm:text-2xl">
						{storage.health.inaccessibleRootFolders}
					</div>
					<div class="text-xs text-base-content/50">
						{m.settings_general_inaccessibleFoldersHint()}
					</div>
				</div>
			</div>
			<div class="card col-span-2 bg-base-200 shadow-sm xl:col-span-1">
				<div class="card-body p-4">
					<div class="flex items-center gap-2 text-sm text-base-content/60">
						<Database class="h-4 w-4" />
						Total storage
					</div>
					<div class="mt-2 text-xl font-semibold sm:text-2xl">
						{formatBytes(storage.totalUsedBytes)}
					</div>
					<div class="text-xs text-base-content/50">
						{storage.movieCount} movies, {storage.seriesCount} series, {storage.subtitleCount} subtitles
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<div class="mt-4 rounded-lg border border-base-300 bg-base-100 p-4">
	<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
		<div>
			<div class="flex items-center gap-2">
				<RefreshCw class="h-4 w-4" />
				<h3 class="font-semibold">{m.settings_general_scanDetails()}</h3>
			</div>
			<div class="mt-1 text-sm text-base-content/60">
				{m.settings_general_scanDetailsDescription()}
			</div>
		</div>
		{#if storage.health.lastScan}
			<div
				class={`badge border-none badge-lg ${getScanTone(storage.health.lastScan.status).includes('success') ? 'bg-success/15 text-success' : getScanTone(storage.health.lastScan.status).includes('error') ? 'bg-error/15 text-error' : getScanTone(storage.health.lastScan.status).includes('warning') ? 'bg-warning/20 text-warning-content' : 'bg-base-200 text-base-content/70'}`}
			>
				{storage.health.lastScan.status}
			</div>
		{/if}
	</div>
	<div class="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-5">
		<div class="rounded-lg bg-base-200 p-3">
			<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
				{m.settings_general_filesScanned()}
			</div>
			<div class="mt-1 text-lg font-semibold">{storage.health.lastScan?.filesScanned ?? 0}</div>
		</div>
		<div class="rounded-lg bg-base-200 p-3">
			<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
				{m.settings_general_scanAdded()}
			</div>
			<div class="mt-1 text-lg font-semibold">{storage.health.lastScan?.filesAdded ?? 0}</div>
		</div>
		<div class="rounded-lg bg-base-200 p-3">
			<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
				{m.settings_general_scanUpdated()}
			</div>
			<div class="mt-1 text-lg font-semibold">{storage.health.lastScan?.filesUpdated ?? 0}</div>
		</div>
		<div class="rounded-lg bg-base-200 p-3">
			<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
				{m.settings_general_scanRemoved()}
			</div>
			<div class="mt-1 text-lg font-semibold">{storage.health.lastScan?.filesRemoved ?? 0}</div>
		</div>
		<div class="col-span-2 rounded-lg bg-base-200 p-3 xl:col-span-1">
			<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
				{m.settings_general_scanUnmatched()}
			</div>
			<div class="mt-1 text-lg font-semibold">{storage.health.lastScan?.unmatchedFiles ?? 0}</div>
		</div>
	</div>
	{#if storage.health.lastScan?.errorMessage}
		<div class="mt-3 rounded-lg bg-error/10 p-3 text-sm text-error">
			{storage.health.lastScan.errorMessage}
		</div>
	{/if}
</div>

<div class="mt-4 grid gap-4 xl:grid-cols-3">
	<div class="rounded-lg border border-base-300 bg-base-100 p-4 xl:col-span-1">
		<div class="mb-3 flex items-center gap-2">
			<Film class="h-4 w-4" />
			<h3 class="font-semibold">{m.settings_general_diskUsageByType()}</h3>
		</div>
		<div class="space-y-3">
			{#each mediaDistribution as item (item.label)}
				<div>
					<div class="mb-1 flex items-center justify-between text-sm">
						<span>{item.label}</span>
						<span class="text-base-content/60">{formatBytes(item.value)}</span>
					</div>
					<div class="h-2 rounded-full bg-base-200">
						<div
							class={`h-2 rounded-full ${item.tone}`}
							style={`width: ${ratioWidth(item.value, storage.totalUsedBytes)}`}
						></div>
					</div>
				</div>
			{/each}
		</div>
	</div>
	<div class="rounded-lg border border-base-300 bg-base-100 p-4 xl:col-span-1">
		<div class="mb-3 flex items-center gap-2">
			<Library class="h-4 w-4" />
			<h3 class="font-semibold">{m.settings_general_topLibrariesByUsage()}</h3>
		</div>
		<div class="space-y-3">
			{#if topLibraries.length === 0}
				<div class="text-sm text-base-content/60">{m.settings_general_noLibraryUsageDataYet()}</div>
			{:else}
				{#each topLibraries as item (item.id)}
					<div>
						<div class="mb-1 flex items-center justify-between gap-3 text-sm">
							<span class="truncate">{item.name}</span>
							<span class="text-base-content/60">{formatBytes(item.usedBytes)}</span>
						</div>
						<div class="h-2 rounded-full bg-base-200">
							<div
								class="h-2 rounded-full bg-primary"
								style={`width: ${ratioWidth(item.usedBytes, storage.totalUsedBytes)}`}
							></div>
						</div>
					</div>
				{/each}
			{/if}
		</div>
	</div>
	<div class="rounded-lg border border-base-300 bg-base-100 p-4 xl:col-span-1">
		<div class="mb-3 flex items-center gap-2">
			<HardDrive class="h-4 w-4" />
			<h3 class="font-semibold">{m.settings_general_topRootFoldersByUsage()}</h3>
		</div>
		<div class="space-y-3">
			{#if topRootFolders.length === 0}
				<div class="text-sm text-base-content/60">
					{m.settings_general_noRootFolderUsageDataYet()}
				</div>
			{:else}
				{#each topRootFolders as item (item.id)}
					<div>
						<div class="mb-1 flex items-center justify-between gap-3 text-sm">
							<span class="truncate">{item.name}</span>
							<span class="text-base-content/60">{formatBytes(item.usedBytes)}</span>
						</div>
						<div class="h-2 rounded-full bg-base-200">
							<div
								class="h-2 rounded-full bg-secondary"
								style={`width: ${ratioWidth(item.usedBytes, storage.totalUsedBytes)}`}
							></div>
						</div>
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>

<div class="mt-6 grid gap-6 xl:grid-cols-2">
	<div id="libraries-usage">
		<div class="mb-3 flex items-center gap-2">
			<Library class="h-4 w-4" />
			<h3 class="font-semibold">{m.settings_general_libraryUsage()}</h3>
		</div>
		<div class="space-y-3 md:hidden">
			{#each storage.libraryBreakdown as item (item.id)}
				<div class="rounded-lg border border-base-300 bg-base-100 p-3">
					<div class="flex items-start justify-between gap-3">
						<div class="font-medium">{item.name}</div>
						{#if item.hasRootFolder === false}
							<span class="badge border-none bg-warning/20 badge-sm text-warning-content">
								{m.settings_general_noRootFolder()}
							</span>
						{/if}
					</div>
					<div class="mt-1 text-xs text-base-content/50">
						{item.path ?? m.settings_general_noRootFolderAssigned()}
					</div>
					<div class="mt-2 flex flex-wrap gap-1">
						{#if item.mediaSubType === 'anime'}
							<span class="badge border-none bg-warning/20 badge-sm text-warning-content">
								{m.settings_general_badgeAnime()}
							</span>
						{/if}
						{#if item.needsScan}
							<span class="badge border-none bg-warning/20 badge-sm text-warning-content">
								{m.settings_general_needsScan()}
							</span>
						{/if}
						{#if (item.unmatchedCount ?? 0) > 0}
							<span class="badge border-none bg-info/15 badge-sm text-info">
								{m.settings_general_unmatchedCount({ count: item.unmatchedCount ?? 0 })}
							</span>
						{/if}
						{#if (item.detachedItemCount ?? 0) > 0}
							<span class="badge border-none bg-error/15 badge-sm text-error">
								{m.settings_general_detachedCount({ count: item.detachedItemCount ?? 0 })}
							</span>
						{/if}
					</div>
					<div class="mt-3 grid grid-cols-3 gap-2 text-sm">
						<div>
							<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
								{m.settings_general_classShort()}
							</div>
							<div>{item.mediaType} / {item.mediaSubType}</div>
						</div>
						<div>
							<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
								{m.settings_general_columnItems()}
							</div>
							<div>{item.itemCount}</div>
						</div>
						<div>
							<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
								{m.settings_general_columnUsed()}
							</div>
							<div>{formatBytes(item.usedBytes)}</div>
						</div>
					</div>
					<div class="mt-3 grid grid-cols-2 gap-2 text-sm">
						<div>
							<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
								{m.settings_general_rootFoldersLabel()}
							</div>
							<div>{item.rootFolderCount ?? 0}</div>
						</div>
						<div>
							<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
								{m.settings_general_detachedItems()}
							</div>
							<div>{item.detachedItemCount ?? 0}</div>
						</div>
					</div>
					<div class="mt-3 flex flex-wrap gap-2">
						<span
							class={`badge border-none badge-sm ${getStatusBadgeClass(item.defaultMonitored ?? false)}`}
							title={m.settings_general_statusTooltip({
								label: m.settings_general_monitorByDefault(),
								status: item.defaultMonitored ? m.common_enabled() : m.common_disabled()
							})}
						>
							{#if item.defaultMonitored}
								<Eye class="h-3 w-3" />
							{:else}
								<EyeOff class="h-3 w-3" />
							{/if}
						</span>
						<span
							class={`badge border-none badge-sm ${getStatusBadgeClass(item.defaultSearchOnAdd ?? false)}`}
							title={m.settings_general_statusTooltip({
								label: m.settings_general_searchOnAddLabel(),
								status: item.defaultSearchOnAdd ? m.common_enabled() : m.common_disabled()
							})}
						>
							{#if item.defaultSearchOnAdd}
								<Search class="h-3 w-3" />
							{:else}
								<SearchSlash class="h-3 w-3" />
							{/if}
						</span>
						<span
							class={`badge border-none badge-sm ${getStatusBadgeClass(item.defaultWantsSubtitles ?? false)}`}
							title={m.settings_general_statusTooltip({
								label: m.settings_general_wantSubtitles(),
								status: item.defaultWantsSubtitles ? m.common_enabled() : m.common_disabled()
							})}
						>
							{#if item.defaultWantsSubtitles}
								<Captions class="h-3 w-3" />
							{:else}
								<CaptionsOff class="h-3 w-3" />
							{/if}
						</span>
					</div>
					{#if (item.hasRootFolder === false || (item.detachedItemCount ?? 0) > 0) && hasLibrary(item.id)}
						<div class="mt-1 flex flex-wrap gap-2">
							<button class="btn ml-auto btn-outline btn-xs" onclick={() => onEditLibrary(item.id)}>
								{m.settings_general_reviewLibrary()}
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
		<div class="hidden overflow-x-auto rounded-lg border border-base-300 md:block">
			<table class="table table-sm">
				<thead>
					<tr>
						<th>{m.settings_general_columnLibrary()}</th>
						<th>{m.settings_general_columnClassification()}</th>
						<th>{m.settings_general_columnItems()}</th>
						<th>{m.settings_general_columnUsed()}</th>
					</tr>
				</thead>
				<tbody>
					{#each storage.libraryBreakdown as item (item.id)}
						<tr>
							<td>
								<div class="flex items-center gap-2">
									<div class="font-medium">{item.name}</div>
									{#if item.hasRootFolder === false}
										<span class="badge border-none bg-warning badge-sm text-warning-content">
											{m.settings_general_noRootFolder()}
										</span>
									{/if}
									{#if item.mediaSubType === 'anime'}
										<span class="badge border-none bg-warning/20 badge-sm text-warning-content">
											{m.settings_general_badgeAnime()}
										</span>
									{/if}
									{#if item.needsScan}
										<span class="badge border-none bg-warning/20 badge-sm text-warning-content">
											{m.settings_general_needsScan()}
										</span>
									{/if}
									{#if (item.unmatchedCount ?? 0) > 0}
										<span class="badge border-none bg-info/15 badge-sm text-info">
											{m.settings_general_unmatchedCount({ count: item.unmatchedCount ?? 0 })}
										</span>
									{/if}
									{#if (item.detachedItemCount ?? 0) > 0}
										<span class="badge border-none bg-error/15 badge-sm text-error">
											{m.settings_general_detachedCount({ count: item.detachedItemCount ?? 0 })}
										</span>
									{/if}
								</div>
								<div class="text-xs text-base-content/50">
									{item.path ?? m.settings_general_noRootFolderAssigned()}
								</div>
								<div class="mt-2 flex flex-wrap gap-1">
									<span
										class={`badge border-none badge-sm ${getStatusBadgeClass(item.defaultMonitored ?? false)}`}
										title={m.settings_general_statusTooltip({
											label: m.settings_general_monitorByDefault(),
											status: item.defaultMonitored ? m.common_enabled() : m.common_disabled()
										})}
									>
										{#if item.defaultMonitored}
											<Eye class="h-3 w-3" />
										{:else}
											<EyeOff class="h-3 w-3" />
										{/if}
									</span>
									<span
										class={`badge border-none badge-sm ${getStatusBadgeClass(item.defaultSearchOnAdd ?? false)}`}
										title={m.settings_general_statusTooltip({
											label: m.settings_general_searchOnAddLabel(),
											status: item.defaultSearchOnAdd ? m.common_enabled() : m.common_disabled()
										})}
									>
										{#if item.defaultSearchOnAdd}
											<Search class="h-3 w-3" />
										{:else}
											<SearchSlash class="h-3 w-3" />
										{/if}
									</span>
									<span
										class={`badge border-none badge-sm ${getStatusBadgeClass(item.defaultWantsSubtitles ?? false)}`}
										title={m.settings_general_statusTooltip({
											label: m.settings_general_wantSubtitles(),
											status: item.defaultWantsSubtitles ? m.common_enabled() : m.common_disabled()
										})}
									>
										{#if item.defaultWantsSubtitles}
											<Captions class="h-3 w-3" />
										{:else}
											<CaptionsOff class="h-3 w-3" />
										{/if}
									</span>
								</div>
								{#if (item.hasRootFolder === false || (item.detachedItemCount ?? 0) > 0) && hasLibrary(item.id)}
									<div class="mt-2">
										<button class="btn btn-outline btn-xs" onclick={() => onEditLibrary(item.id)}>
											{m.settings_general_reviewLibrary()}
										</button>
									</div>
								{/if}
							</td>
							<td>{item.mediaType} / {item.mediaSubType}</td>
							<td>
								<div>{item.itemCount}</div>
								<div class="text-xs text-base-content/50">
									{m.settings_general_rootFoldersCount({ count: item.rootFolderCount ?? 0 })}
								</div>
							</td>
							<td>
								<div>{formatBytes(item.usedBytes)}</div>
								<div class="text-xs text-base-content/50">
									{m.settings_general_detachedCount({ count: item.detachedItemCount ?? 0 })}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<div id="root-folders-usage">
		<div class="mb-3 flex items-center gap-2">
			<FolderOpen class="h-4 w-4" />
			<h3 class="font-semibold">{m.settings_general_rootFolderUsage()}</h3>
		</div>
		<div class="space-y-3 md:hidden">
			{#each storage.rootFolderBreakdown as item (item.id)}
				<div class="rounded-lg border border-base-300 bg-base-100 p-3">
					<div class="flex items-start justify-between gap-3">
						<div class="font-medium">{item.name}</div>
						<div class="flex flex-wrap justify-end gap-1">
							{#if item.accessible === false}
								<span class="badge border-none bg-error/15 badge-sm text-error"
									>{m.settings_general_inaccessible()}</span
								>
							{/if}
							{#if item.readOnly}
								<span class="badge border-none bg-info/15 badge-sm text-info"
									>{m.rootFolders_badgeReadOnly()}</span
								>
							{/if}
						</div>
					</div>
					<div class="mt-1 text-xs text-base-content/50">{item.path}</div>
					<div class="mt-2 flex flex-wrap gap-1">
						{#if item.mediaSubType === 'anime'}
							<span class="badge border-none bg-warning/20 badge-sm text-warning-content">
								{m.settings_general_badgeAnime()}
							</span>
						{/if}
						{#if item.needsScan}
							<span class="badge border-none bg-warning/20 badge-sm text-warning-content">
								{m.settings_general_needsScan()}
							</span>
						{/if}
						{#if (item.unmatchedCount ?? 0) > 0}
							<span class="badge border-none bg-info/15 badge-sm text-info">
								{m.settings_general_unmatchedCount({ count: item.unmatchedCount ?? 0 })}
							</span>
						{/if}
						<span class={`badge border-none badge-sm ${getRootFolderScanBadgeClass(item)}`}>
							{getRootFolderScanLabel(item)}
						</span>
					</div>
					<div class="mt-3 grid grid-cols-3 gap-2 text-sm">
						<div>
							<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
								{m.settings_general_classShort()}
							</div>
							<div>{item.mediaType} / {item.mediaSubType}</div>
						</div>
						<div>
							<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
								{m.settings_general_columnItems()}
							</div>
							<div>{item.itemCount}</div>
						</div>
						<div>
							<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
								{m.settings_general_columnUsed()}
							</div>
							<div>{formatBytes(item.usedBytes)}</div>
						</div>
					</div>
					<div class="mt-3 grid grid-cols-2 gap-2 text-sm">
						<div>
							<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
								{m.settings_general_diskFree()}
							</div>
							<div>{item.freeSpaceFormatted ?? 'N/A'}</div>
						</div>
						<div>
							<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
								{m.settings_general_diskCapacity()}
							</div>
							<div>
								{getRootFolderTotalBytes(item)
									? formatBytes(getRootFolderTotalBytes(item) ?? 0)
									: 'N/A'}
							</div>
						</div>
						<div>
							<div class="text-[11px] tracking-wide text-base-content/50 uppercase">
								{m.settings_general_lastScan()}
							</div>
							<div>{formatTimestamp(item.lastScannedAt ?? null)}</div>
						</div>
					</div>
					{#if getUsedRatio(item) !== null}
						<div class="mt-3">
							<div class="mb-1 flex items-center justify-between text-xs text-base-content/60">
								<span>{m.settings_general_trackedMediaDiskUsage()}</span>
								<span>{formatPercent(getUsedRatio(item))}</span>
							</div>
							<div class="flex h-2 overflow-hidden rounded-full bg-base-200">
								<div
									class="h-2"
									style={`${DISK_SEGMENT_STYLES.cinephage} width: ${segmentWidth(getUsedRatio(item))}`}
									title={`Cinephage tracked media disk usage: ${formatBytes(item.usedBytes)}`}
								></div>
								<div
									class="h-2"
									style={`${DISK_SEGMENT_STYLES.other} width: ${segmentWidth(getNonCinephageRatio(item))}`}
									title={`Other disk usage: ${formatBytes(getNonCinephageUsedBytes(item) ?? 0)}`}
								></div>
								<div
									class="h-2"
									style={`${DISK_SEGMENT_STYLES.free} width: ${segmentWidth(getFreeRatio(item))}`}
									title={`Disk free: ${item.freeSpaceFormatted ?? 'N/A'}`}
								></div>
							</div>
							<div class="mt-2 flex flex-wrap gap-3 text-xs text-base-content/60">
								<span class="inline-flex items-center gap-1.5">
									<span class="h-2.5 w-2.5 rounded-full" style={DISK_SEGMENT_STYLES.cinephage}
									></span>
									{m.settings_general_cinephageTracked({ used: formatBytes(item.usedBytes) })}
								</span>
								{#if getNonCinephageUsedBytes(item) !== null}
									<span class="inline-flex items-center gap-1.5">
										<span class="h-2.5 w-2.5 rounded-full" style={DISK_SEGMENT_STYLES.other}></span>
										{m.settings_general_otherDiskUsage({
											used: formatBytes(getNonCinephageUsedBytes(item) ?? 0)
										})}
									</span>
								{/if}
								<span class="inline-flex items-center gap-1.5">
									<span class="h-2.5 w-2.5 rounded-full" style={DISK_SEGMENT_STYLES.free}></span>
									{m.settings_general_freeDiskUsage({
										free: item.freeSpaceFormatted ?? m.common_na()
									})}
								</span>
							</div>
						</div>
					{/if}
					{#if (item.accessible === false || item.needsScan) && hasRootFolder(item.id)}
						<div class="mt-3 flex flex-wrap gap-2">
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
			{/each}
		</div>
		<div class="hidden overflow-x-auto rounded-lg border border-base-300 md:block">
			<table class="table table-sm">
				<thead>
					<tr>
						<th>{m.settings_general_columnRootFolder()}</th>
						<th>{m.settings_general_columnClassification()}</th>
						<th>{m.settings_general_columnItems()}</th>
						<th>{m.settings_general_columnUsed()}</th>
					</tr>
				</thead>
				<tbody>
					{#each storage.rootFolderBreakdown as item (item.id)}
						<tr>
							<td>
								<div class="flex items-center gap-2">
									<div class="font-medium">{item.name}</div>
									{#if item.accessible === false}
										<span class="badge border-none bg-error/15 badge-sm text-error"
											>{m.settings_general_inaccessible()}</span
										>
									{/if}
									{#if item.readOnly}
										<span class="badge border-none bg-info/15 badge-sm text-info"
											>{m.rootFolders_badgeReadOnly()}</span
										>
									{/if}
									{#if item.mediaSubType === 'anime'}
										<span class="badge border-none badge-sm text-warning-content badge-accent">
											{m.settings_general_badgeAnime()}
										</span>
									{/if}
									{#if item.needsScan}
										<span class="badge border-none bg-warning/20 badge-sm text-warning-content">
											{m.settings_general_needsScan()}
										</span>
									{/if}
									{#if (item.unmatchedCount ?? 0) > 0}
										<span class="badge border-none bg-info/15 badge-sm text-info">
											{m.settings_general_unmatchedCount({ count: item.unmatchedCount ?? 0 })}
										</span>
									{/if}
									<span class={`badge border-none badge-sm ${getRootFolderScanBadgeClass(item)}`}>
										{getRootFolderScanLabel(item)}
									</span>
								</div>
								<div class="text-xs text-base-content/50">{item.path}</div>
								<div class="mt-2 text-xs text-base-content/50">
									{m.settings_general_lastScanLabel({
										value: formatTimestamp(item.lastScannedAt ?? null)
									})}
								</div>
								{#if (item.accessible === false || item.needsScan) && hasRootFolder(item.id)}
									<div class="mt-2 flex flex-wrap gap-2">
										<button
											class="btn btn-outline btn-xs"
											onclick={() => onEditRootFolder(item.id)}
										>
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
							</td>
							<td>{item.mediaType} / {item.mediaSubType}</td>
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
								<div class="text-xs text-base-content/50">
									{#if getNonCinephageUsedBytes(item) !== null}
										{m.settings_general_otherDiskUsage({
											used: formatBytes(getNonCinephageUsedBytes(item) ?? 0)
										})}
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
