<script lang="ts">
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

<div class="mb-4 flex flex-wrap items-center gap-4">
	<!-- Search -->
	<div class="form-control w-full sm:w-48">
		<input
			type="text"
			placeholder="Search indexers..."
			class="input-bordered input input-sm w-full pl-9"
			value={filters.search}
			oninput={(e) => updateFilter('search', e.currentTarget.value)}
		/>
	</div>

	<!-- Protocol Filter -->
	<div class="join">
		<button
			class="btn join-item btn-sm"
			class:btn-active={filters.protocol === 'all'}
			onclick={() => updateFilter('protocol', 'all')}
		>
			All
		</button>
		<button
			class="btn join-item btn-sm"
			class:btn-active={filters.protocol === 'torrent'}
			onclick={() => updateFilter('protocol', 'torrent')}
		>
			Torrent
		</button>
		<button
			class="btn join-item btn-sm"
			class:btn-active={filters.protocol === 'usenet'}
			onclick={() => updateFilter('protocol', 'usenet')}
		>
			Usenet
		</button>
	</div>

	<!-- Status Filter -->
	<div class="join">
		<button
			class="btn join-item btn-sm"
			class:btn-active={filters.status === 'all'}
			onclick={() => updateFilter('status', 'all')}
		>
			All
		</button>
		<button
			class="btn join-item btn-sm"
			class:btn-active={filters.status === 'enabled'}
			onclick={() => updateFilter('status', 'enabled')}
		>
			Enabled
		</button>
		<button
			class="btn join-item btn-sm"
			class:btn-active={filters.status === 'disabled'}
			onclick={() => updateFilter('status', 'disabled')}
		>
			Disabled
		</button>
	</div>
</div>
