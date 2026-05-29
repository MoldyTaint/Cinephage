<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { Check, Loader2 } from 'lucide-svelte';
	import type { MediaType, DetectionGroup, DetectionSection, TvSeasonSection } from './types.js';

	interface DestinationLibrary {
		id: string;
		name: string;
		slug: string;
		mediaType: MediaType;
		mediaSubType?: string | null;
		isDefault?: boolean;
		defaultRootFolderId?: string | null;
		defaultRootFolderPath?: string | null;
	}

	type QueueMediaFilter = 'all' | MediaType;

	let {
		importMovieSections = [],
		importTvSections = [],
		activeImportTvSection = null,
		activeImportSeasonSection = null,
		hasMultipleImportTvSeries = false,
		importMediaFilter = $bindable('all' as QueueMediaFilter),
		bulkDestinationBySectionId = {},
		selectedImportGroupCount = 0,
		selectedNeedsInputCount = 0,
		readyGroupCount = 0,
		skippedGroupCount = 0,
		executingImport = false,
		canImport = (_group: DetectionGroup) => false,
		getEffectiveMediaType = (_group: DetectionGroup) => 'movie' as MediaType,
		getSectionDestinations = (_section: DetectionSection): DestinationLibrary[] => [],
		getSectionEligibleCount = (_section: DetectionSection) => 0,
		canApplyDestination = (_section: DetectionSection) => false,
		onSelectImportSeriesSection = (_id: string) => {},
		onSelectImportSeasonSection = (_key: string) => {},
		onBulkImport = () => {},
		onUpdateSectionDestination = (_sectionId: string, _value: string) => {},
		onApplyDestination = (_section: DetectionSection) => {},
		onReviewGroup = (_groupId: string) => {},
		onGoToStep = (_step: number) => {}
	}: {
		importMovieSections: DetectionSection[];
		importTvSections: DetectionSection[];
		activeImportTvSection: DetectionSection | null;
		activeImportSeasonSection: TvSeasonSection | null;
		hasMultipleImportTvSeries: boolean;
		importMediaFilter: QueueMediaFilter;
		bulkDestinationBySectionId: Record<string, string>;
		selectedImportGroupCount: number;
		selectedNeedsInputCount: number;
		readyGroupCount: number;
		skippedGroupCount: number;
		executingImport: boolean;
		canImport: (group: DetectionGroup) => boolean;
		getEffectiveMediaType: (group: DetectionGroup) => MediaType;
		getSectionDestinations: (section: DetectionSection) => DestinationLibrary[];
		getSectionEligibleCount: (section: DetectionSection) => number;
		canApplyDestination: (section: DetectionSection) => boolean;
		onSelectImportSeriesSection: (id: string) => void;
		onSelectImportSeasonSection: (key: string) => void;
		onBulkImport: () => void;
		onUpdateSectionDestination: (sectionId: string, value: string) => void;
		onApplyDestination: (section: DetectionSection) => void;
		onReviewGroup: (groupId: string) => void;
		onGoToStep: (step: number) => void;
	} = $props();

	function formatMediaTypeLabel(mediaType: MediaType): string {
		return mediaType === 'movie' ? m.library_import_movieLabel() : m.library_import_tvShowLabel();
	}

	function getDetectedSeasonsLabel(section: DetectionSection): string {
		if (!section.seasonSections || section.seasonSections.length === 0) return 'none';
		const seasons = section.seasonSections
			.filter((season) => season.seasonNumber !== null)
			.map((season) => season.seasonNumber as number);
		if (seasons.length === 0) return 'none';
		return seasons.join(', ');
	}
</script>

<div class="space-y-4">
	<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
		<h2 class="text-lg font-semibold">{m.library_import_importSelectionHeading()}</h2>
		<p class="mt-1 text-sm text-base-content/70">
			{m.library_import_importSelectionHint()}
		</p>

		<div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
			<span class="badge badge-primary"
				>{m.library_import_selectedCount({ count: selectedImportGroupCount })}</span
			>
			<span class="badge badge-success"
				>{m.library_import_readyCount({ count: readyGroupCount })}</span
			>
			{#if selectedNeedsInputCount > 0}
				<span class="badge badge-warning"
					>{m.library_import_needInputCount({ count: selectedNeedsInputCount })}</span
				>
			{/if}
			{#if skippedGroupCount > 0}
				<span class="badge badge-ghost"
					>{m.library_import_skippedCount({ count: skippedGroupCount })}</span
				>
			{/if}
		</div>
	</div>

	<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
		<h3 class="font-semibold">{m.library_import_selectedItemsHeading()}</h3>
		<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
			<p class="text-xs text-base-content/70">{m.library_import_filterByMediaType()}</p>
			<div class="join">
				<button
					type="button"
					class="btn join-item btn-sm {importMediaFilter === 'all' ? 'btn-primary' : 'btn-ghost'}"
					onclick={() => (importMediaFilter = 'all')}
				>
					{m.library_import_filterAllMedia()}
				</button>
				<button
					type="button"
					class="btn join-item btn-sm {importMediaFilter === 'movie' ? 'btn-primary' : 'btn-ghost'}"
					onclick={() => (importMediaFilter = 'movie')}
				>
					{m.common_movies()}
				</button>
				<button
					type="button"
					class="btn join-item btn-sm {importMediaFilter === 'tv' ? 'btn-primary' : 'btn-ghost'}"
					onclick={() => (importMediaFilter = 'tv')}
				>
					{m.common_tvShows()}
				</button>
			</div>
		</div>
		{#if selectedImportGroupCount === 0}
			<div
				class="mt-3 rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/60"
			>
				{m.library_import_noItemsSelected()}
			</div>
		{:else if importMovieSections.length === 0 && importTvSections.length === 0}
			<div
				class="mt-3 rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/60"
			>
				{m.library_import_noItemsMatchFilter()}
			</div>
		{:else}
			<div class="mt-3 space-y-3">
				{#if importMovieSections.length > 0}
					<div class="max-h-72 space-y-2 overflow-y-auto pr-1">
						{#each importMovieSections as section (section.id)}
							{#each section.items as group (group.id)}
								<div class="rounded-lg border border-base-300 p-2">
									<div
										class="flex items-center justify-between gap-3 rounded-lg border border-base-300 p-3"
									>
										<div class="min-w-0">
											<div class="truncate font-medium">{group.displayName}</div>
											<div
												class="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-content/70"
											>
												<span>{formatMediaTypeLabel(getEffectiveMediaType(group))}</span>
												<span>•</span>
												<span
													>{group.detectedFileCount === 1
														? m.library_import_fileCountSingular({
																count: group.detectedFileCount
															})
														: m.library_import_fileCount({
																count: group.detectedFileCount
															})}</span
												>
												{#if canImport(group)}
													<span class="text-success">{m.library_import_ready()}</span>
												{:else}
													<span class="text-warning">{m.library_import_needsInput()}</span>
												{/if}
											</div>
										</div>
										<button class="btn btn-ghost btn-xs" onclick={() => onReviewGroup(group.id)}>
											{m.library_import_review()}
										</button>
									</div>
								</div>
							{/each}
						{/each}
					</div>
				{/if}

				{#if importTvSections.length > 0}
					<div class="overflow-hidden rounded-lg border border-base-300 p-2">
						<div
							class="grid gap-3 {hasMultipleImportTvSeries
								? 'xl:grid-cols-[280px_minmax(0,1fr)]'
								: ''}"
						>
							{#if hasMultipleImportTvSeries}
								<div class="max-h-80 space-y-1 overflow-y-auto pr-1">
									{#each importTvSections as section (section.id)}
										<button
											type="button"
											class="w-full rounded-md border px-3 py-2 text-left transition-colors {activeImportTvSection?.id ===
											section.id
												? 'border-primary bg-primary/5'
												: 'border-base-300 hover:bg-base-200/50'}"
											onclick={() => onSelectImportSeriesSection(section.id)}
										>
											<div class="truncate text-sm font-medium">{section.label}</div>
											<div class="mt-1 text-xs text-base-content/70">
												{section.items.length === 1
													? m.library_import_episodeCountSingular({
															count: section.items.length
														})
													: m.library_import_episodeCount({ count: section.items.length })} • {m.library_import_seasonsLabel(
													{ seasons: getDetectedSeasonsLabel(section) }
												)}
											</div>
										</button>
									{/each}
								</div>
							{/if}

							<div class="min-w-0 overflow-hidden rounded-md border border-base-300 p-2">
								{#if activeImportTvSection}
									{@const mediaDestinationOptions = getSectionDestinations(activeImportTvSection)}
									{@const mediaDestinationEligibleCount =
										getSectionEligibleCount(activeImportTvSection)}
									<div class="min-w-0">
										<div class="truncate font-medium">{activeImportTvSection.label}</div>
										<div class="text-xs text-base-content/70">
											{activeImportTvSection.items.length === 1
												? m.library_import_episodeCountSingular({
														count: activeImportTvSection.items.length
													})
												: m.library_import_episodeCount({
														count: activeImportTvSection.items.length
													})}
										</div>
									</div>

									{#if mediaDestinationOptions.length > 0}
										<div
											class="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-base-300 bg-base-200/40 p-2"
										>
											<div class="min-w-64 flex-1">
												<div class="pb-1 text-xs text-base-content/80">
													{m.library_import_destinationRootFolder()}
												</div>
												<select
													class="select-bordered select w-full select-xs"
													value={bulkDestinationBySectionId[activeImportTvSection.id] ?? ''}
													onchange={(event) =>
														onUpdateSectionDestination(
															activeImportTvSection.id,
															(event.target as HTMLSelectElement).value
														)}
												>
													<option disabled value="">{m.library_import_selectRootFolder()}</option>
													{#each mediaDestinationOptions as folder (folder.id)}
														<option value={folder.id}
															>{folder.name}
															{#if folder.defaultRootFolderPath}
																- {folder.defaultRootFolderPath}
															{/if}</option
														>
													{/each}
												</select>
											</div>
											<button
												type="button"
												class="btn btn-ghost btn-xs"
												disabled={!canApplyDestination(activeImportTvSection)}
												onclick={() => onApplyDestination(activeImportTvSection)}
											>
												{m.library_import_applyDestinationToMedia()}
											</button>
										</div>
									{:else}
										<div
											class="mt-2 rounded-md border border-base-300 bg-base-200/40 p-2 text-xs text-base-content/70"
										>
											{#if mediaDestinationEligibleCount === 0}
												{m.library_import_destinationNotNeededForExistingMedia()}
											{:else}
												{m.library_import_noCommonDestinationForMedia()}
											{/if}
										</div>
									{/if}

									{#if activeImportTvSection.seasonSections}
										<div class="mt-2 flex flex-wrap gap-2">
											{#each activeImportTvSection.seasonSections as seasonSection (seasonSection.key)}
												<button
													type="button"
													class="btn btn-xs {activeImportSeasonSection?.key === seasonSection.key
														? 'btn-primary'
														: 'btn-ghost'}"
													onclick={() => onSelectImportSeasonSection(seasonSection.key)}
												>
													{seasonSection.label} ({seasonSection.items.length})
												</button>
											{/each}
										</div>
									{/if}

									<div class="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
										{#each activeImportSeasonSection?.items ?? activeImportTvSection.items as group (group.id)}
											<div
												class="flex items-center justify-between gap-3 rounded-lg border border-base-300 p-3"
											>
												<div class="min-w-0">
													<div class="truncate font-medium">{group.displayName}</div>
													<div
														class="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-content/70"
													>
														<span>{formatMediaTypeLabel(getEffectiveMediaType(group))}</span>
														<span>•</span>
														<span
															>{group.detectedFileCount === 1
																? m.library_import_fileCountSingular({
																		count: group.detectedFileCount
																	})
																: m.library_import_fileCount({
																		count: group.detectedFileCount
																	})}</span
														>
														{#if canImport(group)}
															<span class="text-success">{m.library_import_ready()}</span>
														{:else}
															<span class="text-warning">{m.library_import_needsInput()}</span>
														{/if}
													</div>
												</div>
												<button
													class="btn btn-ghost btn-xs"
													onclick={() => onReviewGroup(group.id)}
												>
													{m.library_import_review()}
												</button>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	{#if selectedNeedsInputCount > 0}
		<div class="alert text-sm alert-warning">
			<span>
				{m.library_import_needsInputWarning({ count: selectedNeedsInputCount })}
			</span>
		</div>
	{/if}

	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<button class="btn btn-ghost" onclick={() => onGoToStep(2)}
			>{m.library_import_backToReview()}</button
		>
		<button
			class="btn btn-primary"
			onclick={onBulkImport}
			disabled={executingImport || selectedImportGroupCount === 0 || selectedNeedsInputCount > 0}
		>
			{#if executingImport}
				<Loader2 class="h-4 w-4 animate-spin" />
				{m.library_import_importing()}
			{:else}
				<Check class="h-4 w-4" />
				{m.library_import_startImportCount({ count: selectedImportGroupCount })}
			{/if}
		</button>
	</div>
</div>
