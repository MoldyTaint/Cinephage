import { tick } from 'svelte';

/**
 * Progressive rendering utility for large lists.
 *
 * Instead of rendering all items at once (which creates thousands of DOM nodes),
 * this renders an initial batch that fills the viewport + a buffer, then adds
 * more items as the user scrolls via IntersectionObserver.
 *
 * The full dataset stays in memory (needed for search/filters/bulk actions),
 * but only a growing slice is actually rendered.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   const renderer = createProgressiveRenderer(() => filteredMovies);
 * </script>
 *
 * {#each renderer.visible as item (item.id)}
 *   <Card {item} />
 * {/each}
 *
 * {#if renderer.hasMore}
 *   <div bind:this={renderer.sentinel}></div>
 * {/if}
 * ```
 */
export function createProgressiveRenderer<T>(
	/** Reactive getter for the full source array */
	source: () => T[],
	options?: {
		/** How many items to render initially and per batch. Default: 50 */
		batchSize?: number;
	}
) {
	const batchSize = options?.batchSize ?? 50;

	let visibleCount = $state(batchSize);
	let sentinel = $state<HTMLElement | undefined>(undefined);
	let isLoadingMore = $state(false);

	// Track the source array identity so we can reset on filter/sort changes.
	// Using $effect ensures state mutations happen outside of $derived.
	let trackedRef: T[] | null = null;
	$effect(() => {
		const current = source();
		if (current !== trackedRef) {
			trackedRef = current;
			visibleCount = batchSize;
		}
	});

	/** The visible slice of items to render */
	const visible = $derived(source().slice(0, visibleCount));

	/** Whether there are more items beyond what's currently visible */
	const hasMore = $derived(visibleCount < source().length);

	/** Load the next batch of items */
	async function loadMore(): Promise<void> {
		if (isLoadingMore || visibleCount >= source().length) return;
		isLoadingMore = true;

		visibleCount = Math.min(visibleCount + batchSize, source().length);
		await tick();

		isLoadingMore = false;
	}

	// Set up IntersectionObserver when sentinel element is bound
	$effect(() => {
		if (!sentinel) return;

		const observer = new IntersectionObserver(
			async (entries) => {
				if (entries[0].isIntersecting && !isLoadingMore) {
					await loadMore();

					// After loading, check if sentinel is still visible (fast scroll case)
					// and load more if needed, like the discover page pattern
					await tick();
					if (sentinel) {
						const rect = sentinel.getBoundingClientRect();
						if (rect.top < window.innerHeight + 400) {
							loadMore();
						}
					}
				}
			},
			{
				// Start loading before the sentinel is actually visible
				// 600px gives plenty of buffer for fast scrolling
				rootMargin: '600px'
			}
		);

		observer.observe(sentinel);

		return () => observer.disconnect();
	});

	return {
		/** Bind this to a div after your list: `<div bind:this={renderer.sentinel}></div>` */
		get sentinel(): HTMLElement | undefined {
			return sentinel;
		},
		set sentinel(el: HTMLElement | undefined) {
			sentinel = el;
		},

		/** The visible slice of items to render */
		get visible(): T[] {
			return visible;
		},

		/** Whether there are more items to render */
		get hasMore(): boolean {
			return hasMore;
		},

		/** Whether a batch is currently being added */
		get isLoadingMore(): boolean {
			return isLoadingMore;
		}
	};
}
