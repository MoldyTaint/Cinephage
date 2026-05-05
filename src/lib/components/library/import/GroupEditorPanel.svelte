<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { Check, Clapperboard, Loader2, Search, Tv, X } from 'lucide-svelte';

	type MediaType = 'movie' | 'tv';

	interface MatchResult {
		tmdbId: number;
		title: string;
		year?: number;
		mediaType: MediaType;
		isAnime?: boolean;
		confidence: number;
		inLibrary: boolean;
		libraryId?: string;
		rootFolderId?: string | null;
		rootFolderPath?: string | null;
	}

	interface DetectionGroup {
		id: string;
		displayName: string;
		sourceType: 'file' | 'folder';
		sourcePath: string;
		selectedFilePath: string;
		fileName: string;
		detectedFileCount: number;
		detectedSeasons?: number[];
		suggestedSeason?: number;
		parsedTitle: string;
		parsedYear?: number;
		parsedSeason?: number;
		parsedEpisode?: number;
		inferredMediaType: MediaType;
	}

	interface ImportRouteContext {
		mediaType: MediaType;
		tmdbId: number;
		libraryId: string | null;
		title: string | null;
		year: number | null;
	}

	let {
		activeGroup = null as DetectionGroup | null,
		selectedMediaType = 'movie' as MediaType,
		selectedMatch = null as MatchResult | null,
		searchQuery = $bindable(''),
		matchCandidates = [],
		importTarget = $bindable('new' as 'new' | 'existing'),
		seasonNumber = $bindable(1),
		episodeNumber = $bindable(1),
		batchSeasonOverride = $bindable(null as number | null),
		selectedRootFolder = $bindable(''),
		isMediaTypeLockedByContext = false,
		isBatchTvImport = false,
		isGroupImported = false,
		isGroupSkipped = false,
		skipActionsEnabled = false,
		searchingMatches = false,
		routeImportContext = null as ImportRouteContext | null,
		selectedMatchContextMismatch = false,
		parsedSourceContextMismatch = false,
		canApplyMatchSelectionToActiveSeason = false,
		applyMatchToSeasonOnSelect = $bindable(false),
		canImportGroup = (_group: DetectionGroup) => false,
		canApplyActiveSeasonOverride = () => false,
		onSwitchMediaType = (_type: MediaType) => {},
		onChooseMatch = (_match: MatchResult) => {},
		onSearchInput = (_event: Event) => {},
		onSearch = () => {},
		onClearSearch = () => {},
		onSeasonNumberChange = () => {},
		onEpisodeNumberChange = () => {},
		onToggleSkip = () => {}
	}: {
		activeGroup: DetectionGroup | null;
		selectedMediaType: MediaType;
		selectedMatch: MatchResult | null;
		searchQuery: string;
		matchCandidates: MatchResult[];
		importTarget: 'new' | 'existing';
		seasonNumber: number;
		episodeNumber: number;
		batchSeasonOverride: number | null;
		selectedRootFolder: string;
		isMediaTypeLockedByContext: boolean;
		isBatchTvImport: boolean;
		isGroupImported: boolean;
		isGroupSkipped: boolean;
		skipActionsEnabled: boolean;
		searchingMatches: boolean;
		routeImportContext: ImportRouteContext | null;
		selectedMatchContextMismatch: boolean;
		parsedSourceContextMismatch: boolean;
		canApplyMatchSelectionToActiveSeason: boolean;
		applyMatchToSeasonOnSelect: boolean;
		canImportGroup: (group: DetectionGroup) => boolean;
		canApplyActiveSeasonOverride: () => boolean;
		onSwitchMediaType: (type: MediaType) => void;
		onChooseMatch: (match: MatchResult) => void;
		onSearchInput: (event: Event) => void;
		onSearch: () => void;
		onClearSearch: () => void;
		onSeasonNumberChange: () => void;
		onEpisodeNumberChange: () => void;
		onToggleSkip: () => void;
	} = $props();
</script>

{#if activeGroup}
	<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
		<div class="grid gap-4 lg:grid-cols-2">
			<div class="space-y-1">
				<div class="text-sm text-base-content/60">{m.library_import_source()}</div>
				<div class="font-medium break-all">{activeGroup.sourcePath}</div>
				<div class="text-xs break-all text-base-content/60">
					{m.library_import_primaryFile({ path: activeGroup.selectedFilePath })}
				</div>
				<div class="text-sm text-base-content/70">
					{m.library_import_parsed()}
					<span class="font-medium">{activeGroup.parsedTitle}</span>
					{#if activeGroup.parsedYear}
						({activeGroup.parsedYear})
					{/if}
				</div>
				<div class="text-sm text-base-content/70">
					{m.library_import_filesDetected()}
					<span class="font-medium">{activeGroup.detectedFileCount}</span>
					{#if activeGroup.detectedSeasons && activeGroup.detectedSeasons.length > 1}
						<span class="ml-2"
							>{m.library_import_seasonsDetectedInline({
								seasons: activeGroup.detectedSeasons.join(', ')
							})}</span
						>
					{/if}
				</div>
				<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
					{#if isGroupImported}
						<span class="badge badge-sm badge-success">{m.library_import_badgeImported()}</span>
					{:else if isGroupSkipped}
						<span class="badge badge-ghost badge-sm">{m.library_import_badgeSkipped()}</span>
					{:else if canImportGroup(activeGroup)}
						<span class="badge badge-sm badge-primary">{m.library_import_badgeReady()}</span>
					{:else}
						<span class="badge badge-sm badge-warning">{m.library_import_badgeNeedsInput()}</span>
					{/if}
					{#if !isGroupImported && skipActionsEnabled}
						<button class="btn btn-ghost btn-xs" onclick={onToggleSkip}>
							{isGroupSkipped ? m.library_import_selectItem() : m.library_import_skipItem()}
						</button>
					{/if}
				</div>
			</div>
			<div class="space-y-2">
				<div class="text-sm text-base-content/60">{m.library_import_mediaTypeHeading()}</div>
				<div class="flex gap-2">
					<button
						type="button"
						class="btn btn-sm {selectedMediaType === 'movie' ? 'btn-primary' : 'btn-ghost'}"
						onclick={() => onSwitchMediaType('movie')}
						disabled={isMediaTypeLockedByContext}
					>
						<Clapperboard class="h-4 w-4" />
						{m.common_movie()}
					</button>
					<button
						type="button"
						class="btn btn-sm {selectedMediaType === 'tv' ? 'btn-primary' : 'btn-ghost'}"
						onclick={() => onSwitchMediaType('tv')}
						disabled={isMediaTypeLockedByContext}
					>
						<Tv class="h-4 w-4" />
						{m.ui_mediaType_tv()}
					</button>
				</div>
				{#if isMediaTypeLockedByContext}
					<div class="text-xs text-base-content/60">
						{m.library_import_mediaTypeLocked()}
					</div>
				{/if}
				{#if selectedMediaType === 'tv' && !isBatchTvImport}
					<div class="grid grid-cols-2 gap-2">
						<label class="form-control">
							<span class="label-text text-xs">{m.library_import_seasonLabel()}</span>
							<input
								type="number"
								min="0"
								class="input-bordered input input-sm"
								bind:value={seasonNumber}
								onchange={onSeasonNumberChange}
							/>
							{#if canApplyActiveSeasonOverride()}
								<div class="mt-2">
									<button type="button" class="btn btn-ghost btn-xs" onclick={onSeasonNumberChange}>
										{m.action_apply()}
									</button>
								</div>
							{/if}
						</label>
						<label class="form-control">
							<span class="label-text text-xs">{m.library_import_episodeLabel()}</span>
							<input
								type="number"
								min="1"
								class="input-bordered input input-sm"
								bind:value={episodeNumber}
								onchange={onEpisodeNumberChange}
							/>
						</label>
					</div>
				{:else if selectedMediaType === 'tv' && isBatchTvImport}
					<div class="space-y-2 rounded border border-base-300 bg-base-200/40 p-2">
						<div class="text-xs text-base-content/70">
							{m.library_import_episodeMappingAutoDetected()}
						</div>
						<label class="form-control">
							<span class="label-text text-xs">{m.library_import_seasonOverrideLabel()}</span>
							<input
								type="number"
								min="0"
								class="input-bordered input input-sm"
								placeholder={m.library_import_seasonOverridePlaceholder()}
								bind:value={batchSeasonOverride}
								onchange={onEpisodeNumberChange}
							/>
							<div class="label-text-alt text-xs text-base-content/60">
								{m.library_import_seasonOverrideHint()}
							</div>
						</label>
					</div>
				{/if}
				{#if isGroupImported}
					<div class="text-xs text-success">
						{m.library_import_alreadyImported()}
					</div>
				{:else if isGroupSkipped}
					<div class="text-xs text-base-content/70">
						{m.library_import_itemSkipped()}
					</div>
				{/if}
			</div>
			{#if parsedSourceContextMismatch && routeImportContext}
				<div class="alert text-sm alert-warning lg:col-span-2">
					<span>
						{m.library_import_parsedFileSuggests()}
						<strong
							>{activeGroup.parsedTitle}
							{#if activeGroup.parsedYear}
								({activeGroup.parsedYear})
							{/if}</strong
						>, {m.library_import_butImportOpenedFor()}
						<strong
							>{routeImportContext.title || `TMDB ${routeImportContext.tmdbId}`}
							{#if routeImportContext.year}
								({routeImportContext.year})
							{/if}</strong
						>.
					</span>
				</div>
			{/if}
		</div>
	</div>

	<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
		{#if routeImportContext}
			<div class="mb-3 alert text-sm alert-info">
				<span>
					{m.library_import_directImportFor()}
					<strong
						>{routeImportContext.title || `TMDB ${routeImportContext.tmdbId}`}
						{#if routeImportContext.year}
							({routeImportContext.year})
						{/if}</strong
					>.
				</span>
			</div>
		{:else}
			<div class="mb-3 flex items-center gap-2">
				<div class="group relative w-full">
					<div class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2">
						{#if searchingMatches}
							<Loader2
								class="h-4 w-4 animate-spin text-base-content/40 transition-colors group-focus-within:text-primary"
							/>
						{:else}
							<Search
								class="h-4 w-4 text-base-content/40 transition-colors group-focus-within:text-primary"
							/>
						{/if}
					</div>
					<input
						type="text"
						placeholder={m.library_import_searchTmdbPlaceholder()}
						class="input input-md w-full rounded-full border-base-content/20 bg-base-200/60 pr-9 pl-10 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none"
						value={searchQuery}
						oninput={onSearchInput}
						onkeydown={(event) => {
							if (event.key === 'Enter') {
								event.preventDefault();
								onSearch();
							}
							if (event.key === 'Escape') {
								onClearSearch();
							}
						}}
					/>
					{#if searchQuery}
						<button
							class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-base-content/40 transition-colors hover:bg-base-300 hover:text-base-content"
							onclick={onClearSearch}
							aria-label={m.library_import_clearTmdbSearch()}
						>
							<X class="h-3.5 w-3.5" />
						</button>
					{/if}
				</div>
			</div>
		{/if}
		{#if selectedMatchContextMismatch && routeImportContext && selectedMatch}
			<div class="mt-3 mb-3 alert text-sm alert-warning">
				<span>
					{m.library_import_importOpenedFor()}
					<strong
						>{routeImportContext.title || `TMDB ${routeImportContext.tmdbId}`}
						{#if routeImportContext.year}
							({routeImportContext.year})
						{/if}</strong
					>, {m.library_import_butSelectedMatchIs()}
					<strong
						>{selectedMatch.title}
						{#if selectedMatch.year}
							({selectedMatch.year})
						{/if}</strong
					>".
				</span>
			</div>
		{/if}
		{#if canApplyMatchSelectionToActiveSeason}
			<div class="mt-3 mb-3 rounded-lg border border-base-300 bg-base-200/40 p-3">
				<label class="flex cursor-pointer items-center justify-between gap-3">
					<span class="text-sm font-medium">
						{m.library_import_matchEntireSelectedSeason()}
					</span>
					<input
						type="checkbox"
						class="toggle toggle-sm"
						bind:checked={applyMatchToSeasonOnSelect}
					/>
				</label>
				<p class="mt-1 text-xs text-base-content/70">
					{m.library_import_matchEntireSelectedSeasonHint()}
				</p>
			</div>
		{/if}

		{#if matchCandidates.length === 0}
			<div class="rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/60">
				{m.library_import_noMatchesYet()}
			</div>
		{:else}
			<div class="max-h-80 space-y-2 overflow-y-auto pr-1">
				{#each matchCandidates as match (match.mediaType + '-' + match.tmdbId)}
					<button
						type="button"
						class="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:border-primary/50 {selectedMatch?.tmdbId ===
							match.tmdbId && selectedMatch?.mediaType === match.mediaType
							? 'border-primary bg-primary/5'
							: 'border-base-300'}"
						onclick={() => onChooseMatch(match)}
					>
						<div class="min-w-0">
							<div class="truncate font-medium">
								{match.title}
								{#if match.year}
									<span class="text-base-content/60">({match.year})</span>
								{/if}
							</div>
							<div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
								<span class="badge badge-outline badge-sm">
									{match.mediaType === 'movie' ? m.common_movie() : m.ui_mediaType_tv()}
								</span>
								{#if match.confidence > 0}
									<span class="badge badge-ghost badge-sm"
										>{m.library_import_confidenceMatch({
											percent: Math.round(match.confidence * 100)
										})}</span
									>
								{/if}
								{#if match.inLibrary}
									<span class="badge badge-sm badge-success">{m.library_import_inLibrary()}</span>
								{/if}
							</div>
						</div>
						{#if selectedMatch?.tmdbId === match.tmdbId && selectedMatch?.mediaType === match.mediaType}
							<Check class="h-4 w-4 text-primary" />
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}
