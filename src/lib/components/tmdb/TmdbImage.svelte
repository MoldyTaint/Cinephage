<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';

	// TMDB's image base URL is static and hasn't changed in 10+ years
	const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/';

	let {
		path,
		size = 'w500',
		alt,
		class: className = ''
	}: { path: string | null; size?: string; alt: string; class?: string } = $props();

	// Use native lazy loading - much more efficient than JS IntersectionObserver
	// The browser handles this with a single optimized observer internally
	const src = $derived(path ? `${TMDB_IMAGE_BASE}${size}${path}` : '');

	let loaded = $state(false);
</script>

<div class="relative {className}">
	{#if src}
		<img
			{src}
			{alt}
			loading="lazy"
			decoding="async"
			onload={() => (loaded = true)}
			class="h-full w-full object-cover transition-opacity duration-200 {loaded
				? 'opacity-100'
				: 'opacity-0'}"
		/>
		{#if !loaded}
			<div class="absolute inset-0 animate-pulse bg-base-300"></div>
		{/if}
	{:else}
		<!-- No image available -->
		<div class="flex h-full w-full items-center justify-center bg-base-300 text-base-content/30">
			<span class="text-xs">{m.tmdb_noImage()}</span>
		</div>
	{/if}
</div>
