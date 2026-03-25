<script lang="ts">
	import type { ProductionCompany } from '$lib/types/tmdb';
	import TmdbImage from './TmdbImage.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { networks }: { networks: ProductionCompany[] } = $props();
</script>

{#if networks.length > 0}
	<div class="flex flex-wrap items-center gap-4">
		{#each networks as network (network.id)}
			<div
				class="flex items-center justify-center rounded-lg bg-base-300/50 px-3 py-2"
				title={network.name}
			>
				{#if network.logo_path}
					<TmdbImage
						path={network.logo_path}
						size="w92"
						alt={network.name}
						class="h-8 w-auto max-w-24 object-contain"
					/>
				{:else}
					<span class="text-sm text-white/80">{network.name}</span>
				{/if}
			</div>
		{/each}
	</div>
{/if}
