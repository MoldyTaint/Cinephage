<script lang="ts">
	import { ArrowUpDown, Filter, X } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages.js';

	interface SortOption {
		value: string;
		label: string;
	}

	interface FilterOption {
		key: string;
		label: string;
		options: { value: string; label: string }[];
	}

	let {
		sortOptions,
		filterOptions,
		currentSort = 'title-asc',
		currentFilters = {},
		hiddenActiveFilterKeys = [],
		onSortChange,
		onFilterChange,
		onClearFilters
	}: {
		sortOptions: SortOption[];
		filterOptions: FilterOption[];
		currentSort: string;
		currentFilters: Record<string, string>;
		hiddenActiveFilterKeys?: string[];
		onSortChange: (sort: string) => void;
		onFilterChange: (key: string, value: string) => void;
		onClearFilters: () => void;
	} = $props();

	const visibleActiveFilterEntries = $derived(
		Object.entries(currentFilters).filter(
			([key, value]) => !hiddenActiveFilterKeys.includes(key) && value !== 'all'
		)
	);

	// Check if any non-default filters are active
	const hasActiveFilters = $derived(visibleActiveFilterEntries.length > 0);

	// Count active filters
	const activeFilterCount = $derived(visibleActiveFilterEntries.length);

	// Get labels for active filters
	const activeFilterLabels = $derived(() => {
		const labels: string[] = [];
		for (const filter of filterOptions) {
			if (hiddenActiveFilterKeys.includes(filter.key)) continue;
			const value = currentFilters[filter.key];
			if (value && value !== 'all') {
				const option = filter.options.find((o) => o.value === value);
				if (option) {
					labels.push(option.label);
				}
			}
		}
		return labels;
	});

	let isFilterOpen = $state(false);
</script>

<div class="flex flex-wrap items-center gap-3">
	<!-- Sort Dropdown -->
	<div class="dropdown dropdown-end">
		<button class="btn gap-2 btn-ghost btn-sm">
			<ArrowUpDown class="h-4 w-4" />
			<span class="hidden sm:inline">{m.action_sort()}</span>
		</button>
		<ul class="dropdown-content menu z-50 w-52 rounded-box bg-base-200 p-2 shadow-lg">
			{#each sortOptions as option (option.value)}
				<li>
					<button
						class:active={currentSort === option.value}
						onclick={() => onSortChange(option.value)}
					>
						{option.label}
					</button>
				</li>
			{/each}
		</ul>
	</div>

	<!-- Filter Button / Dropdown -->
	<div class="dropdown dropdown-end">
		<button
			class="btn gap-2 btn-sm {hasActiveFilters ? 'btn-primary' : 'btn-ghost'}"
			onclick={() => (isFilterOpen = !isFilterOpen)}
		>
			<Filter class="h-4 w-4" />
			<span class="hidden sm:inline">{m.action_filter()}</span>
			{#if activeFilterCount > 0}
				<span class="badge badge-sm">{activeFilterCount}</span>
			{/if}
		</button>
		<div
			class="dropdown-content z-50 w-[min(18rem,calc(100vw-2rem))] rounded-box bg-base-200 p-4 shadow-lg"
			class:hidden={!isFilterOpen}
		>
			<div class="space-y-4">
				{#each filterOptions as filter (filter.key)}
					<div>
						<label class="label" for="filter-{filter.key}">
							<span class="label-text font-medium">{filter.label}</span>
						</label>
						<select
							id="filter-{filter.key}"
							class="select-bordered select w-full select-sm"
							value={currentFilters[filter.key] || 'all'}
							onchange={(e) => onFilterChange(filter.key, e.currentTarget.value)}
						>
							{#each filter.options as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</div>
				{/each}

				{#if hasActiveFilters}
					<button class="btn w-full btn-ghost btn-sm" onclick={onClearFilters}>
						{m.library_controls_clearAllFilters()}
					</button>
				{/if}
			</div>
		</div>
	</div>

	<!-- Active Filter Badges -->
	{#if hasActiveFilters}
		<div class="hidden flex-wrap items-center gap-2 md:flex">
			{#each activeFilterLabels() as label (label)}
				<span class="badge badge-outline badge-sm">{label}</span>
			{/each}
			<button
				class="btn text-error btn-ghost btn-xs"
				onclick={onClearFilters}
				title="Clear all filters"
			>
				<X class="h-3 w-3" />
			</button>
		</div>
	{/if}
</div>
