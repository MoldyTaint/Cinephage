<script lang="ts">
	import {
		ChevronDown,
		ChevronRight,
		Eye,
		EyeOff,
		Search,
		Download,
		Loader2,
		Trash2
	} from 'lucide-svelte';
	import EpisodeRow from './EpisodeRow.svelte';
	import AutoSearchStatus from './AutoSearchStatus.svelte';

	interface Subtitle {
		id: string;
		language: string;
		isForced?: boolean;
		isHearingImpaired?: boolean;
		format?: string;
	}

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

	interface Season {
		id: string;
		seasonNumber: number;
		name: string | null;
		monitored: boolean | null;
		episodeCount: number | null;
		episodeFileCount: number | null;
		episodes: Episode[];
	}

	interface AutoSearchResult {
		found: boolean;
		grabbed: boolean;
		releaseName?: string;
		error?: string;
	}

	interface Props {
		season: Season;
		seriesMonitored: boolean;
		defaultOpen?: boolean;
		selectedEpisodes?: Set<string>;
		showCheckboxes?: boolean;
		downloadingEpisodeIds?: Set<string>;
		downloadingSeasons?: Set<number>;
		autoSearchingSeason?: boolean;
		autoSearchSeasonResult?: AutoSearchResult | null;
		autoSearchingEpisodes?: Set<string>;
		autoSearchEpisodeResults?: Map<string, AutoSearchResult>;
		subtitleAutoSearchingEpisodes?: Set<string>;
		onSeasonMonitorToggle?: (seasonId: string, newValue: boolean) => void;
		onEpisodeMonitorToggle?: (episodeId: string, newValue: boolean) => void;
		onSeasonSearch?: (season: Season) => void;
		onAutoSearchSeason?: (season: Season) => void;
		onEpisodeSearch?: (episode: Episode) => void;
		onAutoSearchEpisode?: (episode: Episode) => void;
		onEpisodeSelectChange?: (episodeId: string, selected: boolean) => void;
		onSelectAllInSeason?: (seasonId: string, selectAll: boolean) => void;
		onSubtitleSearch?: (episode: Episode) => void;
		onSubtitleAutoSearch?: (episode: Episode) => void;
		onSeasonDelete?: (season: Season) => void;
		onEpisodeDelete?: (episode: Episode) => void;
	}

	let {
		season,
		seriesMonitored,
		defaultOpen = false,
		selectedEpisodes = new Set(),
		showCheckboxes = false,
		downloadingEpisodeIds = new Set(),
		downloadingSeasons = new Set(),
		autoSearchingSeason = false,
		autoSearchSeasonResult = null,
		autoSearchingEpisodes = new Set(),
		autoSearchEpisodeResults = new Map(),
		subtitleAutoSearchingEpisodes = new Set(),
		onSeasonMonitorToggle,
		onEpisodeMonitorToggle,
		onSeasonSearch,
		onAutoSearchSeason,
		onEpisodeSearch,
		onAutoSearchEpisode,
		onEpisodeSelectChange,
		onSelectAllInSeason,
		onSubtitleSearch,
		onSubtitleAutoSearch,
		onSeasonDelete,
		onEpisodeDelete
	}: Props = $props();

	// Track accordion open state
	let isOpen = $state(defaultOpen);

	const downloadedCount = $derived(season.episodeFileCount ?? 0);
	const totalCount = $derived(season.episodeCount ?? season.episodes.length);
	const percentComplete = $derived(
		totalCount > 0 ? Math.round((downloadedCount / totalCount) * 100) : 0
	);

	// Calculate selection state for season checkbox
	const seasonEpisodeIds = $derived(season.episodes.map((e) => e.id));
	const selectedInSeasonCount = $derived(
		seasonEpisodeIds.filter((id) => selectedEpisodes.has(id)).length
	);
	const isAllSelected = $derived(
		season.episodes.length > 0 && selectedInSeasonCount === season.episodes.length
	);
	const isSomeSelected = $derived(
		selectedInSeasonCount > 0 && selectedInSeasonCount < season.episodes.length
	);

	// Derive auto-search status for the season
	const autoSearchSeasonStatus = $derived.by(() => {
		if (autoSearchingSeason) return 'searching';
		if (autoSearchSeasonResult?.grabbed) return 'success';
		if (autoSearchSeasonResult?.error) return 'failed';
		return 'idle';
	});

	function getSeasonName(): string {
		if (season.seasonNumber === 0) return 'Specials';
		return season.name || `Season ${season.seasonNumber}`;
	}

	function handleSeasonMonitorToggle() {
		if (onSeasonMonitorToggle) {
			onSeasonMonitorToggle(season.id, !season.monitored);
		}
	}

	function handleSeasonSearch() {
		if (onSeasonSearch) {
			onSeasonSearch(season);
		}
	}

	function handleAutoSearchSeason() {
		if (onAutoSearchSeason) {
			onAutoSearchSeason(season);
		}
	}

	function handleSelectAllChange(event: Event) {
		const target = event.target as HTMLInputElement;
		if (onSelectAllInSeason) {
			onSelectAllInSeason(season.id, target.checked);
		}
	}

	function handleSeasonDelete() {
		if (onSeasonDelete) {
			onSeasonDelete(season);
		}
	}
</script>

<div class="overflow-hidden rounded-lg border border-base-300 bg-base-100">
	<!-- Header -->
	<div
		class="flex w-full items-center justify-between gap-4 p-4 transition-colors hover:bg-base-200"
	>
		<!-- Clickable area for expand/collapse -->
		<button class="flex flex-1 items-center gap-3 text-left" onclick={() => (isOpen = !isOpen)}>
			{#if isOpen}
				<ChevronDown size={20} class="text-base-content/50" />
			{:else}
				<ChevronRight size={20} class="text-base-content/50" />
			{/if}

			<div>
				<h3 class="font-semibold">{getSeasonName()}</h3>
				<div class="flex items-center gap-2 text-sm text-base-content/60">
					<span>{downloadedCount}/{totalCount} episodes</span>
					{#if percentComplete === 100}
						<span class="badge badge-xs badge-success">Complete</span>
					{:else if percentComplete > 0}
						<span class="badge badge-xs badge-primary">{percentComplete}%</span>
					{/if}
				</div>
			</div>
		</button>

		<!-- Action buttons -->
		<div class="flex items-center gap-2">
			<!-- Season monitor toggle -->
			<button
				class="btn btn-ghost btn-sm {season.monitored ? 'text-success' : 'text-base-content/40'}"
				onclick={handleSeasonMonitorToggle}
				disabled={!seriesMonitored}
				title={season.monitored ? 'Season monitored' : 'Season not monitored'}
			>
				{#if season.monitored}
					<Eye size={16} />
				{:else}
					<EyeOff size={16} />
				{/if}
			</button>

			<!-- Auto-search status indicator -->
			<AutoSearchStatus
				status={autoSearchSeasonStatus}
				releaseName={autoSearchSeasonResult?.releaseName}
				error={autoSearchSeasonResult?.error}
				size="sm"
			/>

			<!-- Auto-grab season pack -->
			<button
				class="btn btn-ghost btn-sm"
				onclick={handleAutoSearchSeason}
				disabled={autoSearchingSeason}
				title="Auto-grab season pack"
			>
				{#if autoSearchingSeason}
					<Loader2 size={16} class="animate-spin" />
				{:else}
					<Download size={16} />
				{/if}
			</button>

			<!-- Interactive search season -->
			<button
				class="btn btn-ghost btn-sm"
				onclick={handleSeasonSearch}
				title="Interactive search for season"
			>
				<Search size={16} />
			</button>

			<!-- Delete season -->
			{#if onSeasonDelete}
				<button
					class="btn btn-ghost btn-sm text-error"
					onclick={handleSeasonDelete}
					title="Delete season"
				>
					<Trash2 size={16} />
				</button>
			{/if}
		</div>
	</div>

	<!-- Episodes table -->
	{#if isOpen}
		<div class="border-t border-base-300">
			{#if season.episodes.length === 0}
				<div class="p-8 text-center text-base-content/60">No episodes in this season</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="table table-sm">
						<thead>
							<tr class="text-xs text-base-content/60">
								{#if showCheckboxes}
									<th class="w-10">
										<input
											type="checkbox"
											class="checkbox checkbox-sm"
											checked={isAllSelected}
											indeterminate={isSomeSelected}
											onchange={handleSelectAllChange}
											title="Select all episodes in season"
										/>
									</th>
								{/if}
								<th class="w-12 text-center">#</th>
								<th>Title</th>
								<th class="w-24">Air Date</th>
								<th class="w-32">Status</th>
								<th class="w-20">Size</th>
								<th class="w-28">Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each season.episodes as episode (episode.id)}
								<EpisodeRow
									{episode}
									{seriesMonitored}
									selected={selectedEpisodes.has(episode.id)}
									showCheckbox={showCheckboxes}
									isDownloading={downloadingEpisodeIds.has(episode.id) ||
										downloadingSeasons.has(episode.seasonNumber)}
									autoSearching={autoSearchingEpisodes.has(episode.id)}
									autoSearchResult={autoSearchEpisodeResults.get(episode.id) ?? null}
									subtitleAutoSearching={subtitleAutoSearchingEpisodes.has(episode.id)}
									onMonitorToggle={onEpisodeMonitorToggle}
									onSearch={onEpisodeSearch}
									onAutoSearch={onAutoSearchEpisode}
									onSelectChange={onEpisodeSelectChange}
									{onSubtitleSearch}
									{onSubtitleAutoSearch}
									onDelete={onEpisodeDelete}
								/>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}
</div>
