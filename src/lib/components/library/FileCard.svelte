<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { MovieFile } from '$lib/types/library';
	import QualityBadge from './QualityBadge.svelte';
	import MediaInfoPopover from './MediaInfoPopover.svelte';
	import { SubtitleDisplay } from '$lib/components/subtitles';
	import { File, Trash2, Calendar, HardDrive, Subtitles, Download, Loader2 } from 'lucide-svelte';
	import { normalizeLanguageCode } from '$lib/shared/languages';

	interface Subtitle {
		id: string;
		language: string;
		isForced?: boolean;
		isHearingImpaired?: boolean;
		format?: string;
		isEmbedded?: boolean;
	}

	interface Props {
		file: MovieFile;
		subtitles?: Subtitle[];
		isStreamerProfile?: boolean;
		onDelete?: (fileId: string) => void;
		onSubtitleSearch?: () => void;
		onSubtitleAutoSearch?: () => void;
		autoSearching?: boolean;
	}

	let {
		file,
		subtitles = [],
		isStreamerProfile = false,
		onDelete,
		onSubtitleSearch,
		onSubtitleAutoSearch,
		autoSearching = false
	}: Props = $props();

	// Combine external subtitles with embedded subtitles from mediaInfo
	const allSubtitles = $derived.by(() => {
		const combined: Subtitle[] = [...subtitles];

		// Add embedded subtitles from mediaInfo (if not already covered by external)
		const embeddedLangs = file.mediaInfo?.subtitleLanguages ?? [];
		const externalLangSet = new SvelteSet(subtitles.map((s) => s.language));

		for (const lang of embeddedLangs) {
			const normalized = normalizeLanguageCode(lang);
			// Only add if we don't already have an external subtitle for this language
			if (!externalLangSet.has(normalized)) {
				combined.push({
					id: `embedded-${lang}`,
					language: normalized,
					isForced: false,
					isHearingImpaired: false,
					format: 'embedded',
					isEmbedded: true
				});
				externalLangSet.add(normalized); // Prevent duplicates from same language appearing multiple times
			}
		}

		return combined;
	});

	function formatBytes(bytes: number | null): string {
		if (!bytes) return 'Unknown size';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	function formatDate(dateString: string | null): string {
		if (!dateString) return 'Unknown';
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function getFileName(path: string): string {
		return path.split('/').pop() || path;
	}
</script>

<div class="rounded-lg border border-base-300 bg-base-100 p-3 md:p-4">
	<!-- File name row -->
	<div class="flex flex-wrap items-start justify-between gap-2 md:gap-4">
		<div class="flex min-w-0 flex-1 items-start gap-3">
			<File size={20} class="mt-0.5 shrink-0 text-base-content/50" />
			<div class="min-w-0 flex-1">
				<div class="font-mono text-sm break-all sm:truncate" title={file.relativePath}>
					{getFileName(file.relativePath)}
				</div>
				{#if file.relativePath !== getFileName(file.relativePath)}
					<div
						class="mt-1 text-xs break-all text-base-content/50 sm:truncate"
						title={file.relativePath}
					>
						{file.relativePath}
					</div>
				{/if}
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			{#if file.mediaInfo}
				<MediaInfoPopover mediaInfo={file.mediaInfo} />
			{/if}
			{#if onDelete}
				<button
					class="btn text-error btn-ghost btn-xs"
					onclick={() => onDelete(file.id)}
					title="Delete file"
				>
					<Trash2 size={14} />
				</button>
			{/if}
		</div>
	</div>

	<!-- Info row -->
	<div class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 md:gap-x-4">
		<!-- Streaming tag before size for streamer profiles -->
		{#if isStreamerProfile}
			<span class="badge max-w-full truncate badge-sm badge-secondary">Streaming</span>
		{/if}

		<!-- Quality badges -->
		{#if !isStreamerProfile}
			<QualityBadge quality={file.quality} mediaInfo={file.mediaInfo} size="sm" />
		{/if}

		<!-- Size -->
		<div class="flex items-center gap-1 text-sm text-base-content/70">
			<HardDrive size={14} />
			<span>{formatBytes(file.size)}</span>
		</div>

		<!-- Date added -->
		<div class="flex items-center gap-1 text-sm text-base-content/70">
			<Calendar size={14} />
			<span>{formatDate(file.dateAdded)}</span>
		</div>

		<!-- Release group -->
		{#if file.releaseGroup && !isStreamerProfile}
			<span class="badge max-w-full truncate badge-outline badge-sm" title={file.releaseGroup}>
				{file.releaseGroup}
			</span>
		{/if}

		<!-- Edition -->
		{#if file.edition}
			<span class="badge max-w-full truncate badge-ghost badge-sm" title={file.edition}>
				{file.edition}
			</span>
		{/if}
	</div>

	<!-- Video/Audio info preview -->
	{#if file.mediaInfo}
		<div
			class="mt-3 flex flex-wrap gap-x-2 gap-y-1 border-t border-base-300 pt-3 text-xs text-base-content/60 md:gap-x-4"
		>
			{#if file.mediaInfo.videoCodec}
				<span>
					Video: {file.mediaInfo.videoCodec}
					{#if file.mediaInfo.videoBitDepth}
						{file.mediaInfo.videoBitDepth}-bit
					{/if}
					{#if file.mediaInfo.hdrFormat}
						{file.mediaInfo.hdrFormat}
					{/if}
				</span>
			{/if}
			{#if file.mediaInfo.audioCodec}
				<span>
					Audio: {file.mediaInfo.audioCodec}
					{#if file.mediaInfo.audioChannels}
						({file.mediaInfo.audioChannels === 6
							? '5.1'
							: file.mediaInfo.audioChannels === 8
								? '7.1'
								: `${file.mediaInfo.audioChannels}ch`})
					{/if}
				</span>
			{/if}
			{#if file.mediaInfo.audioLanguages && file.mediaInfo.audioLanguages.length > 0}
				<span>Languages: {file.mediaInfo.audioLanguages.join(', ')}</span>
			{/if}
			{#if file.mediaInfo.subtitleLanguages && file.mediaInfo.subtitleLanguages.length > 0}
				<span>Subs: {file.mediaInfo.subtitleLanguages.join(', ')}</span>
			{/if}
		</div>
	{/if}

	<!-- Subtitles section -->
	<div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-base-300 pt-3">
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<Subtitles size={14} class="text-base-content/50" />
			<SubtitleDisplay subtitles={allSubtitles} size="sm" />
		</div>
		{#if onSubtitleSearch || onSubtitleAutoSearch}
			<div class="flex flex-wrap items-center gap-1">
				{#if onSubtitleSearch}
					<button
						class="btn gap-1 btn-ghost btn-xs"
						onclick={onSubtitleSearch}
						title="Search for subtitles"
					>
						<Subtitles size={12} />
						Search
					</button>
				{/if}
				{#if onSubtitleAutoSearch}
					<button
						class="btn gap-1 btn-ghost btn-xs"
						onclick={onSubtitleAutoSearch}
						disabled={autoSearching}
						title="Auto-download best match"
					>
						{#if autoSearching}
							<Loader2 size={12} class="animate-spin" />
						{:else}
							<Download size={12} />
						{/if}
						Auto
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
