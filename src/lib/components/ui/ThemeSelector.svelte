<script lang="ts">
	import { theme } from '$lib/theme.svelte';
	import { themes } from '$lib/themes';
	import { Palette } from 'lucide-svelte';

	let { class: className = 'dropdown-end', showLabel = true } = $props();
</script>

<div class="dropdown {className}">
	<div tabindex="0" role="button" class="btn m-1 btn-ghost">
		<Palette class="h-5 w-5" />
		{#if showLabel}
			<span class="hidden md:inline">Theme</span>
		{/if}
	</div>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<ul
		tabindex="0"
		class="dropdown-content z-60 h-96 w-52 overflow-y-auto rounded-box bg-base-300 p-2 shadow-2xl"
	>
		{#each themes as t (t)}
			<li>
				<button
					class="btn btn-block justify-start capitalize btn-ghost btn-sm"
					class:btn-active={theme.current === t}
					onclick={() => theme.set(t)}
				>
					{t}
				</button>
			</li>
		{/each}
	</ul>
</div>
