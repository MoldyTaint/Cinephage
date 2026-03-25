<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { Loader2, X, Plus, Sparkles } from 'lucide-svelte';
	import type { SmartListFilters } from '$lib/server/db/schema.js';

	import { createEventDispatcher } from 'svelte';

	interface Props {
		mediaType: 'movie' | 'tv';
		filters: SmartListFilters;
		forceCloseSignal?: number;
	}

	let { mediaType, filters = $bindable(), forceCloseSignal = 0 }: Props = $props();

	const dispatch = createEventDispatcher<{
		sortByChange: { sortBy: string };
		sectionOpen: { section: string };
	}>();

	// Section collapse state (single-open accordion, default basic)
	let openSection = $state<string | null>('basic');

	// Helper data
	let genres = $state<Array<{ id: number; name: string }>>([]);
	let loadingGenres = $state(false);
	let providers = $state<Array<{ provider_id: number; provider_name: string; logo_path: string }>>(
		[]
	);
	let loadingProviders = $state(false);
	let certifications = $state<Array<{ certification: string; meaning: string; order: number }>>([]);
	let loadingCertifications = $state(false);
	let languages = $state<Array<{ iso_639_1: string; english_name: string }>>([]);
	let loadingLanguages = $state(false);

	// People search
	let peopleQuery = $state('');
	let peopleResults = $state<Array<{ id: number; name: string; profile_path: string | null }>>([]);
	let searchingPeople = $state(false);
	let selectedPeople = $state<Array<{ id: number; name: string; type: 'cast' | 'crew' }>>([]);

	// Keywords search
	let keywordQuery = $state('');
	let keywordResults = $state<Array<{ id: number; name: string }>>([]);
	let searchingKeywords = $state(false);
	let selectedKeywords = $state<Array<{ id: number; name: string; exclude: boolean }>>([]);

	// Preset templates
	interface FilterPreset {
		id: string;
		name: string;
		description: string;
		filters: Partial<SmartListFilters>;
		sortBy: string;
		appliesTo: ('movie' | 'tv')[];
	}

	const filterPresets: FilterPreset[] = [
		{
			id: 'popular',
			name: m.smartlists_filter_popular(),
			description: m.smartlists_filter_popularDesc(),
			filters: {},
			sortBy: 'popularity.desc',
			appliesTo: ['movie', 'tv']
		},
		{
			id: 'top-rated',
			name: m.smartlists_filter_topRated(),
			description: m.smartlists_filter_topRatedDesc(),
			filters: { voteCountMin: 100 },
			sortBy: 'vote_average.desc',
			appliesTo: ['movie', 'tv']
		},
		{
			id: 'new-releases',
			name: m.smartlists_filter_newReleases(),
			description: m.smartlists_filter_newReleasesDesc(),
			filters: {},
			sortBy: 'primary_release_date.desc',
			appliesTo: ['movie']
		},
		{
			id: 'new-episodes',
			name: m.smartlists_filter_newEpisodes(),
			description: m.smartlists_filter_newEpisodesDesc(),
			filters: {},
			sortBy: 'first_air_date.desc',
			appliesTo: ['tv']
		}
	];

	let selectedPresetId = $state<string>('');

	function applyPreset(presetId: string) {
		const preset = filterPresets.find((p) => p.id === presetId);
		if (!preset) return;

		// Apply preset filters
		filters = { ...preset.filters };

		// Dispatch event to update sortBy in parent
		dispatch('sortByChange', { sortBy: preset.sortBy });
	}

	function toggleSection(section: string) {
		const willOpen = openSection !== section;
		openSection = willOpen ? section : null;
		if (willOpen) {
			dispatch('sectionOpen', { section });
		}
	}

	let lastForceCloseSignal = 0;
	$effect(() => {
		if (forceCloseSignal !== lastForceCloseSignal) {
			lastForceCloseSignal = forceCloseSignal;
			openSection = null;
		}
	});

	// Load genres when media type changes
	$effect(() => {
		loadGenres();
		loadProviders();
		loadCertifications();
	});

	// Load languages once
	$effect(() => {
		loadLanguages();
	});

	// Initialize selected people from filters
	$effect(() => {
		const castIds = filters.withCast ?? [];
		const crewIds = filters.withCrew ?? [];
		// We only have IDs, so we can't show names without fetching - this is a limitation
		// For now, just track the IDs
		selectedPeople = [
			...castIds.map((id) => ({ id, name: `Person ${id}`, type: 'cast' as const })),
			...crewIds.map((id) => ({ id, name: `Person ${id}`, type: 'crew' as const }))
		];
	});

	// Initialize selected keywords from filters
	$effect(() => {
		const withIds = filters.withKeywords ?? [];
		const withoutIds = filters.withoutKeywords ?? [];
		selectedKeywords = [
			...withIds.map((id) => ({ id, name: `Keyword ${id}`, exclude: false })),
			...withoutIds.map((id) => ({ id, name: `Keyword ${id}`, exclude: true }))
		];
	});

	async function loadGenres() {
		loadingGenres = true;
		try {
			const res = await fetch(`/api/smartlists/helpers?helper=genres&type=${mediaType}`);
			if (res.ok) {
				genres = await res.json();
			}
		} finally {
			loadingGenres = false;
		}
	}

	async function loadProviders() {
		loadingProviders = true;
		try {
			const res = await fetch(
				`/api/smartlists/helpers?helper=providers&type=${mediaType}&region=${filters.watchRegion ?? 'US'}`
			);
			if (res.ok) {
				providers = await res.json();
			}
		} finally {
			loadingProviders = false;
		}
	}

	async function loadCertifications() {
		loadingCertifications = true;
		try {
			const res = await fetch(`/api/smartlists/helpers?helper=certifications&type=${mediaType}`);
			if (res.ok) {
				certifications = await res.json();
				certifications.sort((a, b) => a.order - b.order);
			}
		} finally {
			loadingCertifications = false;
		}
	}

	async function loadLanguages() {
		if (languages.length > 0) return;
		loadingLanguages = true;
		try {
			const res = await fetch('/api/smartlists/helpers?helper=languages');
			if (res.ok) {
				languages = await res.json();
				languages.sort((a, b) => a.english_name.localeCompare(b.english_name));
			}
		} finally {
			loadingLanguages = false;
		}
	}

	async function searchPeople() {
		if (peopleQuery.length < 2) {
			peopleResults = [];
			return;
		}
		searchingPeople = true;
		try {
			const res = await fetch(
				`/api/smartlists/helpers?helper=people&q=${encodeURIComponent(peopleQuery)}`
			);
			if (res.ok) {
				peopleResults = await res.json();
			}
		} finally {
			searchingPeople = false;
		}
	}

	async function searchKeywords() {
		if (keywordQuery.length < 2) {
			keywordResults = [];
			return;
		}
		searchingKeywords = true;
		try {
			const res = await fetch(
				`/api/smartlists/helpers?helper=keywords&q=${encodeURIComponent(keywordQuery)}`
			);
			if (res.ok) {
				keywordResults = await res.json();
			}
		} finally {
			searchingKeywords = false;
		}
	}

	// Genre helpers
	function toggleGenre(genreId: number, include: boolean) {
		if (include) {
			const current = filters.withGenres ?? [];
			if (current.includes(genreId)) {
				filters.withGenres = current.filter((id) => id !== genreId);
			} else {
				filters.withGenres = [...current, genreId];
				// Remove from exclude if present
				if (filters.withoutGenres?.includes(genreId)) {
					filters.withoutGenres = filters.withoutGenres.filter((id) => id !== genreId);
				}
			}
		} else {
			const current = filters.withoutGenres ?? [];
			if (current.includes(genreId)) {
				filters.withoutGenres = current.filter((id) => id !== genreId);
			} else {
				filters.withoutGenres = [...current, genreId];
				// Remove from include if present
				if (filters.withGenres?.includes(genreId)) {
					filters.withGenres = filters.withGenres.filter((id) => id !== genreId);
				}
			}
		}
	}

	function isGenreIncluded(genreId: number): boolean {
		return (filters.withGenres ?? []).includes(genreId);
	}

	function isGenreExcluded(genreId: number): boolean {
		return (filters.withoutGenres ?? []).includes(genreId);
	}

	// Provider helpers
	function toggleProvider(providerId: number) {
		const current = filters.withWatchProviders ?? [];
		if (current.includes(providerId)) {
			filters.withWatchProviders = current.filter((id) => id !== providerId);
		} else {
			filters.withWatchProviders = [...current, providerId];
		}
	}

	function isProviderSelected(providerId: number): boolean {
		return (filters.withWatchProviders ?? []).includes(providerId);
	}

	// People helpers
	function addPerson(person: { id: number; name: string }, type: 'cast' | 'crew') {
		if (type === 'cast') {
			if (!filters.withCast?.includes(person.id)) {
				filters.withCast = [...(filters.withCast ?? []), person.id];
				selectedPeople = [...selectedPeople, { id: person.id, name: person.name, type: 'cast' }];
			}
		} else {
			if (!filters.withCrew?.includes(person.id)) {
				filters.withCrew = [...(filters.withCrew ?? []), person.id];
				selectedPeople = [...selectedPeople, { id: person.id, name: person.name, type: 'crew' }];
			}
		}
		peopleQuery = '';
		peopleResults = [];
	}

	function removePerson(personId: number, type: 'cast' | 'crew') {
		if (type === 'cast') {
			filters.withCast = (filters.withCast ?? []).filter((id) => id !== personId);
		} else {
			filters.withCrew = (filters.withCrew ?? []).filter((id) => id !== personId);
		}
		selectedPeople = selectedPeople.filter((p) => !(p.id === personId && p.type === type));
	}

	// Keyword helpers
	function addKeyword(keyword: { id: number; name: string }, exclude: boolean) {
		if (exclude) {
			if (!filters.withoutKeywords?.includes(keyword.id)) {
				filters.withoutKeywords = [...(filters.withoutKeywords ?? []), keyword.id];
				selectedKeywords = [
					...selectedKeywords,
					{ id: keyword.id, name: keyword.name, exclude: true }
				];
			}
		} else {
			if (!filters.withKeywords?.includes(keyword.id)) {
				filters.withKeywords = [...(filters.withKeywords ?? []), keyword.id];
				selectedKeywords = [
					...selectedKeywords,
					{ id: keyword.id, name: keyword.name, exclude: false }
				];
			}
		}
		keywordQuery = '';
		keywordResults = [];
	}

	function removeKeyword(keywordId: number, exclude: boolean) {
		if (exclude) {
			filters.withoutKeywords = (filters.withoutKeywords ?? []).filter((id) => id !== keywordId);
		} else {
			filters.withKeywords = (filters.withKeywords ?? []).filter((id) => id !== keywordId);
		}
		selectedKeywords = selectedKeywords.filter(
			(k) => !(k.id === keywordId && k.exclude === exclude)
		);
	}

	// Debounce search
	let peopleSearchTimer: ReturnType<typeof setTimeout>;
	let keywordSearchTimer: ReturnType<typeof setTimeout>;

	function handlePeopleInput() {
		clearTimeout(peopleSearchTimer);
		peopleSearchTimer = setTimeout(searchPeople, 300);
	}

	function handleKeywordInput() {
		clearTimeout(keywordSearchTimer);
		keywordSearchTimer = setTimeout(searchKeywords, 300);
	}
</script>

<div class="space-y-3">
	<!-- Quick Presets -->
	{#if filterPresets.some((p) => p.appliesTo.includes(mediaType))}
		<div class="rounded-lg border border-base-300 bg-base-100 p-4">
			<div class="mb-3 flex items-center gap-2">
				<Sparkles class="h-4 w-4 text-primary" />
				<span class="font-medium">{m.smartlists_filter_quickPresets()}</span>
			</div>
			<div class="flex flex-wrap gap-2">
				{#each filterPresets.filter((p) => p.appliesTo.includes(mediaType)) as preset (preset.id)}
					<button
						class="btn btn-sm {selectedPresetId === preset.id ? 'btn-primary' : 'btn-outline'}"
						onclick={() => {
							selectedPresetId = preset.id;
							applyPreset(preset.id);
						}}
						title={preset.description}
					>
						{preset.name}
					</button>
				{/each}
			</div>
			{#if selectedPresetId}
				<button
					class="btn mt-2 btn-ghost btn-xs"
					onclick={() => {
						selectedPresetId = '';
						filters = {};
					}}
				>
					{m.smartlists_filter_clearPreset()}
				</button>
			{/if}
		</div>
	{/if}

	<!-- Basic Filters -->
	<div class="collapse-arrow collapse rounded-lg border border-base-300 bg-base-100">
		<input
			type="checkbox"
			checked={openSection === 'basic'}
			onchange={() => toggleSection('basic')}
		/>
		<div class="collapse-title font-medium">{m.smartlists_filter_basicFilters()}</div>
		<div class="collapse-content">
			<div class="space-y-4 pt-2">
				<!-- Genres Include -->
				<div class="form-control">
					<div class="label py-1">
						<span
							class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
							>{m.smartlists_filter_includeGenres()}</span
						>
						{#if filters.withGenres?.length}
							<span class="badge badge-sm badge-primary">{filters.withGenres.length}</span>
						{/if}
					</div>
					{#if loadingGenres}
						<div class="flex items-center gap-2 py-2">
							<Loader2 class="h-4 w-4 animate-spin" />
							<span class="text-sm text-base-content/60">{m.smartlists_filter_loading()}</span>
						</div>
					{:else}
						<div class="flex flex-wrap gap-1.5">
							{#each genres as genre (genre.id)}
								<button
									type="button"
									class="badge cursor-pointer transition-all {isGenreIncluded(genre.id)
										? 'badge-primary'
										: 'hover:badge-primary/30 badge-ghost'}"
									onclick={() => toggleGenre(genre.id, true)}
								>
									{genre.name}
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Genres Exclude -->
				<div class="form-control">
					<div class="label py-1">
						<span
							class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
							>{m.smartlists_filter_excludeGenres()}</span
						>
						{#if filters.withoutGenres?.length}
							<span class="badge badge-sm badge-error">{filters.withoutGenres.length}</span>
						{/if}
					</div>
					<div class="flex flex-wrap gap-1.5">
						{#each genres as genre (genre.id)}
							<button
								type="button"
								class="badge cursor-pointer transition-all {isGenreExcluded(genre.id)
									? 'badge-error'
									: 'hover:badge-error/30 badge-ghost'}"
								onclick={() => toggleGenre(genre.id, false)}
							>
								{genre.name}
							</button>
						{/each}
					</div>
				</div>

				<!-- Genre Mode -->
				{#if filters.withGenres && filters.withGenres.length > 1}
					<div class="form-control">
						<div class="label py-1">
							<span
								class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
								>{m.smartlists_filter_genreMatchMode()}</span
							>
						</div>
						<div class="flex gap-4">
							<label class="label cursor-pointer gap-2">
								<input
									type="radio"
									name="genreMode"
									class="radio radio-sm"
									value="or"
									checked={filters.genreMode !== 'and'}
									onchange={() => (filters.genreMode = 'or')}
								/>
								<span class="text-sm">{m.smartlists_filter_matchAny()}</span>
							</label>
							<label class="label cursor-pointer gap-2">
								<input
									type="radio"
									name="genreMode"
									class="radio radio-sm"
									value="and"
									checked={filters.genreMode === 'and'}
									onchange={() => (filters.genreMode = 'and')}
								/>
								<span class="text-sm">{m.smartlists_filter_matchAll()}</span>
							</label>
						</div>
					</div>
				{/if}

				<!-- Year Range -->
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div class="form-control">
						<label class="label py-1" for="yearMin">
							<span
								class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
								>{m.smartlists_filter_yearFrom()}</span
							>
						</label>
						<input
							type="number"
							id="yearMin"
							bind:value={filters.yearMin}
							placeholder="1900"
							min="1900"
							max="2030"
							class="input-bordered input input-sm w-full"
						/>
					</div>
					<div class="form-control">
						<label class="label py-1" for="yearMax">
							<span
								class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
								>{m.smartlists_filter_yearTo()}</span
							>
						</label>
						<input
							type="number"
							id="yearMax"
							bind:value={filters.yearMax}
							placeholder="2025"
							min="1900"
							max="2030"
							class="input-bordered input input-sm w-full"
						/>
					</div>
				</div>

				<!-- Rating -->
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div class="form-control">
						<label class="label py-1" for="ratingMin">
							<span
								class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
								>{m.smartlists_filter_minRating()}</span
							>
						</label>
						<input
							type="number"
							id="ratingMin"
							bind:value={filters.voteAverageMin}
							placeholder="0"
							min="0"
							max="10"
							step="0.5"
							class="input-bordered input input-sm w-full"
						/>
					</div>
					<div class="form-control">
						<label class="label py-1" for="voteCount">
							<span
								class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
								>{m.smartlists_filter_minVotes()}</span
							>
						</label>
						<input
							type="number"
							id="voteCount"
							bind:value={filters.voteCountMin}
							placeholder="100"
							min="0"
							class="input-bordered input input-sm w-full"
						/>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Content Filters -->
	<div class="collapse-arrow collapse rounded-lg border border-base-300 bg-base-100">
		<input
			type="checkbox"
			checked={openSection === 'content'}
			onchange={() => toggleSection('content')}
		/>
		<div class="collapse-title font-medium">{m.smartlists_filter_content()}</div>
		<div class="collapse-content">
			<div class="space-y-4 pt-2">
				<!-- Keywords -->
				<div class="form-control">
					<div class="label py-1">
						<span
							class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
							>{m.smartlists_filter_keywords()}</span
						>
					</div>
					<div class="relative">
						<input
							type="text"
							bind:value={keywordQuery}
							oninput={handleKeywordInput}
							placeholder={m.smartlists_filter_keywordsPlaceholder()}
							class="input-bordered input input-sm w-full"
						/>
						{#if searchingKeywords}
							<Loader2 class="absolute top-2 right-3 h-4 w-4 animate-spin" />
						{/if}
					</div>
					{#if keywordResults.length > 0}
						<div
							class="mt-1 max-h-32 overflow-y-auto rounded-lg border border-base-300 bg-base-100"
						>
							{#each keywordResults as keyword (keyword.id)}
								<div
									class="flex items-center justify-between border-b border-base-200 p-2 last:border-0"
								>
									<span class="text-sm">{keyword.name}</span>
									<div class="flex gap-1">
										<button
											type="button"
											class="btn btn-xs btn-success"
											onclick={() => addKeyword(keyword, false)}
											title={m.smartlists_filter_include()}
										>
											<Plus class="h-3 w-3" />
										</button>
										<button
											type="button"
											class="btn btn-xs btn-error"
											onclick={() => addKeyword(keyword, true)}
											title={m.smartlists_filter_exclude()}
										>
											<X class="h-3 w-3" />
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
					<!-- Selected Keywords -->
					{#if selectedKeywords.length > 0}
						<div class="mt-2 flex flex-wrap gap-1">
							{#each selectedKeywords as kw (kw.id + (kw.exclude ? '-ex' : ''))}
								<span class="badge {kw.exclude ? 'badge-error' : 'badge-success'} gap-1">
									{kw.name}
									<button type="button" onclick={() => removeKeyword(kw.id, kw.exclude)}>
										<X class="h-3 w-3" />
									</button>
								</span>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Language -->
				<div class="form-control">
					<label class="label py-1" for="language">
						<span
							class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
							>{m.smartlists_filter_originalLanguage()}</span
						>
					</label>
					<select
						id="language"
						bind:value={filters.withOriginalLanguage}
						class="select-bordered select w-full select-sm"
					>
						<option value="">{m.smartlists_filter_anyLanguage()}</option>
						{#if loadingLanguages}
							<option disabled>{m.smartlists_filter_loading()}</option>
						{:else}
							{#each languages as lang (lang.iso_639_1)}
								<option value={lang.iso_639_1}>{lang.english_name}</option>
							{/each}
						{/if}
					</select>
				</div>

				<!-- Runtime -->
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div class="form-control">
						<label class="label py-1" for="runtimeMin">
							<span
								class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
								>{m.smartlists_filter_minRuntime()}</span
							>
						</label>
						<input
							type="number"
							id="runtimeMin"
							bind:value={filters.runtimeMin}
							placeholder="0"
							min="0"
							class="input-bordered input input-sm w-full"
						/>
					</div>
					<div class="form-control">
						<label class="label py-1" for="runtimeMax">
							<span
								class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
								>{m.smartlists_filter_maxRuntime()}</span
							>
						</label>
						<input
							type="number"
							id="runtimeMax"
							bind:value={filters.runtimeMax}
							placeholder="300"
							min="0"
							class="input-bordered input input-sm w-full"
						/>
					</div>
				</div>

				<!-- Certification -->
				<div class="form-control">
					<label class="label py-1" for="certification">
						<span
							class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
							>{m.smartlists_filter_ageRating()}</span
						>
					</label>
					<select
						id="certification"
						bind:value={filters.certification}
						class="select-bordered select w-full select-sm"
					>
						<option value="">{m.smartlists_filter_anyRating()}</option>
						{#if loadingCertifications}
							<option disabled>{m.smartlists_filter_loading()}</option>
						{:else}
							{#each certifications as cert (cert.certification)}
								<option value={cert.certification}>{cert.certification}</option>
							{/each}
						{/if}
					</select>
				</div>
			</div>
		</div>
	</div>

	<!-- People Filters -->
	<div class="collapse-arrow collapse rounded-lg border border-base-300 bg-base-100">
		<input
			type="checkbox"
			checked={openSection === 'people'}
			onchange={() => toggleSection('people')}
		/>
		<div class="collapse-title font-medium">{m.smartlists_filter_people()}</div>
		<div class="collapse-content">
			<div class="space-y-4 pt-2">
				<div class="form-control">
					<div class="label py-1">
						<span
							class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
							>{m.smartlists_filter_castCrew()}</span
						>
					</div>
					<div class="relative">
						<input
							type="text"
							bind:value={peopleQuery}
							oninput={handlePeopleInput}
							placeholder={m.smartlists_filter_castCrewPlaceholder()}
							class="input-bordered input input-sm w-full"
						/>
						{#if searchingPeople}
							<Loader2 class="absolute top-2 right-3 h-4 w-4 animate-spin" />
						{/if}
					</div>
					{#if peopleResults.length > 0}
						<div
							class="mt-1 max-h-40 overflow-y-auto rounded-lg border border-base-300 bg-base-100"
						>
							{#each peopleResults as person (person.id)}
								<div
									class="flex items-center justify-between border-b border-base-200 p-2 last:border-0"
								>
									<div class="flex items-center gap-2">
										{#if person.profile_path}
											<img
												src="https://image.tmdb.org/t/p/w45{person.profile_path}"
												alt={person.name}
												class="h-8 w-8 rounded-full object-cover"
											/>
										{:else}
											<div
												class="flex h-8 w-8 items-center justify-center rounded-full bg-base-300"
											>
												<span class="text-xs">{person.name.charAt(0)}</span>
											</div>
										{/if}
										<span class="text-sm">{person.name}</span>
									</div>
									<div class="flex gap-1">
										<button
											type="button"
											class="btn btn-xs btn-primary"
											onclick={() => addPerson(person, 'cast')}
										>
											{m.smartlists_filter_cast()}
										</button>
										<button
											type="button"
											class="btn btn-xs btn-secondary"
											onclick={() => addPerson(person, 'crew')}
										>
											{m.smartlists_filter_crew()}
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
					<!-- Selected People -->
					{#if selectedPeople.length > 0}
						<div class="mt-2 flex flex-wrap gap-1">
							{#each selectedPeople as person (person.id + '-' + person.type)}
								<span
									class="badge {person.type === 'cast' ? 'badge-primary' : 'badge-secondary'} gap-1"
								>
									{person.name}
									<button type="button" onclick={() => removePerson(person.id, person.type)}>
										<X class="h-3 w-3" />
									</button>
								</span>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Platform Filters -->
	<div class="collapse-arrow collapse rounded-lg border border-base-300 bg-base-100">
		<input
			type="checkbox"
			checked={openSection === 'platform'}
			onchange={() => toggleSection('platform')}
		/>
		<div class="collapse-title font-medium">{m.smartlists_filter_streamingPlatforms()}</div>
		<div class="collapse-content">
			<div class="space-y-4 pt-2">
				<!-- Watch Region -->
				<div class="form-control">
					<label class="label py-1" for="watchRegion">
						<span
							class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
							>{m.smartlists_filter_region()}</span
						>
					</label>
					<select
						id="watchRegion"
						bind:value={filters.watchRegion}
						class="select-bordered select w-full select-sm"
						onchange={() => loadProviders()}
					>
						<option value="US">United States</option>
						<option value="GB">United Kingdom</option>
						<option value="CA">Canada</option>
						<option value="AU">Australia</option>
						<option value="DE">Germany</option>
						<option value="FR">France</option>
						<option value="IT">Italy</option>
						<option value="ES">Spain</option>
						<option value="NL">Netherlands</option>
						<option value="JP">Japan</option>
					</select>
				</div>

				<!-- Providers Grid -->
				<div class="form-control">
					<div class="label py-1">
						<span
							class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
							>{m.smartlists_filter_availableOn()}</span
						>
						{#if filters.withWatchProviders?.length}
							<span class="badge badge-sm badge-primary">{filters.withWatchProviders.length}</span>
						{/if}
					</div>
					{#if loadingProviders}
						<div class="flex items-center gap-2 py-2">
							<Loader2 class="h-4 w-4 animate-spin" />
							<span class="text-sm text-base-content/60">{m.smartlists_filter_loading()}</span>
						</div>
					{:else}
						<div class="grid grid-cols-5 gap-2 sm:grid-cols-6">
							{#each providers.slice(0, 24) as provider (provider.provider_id)}
								<button
									type="button"
									class="relative aspect-square overflow-hidden rounded-lg border-2 transition-all {isProviderSelected(
										provider.provider_id
									)
										? 'border-primary ring-2 ring-primary/30'
										: 'border-base-300 opacity-60 hover:opacity-100'}"
									onclick={() => toggleProvider(provider.provider_id)}
									title={provider.provider_name}
								>
									<img
										src="https://image.tmdb.org/t/p/w92{provider.logo_path}"
										alt={provider.provider_name}
										class="h-full w-full object-cover"
									/>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Media Type Specific -->
	{#if mediaType === 'tv'}
		<div class="collapse-arrow collapse rounded-lg border border-base-300 bg-base-100">
			<input type="checkbox" checked={openSection === 'tv'} onchange={() => toggleSection('tv')} />
			<div class="collapse-title font-medium">{m.smartlists_filter_tvShowStatus()}</div>
			<div class="collapse-content">
				<div class="pt-2">
					<div class="form-control">
						<label class="label py-1" for="tvStatus">
							<span
								class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
								>{m.smartlists_filter_showStatus()}</span
							>
						</label>
						<select
							id="tvStatus"
							bind:value={filters.withStatus}
							class="select-bordered select w-full select-sm"
						>
							<option value="">{m.smartlists_filter_anyStatus()}</option>
							<option value="0">{m.smartlists_filter_returningSeries()}</option>
							<option value="1">{m.smartlists_filter_planned()}</option>
							<option value="2">{m.smartlists_filter_inProduction()}</option>
							<option value="3">{m.smartlists_filter_ended()}</option>
							<option value="4">{m.smartlists_filter_canceled()}</option>
							<option value="5">{m.smartlists_filter_pilot()}</option>
						</select>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
