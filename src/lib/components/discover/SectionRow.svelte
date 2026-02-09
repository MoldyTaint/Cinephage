<script lang="ts" generics="T extends { id: number }">
	import MediaCard from '$lib/components/tmdb/MediaCard.svelte';
	import type { TmdbMediaItem } from '$lib/types/tmdb';
	import { type Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import { resolvePath } from '$lib/utils/routing';

	let { title, items, link, endpoint, cardSnippet, onAddToLibrary, itemClass, excludeInLibrary } =
		$props<{
			title: string;
			items: T[];
			link?: string;
			endpoint?: string;
			cardSnippet?: Snippet<[T]>;
			onAddToLibrary?: (item: T) => void;
			itemClass?: string;
			excludeInLibrary?: boolean;
		}>();

	const resolvedItemClass = $derived(
		itemClass ?? 'w-[calc((100%-2*0.75rem)/3)] sm:w-36 md:w-40 lg:w-44'
	);

	// Initialize with empty array, effect syncs from props
	let displayedItems = $state<T[]>([]);
	let page = $state(1);
	let loading = $state(false);
	let container: HTMLElement;
	let showLeftArrow = $state(false);
	let showRightArrow = $state(true);

	// Sync items from props
	$effect(() => {
		displayedItems = items;
		page = 1;
	});

	async function loadMore() {
		if (loading || !endpoint) return;
		loading = true;
		try {
			const next = page + 1;
			const res = await fetch(`/api/tmdb/${endpoint}?page=${next}`);
			if (res.ok) {
				const data: { results?: T[] } = await res.json();
				if (data.results && data.results.length > 0) {
					// Filter out duplicates
					const existingIds = new Set(displayedItems.map((i: T) => i.id));
					let newResults = data.results.filter((i: T) => !existingIds.has(i.id));

					// Filter out items in library if excludeInLibrary is true
					if (excludeInLibrary) {
						newResults = newResults.filter((i: T & { inLibrary?: boolean }) => !i.inLibrary);
					}

					if (newResults.length > 0) {
						displayedItems = [...displayedItems, ...newResults];
						page = next;
					}
				}
			}
		} catch (e) {
			console.error('Failed to load more items', e);
		} finally {
			loading = false;
		}
	}

	function handleScroll() {
		if (!container) return;
		const { scrollLeft, scrollWidth, clientWidth } = container;

		showLeftArrow = scrollLeft > 0;
		showRightArrow = scrollLeft < scrollWidth - clientWidth - 10;

		// Load more when we're close to the end (within 200px)
		if (endpoint && scrollWidth - (scrollLeft + clientWidth) < 200) {
			loadMore();
		}
	}

	function scroll(direction: 'left' | 'right') {
		if (!container) return;
		const scrollAmount = container.clientWidth * 0.75;
		container.scrollBy({
			left: direction === 'left' ? -scrollAmount : scrollAmount,
			behavior: 'smooth'
		});
	}

	$effect(() => {
		if (container) handleScroll();
	});
</script>

<div class="group/section space-y-4">
	<div class="flex items-center justify-between px-1">
		<h2 class="flex items-center gap-2 text-xl font-bold text-base-content">
			<span class="h-6 w-1 rounded-full bg-primary"></span>
			{title}
		</h2>
		{#if link}
			<a
				href={resolvePath(link)}
				class="hover:text-primary-focus group/link flex items-center gap-1 text-sm font-bold text-primary transition-colors"
			>
				View All
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4 transition-transform group-hover/link:translate-x-1"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</a>
		{/if}
	</div>

	<div class="group/carousel relative">
		{#if showLeftArrow}
			<button
				class="btn absolute top-1/2 left-0 z-20 btn-circle -translate-x-1/2 -translate-y-1/2 border-none bg-base-100/80 opacity-0 shadow-lg backdrop-blur-sm transition-all duration-300 btn-sm btn-neutral group-hover/carousel:opacity-100"
				onclick={() => scroll('left')}
				transition:fade
				aria-label="Scroll left"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15 19l-7-7 7-7"
					/>
				</svg>
			</button>
		{/if}

		<div
			bind:this={container}
			onscroll={handleScroll}
			class="custom-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-1 pb-4 sm:gap-4"
		>
			{#each displayedItems as item (item.id)}
				<div class={`flex-none snap-start ${resolvedItemClass}`}>
					{#if cardSnippet}
						{@render cardSnippet(item)}
					{:else}
						<!-- When no cardSnippet is provided, items are expected to be TmdbMediaItem -->
						<MediaCard
							item={item as unknown as TmdbMediaItem}
							onAddToLibrary={onAddToLibrary as ((item: TmdbMediaItem) => void) | undefined}
						/>
					{/if}
				</div>
			{/each}
			{#if loading}
				<div
					class="flex min-h-[200px] w-32 flex-none items-center justify-center sm:w-36 md:w-40 lg:w-44"
				>
					<span class="loading loading-md loading-spinner text-primary"></span>
				</div>
			{/if}
		</div>

		{#if showRightArrow}
			<button
				class="btn absolute top-1/2 right-0 z-20 btn-circle translate-x-1/2 -translate-y-1/2 border-none bg-base-100/80 opacity-0 shadow-lg backdrop-blur-sm transition-all duration-300 btn-sm btn-neutral group-hover/carousel:opacity-100"
				onclick={() => scroll('right')}
				transition:fade
				aria-label="Scroll right"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</button>
		{/if}
	</div>
</div>

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
