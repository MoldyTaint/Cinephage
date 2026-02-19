<script lang="ts">
	import type { ActivityFilters } from '$lib/types/activity';
	import { X, Calendar, HardDrive, Globe, Users, Monitor, ArrowUpCircle } from 'lucide-svelte';

	interface Props {
		filters: ActivityFilters;
		downloadClients?: Array<{ id: string; name: string }>;
		onFilterRemove: (key: keyof ActivityFilters) => void;
		onClearAll: () => void;
	}

	let { filters, downloadClients = [], onFilterRemove, onClearAll }: Props = $props();

	// Helper to format filter values for display
	function getFilterDisplay(key: keyof ActivityFilters, value: unknown): string {
		if (value === undefined || value === null || value === 'all' || value === '') {
			return '';
		}

		switch (key) {
			case 'status':
				return value === 'success'
					? 'Success'
					: String(value).charAt(0).toUpperCase() + String(value).slice(1);
			case 'mediaType':
				return value === 'tv' ? 'TV Shows' : 'Movies';
			case 'protocol':
				return String(value).charAt(0).toUpperCase() + String(value).slice(1);
			case 'isUpgrade':
				return 'Upgrades Only';
			case 'startDate':
				return `From ${value}`;
			case 'endDate':
				return `To ${value}`;
			case 'search':
				return `Search: "${value}"`;
			case 'downloadClientId': {
				const client = downloadClients.find((entry) => entry.id === value);
				return client ? `Client: ${client.name}` : `Client: ${value}`;
			}
			default:
				return String(value);
		}
	}

	// Get icon for filter type
	function getFilterIcon(key: keyof ActivityFilters) {
		switch (key) {
			case 'status':
				return Monitor;
			case 'mediaType':
				return HardDrive;
			case 'protocol':
				return Globe;
			case 'indexer':
				return HardDrive;
			case 'releaseGroup':
				return Users;
			case 'resolution':
				return HardDrive;
			case 'downloadClientId':
				return Monitor;
			case 'isUpgrade':
				return ArrowUpCircle;
			case 'startDate':
			case 'endDate':
				return Calendar;
			default:
				return null;
		}
	}

	// Build list of active filters
	let activeFilters = $derived(
		Object.entries(filters).filter(([key, value]) => {
			if (value === undefined || value === null) return false;
			if (value === 'all' || value === '') return false;
			if (key === 'startDate' && !filters.endDate) return true;
			if (key === 'endDate' && !filters.startDate) return true;
			return true;
		}) as [keyof ActivityFilters, unknown][]
	);

	// Group date filters together
	let hasDateRange = $derived(filters.startDate || filters.endDate);
	let dateRangeLabel = $derived(() => {
		if (filters.startDate && filters.endDate) {
			return `${filters.startDate} to ${filters.endDate}`;
		} else if (filters.startDate) {
			return `From ${filters.startDate}`;
		} else if (filters.endDate) {
			return `Until ${filters.endDate}`;
		}
		return '';
	});
</script>

{#if activeFilters.length > 0}
	<div class="flex flex-wrap items-center gap-2">
		<span class="text-sm text-base-content/60">Active filters:</span>

		{#each activeFilters as [key, value] (key)}
			{#if key !== 'startDate' && key !== 'endDate'}
				{@const Icon = getFilterIcon(key)}
				<div class="badge gap-1 badge-primary">
					{#if Icon}
						<Icon class="h-3 w-3" />
					{/if}
					<span>{getFilterDisplay(key, value)}</span>
					<button
						class="btn btn-circle btn-ghost btn-xs"
						onclick={() => onFilterRemove(key)}
						aria-label="Remove filter"
					>
						<X class="h-3 w-3" />
					</button>
				</div>
			{/if}
		{/each}

		{#if hasDateRange}
			<div class="badge gap-1 badge-primary">
				<Calendar class="h-3 w-3" />
				<span>{dateRangeLabel()}</span>
				<button
					class="btn btn-circle btn-ghost btn-xs"
					onclick={() => {
						onFilterRemove('startDate');
						onFilterRemove('endDate');
					}}
					aria-label="Remove date filter"
				>
					<X class="h-3 w-3" />
				</button>
			</div>
		{/if}

		<button class="btn btn-ghost btn-xs" onclick={onClearAll}> Clear all </button>
	</div>
{/if}
