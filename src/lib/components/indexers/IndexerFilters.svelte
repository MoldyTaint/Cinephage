<script lang="ts">
	import { Search } from 'lucide-svelte';
	import type { IndexerFilters } from '$lib/types/indexer';

	interface Props {
		filters: IndexerFilters;
		onFilterChange: (filters: IndexerFilters) => void;
	}

	let { filters, onFilterChange }: Props = $props();

	function updateFilter<K extends keyof IndexerFilters>(key: K, value: IndexerFilters[K]) {
		onFilterChange({ ...filters, [key]: value });
	}
</script>

<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
	<!-- Search -->
	<div class="form-control relative w-full sm:w-56">
		<Search
			class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-base-content/40"
		/>
		<input
			type="text"
			placeholder="Search indexers..."
			class="input input-sm w-full rounded-full border-base-content/20 bg-base-200/60 pr-4 pl-10 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none"
			value={filters.search}
			oninput={(e) => updateFilter('search', e.currentTarget.value)}
		/>
	</div>

	<!-- Protocol Filter -->
	<div class="join w-full sm:w-auto">
		<button
			class="btn join-item flex-1 btn-sm sm:flex-none"
			class:btn-active={filters.protocol === 'all'}
			onclick={() => updateFilter('protocol', 'all')}
		>
			All
		</button>
		<button
			class="btn join-item flex-1 btn-sm sm:flex-none"
			class:btn-active={filters.protocol === 'torrent'}
			onclick={() => updateFilter('protocol', 'torrent')}
		>
			Torrent
		</button>
		<button
			class="btn join-item flex-1 btn-sm sm:flex-none"
			class:btn-active={filters.protocol === 'usenet'}
			onclick={() => updateFilter('protocol', 'usenet')}
		>
			Usenet
		</button>
	</div>

	<!-- Status Filter -->
	<div class="join w-full sm:w-auto">
		<button
			class="btn join-item flex-1 btn-sm sm:flex-none"
			class:btn-active={filters.status === 'all'}
			onclick={() => updateFilter('status', 'all')}
		>
			All
		</button>
		<button
			class="btn join-item flex-1 btn-sm sm:flex-none"
			class:btn-active={filters.status === 'enabled'}
			onclick={() => updateFilter('status', 'enabled')}
		>
			Enabled
		</button>
		<button
			class="btn join-item flex-1 btn-sm sm:flex-none"
			class:btn-active={filters.status === 'disabled'}
			onclick={() => updateFilter('status', 'disabled')}
		>
			Disabled
		</button>
	</div>
</div>
