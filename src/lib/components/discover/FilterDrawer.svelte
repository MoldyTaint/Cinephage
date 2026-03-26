<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import FilterPanel from './FilterPanel.svelte';
	import type { WatchProvider } from '$lib/types/tmdb';
	import * as m from '$lib/paraglide/messages.js';

	let {
		isOpen = $bindable(false),
		type,
		sortBy,
		selectedProviders,
		providers,
		genres,
		selectedGenres,
		selectedLanguage,
		minYear,
		maxYear,
		minRating,
		onTypeChange,
		onSortChange,
		onProviderToggle,
		onGenreToggle,
		onLanguageChange,
		onYearChange,
		onRatingChange,
		onReset,
		onApply
	} = $props<{
		isOpen: boolean;
		type: string;
		sortBy: string;
		selectedProviders: number[];
		providers: WatchProvider[];
		genres: { id: number; name: string }[];
		selectedGenres: number[];
		selectedLanguage: string;
		minYear: string;
		maxYear: string;
		minRating: number;
		onTypeChange: (type: string) => void;
		onSortChange: (sort: string) => void;
		onProviderToggle: (id: number) => void;
		onGenreToggle: (id: number) => void;
		onLanguageChange: (language: string) => void;
		onYearChange: (min: string, max: string) => void;
		onRatingChange: (rating: number) => void;
		onReset: () => void;
		onApply: () => void;
	}>();

	function close() {
		isOpen = false;
	}
</script>

{#if isOpen}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
		transition:fade={{ duration: 200 }}
		onclick={close}
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Escape' && close()}
	></div>

	<!-- Drawer -->
	<div
		class="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-base-100 shadow-2xl"
		transition:fly={{ x: '100%', duration: 300, opacity: 1 }}
	>
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-base-200 p-4">
			<h2 class="text-xl font-bold">{m.discover_filters()}</h2>
			<button
				class="btn btn-circle btn-ghost btn-sm"
				onclick={close}
				aria-label={m.discover_closeFilters()}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			</button>
		</div>

		<!-- Content -->
		<div class="custom-scrollbar flex-1 overflow-y-auto p-4">
			<FilterPanel
				{type}
				{sortBy}
				{selectedProviders}
				{providers}
				{genres}
				{selectedGenres}
				{selectedLanguage}
				{minYear}
				{maxYear}
				{minRating}
				{onTypeChange}
				{onSortChange}
				{onProviderToggle}
				{onGenreToggle}
				{onLanguageChange}
				{onYearChange}
				{onRatingChange}
			/>
		</div>

		<!-- Footer -->
		<div class="flex gap-3 border-t border-base-200 bg-base-100 p-4">
			<button class="btn flex-1 btn-outline" onclick={onReset}>{m.action_reset()}</button>
			<button
				class="btn flex-1 btn-primary"
				onclick={() => {
					onApply();
					close();
				}}>{m.discover_applyFilters()}</button
			>
		</div>
	</div>
{/if}

<style>
	/* Hide scrollbar for Chrome, Safari and Opera */
	.custom-scrollbar::-webkit-scrollbar {
		display: none;
	}
	/* Hide scrollbar for IE, Edge and Firefox */
	.custom-scrollbar {
		-ms-overflow-style: none; /* IE and Edge */
		scrollbar-width: none; /* Firefox */
	}
</style>
