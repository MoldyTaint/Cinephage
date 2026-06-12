<script lang="ts">
	import type { TmdbMediaItem } from '$lib/types/tmdb';
	import {
		getMediaTitle,
		getMediaDate,
		getMediaPoster,
		getMediaLink,
		getMediaTypeLabel
	} from '$lib/types/tmdb-guards';
	import { resolvePath } from '$lib/utils/routing';
	import TmdbImage from './TmdbImage.svelte';
	import { Check, Clock, Plus } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { getSmartReleaseLine } from '$lib/utils/smartReleaseLine.js';

	// Extended type that includes library status (added by enrichWithLibraryStatus)
	type MediaItemWithLibraryStatus = TmdbMediaItem & {
		inLibrary?: boolean;
		hasFile?: boolean;
		libraryId?: string;
		releaseDate?: string | null;
		digitalReleaseDate?: string | null;
		physicalReleaseDate?: string | null;
	};

	interface Props {
		item: MediaItemWithLibraryStatus;
		onAddToLibrary?: (item: MediaItemWithLibraryStatus) => void;
	}

	let { item, onAddToLibrary }: Props = $props();

	function getBadgeClass(item: TmdbMediaItem): string {
		const label = getMediaTypeLabel(item);
		if (label === 'Movie') return 'bg-primary/80 text-primary-content';
		if (label === 'TV') return 'bg-secondary/80 text-secondary-content';
		return 'badge-neutral/80';
	}

	const ratingColor = (rating: number): string => {
		if (rating >= 7) return 'text-success';
		if (rating >= 5) return 'text-warning';
		return 'text-error';
	};

	// Derived values using type-safe helpers
	const title = $derived(getMediaTitle(item));
	const date = $derived(getMediaDate(item));
	const poster = $derived(getMediaPoster(item));
	const link = $derived(getMediaLink(item));
	const typeLabel = $derived(getMediaTypeLabel(item));
	const badgeClass = $derived(getBadgeClass(item));

	// Library status
	const inLibrary = $derived(item.inLibrary ?? false);
	const hasFile = $derived(item.hasFile ?? false);

	const releaseLine = $derived.by(() => {
		const enriched = item as MediaItemWithLibraryStatus;
		const rec = item as unknown as Record<string, unknown>;
		const rd = enriched.releaseDate ?? (rec.release_date as string | null) ?? null;
		if (!rd && !enriched.digitalReleaseDate && !enriched.physicalReleaseDate) return null;
		return getSmartReleaseLine({
			releaseDate: rd,
			digitalReleaseDate: enriched.digitalReleaseDate ?? null,
			physicalReleaseDate: enriched.physicalReleaseDate ?? null,
			status: rec.tmdbStatus as string | null | undefined
		});
	});
</script>

<a
	href={resolvePath(link)}
	class="group relative block aspect-2/3 w-full overflow-hidden rounded-lg bg-base-300 shadow-sm transition-all hover:shadow-md hover:ring-2 hover:ring-primary/50"
>
	<TmdbImage
		path={poster}
		size="w342"
		alt={title}
		class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
	/>

	<!-- Library Status Badge (top-left) -->
	{#if inLibrary}
		<div class="absolute top-2 left-2 z-10">
			{#if hasFile}
				<!-- Available: Green checkmark -->
				<div
					class="flex h-6 w-6 items-center justify-center rounded-full bg-success/90 text-success-content shadow-md backdrop-blur-sm"
					title={m.tmdb_availableInLibrary()}
				>
					<Check class="h-4 w-4" strokeWidth={3} />
				</div>
			{:else}
				<!-- Monitored but missing: Yellow clock -->
				<div
					class="flex h-6 w-6 items-center justify-center rounded-full bg-warning/90 text-warning-content shadow-md backdrop-blur-sm"
					title={m.tmdb_monitoredNotDownloaded()}
				>
					<Clock class="h-4 w-4" strokeWidth={2.5} />
				</div>
			{/if}
		</div>
	{/if}

	<!-- Media Type Badge (top-right) -->
	{#if typeLabel}
		<div class="absolute top-2 right-2 z-10">
			<span
				class="badge border-none badge-sm font-semibold shadow-sm backdrop-blur-sm {badgeClass}"
			>
				{typeLabel}
			</span>
		</div>
	{/if}

	<!-- Hover Overlay -->
	<div
		class="absolute inset-0 flex flex-col justify-end bg-linear-to-t from-black/90 via-black/20 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
	>
		<!-- Quick Add Button (top-right corner when not in library) -->
		{#if !inLibrary && onAddToLibrary}
			<button
				type="button"
				class="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-content shadow-lg transition-transform hover:scale-110 active:scale-95"
				title={m.tmdb_addToLibrary()}
				onclick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onAddToLibrary(item);
				}}
			>
				<Plus class="h-5 w-5" strokeWidth={2.5} />
			</button>
		{/if}

		<div
			class="translate-y-4 transform transition-transform duration-300 group-hover:translate-y-0"
		>
			<h3 class="line-clamp-2 text-sm leading-tight font-bold text-white">
				{title}
			</h3>
			<div class="mt-1 flex items-center justify-between">
				{#if date}
					<span class="text-xs text-white/70">{new Date(date).getFullYear()}</span>
				{/if}
				{#if 'vote_average' in item && item.vote_average}
					<div class="flex items-center gap-1 text-xs font-medium {ratingColor(item.vote_average)}">
						<span>★</span>
						<span>{item.vote_average.toFixed(1)}</span>
					</div>
				{/if}
			</div>
			{#if releaseLine}
				<div
					class="mt-0.5 text-xs font-medium {releaseLine.variant === 'released'
						? 'text-success'
						: releaseLine.variant === 'theaters'
							? 'text-info'
							: releaseLine.variant === 'upcoming'
								? 'text-primary'
								: 'text-white/50'}"
				>
					{releaseLine.text}
				</div>
			{/if}
		</div>
	</div>
</a>
