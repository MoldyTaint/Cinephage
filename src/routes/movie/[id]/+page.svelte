<script lang="ts">
	import type { PageData } from './$types';
	import MediaHero from '$lib/components/tmdb/MediaHero.svelte';
	import PersonCard from '$lib/components/tmdb/PersonCard.svelte';
	import SectionRow from '$lib/components/discover/SectionRow.svelte';

	let { data }: { data: PageData } = $props();

	// Prefetch stream when page loads (warms cache for faster playback)
	$effect(() => {
		if (data.movie?.id) {
			fetch(`/api/streaming/resolve/movie/${data.movie.id}`, {
				signal: AbortSignal.timeout(5000)
			}).catch(() => {});
		}
	});
</script>

<svelte:head>
	<title>{data.movie.title} - Cinephage</title>
</svelte:head>

<div class="flex w-full flex-col gap-12 px-4 pb-20 lg:px-8">
	<!-- Hero Section -->
	<MediaHero item={data.movie} />

	<!-- Cast Section -->
	{#if data.movie.credits.cast.length > 0}
		<SectionRow title="Top Cast" items={data.movie.credits.cast.slice(0, 15)}>
			{#snippet cardSnippet(person)}
				<PersonCard {person} />
			{/snippet}
		</SectionRow>
	{/if}

	<!-- Collection Section -->
	{#if data.collection && data.collection.parts}
		<SectionRow
			title={data.collection.name}
			items={data.collection.parts.sort(
				(a, b) => new Date(a.release_date).getTime() - new Date(b.release_date).getTime()
			)}
		/>
	{/if}

	<!-- Recommendations -->
	{#if data.movie.recommendations.results.length > 0}
		<SectionRow
			title="Recommendations"
			items={data.movie.recommendations.results}
			endpoint={`movie/${data.movie.id}/recommendations`}
		/>
	{/if}

	<!-- Similar -->
	{#if data.movie.similar.results.length > 0}
		<SectionRow
			title="Similar Titles"
			items={data.movie.similar.results}
			endpoint={`movie/${data.movie.id}/similar`}
		/>
	{/if}
</div>
