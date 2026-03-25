<script lang="ts">
	import type { ProductionCompany } from '$lib/types/tmdb';
	import TmdbImage from './TmdbImage.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let {
		companies,
		maxDisplay = 6
	}: {
		companies: ProductionCompany[];
		maxDisplay?: number;
	} = $props();

	let showAll = $state(false);
	const displayCompanies = $derived(showAll ? companies : companies.slice(0, maxDisplay));
	const hasMore = $derived(companies.length > maxDisplay);
</script>

{#if companies.length > 0}
	<div class="flex flex-wrap items-center gap-3">
		{#each displayCompanies as company (company.id)}
			<div class="flex items-center gap-2 rounded-lg bg-base-300/50 px-3 py-2" title={company.name}>
				{#if company.logo_path}
					<TmdbImage
						path={company.logo_path}
						size="w92"
						alt={company.name}
						class="h-6 w-auto max-w-20 object-contain"
					/>
				{:else}
					<span class="text-sm text-white/80">{company.name}</span>
				{/if}
			</div>
		{/each}

		{#if hasMore && !showAll}
			<button class="text-sm text-primary hover:underline" onclick={() => (showAll = true)}>
				{m.tmdb_productionCompanies_more({ count: companies.length - maxDisplay })}
			</button>
		{/if}
	</div>
{/if}
