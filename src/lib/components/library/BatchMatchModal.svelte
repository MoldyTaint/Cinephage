<script lang="ts">
	import { Search, X, Clapperboard, Tv, Check, Loader2, AlertCircle } from 'lucide-svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';
	import TmdbImage from '$lib/components/tmdb/TmdbImage.svelte';

	interface UnmatchedFile {
		id: string;
		path: string;
		mediaType: string;
		parsedSeason: number | null;
		parsedEpisode: number | null;
		size: number | null;
	}

	interface TmdbSearchResult {
		id: number;
		name?: string;
		title?: string;
		poster_path: string | null;
		first_air_date?: string;
		release_date?: string;
		overview?: string;
	}

	interface PreviewResult {
		fileId: string;
		filePath: string;
		filename: string;
		status: 'matched' | 'unmatched' | 'error';
		season?: number;
		episode?: number;
		reason?: string;
	}

	interface Props {
		open: boolean;
		selectedFileIds: string[];
		allFiles: UnmatchedFile[];
		onClose: () => void;
		onSuccess: (matchedIds: string[]) => void;
	}

	let { open, selectedFileIds, allFiles, onClose, onSuccess }: Props = $props();

	// Get selected files
	const selectedFiles = $derived(allFiles.filter((f) => selectedFileIds.includes(f.id)));

	// Form state
	let searchQuery = $state('');
	let searchType = $state<'movie' | 'tv'>('tv');
	let searchResults = $state<TmdbSearchResult[]>([]);
	let isSearching = $state(false);
	let isPreviewing = $state(false);
	let isMatching = $state(false);
	let selectedMedia = $state<TmdbSearchResult | null>(null);
	let previewResults = $state<PreviewResult[]>([]);
	let previewError = $state('');

	// Reset state when modal opens
	$effect(() => {
		if (open) {
			// Auto-detect type from selected files
			const hasTV = selectedFiles.some((f) => f.mediaType === 'tv');
			const hasMovie = selectedFiles.some((f) => f.mediaType === 'movie');
			if (hasTV && !hasMovie) {
				searchType = 'tv';
			} else if (hasMovie && !hasTV) {
				searchType = 'movie';
			}

			// Try to extract common title from filenames
			const commonTitle = extractCommonTitle(selectedFiles);
			if (commonTitle) {
				searchQuery = commonTitle;
			}

			// Reset other state
			searchResults = [];
			selectedMedia = null;
			previewResults = [];
			previewError = '';
		}
	});

	// Extract common title from file paths
	function extractCommonTitle(files: UnmatchedFile[]): string | null {
		if (files.length === 0) return null;

		// Get parent folder names
		const folderNames = files.map((f) => {
			const parts = f.path.split('/');
			return parts[parts.length - 2] || ''; // Parent folder name
		});

		// Find most common folder name
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const counts = new Map<string, number>();
		for (const name of folderNames) {
			const current = counts.get(name) ?? 0;
			counts.set(name, current + 1);
		}

		let mostCommon = '';
		let maxCount = 0;
		for (const [name, count] of counts) {
			if (count > maxCount && name.toLowerCase() !== 'season 1' && !name.match(/^season\s*\d+$/i)) {
				mostCommon = name;
				maxCount = count;
			}
		}

		// Clean up season folder names
		return mostCommon.replace(/^season\s*\d+$/i, '').trim() || null;
	}

	// Search TMDB
	async function search() {
		if (!searchQuery.trim()) return;

		isSearching = true;
		try {
			const response = await fetch(
				`/api/discover/search?query=${encodeURIComponent(searchQuery)}&type=${searchType}`
			);
			const data = await response.json();
			searchResults = data.results || [];
		} catch {
			toasts.error('Search failed');
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}

	// Handle search on enter
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			search();
		}
	}

	// Select media and generate preview
	async function selectMedia(media: TmdbSearchResult) {
		selectedMedia = media;
		await generatePreview();
	}

	// Generate preview of what will happen (client-side)
	async function generatePreview() {
		if (!selectedMedia) return;

		isPreviewing = true;
		previewError = '';

		try {
			// Generate preview client-side from file data
			previewResults = selectedFiles.map((file) => {
				const fileName = file.path.split('/').pop() || file.path;
				return {
					fileId: file.id,
					filePath: file.path,
					filename: fileName,
					status: 'matched' as const,
					season: file.parsedSeason ?? undefined,
					episode: file.parsedEpisode ?? undefined
				};
			});
		} catch {
			previewError = 'Failed to generate preview';
		} finally {
			isPreviewing = false;
		}
	}

	// Perform batch match
	async function performMatch() {
		if (!selectedMedia) return;

		isMatching = true;
		try {
			// Build episode mapping from preview results or use parsed values
			const episodeMapping: Record<string, { season: number; episode: number }> = {};

			if (searchType === 'tv') {
				for (const file of selectedFiles) {
					const season = file.parsedSeason ?? 1;
					const episode = file.parsedEpisode ?? 1;
					episodeMapping[file.id] = { season, episode };
				}
			}

			const response = await fetch('/api/library/unmatched/match', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					fileIds: selectedFileIds,
					tmdbId: selectedMedia.id,
					mediaType: searchType,
					...(searchType === 'tv' && Object.keys(episodeMapping).length > 0
						? { episodeMapping }
						: {})
				})
			});

			const result = await response.json();

			if (result.success) {
				const mediaTitle = selectedMedia.title || selectedMedia.name;
				toasts.success(
					`Matched ${result.data.matched} of ${selectedFileIds.length} files to ${mediaTitle}`,
					result.data.failed > 0 ? { description: `${result.data.failed} files failed` } : undefined
				);

				// Get successfully matched IDs (those not in errors)
				const errorIds = new Set(
					result.data.errors.map((e: string) => e.match(/file ([^\s:]+)/)?.[1])
				);
				const matchedIds = selectedFileIds.filter((id) => !errorIds.has(id));

				onSuccess(matchedIds);
			} else {
				toasts.error('Failed to match files', { description: result.error });
			}
		} catch {
			toasts.error('Error matching files');
		} finally {
			isMatching = false;
		}
	}

	// Close modal
	function close() {
		onClose();
		selectedMedia = null;
		previewResults = [];
	}

	// Go back to search
	function backToSearch() {
		selectedMedia = null;
		previewResults = [];
	}

	// Format file size
	function formatSize(bytes: number | null): string {
		if (!bytes) return 'Unknown';
		const gb = bytes / (1024 * 1024 * 1024);
		if (gb >= 1) return `${gb.toFixed(2)} GB`;
		const mb = bytes / (1024 * 1024);
		return `${mb.toFixed(1)} MB`;
	}
</script>

<ModalWrapper {open} onClose={close} maxWidth="3xl" labelledBy="batch-match-modal-title">
	<!-- Header -->
	<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex items-center gap-2">
			<Check class="h-5 w-5 text-primary" />
			<h3 id="batch-match-modal-title" class="text-lg font-bold">Batch Match Files</h3>
		</div>
		<button
			class="btn btn-circle self-end btn-ghost btn-sm sm:self-auto"
			onclick={close}
			aria-label="Close"
		>
			<X class="h-4 w-4" />
		</button>
	</div>

	<!-- Selected Files Summary -->
	<div class="mb-4 rounded-lg bg-base-200 p-3">
		<p class="text-sm text-base-content/70">
			Matching {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}:
		</p>
		<div class="mt-2 max-h-24 space-y-1 overflow-y-auto">
			{#each selectedFiles.slice(0, 5) as file (file.id)}
				<div class="flex items-center gap-2 text-xs">
					{#if file.mediaType === 'movie'}
						<Clapperboard class="h-3 w-3 text-primary" />
					{:else}
						<Tv class="h-3 w-3 text-secondary" />
					{/if}
					<span class="truncate">{file.path.split('/').pop()}</span>
					{#if file.parsedSeason !== null && file.parsedEpisode !== null}
						<span class="badge badge-xs badge-secondary">
							S{String(file.parsedSeason).padStart(2, '0')}E{String(file.parsedEpisode).padStart(
								2,
								'0'
							)}
						</span>
					{/if}
					<span class="text-base-content/50">{formatSize(file.size)}</span>
				</div>
			{/each}
			{#if selectedFiles.length > 5}
				<p class="text-xs text-base-content/50">... and {selectedFiles.length - 5} more</p>
			{/if}
		</div>
	</div>

	{#if selectedMedia}
		<!-- Preview Mode -->
		<div class="space-y-4">
			<div class="flex items-center gap-3 rounded-lg bg-base-200 p-3">
				{#if selectedMedia.poster_path}
					<TmdbImage
						path={selectedMedia.poster_path}
						size="w92"
						alt={selectedMedia.title || selectedMedia.name || 'Media poster'}
						class="h-16 w-12 rounded object-cover"
					/>
				{:else}
					<div class="flex h-16 w-12 items-center justify-center rounded bg-base-300">
						{#if searchType === 'movie'}
							<Clapperboard class="h-6 w-6 text-base-content/30" />
						{:else}
							<Tv class="h-6 w-6 text-base-content/30" />
						{/if}
					</div>
				{/if}
				<div class="flex-1">
					<p class="font-medium">{selectedMedia.title || selectedMedia.name}</p>
					{#if searchType === 'movie' && selectedMedia.release_date}
						<p class="text-sm text-base-content/70">{selectedMedia.release_date.substring(0, 4)}</p>
					{:else if searchType === 'tv' && selectedMedia.first_air_date}
						<p class="text-sm text-base-content/70">
							{selectedMedia.first_air_date.substring(0, 4)}
						</p>
					{/if}
				</div>
				<button class="btn btn-ghost btn-sm" onclick={backToSearch}> Change </button>
			</div>

			<!-- Preview Results -->
			<div>
				<p class="mb-2 text-sm font-medium">
					Match Preview {isPreviewing ? '(Loading...)' : ''}:
				</p>

				{#if previewError}
					<div class="alert-sm alert alert-warning">
						<AlertCircle class="h-4 w-4" />
						<span>{previewError}</span>
					</div>
				{/if}

				<div class="max-h-64 space-y-1 overflow-y-auto rounded-lg bg-base-200 p-2">
					{#if isPreviewing}
						<div class="flex items-center justify-center py-8">
							<Loader2 class="h-8 w-8 animate-spin text-primary" />
						</div>
					{:else if previewResults.length === 0}
						<p class="py-4 text-center text-base-content/50">Click Preview to see match results</p>
					{:else}
						{#each previewResults as result (result.fileId)}
							<div
								class="flex items-center justify-between rounded px-2 py-1.5 text-sm {result.status ===
								'matched'
									? 'bg-success/10'
									: result.status === 'error'
										? 'bg-error/10'
										: 'bg-warning/10'}"
							>
								<div class="flex min-w-0 flex-1 items-center gap-2">
									<span class="truncate">{result.filename}</span>
								</div>
								<div class="flex shrink-0 items-center gap-2">
									{#if result.season !== undefined && result.episode !== undefined}
										<span class="badge badge-sm badge-secondary">
											S{String(result.season).padStart(2, '0')}E{String(result.episode).padStart(
												2,
												'0'
											)}
										</span>
									{/if}
									<span
										class="badge badge-sm {result.status === 'matched'
											? 'badge-success'
											: result.status === 'error'
												? 'badge-error'
												: 'badge-warning'}"
									>
										{result.status}
									</span>
								</div>
							</div>
							{#if result.reason && result.status !== 'matched'}
								<p class="px-2 text-xs text-base-content/60">{result.reason}</p>
							{/if}
						{/each}
					{/if}
				</div>
			</div>

			<!-- Actions -->
			<div class="flex justify-end gap-2 pt-2">
				<button class="btn btn-ghost" onclick={backToSearch} disabled={isMatching}> Back </button>
				<button
					class="btn btn-primary"
					onclick={performMatch}
					disabled={isMatching || previewResults.length === 0}
				>
					{#if isMatching}
						<Loader2 class="h-4 w-4 animate-spin" />
					{:else}
						<Check class="h-4 w-4" />
					{/if}
					Match {selectedFiles.length} Files
				</button>
			</div>
		</div>
	{:else}
		<!-- Search Mode -->
		<!-- Search Type Toggle -->
		<div class="mb-4 flex gap-2">
			<button
				class="btn btn-sm {searchType === 'movie' ? 'btn-primary' : 'btn-ghost'}"
				onclick={() => (searchType = 'movie')}
			>
				<Clapperboard class="h-4 w-4" />
				Movie
			</button>
			<button
				class="btn btn-sm {searchType === 'tv' ? 'btn-primary' : 'btn-ghost'}"
				onclick={() => (searchType = 'tv')}
			>
				<Tv class="h-4 w-4" />
				TV Show
			</button>
		</div>

		<!-- Search Input -->
		<div class="mb-4 flex gap-2">
			<input
				type="text"
				class="input-bordered input flex-1"
				placeholder="Search TMDB..."
				bind:value={searchQuery}
				onkeydown={handleKeydown}
			/>
			<button
				class="btn btn-primary"
				onclick={search}
				disabled={isSearching || !searchQuery.trim()}
			>
				{#if isSearching}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<Search class="h-4 w-4" />
				{/if}
				Search
			</button>
		</div>

		<!-- Search Results -->
		<div class="max-h-96 space-y-2 overflow-y-auto">
			{#if searchResults.length > 0}
				<p class="mb-2 text-sm text-base-content/70">
					Click a result to select it and preview the match
				</p>
				{#each searchResults as result (result.id)}
					<button
						class="flex w-full items-center gap-3 rounded-lg bg-base-200 p-3 text-left transition-colors hover:bg-base-300"
						onclick={() => selectMedia(result)}
					>
						{#if result.poster_path}
							<TmdbImage
								path={result.poster_path}
								size="w92"
								alt={result.title || result.name || 'Media poster'}
								class="h-16 w-12 shrink-0 rounded object-cover"
							/>
						{:else}
							<div class="flex h-16 w-12 shrink-0 items-center justify-center rounded bg-base-300">
								{#if searchType === 'movie'}
									<Clapperboard class="h-6 w-6 text-base-content/30" />
								{:else}
									<Tv class="h-6 w-6 text-base-content/30" />
								{/if}
							</div>
						{/if}
						<div class="min-w-0 flex-1">
							<p class="truncate font-medium">{result.title || result.name}</p>
							{#if searchType === 'movie' && result.release_date}
								<p class="text-sm text-base-content/70">{result.release_date.substring(0, 4)}</p>
							{:else if searchType === 'tv' && result.first_air_date}
								<p class="text-sm text-base-content/70">
									{result.first_air_date.substring(0, 4)}
								</p>
							{/if}
							{#if result.overview}
								<p class="mt-1 line-clamp-2 text-xs text-base-content/50">{result.overview}</p>
							{/if}
						</div>
					</button>
				{/each}
			{:else if !isSearching && searchQuery}
				<p class="py-8 text-center text-base-content/50">No results found</p>
			{:else if !isSearching}
				<p class="py-8 text-center text-base-content/50">
					Search for a {searchType === 'movie' ? 'movie' : 'TV show'} to match
				</p>
			{/if}
		</div>
	{/if}
</ModalWrapper>
