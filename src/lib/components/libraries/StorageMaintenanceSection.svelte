<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import {
		CheckCircle,
		AlertCircle,
		ExternalLink,
		Film,
		Tv,
		Library,
		FolderOpen,
		Database
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
		}>;
		rootFolderBreakdown: Array<{
			id: string;
			name: string;
			mediaType: string;
			mediaSubType: string;
			itemCount: number;
			usedBytes: number;
			path?: string | null;
		}>;
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
		rootFolderCount: number;
		scanning: boolean;
		scanProgress: ScanProgress | null;
		scanError: string | null;
		scanSuccess: ScanSuccess | null;
		formatBytes: (value: number) => string;
	}

	let {
		storage,
		rootFolderCount,
		scanning,
		scanProgress,
		scanError,
		scanSuccess,
		formatBytes
	}: Props = $props();
</script>

<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
	<div class="card bg-base-200 shadow-sm">
		<div class="card-body p-4">
			<div class="flex items-center gap-2 text-sm text-base-content/60">
				<Database class="h-4 w-4" />
				Total storage
			</div>
			<div class="mt-2 text-2xl font-semibold">
				{formatBytes(storage.totalUsedBytes)}
			</div>
		</div>
	</div>
	<div class="card bg-base-200 shadow-sm">
		<div class="card-body p-4">
			<div class="flex items-center gap-2 text-sm text-base-content/60">
				<Film class="h-4 w-4" />
				Movies
			</div>
			<div class="mt-2 text-2xl font-semibold">
				{formatBytes(storage.moviesUsedBytes)}
			</div>
			<div class="text-xs text-base-content/50">{storage.movieCount} movies</div>
		</div>
	</div>
	<div class="card bg-base-200 shadow-sm">
		<div class="card-body p-4">
			<div class="flex items-center gap-2 text-sm text-base-content/60">
				<Tv class="h-4 w-4" />
				TV
			</div>
			<div class="mt-2 text-2xl font-semibold">{formatBytes(storage.tvUsedBytes)}</div>
			<div class="text-xs text-base-content/50">{storage.seriesCount} series</div>
		</div>
	</div>
	<div class="card bg-base-200 shadow-sm">
		<div class="card-body p-4">
			<div class="flex items-center gap-2 text-sm text-base-content/60">
				<FolderOpen class="h-4 w-4" />
				Subtitles
			</div>
			<div class="mt-2 text-2xl font-semibold">
				{formatBytes(storage.subtitlesUsedBytes)}
			</div>
			<div class="text-xs text-base-content/50">
				{storage.subtitleCount} subtitle files
			</div>
		</div>
	</div>
</div>

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

<div class="mt-6 grid gap-6 xl:grid-cols-2">
	<div>
		<div class="mb-3 flex items-center gap-2">
			<Library class="h-4 w-4" />
			<h3 class="font-semibold">Library usage</h3>
		</div>
		<div class="overflow-x-auto rounded-lg border border-base-300">
			<table class="table table-sm">
				<thead>
					<tr>
						<th>Library</th>
						<th>Classification</th>
						<th>Items</th>
						<th>Used</th>
					</tr>
				</thead>
				<tbody>
					{#each storage.libraryBreakdown as item (item.id)}
						<tr>
							<td>
								<div class="font-medium">{item.name}</div>
								<div class="text-xs text-base-content/50">
									{item.path ?? 'No root folder assigned'}
								</div>
							</td>
							<td>{item.mediaType} / {item.mediaSubType}</td>
							<td>{item.itemCount}</td>
							<td>{formatBytes(item.usedBytes)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<div>
		<div class="mb-3 flex items-center gap-2">
			<FolderOpen class="h-4 w-4" />
			<h3 class="font-semibold">Root folder usage</h3>
		</div>
		<div class="overflow-x-auto rounded-lg border border-base-300">
			<table class="table table-sm">
				<thead>
					<tr>
						<th>Root folder</th>
						<th>Classification</th>
						<th>Items</th>
						<th>Used</th>
					</tr>
				</thead>
				<tbody>
					{#each storage.rootFolderBreakdown as item (item.id)}
						<tr>
							<td>
								<div class="font-medium">{item.name}</div>
								<div class="text-xs text-base-content/50">{item.path}</div>
							</td>
							<td>{item.mediaType} / {item.mediaSubType}</td>
							<td>{item.itemCount}</td>
							<td>{formatBytes(item.usedBytes)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
