<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';

	let {
		label,
		value,
		href
	}: {
		label: string;
		value: string | number | null | undefined;
		href?: string;
	} = $props();
</script>

{#if value}
	<div class="flex flex-col gap-1">
		<span class="text-sm font-medium text-white/60">{label}</span>
		{#if href}
			<!-- eslint-disable svelte/no-navigation-without-resolve -- External URL -->
			<a
				{href}
				class="text-base text-white transition-colors hover:text-primary"
				target="_blank"
				rel="noopener noreferrer"
			>
				{value}
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{:else}
			<span class="text-base text-white">{value}</span>
		{/if}
	</div>
{/if}
