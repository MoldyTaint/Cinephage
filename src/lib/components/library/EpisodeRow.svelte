<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import {
		CheckCircle,
		XCircle,
		Search,
		Eye,
		EyeOff,
		Info,
		Download,
		ChevronDown,
		Loader2,
		Subtitles,
		Trash2
	} from 'lucide-svelte';
	import QualityBadge from './QualityBadge.svelte';
	import AutoSearchStatus from './AutoSearchStatus.svelte';
	import { SubtitleDisplay } from '$lib/components/subtitles';
	import { normalizeLanguageCode } from '$lib/shared/languages';

	interface EpisodeFile {
		id: string;
		relativePath: string;
		size: number | null;
		quality: {
			resolution?: string;
			source?: string;
			codec?: string;
			hdr?: string;
		} | null;
		mediaInfo: {
			videoCodec?: string;
			audioCodec?: string;
			audioChannels?: number;
			audioLanguages?: string[];
			subtitleLanguages?: string[];
		} | null;
		releaseGroup: string | null;
	}

	interface Subtitle {
		id: string;
		language: string;
		isForced?: boolean;
		isHearingImpaired?: boolean;
		format?: string;
		isEmbedded?: boolean;
	}

	interface Episode {
		id: string;
		seasonNumber: number;
		episodeNumber: number;
		absoluteEpisodeNumber: number | null;
		title: string | null;
		airDate: string | null;
		runtime: number | null;
		monitored: boolean | null;
		hasFile: boolean | null;
		file: EpisodeFile | null;
		subtitles?: Subtitle[];
	}

	interface AutoSearchResult {
		found: boolean;
		grabbed: boolean;
		releaseName?: string;
		error?: string;
	}

	interface Props {
		episode: Episode;
		seriesMonitored: boolean;
		selected?: boolean;
		showCheckbox?: boolean;
		isDownloading?: boolean;
		autoSearching?: boolean;
		autoSearchResult?: AutoSearchResult | null;
		subtitleAutoSearching?: boolean;
		onMonitorToggle?: (episodeId: string, newValue: boolean) => void;
		onSearch?: (episode: Episode) => void;
		onAutoSearch?: (episode: Episode) => void;
		onSelectChange?: (episodeId: string, selected: boolean) => void;
		onSubtitleSearch?: (episode: Episode) => void;
		onSubtitleAutoSearch?: (episode: Episode) => void;
		onDelete?: (episode: Episode) => void;
	}

	let {
		episode,
		seriesMonitored,
		selected = false,
		showCheckbox = false,
		isDownloading = false,
		autoSearching = false,
		autoSearchResult = null,
		subtitleAutoSearching = false,
		onMonitorToggle,
		onSearch,
		onAutoSearch,
		onSelectChange,
		onSubtitleSearch,
		onSubtitleAutoSearch,
		onDelete
	}: Props = $props();

	// Derive auto-search status for the status indicator
	const autoSearchStatus = $derived.by(() => {
		if (autoSearching) return 'searching';
		if (autoSearchResult?.grabbed) return 'success';
		if (autoSearchResult?.error) return 'failed';
		return 'idle';
	});

	// Combine external subtitles with embedded subtitles from mediaInfo
	const allSubtitles = $derived.by(() => {
		const external = episode.subtitles ?? [];
		const combined: Subtitle[] = [...external];

		// Add embedded subtitles from file mediaInfo (if not already covered by external)
		const embeddedLangs = episode.file?.mediaInfo?.subtitleLanguages ?? [];
		const externalLangSet = new SvelteSet(external.map((s) => s.language));

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
				externalLangSet.add(normalized); // Prevent duplicates
			}
		}

		return combined;
	});

	function formatAirDate(dateString: string | null): string {
		if (!dateString) return 'TBA';
		const date = new Date(dateString);
		const now = new Date();

		// Check if not yet aired
		if (date > now) {
			const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
			if (diffDays <= 7) {
				return `In ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
			}
		}

		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
		});
	}

	function isAired(dateString: string | null): boolean {
		if (!dateString) return false;
		return new Date(dateString) <= new Date();
	}

	function formatBytes(bytes: number | null): string {
		if (!bytes) return '';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	function handleMonitorClick() {
		if (onMonitorToggle) {
			onMonitorToggle(episode.id, !episode.monitored);
		}
	}

	function handleSearchClick() {
		if (onSearch) {
			onSearch(episode);
		}
	}

	function handleAutoSearchClick() {
		if (onAutoSearch) {
			onAutoSearch(episode);
		}
	}

	function handleCheckboxChange(event: Event) {
		const target = event.target as HTMLInputElement;
		if (onSelectChange) {
			onSelectChange(episode.id, target.checked);
		}
	}

	function handleSubtitleSearchClick() {
		if (onSubtitleSearch) {
			onSubtitleSearch(episode);
		}
	}

	function handleSubtitleAutoSearchClick() {
		if (onSubtitleAutoSearch) {
			onSubtitleAutoSearch(episode);
		}
	}

	function handleDeleteClick() {
		if (onDelete) {
			onDelete(episode);
		}
	}
</script>

<tr class="hover" class:opacity-60={!isAired(episode.airDate) && !episode.hasFile}>
	<!-- Checkbox for selection -->
	{#if showCheckbox}
		<td class="w-10">
			<input
				type="checkbox"
				class="checkbox checkbox-sm"
				checked={selected}
				onchange={handleCheckboxChange}
			/>
		</td>
	{/if}

	<!-- Episode number -->
	<td class="w-12 text-center font-mono text-sm">
		{episode.episodeNumber}
	</td>

	<!-- Title -->
	<td class="min-w-0">
		<div class="flex min-w-0 flex-col">
			<div class="flex items-start justify-between gap-2">
				<span
					class={`min-w-0 flex-1 font-medium break-words ${!episode.title ? 'text-base-content/60' : ''}`}
				>
					{episode.title || 'TBA'}
				</span>
				<div class="ml-auto flex shrink-0 items-center gap-1 sm:hidden">
					<button
						class="btn btn-ghost btn-xs {episode.monitored
							? 'text-success'
							: 'text-base-content/40'}"
						onclick={handleMonitorClick}
						title={episode.monitored ? 'Monitored' : 'Not monitored'}
					>
						{#if episode.monitored}
							<Eye size={14} />
						{:else}
							<EyeOff size={14} />
						{/if}
					</button>
					<AutoSearchStatus
						status={autoSearchStatus}
						releaseName={autoSearchResult?.releaseName}
						error={autoSearchResult?.error}
						size="xs"
					/>
					<div class="dropdown dropdown-end">
						<button
							class="btn btn-ghost btn-xs"
							disabled={autoSearching || subtitleAutoSearching}
							title="Search options"
						>
							{#if autoSearching || subtitleAutoSearching}
								<Loader2 size={14} class="animate-spin" />
							{:else}
								<Search size={14} />
							{/if}
							<ChevronDown size={10} />
						</button>
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<ul
							tabindex="0"
							class="dropdown-content menu z-50 w-52 rounded-box bg-base-200 p-2 shadow-lg"
						>
							<li class="menu-title">
								<span>Media</span>
							</li>
							<li>
								<button onclick={handleAutoSearchClick} disabled={autoSearching}>
									<Download size={14} />
									Auto-grab best
								</button>
							</li>
							<li>
								<button onclick={handleSearchClick}>
									<Search size={14} />
									Interactive search
								</button>
							</li>
							{#if episode.hasFile && (onSubtitleSearch || onSubtitleAutoSearch)}
								<li class="menu-title">
									<span>Subtitles</span>
								</li>
								{#if onSubtitleAutoSearch}
									<li>
										<button
											onclick={handleSubtitleAutoSearchClick}
											disabled={subtitleAutoSearching}
										>
											<Subtitles size={14} />
											Auto-download subs
										</button>
									</li>
								{/if}
								{#if onSubtitleSearch}
									<li>
										<button onclick={handleSubtitleSearchClick}>
											<Search size={14} />
											Search subtitles
										</button>
									</li>
								{/if}
							{/if}
						</ul>
					</div>
					{#if episode.file?.mediaInfo}
						<div class="dropdown dropdown-end">
							<button class="btn btn-ghost btn-xs">
								<Info size={14} />
							</button>
							<div
								tabindex="0"
								role="dialog"
								class="dropdown-content z-50 w-64 rounded-lg bg-base-200 p-3 text-xs shadow-xl"
							>
								<div class="space-y-1">
									{#if episode.file.mediaInfo.videoCodec}
										<div>Video: {episode.file.mediaInfo.videoCodec}</div>
									{/if}
									{#if episode.file.mediaInfo.audioCodec}
										<div>
											Audio: {episode.file.mediaInfo.audioCodec}
											{#if episode.file.mediaInfo.audioChannels}
												({episode.file.mediaInfo.audioChannels === 6
													? '5.1'
													: episode.file.mediaInfo.audioChannels === 8
														? '7.1'
														: `${episode.file.mediaInfo.audioChannels}ch`})
											{/if}
										</div>
									{/if}
									{#if episode.file.mediaInfo.audioLanguages?.length}
										<div>Languages: {episode.file.mediaInfo.audioLanguages.join(', ')}</div>
									{/if}
									{#if episode.file.mediaInfo.subtitleLanguages?.length}
										<div>Subs: {episode.file.mediaInfo.subtitleLanguages.join(', ')}</div>
									{/if}
									{#if episode.file.releaseGroup}
										<div>Group: {episode.file.releaseGroup}</div>
									{/if}
								</div>
							</div>
						</div>
					{/if}
					{#if onDelete}
						<button
							class="btn text-error btn-ghost btn-xs"
							onclick={handleDeleteClick}
							title="Delete episode"
						>
							<Trash2 size={14} />
						</button>
					{/if}
				</div>
			</div>
			{#if episode.file}
				<span
					class="block max-w-full text-xs break-words text-base-content/50 sm:truncate"
					title={episode.file.relativePath}
				>
					{episode.file.relativePath.split('/').pop()}
				</span>
			{/if}
			<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-content/60 sm:hidden">
				<span>{formatAirDate(episode.airDate)}</span>
				<span class="text-base-content/40">•</span>
				{#if episode.hasFile && episode.file}
					<span class="text-success">Downloaded</span>
				{:else if isDownloading}
					<span class="text-warning">Downloading</span>
				{:else if isAired(episode.airDate)}
					<span class="text-error">Missing</span>
				{:else}
					<span class="text-base-content/50">Not aired</span>
				{/if}
				<span class="text-base-content/40">•</span>
				<span>
					{#if episode.file?.size}
						{formatBytes(episode.file.size)}
					{:else}
						—
					{/if}
				</span>
			</div>
			{#if episode.hasFile && episode.file}
				<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-content/60 sm:hidden">
					<QualityBadge quality={episode.file.quality} mediaInfo={null} size="sm" />
					{#if allSubtitles.length > 0}
						<div class="flex items-center gap-1">
							<Subtitles size={12} class="text-base-content/50" />
							<SubtitleDisplay subtitles={allSubtitles} maxDisplay={3} size="xs" />
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</td>

	<!-- Air date -->
	<td class="hidden text-sm text-base-content/70 sm:table-cell">
		{formatAirDate(episode.airDate)}
	</td>

	<!-- Status -->
	<td class="hidden sm:table-cell">
		{#if episode.hasFile && episode.file}
			<div class="flex flex-col gap-1">
				<div class="flex items-center gap-2">
					<CheckCircle size={16} class="text-success" />
					<QualityBadge quality={episode.file.quality} mediaInfo={null} size="sm" />
				</div>
				{#if allSubtitles.length > 0}
					<div class="flex items-center gap-1">
						<Subtitles size={12} class="text-base-content/50" />
						<SubtitleDisplay subtitles={allSubtitles} maxDisplay={3} size="xs" />
					</div>
				{/if}
			</div>
		{:else if isDownloading}
			<div class="flex items-center gap-2 text-warning">
				<Download size={16} class="animate-pulse" />
				<span class="text-sm">Downloading</span>
			</div>
		{:else if isAired(episode.airDate)}
			<div class="flex items-center gap-2 text-error">
				<XCircle size={16} />
				<span class="text-sm">Missing</span>
			</div>
		{:else}
			<span class="text-sm text-base-content/50">Not aired</span>
		{/if}
	</td>

	<!-- Size -->
	<td class="hidden text-sm text-base-content/70 sm:table-cell">
		{#if episode.file?.size}
			{formatBytes(episode.file.size)}
		{:else}
			—
		{/if}
	</td>

	<!-- Actions -->
	<td class="hidden sm:table-cell">
		<div class="flex flex-wrap items-center gap-1">
			<!-- Monitor toggle -->
			<button
				class="btn btn-ghost btn-xs {episode.monitored ? 'text-success' : 'text-base-content/40'}"
				onclick={handleMonitorClick}
				disabled={seriesMonitored}
				title={episode.monitored ? 'Monitored' : 'Not monitored'}
			>
				{#if episode.monitored}
					<Eye size={14} />
				{:else}
					<EyeOff size={14} />
				{/if}
			</button>

			<!-- Auto-search status indicator -->
			<AutoSearchStatus
				status={autoSearchStatus}
				releaseName={autoSearchResult?.releaseName}
				error={autoSearchResult?.error}
				size="xs"
			/>

			<!-- Search dropdown with auto-grab and interactive options -->
			<div class="dropdown dropdown-end">
				<button
					class="btn btn-ghost btn-xs"
					disabled={autoSearching || subtitleAutoSearching}
					title="Search options"
				>
					{#if autoSearching || subtitleAutoSearching}
						<Loader2 size={14} class="animate-spin" />
					{:else}
						<Search size={14} />
					{/if}
					<ChevronDown size={10} />
				</button>
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<ul
					tabindex="0"
					class="dropdown-content menu z-50 w-52 rounded-box bg-base-200 p-2 shadow-lg"
				>
					<li class="menu-title">
						<span>Media</span>
					</li>
					<li>
						<button onclick={handleAutoSearchClick} disabled={autoSearching}>
							<Download size={14} />
							Auto-grab best
						</button>
					</li>
					<li>
						<button onclick={handleSearchClick}>
							<Search size={14} />
							Interactive search
						</button>
					</li>
					{#if episode.hasFile && (onSubtitleSearch || onSubtitleAutoSearch)}
						<li class="menu-title">
							<span>Subtitles</span>
						</li>
						{#if onSubtitleAutoSearch}
							<li>
								<button onclick={handleSubtitleAutoSearchClick} disabled={subtitleAutoSearching}>
									<Subtitles size={14} />
									Auto-download subs
								</button>
							</li>
						{/if}
						{#if onSubtitleSearch}
							<li>
								<button onclick={handleSubtitleSearchClick}>
									<Search size={14} />
									Search subtitles
								</button>
							</li>
						{/if}
					{/if}
				</ul>
			</div>

			<!-- File info -->
			{#if episode.file?.mediaInfo}
				<div class="dropdown dropdown-end">
					<button class="btn btn-ghost btn-xs">
						<Info size={14} />
					</button>
					<div
						tabindex="0"
						role="dialog"
						class="dropdown-content z-50 w-64 rounded-lg bg-base-200 p-3 text-xs shadow-xl"
					>
						<div class="space-y-1">
							{#if episode.file.mediaInfo.videoCodec}
								<div>Video: {episode.file.mediaInfo.videoCodec}</div>
							{/if}
							{#if episode.file.mediaInfo.audioCodec}
								<div>
									Audio: {episode.file.mediaInfo.audioCodec}
									{#if episode.file.mediaInfo.audioChannels}
										({episode.file.mediaInfo.audioChannels === 6
											? '5.1'
											: episode.file.mediaInfo.audioChannels === 8
												? '7.1'
												: `${episode.file.mediaInfo.audioChannels}ch`})
									{/if}
								</div>
							{/if}
							{#if episode.file.mediaInfo.audioLanguages?.length}
								<div>Languages: {episode.file.mediaInfo.audioLanguages.join(', ')}</div>
							{/if}
							{#if episode.file.mediaInfo.subtitleLanguages?.length}
								<div>Subs: {episode.file.mediaInfo.subtitleLanguages.join(', ')}</div>
							{/if}
							{#if episode.file.releaseGroup}
								<div>Group: {episode.file.releaseGroup}</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Delete episode -->
			{#if onDelete}
				<button
					class="btn text-error btn-ghost btn-xs"
					onclick={handleDeleteClick}
					title="Delete episode"
				>
					<Trash2 size={14} />
				</button>
			{/if}
		</div>
	</td>
</tr>
