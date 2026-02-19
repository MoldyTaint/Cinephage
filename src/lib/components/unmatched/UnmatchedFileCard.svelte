<script lang="ts">
	import { Clapperboard, Tv, HardDrive, Calendar, AlertCircle } from 'lucide-svelte';
	import type { UnmatchedFile } from '$lib/types/unmatched.js';

	interface Props {
		file: UnmatchedFile;
		selected?: boolean;
		showCheckboxes?: boolean;
		onSelect?: () => void;
		onMatch?: () => void;
		onDelete?: () => void;
	}

	let {
		file,
		selected = false,
		showCheckboxes = false,
		onSelect,
		onMatch,
		onDelete
	}: Props = $props();

	function formatSize(bytes: number | null): string {
		if (!bytes) return 'Unknown';
		const gb = bytes / (1024 * 1024 * 1024);
		if (gb >= 1) return `${gb.toFixed(2)} GB`;
		const mb = bytes / (1024 * 1024);
		return `${mb.toFixed(1)} MB`;
	}

	function formatPath(fullPath: string, rootPath: string | null): string {
		if (!rootPath) return fullPath;
		if (fullPath.startsWith(rootPath)) {
			return fullPath.substring(rootPath.length).replace(/^\//, '');
		}
		return fullPath;
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString();
	}
</script>

<div class="rounded-lg bg-base-200 p-3 transition-colors hover:bg-base-300">
	<div class="flex items-start justify-between gap-3">
		<div class="flex min-w-0 flex-1 items-start gap-3">
			{#if showCheckboxes}
				<input
					type="checkbox"
					class="checkbox mt-1 checkbox-sm"
					checked={selected}
					onchange={onSelect}
				/>
			{/if}
			<div class="rounded-lg bg-base-300 p-2">
				{#if file.mediaType === 'movie'}
					<Clapperboard class="h-5 w-5 text-primary" />
				{:else}
					<Tv class="h-5 w-5 text-secondary" />
				{/if}
			</div>
			<div class="min-w-0 flex-1">
				<p class="font-medium wrap-break-word" title={file.path}>
					{formatPath(file.path, file.rootFolderPath)}
				</p>
				<div class="mt-1 flex items-center gap-2 text-xs text-base-content/50">
					<HardDrive class="h-3 w-3" />
					<span>{formatSize(file.size)}</span>
				</div>
				<div class="mt-2 flex flex-wrap gap-1">
					{#if file.parsedYear}
						<span class="badge badge-ghost badge-sm">{file.parsedYear}</span>
					{/if}
					{#if file.mediaType === 'tv' && file.parsedSeason !== null}
						<span class="badge badge-sm badge-secondary">
							S{String(file.parsedSeason).padStart(2, '0')}
							{#if file.parsedEpisode !== null}
								E{String(file.parsedEpisode).padStart(2, '0')}
							{/if}
						</span>
					{/if}
					<span class="badge badge-outline badge-sm">
						{file.mediaType === 'movie' ? 'Movie' : 'TV'}
					</span>
				</div>
				{#if file.reason}
					<div class="mt-2 flex items-center gap-1 text-xs text-warning">
						<AlertCircle class="h-3 w-3" />
						<span>{file.reason}</span>
					</div>
				{/if}
				<div class="mt-1 flex items-center gap-1 text-xs text-base-content/50">
					<Calendar class="h-3 w-3" />
					<span>{formatDate(file.discoveredAt)}</span>
				</div>
			</div>
		</div>
		<div class="flex flex-col gap-2">
			<button class="btn btn-ghost btn-xs" onclick={onMatch}> Match </button>
			<button class="btn text-error btn-ghost btn-xs" onclick={onDelete}> Delete </button>
		</div>
	</div>
</div>
