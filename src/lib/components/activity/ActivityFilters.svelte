<script lang="ts">
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
		onFiltersChange: (filters: ActivityFilters) => void;
		onClearFilters: () => void;
	}

	let { filters, filterOptions, onFiltersChange, onClearFilters }: Props = $props();

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

	// Quick date presets
	const datePresets = [
		{ label: 'Today', days: 0 },
		{ label: 'Last 7 days', days: 7 },
		{ label: 'Last 30 days', days: 30 },
		{ label: 'Last 90 days', days: 90 }
	];

	function applyDatePreset(days: number) {
		const end = $state(new Date());
		const start = $state(new Date());
		start.setDate(start.getDate() - days);
		// For "Today", set start to beginning of day
		if (days === 0) {
			start.setHours(0, 0, 0, 0);
		}
		onFiltersChange({
			...filters,
			startDate: start.toISOString().split('T')[0],
			endDate: end.toISOString().split('T')[0]
		});
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

	// Status options with colors
	const statusOptions = [
		{ value: 'all', label: 'All', color: '' },
		{ value: 'success', label: 'Success', color: 'badge-success' },
		{ value: 'downloading', label: 'Downloading', color: 'badge-info' },
		{ value: 'paused', label: 'Paused', color: 'badge-warning' },
		{ value: 'failed', label: 'Failed', color: 'badge-error' },
		{ value: 'removed', label: 'Removed', color: 'badge-ghost' },
		{ value: 'rejected', label: 'Rejected', color: 'badge-warning' },
		{ value: 'no_results', label: 'No Results', color: 'badge-ghost' }
	];

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

<div class="card bg-base-200">
	<div class="card-body p-4">
		<!-- Header with toggle -->
		<div class="flex items-center justify-between">
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
						Clear All
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

		<!-- Always visible: Quick filters -->
		<div class="mt-4 flex flex-wrap items-center gap-2">
			<!-- Search -->
			<div class="form-control min-w-50 flex-1">
				<div class="relative">
					<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-base-content/50" />
					<input
						type="text"
						placeholder="Search media, release, group..."
						class="input-bordered input input-sm w-full pl-9"
						value={filters.search || ''}
						oninput={(e) => updateFilter('search', e.currentTarget.value || undefined)}
					/>
				</div>
			</div>

			<!-- Media Type -->
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

			<!-- Date Presets -->
			<div class="join">
				{#each datePresets as preset (preset.label)}
					<button
						class="btn join-item btn-ghost btn-sm"
						onclick={() => applyDatePreset(preset.days)}
						title="Last {preset.days === 0 ? '24 hours' : preset.days + ' days'}"
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
		</div>

		<!-- Expanded filters -->
		{#if isExpanded}
			<div class="mt-4 grid gap-4 border-t border-base-300 pt-4 md:grid-cols-2 lg:grid-cols-3">
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
						{#each filterOptions.indexers as indexer (indexer.name)}
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
						value={filters.releaseGroup || ''}
						oninput={(e) => updateFilter('releaseGroup', e.currentTarget.value || undefined)}
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
			</div>
		{/if}
	</div>
</div>
