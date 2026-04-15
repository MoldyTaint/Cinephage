<script lang="ts">
	import { Search, X, Loader2 } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages.js';

	let {
		value = $bindable(''),
		onSearch,
		isLoading = false,
		placeholder = m.discover_searchPlaceholder()
	}: {
		value: string;
		onSearch: (query: string) => void;
		isLoading?: boolean;
		placeholder?: string;
	} = $props();

	let inputEl = $state<HTMLInputElement>();
	let debounceTimer = $state<ReturnType<typeof setTimeout>>();

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		value = target.value.replace(/^\s+/, '');

		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			onSearch(value);
		}, 600);
	}

	function clearSearch() {
		value = '';
		clearTimeout(debounceTimer);
		onSearch('');
		inputEl?.focus();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			clearSearch();
		}
	}
</script>

<div class="relative w-full max-w-md">
	<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
		{#if isLoading}
			<Loader2 class="h-5 w-5 animate-spin text-base-content/50" />
		{:else}
			<Search class="h-5 w-5 text-base-content/50" />
		{/if}
	</div>

	<input
		bind:this={inputEl}
		type="text"
		{placeholder}
		class="input-bordered input w-full bg-base-200 pr-10 pl-10 focus:bg-base-100"
		{value}
		oninput={handleInput}
		onkeydown={handleKeydown}
	/>

	{#if value}
		<button
			class="absolute inset-y-0 right-0 flex items-center pr-3"
			onclick={clearSearch}
			aria-label={m.discover_clearSearch()}
		>
			<X class="h-5 w-5 text-base-content/50 transition-colors hover:text-base-content" />
		</button>
	{/if}
</div>
