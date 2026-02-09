<script lang="ts">
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import { X, Search, Loader2, RefreshCw, Filter, Subtitles } from 'lucide-svelte';
	import SubtitleSearchResultRow from './SubtitleSearchResultRow.svelte';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';

	interface SubtitleResult {
		providerId: string;
		providerName: string;
		providerSubtitleId: string;
		language: string;
		title: string;
		isForced: boolean;
		isHearingImpaired: boolean;
		format: string;
		isHashMatch: boolean;
		matchScore: number;
		downloadCount?: number;
		uploadDate?: string;
	}

	interface SearchResponse {
		results: SubtitleResult[];
		totalResults: number;
		searchTimeMs: number;
		providers: Array<{
			providerId: string;
			providerName: string;
			resultsCount: number;
			error?: string;
		}>;
	}

	interface DownloadedSubtitle {
		id: string;
		language: string;
		isForced?: boolean;
		isHearingImpaired?: boolean;
		format?: string;
	}

	interface Props {
		open: boolean;
		title: string;
		movieId?: string;
		episodeId?: string;
		onClose: () => void;
		onDownloaded?: (subtitle: DownloadedSubtitle) => void;
	}

	let { open, title, movieId, episodeId, onClose, onDownloaded }: Props = $props();

	// State
	let results = $state<SubtitleResult[]>([]);
	let searching = $state(false);
	let searchError = $state<string | null>(null);
	let downloadingIds = new SvelteSet<string>();
	let downloadedIds = new SvelteSet<string>();
	let downloadErrors = new SvelteMap<string, string>();
	let searchTriggered = $state(false);
	let searchMeta = $state<{ totalResults: number; searchTimeMs: number } | null>(null);

	// Sorting & Filtering
	let sortBy = $state<'score' | 'language'>('score');
	let sortDir = $state<'asc' | 'desc'>('desc');
	let filterQuery = $state('');
	let showHashOnly = $state(false);

	// Derived filtered/sorted results
	const filteredResults = $derived.by(() => {
		let result = [...results];

		// Filter by hash match
		if (showHashOnly) {
			result = result.filter((r) => r.isHashMatch);
		}

		// Filter by query
		if (filterQuery) {
			const q = filterQuery.toLowerCase();
			result = result.filter(
				(r) =>
					r.title.toLowerCase().includes(q) ||
					r.language.toLowerCase().includes(q) ||
					r.providerName.toLowerCase().includes(q)
			);
		}

		// Sort
		result.sort((a, b) => {
			let comparison = 0;
			switch (sortBy) {
				case 'score':
					comparison = a.matchScore - b.matchScore;
					break;
				case 'language':
					comparison = a.language.localeCompare(b.language);
					break;
			}
			return sortDir === 'desc' ? -comparison : comparison;
		});

		return result;
	});

	// Auto-search when modal opens
	$effect(() => {
		if (open && results.length === 0 && !searching && !searchTriggered) {
			searchTriggered = true;
			performSearch();
		}
	});

	// Reset state when modal closes
	$effect(() => {
		if (!open) {
			results = [];
			searchError = null;
			downloadingIds.clear();
			downloadedIds.clear();
			downloadErrors.clear();
			filterQuery = '';
			searchTriggered = false;
			searchMeta = null;
		}
	});

	async function performSearch() {
		searching = true;
		searchError = null;

		try {
			const body: Record<string, unknown> = {};
			if (movieId) body.movieId = movieId;
			if (episodeId) body.episodeId = episodeId;

			const response = await fetch('/api/subtitles/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const data: SearchResponse = await response.json();

			if (!response.ok) {
				throw new Error((data as unknown as { error: string }).error || 'Search failed');
			}

			results = data.results || [];
			searchMeta = {
				totalResults: data.totalResults,
				searchTimeMs: data.searchTimeMs
			};
		} catch (err) {
			searchError = err instanceof Error ? err.message : 'Search failed';
			results = [];
		} finally {
			searching = false;
		}
	}

	async function handleDownload(result: SubtitleResult) {
		const key = `${result.providerId}-${result.providerSubtitleId}`;
		downloadingIds.add(key);
		downloadErrors.delete(key);

		try {
			const body: Record<string, unknown> = {
				providerId: result.providerId,
				providerSubtitleId: result.providerSubtitleId,
				language: result.language,
				isForced: result.isForced,
				isHearingImpaired: result.isHearingImpaired
			};

			if (movieId) body.movieId = movieId;
			if (episodeId) body.episodeId = episodeId;

			const response = await fetch('/api/subtitles/download', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Download failed');
			}

			downloadedIds.add(key);
			onDownloaded?.({
				id: data.subtitle?.subtitleId ?? key,
				language: data.subtitle?.language ?? result.language,
				isForced: result.isForced,
				isHearingImpaired: result.isHearingImpaired,
				format: data.subtitle?.format ?? result.format
			});
		} catch (err) {
			downloadErrors.set(key, err instanceof Error ? err.message : 'Download failed');
		} finally {
			downloadingIds.delete(key);
		}
	}

	function toggleSort(field: typeof sortBy) {
		if (sortBy === field) {
			sortDir = sortDir === 'desc' ? 'asc' : 'desc';
		} else {
			sortBy = field;
			sortDir = 'desc';
		}
	}

	function getResultKey(result: SubtitleResult): string {
		return `${result.providerId}-${result.providerSubtitleId}`;
	}
</script>

<ModalWrapper {open} {onClose} maxWidth="4xl" labelledBy="subtitle-search-modal-title">
	<!-- Header -->
	<div class="mb-4 flex items-center justify-between">
		<div>
			<h3 id="subtitle-search-modal-title" class="flex items-center gap-2 text-lg font-bold">
				<Subtitles size={20} class="text-primary" />
				Subtitle Search
			</h3>
			<p class="text-sm text-base-content/60">{title}</p>
		</div>
		<div class="flex items-center gap-2">
			<button class="btn btn-ghost btn-sm" onclick={performSearch} disabled={searching}>
				{#if searching}
					<Loader2 size={16} class="animate-spin" />
				{:else}
					<RefreshCw size={16} />
				{/if}
				Refresh
			</button>
			<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
				<X size={16} />
			</button>
		</div>
	</div>

	<!-- Search stats -->
	{#if searchMeta}
		<div class="mb-4 flex flex-wrap items-center gap-4 text-sm text-base-content/70">
			<span>{searchMeta.totalResults} results</span>
			<span>Search: {searchMeta.searchTimeMs}ms</span>
		</div>
	{/if}

	<!-- Filters -->
	<div class="mb-4 flex flex-wrap items-center gap-4">
		<div class="form-control">
			<div class="input-group input-group-sm">
				<span class="bg-base-200">
					<Filter size={14} />
				</span>
				<input
					type="text"
					placeholder="Filter results..."
					class="input-bordered input input-sm w-full sm:w-48"
					bind:value={filterQuery}
				/>
			</div>
		</div>

		<label class="label cursor-pointer gap-2">
			<input type="checkbox" class="checkbox checkbox-sm" bind:checked={showHashOnly} />
			<span class="label-text">Hash matches only</span>
		</label>
	</div>

	<!-- Results -->
	<div class="flex-1 overflow-auto">
		{#if searching}
			<div class="flex flex-col items-center justify-center py-12">
				<Loader2 size={32} class="animate-spin text-primary" />
				<p class="mt-4 text-base-content/60">Searching subtitle providers...</p>
			</div>
		{:else if searchError}
			<div class="alert alert-error">
				<span>{searchError}</span>
			</div>
		{:else if filteredResults.length === 0}
			<div class="flex flex-col items-center justify-center py-12">
				<Search size={48} class="text-base-content/30" />
				<p class="mt-4 text-base-content/60">No subtitles found</p>
				<p class="mt-2 text-sm text-base-content/40">
					Try adjusting your language profile or search filters
				</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="table table-sm">
					<thead class="sticky top-0 z-10 bg-base-100">
						<tr>
							<th>
								<button class="btn btn-ghost btn-xs" onclick={() => toggleSort('language')}>
									Language {sortBy === 'language' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
								</button>
							</th>
							<th>Release</th>
							<th>Provider</th>
							<th>
								<button class="btn btn-ghost btn-xs" onclick={() => toggleSort('score')}>
									Score {sortBy === 'score' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
								</button>
							</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredResults as result (getResultKey(result))}
							<SubtitleSearchResultRow
								{result}
								onDownload={handleDownload}
								downloading={downloadingIds.has(getResultKey(result))}
								downloaded={downloadedIds.has(getResultKey(result))}
								error={downloadErrors.get(getResultKey(result))}
							/>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<!-- Footer -->
	<div class="modal-action">
		<button class="btn" onclick={onClose}>Close</button>
	</div>
</ModalWrapper>
