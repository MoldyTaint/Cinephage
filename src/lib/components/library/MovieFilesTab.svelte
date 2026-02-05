<script lang="ts">
	import type { MovieFile } from '$lib/types/library';
	import FileCard from './FileCard.svelte';
	import { FileX, Search } from 'lucide-svelte';

	interface Subtitle {
		id: string;
		language: string;
		isForced?: boolean;
		isHearingImpaired?: boolean;
		format?: string;
	}

	interface Props {
		files: MovieFile[];
		subtitles?: Subtitle[];
		isStreamerProfile?: boolean;
		onDeleteFile?: (fileId: string) => void;
		onSearch?: () => void;
		onSubtitleSearch?: () => void;
		onSubtitleAutoSearch?: () => void;
		subtitleAutoSearching?: boolean;
	}

	let {
		files,
		subtitles = [],
		isStreamerProfile = false,
		onDeleteFile,
		onSearch,
		onSubtitleSearch,
		onSubtitleAutoSearch,
		subtitleAutoSearching = false
	}: Props = $props();

	// Calculate total size for display
	const totalSize = $derived(files.reduce((sum, f) => sum + (f.size || 0), 0));

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}
</script>

<div class="space-y-4">
	{#if files.length === 0}
		<!-- Empty state -->
		<div
			class="flex flex-col items-center justify-center rounded-lg border border-dashed border-base-300 bg-base-100 py-12"
		>
			<FileX size={48} class="text-base-content/30" />
			<h3 class="mt-4 text-lg font-medium">No Files Found</h3>
			<p class="mt-1 text-sm text-base-content/60">This movie hasn't been downloaded yet.</p>
			{#if onSearch}
				<button class="btn mt-4 gap-2 btn-sm btn-primary" onclick={onSearch}>
					<Search size={16} />
					Search for Downloads
				</button>
			{/if}
		</div>
	{:else}
		<!-- File list -->
		<div class="space-y-3">
			{#each files as file (file.id)}
				<FileCard
					{file}
					{subtitles}
					{isStreamerProfile}
					onDelete={onDeleteFile}
					{onSubtitleSearch}
					{onSubtitleAutoSearch}
					autoSearching={subtitleAutoSearching}
				/>
			{/each}
		</div>

		<!-- Summary -->
		<div class="rounded-lg bg-base-200 p-3 text-sm text-base-content/70">
			{files.length} file{files.length !== 1 ? 's' : ''} •
			{#if totalSize > 0}
				{formatBytes(totalSize)} total
			{:else}
				Unknown total size
			{/if}
		</div>
	{/if}
</div>
