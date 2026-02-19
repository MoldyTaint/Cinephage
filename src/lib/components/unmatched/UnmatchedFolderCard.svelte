<script lang="ts">
	import { Folder, ChevronDown, ChevronUp, Link } from 'lucide-svelte';
	import type { UnmatchedFolder } from '$lib/types/unmatched.js';

	interface Props {
		folder: UnmatchedFolder;
		expanded?: boolean;
		onToggle?: () => void;
		onMatch?: () => void;
	}

	let { folder, expanded = false, onToggle, onMatch }: Props = $props();

	function formatSize(bytes: number | null): string {
		if (!bytes) return 'Unknown';
		const gb = bytes / (1024 * 1024 * 1024);
		if (gb >= 1) return `${gb.toFixed(2)} GB`;
		const mb = bytes / (1024 * 1024);
		return `${mb.toFixed(1)} MB`;
	}
</script>

<div class="card bg-base-200">
	<div class="card-body p-4">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex items-start gap-3">
				<div class="rounded-lg bg-base-300 p-2">
					<Folder class="h-5 w-5 text-primary" />
				</div>
				<div class="min-w-0 flex-1">
					<h3 class="truncate font-medium" title={folder.folderPath}>
						{folder.folderName}
						{#if folder.isShowFolder}
							<span class="ml-2 badge badge-sm badge-primary">Show</span>
						{/if}
					</h3>
					<p class="truncate text-sm text-base-content/60">{folder.folderPath}</p>
					<div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
						<span class="badge badge-sm">
							{folder.fileCount} file{folder.fileCount !== 1 ? 's' : ''}
						</span>
						<span class="badge badge-outline badge-sm">
							{folder.mediaType === 'movie' ? 'Movie' : 'TV'}
						</span>
						{#if folder.seasonFolders && folder.seasonFolders.length > 0}
							<span class="badge badge-sm badge-secondary">
								{folder.seasonFolders.length} season{folder.seasonFolders.length !== 1 ? 's' : ''}
							</span>
						{/if}
						{#each folder.reasons as reason (reason)}
							<span class="badge badge-sm badge-warning">{reason}</span>
						{/each}
					</div>
					{#if folder.commonParsedTitle}
						<p class="mt-1 text-xs text-base-content/50">
							Parsed: {folder.commonParsedTitle}
						</p>
					{/if}
					{#if folder.seasonFolders && folder.seasonFolders.length > 0}
						<div class="mt-2 flex flex-wrap gap-1">
							{#each folder.seasonFolders as season (season.name)}
								<span class="badge badge-outline badge-xs">
									{season.name} ({season.fileCount})
								</span>
							{/each}
						</div>
					{/if}
				</div>
			</div>
			<div class="flex items-center gap-2">
				<button class="btn btn-ghost btn-sm" onclick={onToggle}>
					{#if expanded}
						<ChevronUp class="h-4 w-4" />
						Collapse
					{:else}
						<ChevronDown class="h-4 w-4" />
						Expand
					{/if}
				</button>
				<button class="btn btn-sm btn-primary" onclick={onMatch}>
					<Link class="h-4 w-4" />
					Match {folder.isShowFolder ? 'Show' : 'Folder'}
				</button>
			</div>
		</div>

		{#if expanded}
			<div class="mt-4 border-t border-base-300 pt-4">
				<p class="mb-2 text-xs font-medium text-base-content/60">Files in this folder:</p>
				<div class="space-y-1">
					{#each folder.files as file (file.id)}
						<div class="flex items-center justify-between rounded bg-base-300/50 px-3 py-2 text-sm">
							<span class="truncate">{file.path.split('/').pop()}</span>
							<div class="flex items-center gap-2">
								{#if file.parsedSeason !== null && file.parsedEpisode !== null}
									<span class="badge badge-sm badge-secondary">
										S{String(file.parsedSeason).padStart(2, '0')}E{String(
											file.parsedEpisode
										).padStart(2, '0')}
									</span>
								{/if}
								<span class="text-xs text-base-content/50">{formatSize(file.size)}</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
