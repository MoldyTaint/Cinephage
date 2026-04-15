<script lang="ts">
	import TmdbImage from '$lib/components/tmdb/TmdbImage.svelte';
	import type { WatchProvider } from '$lib/types/tmdb';
	import * as m from '$lib/paraglide/messages.js';

	let {
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
		onRatingChange
	} = $props<{
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
	}>();

	// Common languages for filtering
	const languages = [
		{ code: '', name: 'All Languages' },
		{ code: 'en', name: 'English' },
		{ code: 'es', name: 'Spanish' },
		{ code: 'fr', name: 'French' },
		{ code: 'de', name: 'German' },
		{ code: 'it', name: 'Italian' },
		{ code: 'ja', name: 'Japanese' },
		{ code: 'ko', name: 'Korean' },
		{ code: 'zh', name: 'Chinese' },
		{ code: 'hi', name: 'Hindi' },
		{ code: 'pt', name: 'Portuguese' },
		{ code: 'ru', name: 'Russian' },
		{ code: 'ar', name: 'Arabic' }
	];
</script>

<div class="space-y-8">
	<!-- Type -->
	<div class="form-control">
		<span class="label text-sm font-bold tracking-wide text-base-content/70 uppercase"
			>{m.discover_filter_mediaType()}</span
		>
		<div class="join w-full">
			<button
				class="btn join-item flex-1 {type === 'all'
					? 'btn-primary'
					: 'border-base-300 btn-outline'}"
				onclick={() => onTypeChange('all')}>{m.common_all()}</button
			>
			<button
				class="btn join-item flex-1 {type === 'movie'
					? 'btn-primary'
					: 'border-base-300 btn-outline'}"
				onclick={() => onTypeChange('movie')}>{m.common_movies()}</button
			>
			<button
				class="btn join-item flex-1 {type === 'tv' ? 'btn-primary' : 'border-base-300 btn-outline'}"
				onclick={() => onTypeChange('tv')}>{m.common_tvShows()}</button
			>
		</div>
	</div>

	<!-- Sort -->
	<div class="form-control">
		<label
			for="sort-by"
			class="label text-sm font-bold tracking-wide text-base-content/70 uppercase"
			>{m.discover_filter_sortBy()}</label
		>
		<select
			id="sort-by"
			class="select-bordered select w-full bg-base-200 transition-colors focus:bg-base-100"
			value={sortBy}
			onchange={(e) => onSortChange(e.currentTarget.value)}
		>
			<option value="popularity.desc">{m.discover_sort_mostPopular()}</option>
			<option value="vote_average.desc">{m.discover_sort_highestRated()}</option>
			<option value="primary_release_date.desc">{m.discover_sort_newestReleases()}</option>
			<option value="revenue.desc">{m.discover_sort_highestRevenue()}</option>
		</select>
	</div>

	<!-- Original Language -->
	<div class="form-control">
		<label
			for="original-language"
			class="label text-sm font-bold tracking-wide text-base-content/70 uppercase"
			>{m.discover_filter_originalLanguage()}</label
		>
		<select
			id="original-language"
			class="select-bordered select w-full bg-base-200 transition-colors focus:bg-base-100"
			value={selectedLanguage}
			onchange={(e) => onLanguageChange(e.currentTarget.value)}
		>
			{#each languages as language (language.code)}
				<option value={language.code}>{language.name}</option>
			{/each}
		</select>
	</div>

	<!-- Release Year -->
	<div class="form-control">
		<span class="label text-sm font-bold tracking-wide text-base-content/70 uppercase"
			>{m.discover_filter_releaseYear()}</span
		>
		<div class="flex items-center gap-2">
			<input
				type="number"
				placeholder="1900"
				class="input-bordered input w-full min-w-0 bg-base-200 transition-colors focus:bg-base-100"
				value={minYear}
				onchange={(e) => onYearChange(e.currentTarget.value, maxYear)}
			/>
			<span class="font-bold text-base-content/50">-</span>
			<input
				type="number"
				placeholder={new Date().getFullYear().toString()}
				class="input-bordered input w-full min-w-0 bg-base-200 transition-colors focus:bg-base-100"
				value={maxYear}
				onchange={(e) => onYearChange(minYear, e.currentTarget.value)}
			/>
		</div>
	</div>

	<!-- Minimum Rating -->
	<div class="form-control">
		<label
			for="min-rating"
			class="label text-sm font-bold tracking-wide text-base-content/70 uppercase"
		>
			<span>{m.discover_filter_minRating()}</span>
			<span class="badge font-bold badge-primary">{minRating}</span>
		</label>
		<input
			type="range"
			min="0"
			max="10"
			step="0.5"
			value={minRating}
			id="min-rating"
			class="range range-primary range-sm"
			onchange={(e) => onRatingChange(parseFloat(e.currentTarget.value))}
		/>
		<div class="mt-2 flex w-full justify-between px-1 text-xs font-medium text-base-content/50">
			<span>0</span>
			<span>5</span>
			<span>10</span>
		</div>
	</div>

	<!-- Genres -->
	<div class="form-control">
		<span class="label text-sm font-bold tracking-wide text-base-content/70 uppercase">
			<span>{m.common_genres()}</span>
			{#if selectedGenres.length > 0}
				<span class="badge badge-sm badge-primary">{selectedGenres.length}</span>
			{/if}
		</span>
		<div class="flex flex-wrap gap-2">
			{#each genres as genre (genre.id)}
				<button
					class="btn btn-sm {selectedGenres.includes(genre.id)
						? 'btn-primary'
						: 'border-base-300 btn-outline hover:btn-primary'}"
					onclick={() => onGenreToggle(genre.id)}
				>
					{genre.name}
				</button>
			{/each}
		</div>
	</div>

	<!-- Watch Providers -->
	<div class="form-control">
		<span class="label text-sm font-bold tracking-wide text-base-content/70 uppercase">
			<span>{m.discover_filter_watchProviders()}</span>
			{#if selectedProviders.length > 0}
				<span class="badge badge-sm badge-primary">{selectedProviders.length}</span>
			{/if}
		</span>
		<div class="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
			{#each providers as provider (provider.provider_id)}
				<button
					class="relative aspect-square overflow-hidden rounded-xl border-2 transition-all duration-200 {selectedProviders.includes(
						provider.provider_id
					)
						? 'scale-95 border-primary ring-2 ring-primary/30'
						: 'border-transparent bg-base-200 opacity-70 hover:scale-105 hover:opacity-100'}"
					onclick={() => onProviderToggle(provider.provider_id)}
					title={provider.provider_name}
				>
					<TmdbImage path={provider.logo_path} size="w92" alt={provider.provider_name} />
					{#if selectedProviders.includes(provider.provider_id)}
						<div
							class="absolute inset-0 flex items-center justify-center bg-primary/60 backdrop-blur-[1px]"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-8 w-8 text-white drop-shadow-md"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="3"
									d="M5 13l4 4L19 7"
								/>
							</svg>
						</div>
					{/if}
				</button>
			{/each}
		</div>
	</div>
</div>
