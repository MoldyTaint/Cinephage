<script lang="ts">
	import { Search, X, Clapperboard, Tv, Check, Loader2, Folder } from 'lucide-svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';
	import TmdbImage from '$lib/components/tmdb/TmdbImage.svelte';

	interface UnmatchedFolder {
		folderPath: string;
		folderName: string;
		mediaType: string;
		fileCount: number;
		files: Array<
			{
				path: string;
				parsedTitle: string | null;
				parsedSeason: number | null;
				parsedEpisode: number | null;
			} & Record<string, unknown>
		>;
		commonParsedTitle: string | null;
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

	interface Props {
		open: boolean;
		folder: UnmatchedFolder;
		onClose: () => void;
		onSuccess: (folderPath: string) => void;
	}

	let { open, folder, onClose, onSuccess }: Props = $props();

	// Form state
	let searchQuery = $state('');
	let searchType = $state<'movie' | 'tv'>('movie');
	let searchResults = $state<TmdbSearchResult[]>([]);
	let isSearching = $state(false);
	let isMatching = $state(false);
	let selectedMedia = $state<TmdbSearchResult | null>(null);
	let matchPreview = $state<Array<{ file: string; season?: number; episode?: number }>>([]);

	// Reset state when folder changes
	$effect(() => {
		if (folder) {
			searchQuery = folder.commonParsedTitle || folder.folderName || '';
			searchType = folder.mediaType === 'tv' ? 'tv' : 'movie';
			selectedMedia = null;
			searchResults = [];
			matchPreview = [];
		}
	});

	// Generate match preview when media is selected
	$effect(() => {
		if (selectedMedia && folder) {
			matchPreview = folder.files.map((file) => {
				const fileName = file.path.split('/').pop() || file.path;
				return {
					file: fileName,
					season: file.parsedSeason ?? undefined,
					episode: file.parsedEpisode ?? undefined
				};
			});
		}
	});

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

	// Select media
	function selectMedia(media: TmdbSearchResult) {
		selectedMedia = media;
	}

	// Match folder
	async function matchFolder() {
		if (!selectedMedia) return;

		isMatching = true;
		try {
			const response = await fetch('/api/library/unmatched/folder-match', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					folderPath: folder.folderPath,
					tmdbId: selectedMedia.id,
					mediaType: searchType
				})
			});
			const result = await response.json();

			if (result.success) {
				const mediaTitle = selectedMedia.title || selectedMedia.name;
				toasts.success(
					`Matched ${result.matched} files to ${mediaTitle}`,
					result.failed > 0 ? { description: `${result.failed} files failed` } : undefined
				);
				onSuccess(folder.folderPath);
			} else {
				toasts.error('Failed to match folder', { description: result.error });
			}
		} catch {
			toasts.error('Error matching folder');
		} finally {
			isMatching = false;
		}
	}

	// Close modal
	function close() {
		onClose();
		selectedMedia = null;
	}

	// Go back to search
	function backToSearch() {
		selectedMedia = null;
	}
</script>

<ModalWrapper {open} onClose={close} maxWidth="2xl" labelledBy="match-folder-modal-title">
	<!-- Header -->
	<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex items-center gap-2">
			<Folder class="h-5 w-5 text-primary" />
			<h3 id="match-folder-modal-title" class="text-lg font-bold">Match Folder</h3>
		</div>
		<button
			class="btn btn-circle self-end btn-ghost btn-sm sm:self-auto"
			onclick={close}
			aria-label="Close"
		>
			<X class="h-4 w-4" />
		</button>
	</div>

	<!-- Folder Info -->
	<div class="mb-4 rounded-lg bg-base-200 p-3">
		<p class="truncate font-medium" title={folder.folderPath}>{folder.folderName}</p>
		<p class="text-sm text-base-content/70">
			{folder.fileCount} file{folder.fileCount !== 1 ? 's' : ''} • {folder.mediaType === 'movie'
				? 'Movie'
				: 'TV Show'}
		</p>
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

			<!-- Match Preview -->
			<div>
				<p class="mb-2 text-sm font-medium">Files will be matched:</p>
				<div class="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-base-200 p-2">
					{#each matchPreview.slice(0, 10) as item, index (`${item.file}-${index}`)}
						<div class="flex items-center justify-between rounded bg-base-300/50 px-2 py-1 text-sm">
							<span class="flex-1 truncate" title={item.file}>{item.file}</span>
							{#if item.season !== undefined && item.episode !== undefined}
								<span class="ml-2 badge shrink-0 badge-sm badge-secondary">
									S{String(item.season).padStart(2, '0')}E{String(item.episode).padStart(2, '0')}
								</span>
							{/if}
						</div>
					{/each}
					{#if matchPreview.length > 10}
						<p class="py-1 text-center text-xs text-base-content/50">
							... and {matchPreview.length - 10} more files
						</p>
					{/if}
				</div>
			</div>

			<!-- Actions -->
			<div class="flex justify-end gap-2 pt-2">
				<button class="btn btn-ghost" onclick={backToSearch} disabled={isMatching}> Back </button>
				<button class="btn btn-primary" onclick={matchFolder} disabled={isMatching}>
					{#if isMatching}
						<Loader2 class="h-4 w-4 animate-spin" />
					{:else}
						<Check class="h-4 w-4" />
					{/if}
					Match {folder.fileCount} Files
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
								<p class="text-sm text-base-content/70">{result.first_air_date.substring(0, 4)}</p>
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
