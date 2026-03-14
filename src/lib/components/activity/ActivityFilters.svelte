<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { ActivityFilters, FilterOptions } from '$lib/types/activity';
	import {
		Filter,
		X,
		Calendar,
		HardDrive,
		Globe,
		Users,
		Monitor,
		ArrowUpCircle,
		Search,
		ChevronDown,
		ChevronUp
	} from 'lucide-svelte';

	interface Props {
		filters: ActivityFilters;
		filterOptions: FilterOptions;
		statusContext?: 'active' | 'history';
		onFiltersChange: (filters: ActivityFilters) => void;
		onClearFilters: () => void;
		showActiveFilters?: boolean;
		showHistoryControls?: boolean;
		activeFiltersContent?: Snippet;
		historyControlsContent?: Snippet;
	}

	let {
		filters,
		filterOptions,
		statusContext = 'history',
		onFiltersChange,
		onClearFilters,
		showActiveFilters = false,
		showHistoryControls = false,
		activeFiltersContent,
		historyControlsContent
	}: Props = $props();

	let isExpanded = $state(false);
	let hasActiveFilters = $derived(
		filters.status !== 'all' ||
			filters.mediaType !== 'all' ||
			filters.protocol !== 'all' ||
			filters.indexer ||
			filters.releaseGroup ||
			filters.resolution ||
			filters.isUpgrade ||
			filters.includeNoResults ||
			filters.startDate ||
			filters.endDate ||
			filters.search
	);

	// ── Debounced text inputs ────────────────────────────────────────────
	// Search and releaseGroup are text inputs that fire on every keystroke.
	// Debounce them so the expensive goto() + server re-fetch only fires
	// after the user stops typing for 300ms.
	const DEBOUNCE_MS = 300;
	let searchValue = $state('');
	let releaseGroupValue = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let releaseGroupTimer: ReturnType<typeof setTimeout> | undefined;

	// Track the last external filter value so we only reset local state
	// when the parent actually changes the filter (tab switch, clear, etc.),
	// not when our own debounced callback round-trips through props.
	let lastExternalSearch = $state('');
	let lastExternalReleaseGroup = $state('');

	$effect(() => {
		const incoming = filters.search || '';
		if (incoming !== lastExternalSearch) {
			lastExternalSearch = incoming;
			searchValue = incoming;
		}
	});
	$effect(() => {
		const incoming = filters.releaseGroup || '';
		if (incoming !== lastExternalReleaseGroup) {
			lastExternalReleaseGroup = incoming;
			releaseGroupValue = incoming;
		}
	});

	function onSearchInput(value: string) {
		searchValue = value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			onFiltersChange({ ...filters, search: value || undefined });
		}, DEBOUNCE_MS);
	}

	function onReleaseGroupInput(value: string) {
		releaseGroupValue = value;
		clearTimeout(releaseGroupTimer);
		releaseGroupTimer = setTimeout(() => {
			onFiltersChange({ ...filters, releaseGroup: value || undefined });
		}, DEBOUNCE_MS);
	}

	onDestroy(() => {
		clearTimeout(searchTimer);
		clearTimeout(releaseGroupTimer);
	});

	// Quick date presets
	const datePresets = [
		{ label: 'Today', days: 0 },
		{ label: 'Last 7 days', days: 7 },
		{ label: 'Last 30 days', days: 30 },
		{ label: 'Last 90 days', days: 90 }
	];

	const DAY_IN_MS = 24 * 60 * 60 * 1000;

	function toIsoDate(epochMs: number): string {
		return new Date(epochMs).toISOString().split('T')[0];
	}

	function getDatePresetRange(days: number): { startDate: string; endDate: string } {
		const now = Date.now();

		return {
			startDate: toIsoDate(now - days * DAY_IN_MS),
			endDate: toIsoDate(now)
		};
	}

	function applyDatePreset(days: number) {
		const range = getDatePresetRange(days);
		onFiltersChange({
			...filters,
			startDate: range.startDate,
			endDate: range.endDate
		});
	}

	function isDatePresetActive(days: number): boolean {
		if (!filters.startDate || !filters.endDate) return false;
		const range = getDatePresetRange(days);
		return filters.startDate === range.startDate && filters.endDate === range.endDate;
	}

	function clearDateRange() {
		onFiltersChange({
			...filters,
			startDate: undefined,
			endDate: undefined
		});
	}

	function updateFilter(key: keyof ActivityFilters, value: unknown) {
		onFiltersChange({
			...filters,
			[key]: value
		});
	}

	const activeStatusOptions = [
		{ value: 'all', label: 'All' },
		{ value: 'downloading', label: 'Downloading' },
		{ value: 'seeding', label: 'Seeding' },
		{ value: 'paused', label: 'Paused' },
		{ value: 'failed', label: 'Failed' }
	] as const;

	const historyStatusOptions = [
		{ value: 'all', label: 'All', color: '' },
		{ value: 'success', label: 'Success', color: 'badge-success' },
		{ value: 'failed', label: 'Failed', color: 'badge-error' },
		{ value: 'removed', label: 'Removed', color: 'badge-ghost' },
		{ value: 'rejected', label: 'Rejected', color: 'badge-warning' },
		{ value: 'no_results', label: 'No Results', color: 'badge-ghost' }
	] as const;

	const statusOptions = $derived(
		statusContext === 'active' ? activeStatusOptions : historyStatusOptions
	);

	// Protocol options
	const protocolOptions = [
		{ value: 'all', label: 'All' },
		{ value: 'torrent', label: 'Torrent' },
		{ value: 'usenet', label: 'Usenet' },
		{ value: 'streaming', label: 'Streaming' }
	];

	// Resolution options
	const resolutionOptions = ['4K', '2160p', '1080p', '720p', '480p', 'SD'];
</script>

<div class="rounded-xl border border-base-300 bg-base-200 p-4">
	<div class="flex items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<Filter class="h-5 w-5" />
			<span class="font-medium">Filters</span>
			{#if hasActiveFilters}
				<span class="badge badge-sm badge-primary">Active</span>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			{#if hasActiveFilters}
				<button class="btn btn-ghost btn-xs" onclick={onClearFilters}>
					<X class="h-3 w-3" />
					Clear
				</button>
			{/if}
			<button
				class="btn gap-1 btn-sm"
				onclick={() => (isExpanded = !isExpanded)}
				aria-label={isExpanded ? 'Collapse filters' : 'Expand filters'}
			>
				{#if isExpanded}
					<span>Less Filters</span>
					<ChevronUp class="h-4 w-4" />
				{:else}
					<span>More Filters</span>
					<ChevronDown class="h-4 w-4" />
				{/if}
			</button>
		</div>
	</div>

	<div class="mt-3 flex flex-wrap items-center gap-2">
		<div class="form-control min-w-50 flex-1">
			<div class="group relative">
				<div class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2">
					<Search
						class="h-4 w-4 text-base-content/40 transition-colors group-focus-within:text-primary"
					/>
				</div>
				<input
					type="text"
					placeholder="Search media, release, group..."
					class="input input-md w-full rounded-full border-base-content/20 bg-base-200/60 pr-9 pl-10 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none"
					value={searchValue}
					oninput={(e) => onSearchInput(e.currentTarget.value)}
				/>
			</div>
		</div>

		<div class="join">
			<button
				class="btn join-item btn-sm {filters.mediaType === 'all' ? 'btn-primary' : 'btn-ghost'}"
				onclick={() => updateFilter('mediaType', 'all')}
			>
				All
			</button>
			<button
				class="btn join-item btn-sm {filters.mediaType === 'movie' ? 'btn-primary' : 'btn-ghost'}"
				onclick={() => updateFilter('mediaType', 'movie')}
			>
				Movies
			</button>
			<button
				class="btn join-item btn-sm {filters.mediaType === 'tv' ? 'btn-primary' : 'btn-ghost'}"
				onclick={() => updateFilter('mediaType', 'tv')}
			>
				TV Shows
			</button>
		</div>

		{#if statusContext === 'history'}
			<div class="join">
				{#each datePresets as preset (preset.label)}
					<button
						class="btn join-item btn-sm {isDatePresetActive(preset.days)
							? 'btn-primary'
							: 'btn-ghost'}"
						onclick={() => applyDatePreset(preset.days)}
						title="Last {preset.days === 0 ? '24 hours' : preset.days + ' days'}"
						aria-pressed={isDatePresetActive(preset.days)}
					>
						{preset.label}
					</button>
				{/each}
				{#if filters.startDate || filters.endDate}
					<button class="btn join-item btn-ghost btn-sm btn-error" onclick={clearDateRange}>
						<X class="h-3 w-3" />
					</button>
				{/if}
			</div>
		{/if}
	</div>

	{#if isExpanded}
		<div class="mt-3 grid gap-4 border-t border-base-300 pt-4 md:grid-cols-2 lg:grid-cols-3">
			<!-- Status -->
			<div class="space-y-2">
				<label class="flex items-center gap-2 text-sm font-medium">
					<Monitor class="h-4 w-4" />
					Status
				</label>
				<select
					class="select-bordered select w-full select-sm"
					value={filters.status}
					onchange={(e) => updateFilter('status', e.currentTarget.value)}
				>
					{#each statusOptions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>

			<!-- Protocol -->
			<div class="space-y-2">
				<label class="flex items-center gap-2 text-sm font-medium">
					<Globe class="h-4 w-4" />
					Protocol
				</label>
				<select
					class="select-bordered select w-full select-sm"
					value={filters.protocol || 'all'}
					onchange={(e) => updateFilter('protocol', e.currentTarget.value)}
				>
					{#each protocolOptions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>

			<!-- Indexer -->
			<div class="space-y-2">
				<label class="flex items-center gap-2 text-sm font-medium">
					<HardDrive class="h-4 w-4" />
					Indexer
				</label>
				<select
					class="select-bordered select w-full select-sm"
					value={filters.indexer || ''}
					onchange={(e) => updateFilter('indexer', e.currentTarget.value || undefined)}
				>
					<option value="">All Indexers</option>
					{#each filterOptions.indexers as indexer (indexer.id)}
						<option value={indexer.name}>{indexer.name}</option>
					{/each}
				</select>
			</div>

			<!-- Download Client -->
			<div class="space-y-2">
				<label class="flex items-center gap-2 text-sm font-medium">
					<Monitor class="h-4 w-4" />
					Download Client
				</label>
				<select
					class="select-bordered select w-full select-sm"
					value={filters.downloadClientId || ''}
					onchange={(e) => updateFilter('downloadClientId', e.currentTarget.value || undefined)}
				>
					<option value="">All Clients</option>
					{#each filterOptions.downloadClients as client (client.id)}
						<option value={client.id}>{client.name}</option>
					{/each}
				</select>
			</div>

			<!-- Resolution -->
			<div class="space-y-2">
				<label class="flex items-center gap-2 text-sm font-medium">
					<HardDrive class="h-4 w-4" />
					Resolution
				</label>
				<select
					class="select-bordered select w-full select-sm"
					value={filters.resolution || ''}
					onchange={(e) => updateFilter('resolution', e.currentTarget.value || undefined)}
				>
					<option value="">All Resolutions</option>
					{#each resolutionOptions as res (res)}
						<option value={res}>{res}</option>
					{/each}
				</select>
			</div>

			<!-- Release Group -->
			<div class="space-y-2">
				<label class="flex items-center gap-2 text-sm font-medium">
					<Users class="h-4 w-4" />
					Release Group
				</label>
				<input
					type="text"
					placeholder="Filter by group..."
					class="input-bordered input input-sm w-full"
					value={releaseGroupValue}
					oninput={(e) => onReleaseGroupInput(e.currentTarget.value)}
				/>
			</div>

			<!-- Date Range -->
			<div class="space-y-2 md:col-span-2 lg:col-span-3">
				<label class="flex items-center gap-2 text-sm font-medium">
					<Calendar class="h-4 w-4" />
					Date Range
				</label>
				<div class="flex flex-wrap items-center gap-2">
					<input
						type="date"
						class="input-bordered input input-sm"
						value={filters.startDate || ''}
						onchange={(e) => updateFilter('startDate', e.currentTarget.value || undefined)}
					/>
					<span class="text-base-content/50">to</span>
					<input
						type="date"
						class="input-bordered input input-sm"
						value={filters.endDate || ''}
						onchange={(e) => updateFilter('endDate', e.currentTarget.value || undefined)}
					/>
					{#if filters.startDate || filters.endDate}
						<button class="btn btn-ghost btn-sm btn-error" onclick={clearDateRange}>
							<X class="h-4 w-4" />
						</button>
					{/if}
				</div>
			</div>

			<!-- Is Upgrade Toggle -->
			<div class="space-y-2">
				<label class="flex items-center gap-2 text-sm font-medium">
					<ArrowUpCircle class="h-4 w-4" />
					Upgrades Only
				</label>
				<div class="form-control">
					<label class="label cursor-pointer justify-start gap-2">
						<input
							type="checkbox"
							class="toggle toggle-primary toggle-sm"
							checked={filters.isUpgrade || false}
							onchange={(e) => updateFilter('isUpgrade', e.currentTarget.checked || undefined)}
						/>
						<span class="label-text text-sm">Show only upgrades</span>
					</label>
				</div>
			</div>

			{#if statusContext === 'history'}
				<!-- Include No Results Toggle -->
				<div class="space-y-2">
					<label class="flex items-center gap-2 text-sm font-medium">
						<Search class="h-4 w-4" />
						Include 'No Results'
					</label>
					<div class="form-control">
						<label class="label cursor-pointer justify-start gap-2">
							<input
								type="checkbox"
								class="toggle toggle-primary toggle-sm"
								checked={filters.includeNoResults || false}
								onchange={(e) =>
									updateFilter('includeNoResults', e.currentTarget.checked || undefined)}
							/>
							<span class="label-text text-sm">Show items with no releases found</span>
						</label>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	{#if showActiveFilters && activeFiltersContent}
		<div class="mt-3 border-t border-base-300 pt-3">
			{@render activeFiltersContent()}
		</div>
	{/if}

	{#if showHistoryControls && historyControlsContent}
		<div class="mt-3">
			{@render historyControlsContent()}
		</div>
	{/if}
</div>
