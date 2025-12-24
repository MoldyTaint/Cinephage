<script lang="ts">
	import type { PageData } from './$types';
	import {
		LibrarySeriesHeader,
		SeasonAccordion,
		SeriesEditModal,
		RenamePreviewModal
	} from '$lib/components/library';
	import { TVSeriesSidebar, BulkActionBar } from '$lib/components/library/tv';
	import { InteractiveSearchModal } from '$lib/components/search';
	import { SubtitleSearchModal } from '$lib/components/subtitles';
	import DeleteConfirmationModal from '$lib/components/ui/modal/DeleteConfirmationModal.svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import type { SeriesEditData } from '$lib/components/library/SeriesEditModal.svelte';
	import type { SearchMode } from '$lib/components/search/InteractiveSearchModal.svelte';
	import { CheckSquare, FileEdit } from 'lucide-svelte';
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';

	let { data }: { data: PageData } = $props();

	// State
	let isEditModalOpen = $state(false);
	let isSearchModalOpen = $state(false);
	let isRenameModalOpen = $state(false);
	let isDeleteModalOpen = $state(false);
	let isSaving = $state(false);
	let isRefreshing = $state(false);
	let refreshProgress = $state<{ current: number; total: number; message: string } | null>(null);
	let isDeleting = $state(false);

	// Selection state
	let selectedEpisodes = new SvelteSet<string>();
	let showCheckboxes = $state(false);

	// Auto-search state
	let autoSearchingEpisodes = new SvelteSet<string>();
	let autoSearchEpisodeResults = new SvelteMap<
		string,
		{ found: boolean; grabbed: boolean; releaseName?: string; error?: string }
	>();
	let autoSearchingSeasons = new SvelteSet<string>();
	let autoSearchSeasonResults = new SvelteMap<
		string,
		{ found: boolean; grabbed: boolean; releaseName?: string; error?: string }
	>();
	let searchingMissing = $state(false);
	let missingSearchProgress = $state<{ current: number; total: number } | null>(null);
	let missingSearchResult = $state<{ searched: number; found: number; grabbed: number } | null>(
		null
	);

	// Subtitle search state
	let isSubtitleSearchModalOpen = $state(false);
	let subtitleSearchContext = $state<{
		episodeId: string;
		title: string;
	} | null>(null);
	let subtitleAutoSearchingEpisodes = new SvelteSet<string>();

	// Search context
	let searchContext = $state<{
		title: string;
		season?: number;
		episode?: number;
		searchMode?: SearchMode;
	} | null>(null);

	// Season/Episode delete state
	let isSeasonDeleteModalOpen = $state(false);
	let isEpisodeDeleteModalOpen = $state(false);
	let deletingSeasonId = $state<string | null>(null);
	let deletingSeasonName = $state<string>('');
	let deletingEpisodeId = $state<string | null>(null);
	let deletingEpisodeName = $state<string>('');
	let isDeletingSeason = $state(false);
	let isDeletingEpisode = $state(false);

	// Find quality profile name (use default if none set)
	const qualityProfileName = $derived.by(() => {
		if (data.series.scoringProfileId) {
			return data.qualityProfiles.find((p) => p.id === data.series.scoringProfileId)?.name ?? null;
		}
		// No profile set - show the default
		const defaultProfile = data.qualityProfiles.find((p) => p.isDefault);
		return defaultProfile ? `${defaultProfile.name} (Default)` : null;
	});

	// Build a set of episode IDs that are currently downloading
	const downloadingEpisodeIds = $derived.by(() => {
		const ids = new SvelteSet<string>();
		for (const item of data.queueItems) {
			if (item.episodeIds) {
				for (const epId of item.episodeIds) {
					ids.add(epId);
				}
			}
		}
		return ids;
	});

	// Build a set of season numbers that have a season pack downloading
	const downloadingSeasons = $derived.by(() => {
		const seasons = new SvelteSet<number>();
		for (const item of data.queueItems) {
			// Season pack: has seasonNumber but no specific episodeIds
			if (item.seasonNumber !== null && (!item.episodeIds || item.episodeIds.length === 0)) {
				seasons.add(item.seasonNumber);
			}
		}
		return seasons;
	});

	// Calculate missing episode count (monitored, aired, no file, not downloading)
	const missingEpisodeCount = $derived.by(() => {
		const now = new Date().toISOString().split('T')[0];
		let count = 0;
		for (const season of data.seasons) {
			for (const episode of season.episodes) {
				if (episode.monitored && !episode.hasFile && episode.airDate && episode.airDate <= now) {
					// Don't count as missing if it's downloading
					if (
						!downloadingEpisodeIds.has(episode.id) &&
						!downloadingSeasons.has(episode.seasonNumber)
					) {
						count++;
					}
				}
			}
		}
		return count;
	});

	// Calculate downloading count
	const downloadingCount = $derived(data.queueItems.length);

	// Derive selection count
	const selectedCount = $derived(selectedEpisodes.size);

	// Handlers
	async function handleMonitorToggle(newValue: boolean) {
		isSaving = true;
		try {
			const response = await fetch(`/api/library/series/${data.series.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ monitored: newValue })
			});

			if (response.ok) {
				data.series.monitored = newValue;
			}
		} catch (error) {
			console.error('Failed to update monitored status:', error);
		} finally {
			isSaving = false;
		}
	}

	function handleSearch() {
		// Top-level search is for multi-season packs / complete series only
		searchContext = {
			title: data.series.title,
			searchMode: 'multiSeasonPack'
		};
		isSearchModalOpen = true;
	}

	function handleEdit() {
		isEditModalOpen = true;
	}

	async function handleRefresh() {
		isRefreshing = true;
		refreshProgress = null;

		try {
			const response = await fetch(`/api/library/series/${data.series.id}/refresh`, {
				method: 'POST'
			});

			if (!response.ok) {
				console.error('Failed to refresh series');
				return;
			}

			// Read the streaming response
			const reader = response.body?.getReader();
			if (!reader) {
				console.error('No response body');
				return;
			}

			const decoder = new TextDecoder();
			let buffer = '';
			let completed = false;

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				// Parse SSE events from buffer
				const lines = buffer.split('\n');
				buffer = lines.pop() || ''; // Keep incomplete line in buffer

				let eventType = '';
				for (const line of lines) {
					if (line.startsWith('event: ')) {
						eventType = line.slice(7).trim();
					} else if (line.startsWith('data: ')) {
						const jsonStr = line.slice(6);
						try {
							const eventData = JSON.parse(jsonStr);

							if (eventType === 'progress' || eventData.type === 'progress') {
								refreshProgress = {
									current: eventData.seasonNumber,
									total: eventData.totalSeasons,
									message: eventData.message
								};
							} else if (eventType === 'complete' || eventData.type === 'complete') {
								completed = true;
							} else if (eventType === 'error' || eventData.type === 'error') {
								console.error('Refresh error:', eventData.message);
							}
						} catch {
							// Ignore parse errors (e.g., heartbeat comments)
						}
					}
				}
			}

			if (completed) {
				// Reload the page to get updated data
				window.location.reload();
			}
		} catch (error) {
			console.error('Failed to refresh series:', error);
		} finally {
			isRefreshing = false;
			refreshProgress = null;
		}
	}

	async function handleEditSave(editData: SeriesEditData) {
		isSaving = true;
		try {
			const response = await fetch(`/api/library/series/${data.series.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(editData)
			});

			if (response.ok) {
				data.series.monitored = editData.monitored;
				data.series.scoringProfileId = editData.scoringProfileId;
				data.series.rootFolderId = editData.rootFolderId;
				data.series.seasonFolder = editData.seasonFolder;
				data.series.wantsSubtitles = editData.wantsSubtitles;

				const newFolder = data.rootFolders.find((f) => f.id === editData.rootFolderId);
				data.series.rootFolderPath = newFolder?.path ?? null;

				isEditModalOpen = false;
			}
		} catch (error) {
			console.error('Failed to update series:', error);
		} finally {
			isSaving = false;
		}
	}

	function handleDelete() {
		isDeleteModalOpen = true;
	}

	async function performDelete(deleteFiles: boolean) {
		isDeleting = true;
		try {
			const response = await fetch(
				`/api/library/series/${data.series.id}?deleteFiles=${deleteFiles}`,
				{ method: 'DELETE' }
			);
			const result = await response.json();

			if (result.success) {
				toasts.success('Series files deleted');
				// Reload to show updated state (all episodes now missing)
				window.location.reload();
			} else {
				toasts.error('Failed to delete series files', { description: result.error });
			}
		} catch (error) {
			console.error('Failed to delete series:', error);
			toasts.error('Failed to delete series');
		} finally {
			isDeleting = false;
			isDeleteModalOpen = false;
		}
	}

	// Season deletion handlers
	interface Season {
		id: string;
		seasonNumber: number;
		name: string | null;
	}

	function handleSeasonDelete(season: Season) {
		deletingSeasonId = season.id;
		deletingSeasonName = season.name || `Season ${season.seasonNumber}`;
		isSeasonDeleteModalOpen = true;
	}

	async function performSeasonDelete(deleteFiles: boolean) {
		if (!deletingSeasonId) return;

		isDeletingSeason = true;
		try {
			const response = await fetch(
				`/api/library/seasons/${deletingSeasonId}?deleteFiles=${deleteFiles}`,
				{ method: 'DELETE' }
			);
			const result = await response.json();

			if (result.success) {
				toasts.success('Season files deleted');
				// Mark all episodes in this season as missing
				data.seasons = data.seasons.map((s) =>
					s.id === deletingSeasonId
						? {
								...s,
								episodes: s.episodes.map((e) => ({ ...e, hasFile: false, file: undefined }))
							}
						: s
				);
			} else {
				toasts.error('Failed to delete season files', { description: result.error });
			}
		} catch (error) {
			console.error('Failed to delete season:', error);
			toasts.error('Failed to delete season');
		} finally {
			isDeletingSeason = false;
			isSeasonDeleteModalOpen = false;
			deletingSeasonId = null;
		}
	}

	// Episode deletion handlers
	interface Episode {
		id: string;
		seasonNumber: number;
		episodeNumber: number;
		title: string | null;
	}

	function handleEpisodeDelete(episode: Episode) {
		deletingEpisodeId = episode.id;
		const epTitle = episode.title || `Episode ${episode.episodeNumber}`;
		deletingEpisodeName = `S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')} - ${epTitle}`;
		isEpisodeDeleteModalOpen = true;
	}

	async function performEpisodeDelete(deleteFiles: boolean) {
		if (!deletingEpisodeId) return;

		isDeletingEpisode = true;
		try {
			const response = await fetch(
				`/api/library/episodes/${deletingEpisodeId}?deleteFiles=${deleteFiles}`,
				{ method: 'DELETE' }
			);
			const result = await response.json();

			if (result.success) {
				toasts.success('Episode files deleted');
				// Mark episode as missing (hasFile: false) instead of removing it
				data.seasons = data.seasons.map((season) => ({
					...season,
					episodes: season.episodes.map((e) =>
						e.id === deletingEpisodeId ? { ...e, hasFile: false, file: undefined } : e
					)
				}));
			} else {
				toasts.error('Failed to delete episode files', { description: result.error });
			}
		} catch (error) {
			console.error('Failed to delete episode:', error);
			toasts.error('Failed to delete episode');
		} finally {
			isDeletingEpisode = false;
			isEpisodeDeleteModalOpen = false;
			deletingEpisodeId = null;
		}
	}

	async function handleSeasonMonitorToggle(seasonId: string, newValue: boolean) {
		try {
			const response = await fetch(`/api/library/seasons/${seasonId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ monitored: newValue })
			});

			if (response.ok) {
				const season = data.seasons.find((s) => s.id === seasonId);
				if (season) {
					season.monitored = newValue;
					// Also update all episodes in the season
					for (const ep of season.episodes) {
						ep.monitored = newValue;
					}
				}
			}
		} catch (error) {
			console.error('Failed to update season monitored status:', error);
		}
	}

	async function handleEpisodeMonitorToggle(episodeId: string, newValue: boolean) {
		try {
			const response = await fetch(`/api/library/episodes/${episodeId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ monitored: newValue })
			});

			if (response.ok) {
				for (const season of data.seasons) {
					const episode = season.episodes.find((e) => e.id === episodeId);
					if (episode) {
						episode.monitored = newValue;
						break;
					}
				}
			}
		} catch (error) {
			console.error('Failed to update episode monitored status:', error);
		}
	}

	interface Season {
		id: string;
		seasonNumber: number;
	}

	interface Episode {
		seasonNumber: number;
		episodeNumber: number;
	}

	function handleSeasonSearch(season: Season) {
		searchContext = {
			title: data.series.title,
			season: season.seasonNumber
		};
		isSearchModalOpen = true;
	}

	function handleEpisodeSearch(episode: Episode) {
		searchContext = {
			title: data.series.title,
			season: episode.seasonNumber,
			episode: episode.episodeNumber
		};
		isSearchModalOpen = true;
	}

	// Auto-search handlers
	async function handleAutoSearchEpisode(episode: Episode & { id: string }) {
		autoSearchingEpisodes = new SvelteSet([...autoSearchingEpisodes, episode.id]);

		try {
			const response = await fetch(`/api/library/series/${data.series.id}/auto-search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: 'episode',
					episodeId: episode.id
				})
			});

			const result = await response.json();
			const itemResult = result.results?.[0];

			autoSearchEpisodeResults = new SvelteMap([
				...autoSearchEpisodeResults,
				[
					episode.id,
					{
						found: itemResult?.found ?? false,
						grabbed: itemResult?.grabbed ?? false,
						releaseName: itemResult?.releaseName,
						error: itemResult?.error
					}
				]
			]);

			// Clear result after 5 seconds
			setTimeout(() => {
				autoSearchEpisodeResults = new SvelteMap(
					[...autoSearchEpisodeResults].filter(([id]) => id !== episode.id)
				);
			}, 5000);
		} catch (error) {
			autoSearchEpisodeResults = new SvelteMap([
				...autoSearchEpisodeResults,
				[
					episode.id,
					{
						found: false,
						grabbed: false,
						error: error instanceof Error ? error.message : 'Search failed'
					}
				]
			]);
		} finally {
			autoSearchingEpisodes = new SvelteSet(
				[...autoSearchingEpisodes].filter((id) => id !== episode.id)
			);
		}
	}

	async function handleAutoSearchSeason(season: Season) {
		autoSearchingSeasons = new SvelteSet([...autoSearchingSeasons, season.id]);

		try {
			const response = await fetch(`/api/library/series/${data.series.id}/auto-search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: 'season',
					seasonNumber: season.seasonNumber
				})
			});

			const result = await response.json();
			const itemResult = result.results?.[0];

			autoSearchSeasonResults = new SvelteMap([
				...autoSearchSeasonResults,
				[
					season.id,
					{
						found: itemResult?.found ?? false,
						grabbed: itemResult?.grabbed ?? false,
						releaseName: itemResult?.releaseName,
						error: itemResult?.error
					}
				]
			]);

			// Clear result after 5 seconds
			setTimeout(() => {
				autoSearchSeasonResults = new SvelteMap(
					[...autoSearchSeasonResults].filter(([id]) => id !== season.id)
				);
			}, 5000);
		} catch (error) {
			autoSearchSeasonResults = new SvelteMap([
				...autoSearchSeasonResults,
				[
					season.id,
					{
						found: false,
						grabbed: false,
						error: error instanceof Error ? error.message : 'Search failed'
					}
				]
			]);
		} finally {
			autoSearchingSeasons = new SvelteSet(
				[...autoSearchingSeasons].filter((id) => id !== season.id)
			);
		}
	}

	async function handleSearchMissing() {
		searchingMissing = true;
		missingSearchProgress = null;
		missingSearchResult = null;

		try {
			const response = await fetch(`/api/library/series/${data.series.id}/auto-search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: 'missing' })
			});

			const result = await response.json();

			missingSearchResult = result.summary ?? {
				searched: result.results?.length ?? 0,
				found: result.results?.filter((r: { found: boolean }) => r.found).length ?? 0,
				grabbed: result.results?.filter((r: { grabbed: boolean }) => r.grabbed).length ?? 0
			};

			// Clear result after 10 seconds
			setTimeout(() => {
				missingSearchResult = null;
			}, 10000);
		} catch (error) {
			console.error('Failed to search missing episodes:', error);
		} finally {
			searchingMissing = false;
			missingSearchProgress = null;
		}
	}

	async function handleBulkAutoSearch() {
		const episodeIds = [...selectedEpisodes];
		if (episodeIds.length === 0) return;

		// Mark all selected as searching
		autoSearchingEpisodes = new SvelteSet([...autoSearchingEpisodes, ...episodeIds]);

		try {
			const response = await fetch(`/api/library/series/${data.series.id}/auto-search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: 'bulk',
					episodeIds
				})
			});

			const result = await response.json();

			// Update results for each episode
			const newResults = new SvelteMap(autoSearchEpisodeResults);
			for (const itemResult of result.results ?? []) {
				newResults.set(itemResult.itemId, {
					found: itemResult.found,
					grabbed: itemResult.grabbed,
					releaseName: itemResult.releaseName,
					error: itemResult.error
				});
			}
			autoSearchEpisodeResults = newResults;

			// Clear selection after search
			selectedEpisodes = new SvelteSet();
			showCheckboxes = false;

			// Clear results after 5 seconds
			setTimeout(() => {
				autoSearchEpisodeResults = new SvelteMap(
					[...autoSearchEpisodeResults].filter(([id]) => !episodeIds.includes(id))
				);
			}, 5000);
		} catch (error) {
			console.error('Bulk search failed:', error);
		} finally {
			autoSearchingEpisodes = new SvelteSet(
				[...autoSearchingEpisodes].filter((id) => !episodeIds.includes(id))
			);
		}
	}

	// Subtitle search handlers
	interface EpisodeForSubtitle {
		id: string;
		title: string | null;
		seasonNumber: number;
		episodeNumber: number;
	}

	function handleSubtitleSearch(episode: EpisodeForSubtitle) {
		const episodeTitle = episode.title || `Episode ${episode.episodeNumber}`;
		subtitleSearchContext = {
			episodeId: episode.id,
			title: `${data.series.title} S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')} - ${episodeTitle}`
		};
		isSubtitleSearchModalOpen = true;
	}

	async function handleSubtitleAutoSearch(episode: EpisodeForSubtitle) {
		subtitleAutoSearchingEpisodes = new SvelteSet([...subtitleAutoSearchingEpisodes, episode.id]);

		try {
			const response = await fetch('/api/subtitles/auto-search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ episodeId: episode.id })
			});

			const result = await response.json();

			if (result.success && result.subtitle) {
				// Find and update the episode's subtitles in local state
				for (const season of data.seasons) {
					const ep = season.episodes.find((e) => e.id === episode.id);
					if (ep) {
						ep.subtitles = [...(ep.subtitles || []), result.subtitle];
						break;
					}
				}
			}
		} catch (error) {
			console.error('Failed to auto-search subtitles:', error);
		} finally {
			subtitleAutoSearchingEpisodes = new SvelteSet(
				[...subtitleAutoSearchingEpisodes].filter((id) => id !== episode.id)
			);
		}
	}

	function handleSubtitleDownloaded() {
		// Refresh the page data to get updated subtitles
		window.location.reload();
	}

	// Selection handlers
	function handleEpisodeSelectChange(episodeId: string, selected: boolean) {
		if (selected) {
			selectedEpisodes = new SvelteSet([...selectedEpisodes, episodeId]);
		} else {
			selectedEpisodes = new SvelteSet([...selectedEpisodes].filter((id) => id !== episodeId));
		}
	}

	function handleSelectAllInSeason(seasonId: string, selectAll: boolean) {
		const season = data.seasons.find((s) => s.id === seasonId);
		if (!season) return;

		const episodeIds = season.episodes.map((e) => e.id);

		if (selectAll) {
			selectedEpisodes = new SvelteSet([...selectedEpisodes, ...episodeIds]);
		} else {
			selectedEpisodes = new SvelteSet(
				[...selectedEpisodes].filter((id) => !episodeIds.includes(id))
			);
		}
	}

	function toggleSelectionMode() {
		showCheckboxes = !showCheckboxes;
		if (!showCheckboxes) {
			selectedEpisodes = new SvelteSet();
		}
	}

	function clearSelection() {
		selectedEpisodes = new SvelteSet();
	}

	interface Release {
		guid: string;
		title: string;
		downloadUrl: string;
		magnetUrl?: string;
		infoHash?: string;
		indexerId: string;
		indexerName: string;
		protocol: string;
		episodeMatch?: {
			season?: number;
			seasons?: number[];
			episodes?: number[];
			isSeasonPack?: boolean;
			isCompleteSeries?: boolean;
		};
		parsed?: {
			episode?: {
				season?: number;
				seasons?: number[];
				episodes?: number[];
				isSeasonPack?: boolean;
				isCompleteSeries?: boolean;
			};
		};
	}

	// Helper function to look up episode IDs from local data
	function lookupEpisodeIds(season: number, episodes: number[]): string[] {
		const ids: string[] = [];
		for (const seasonData of data.seasons) {
			if (seasonData.seasonNumber === season) {
				for (const ep of seasonData.episodes) {
					if (episodes.includes(ep.episodeNumber)) {
						ids.push(ep.id);
					}
				}
				break;
			}
		}
		return ids;
	}

	async function handleGrab(release: Release): Promise<{ success: boolean; error?: string }> {
		try {
			// Determine season/episode info from release metadata
			const episodeMatch = release.episodeMatch || release.parsed?.episode;

			let seasonNumber: number | undefined;
			let episodeIds: string[] | undefined;

			if (episodeMatch) {
				if (episodeMatch.isSeasonPack && episodeMatch.season !== undefined) {
					// Season pack - just need seasonNumber
					seasonNumber = episodeMatch.season;
				} else if (episodeMatch.seasons && episodeMatch.seasons.length === 1) {
					// Single season from seasons array (also a season pack)
					seasonNumber = episodeMatch.seasons[0];
				} else if (episodeMatch.season !== undefined && episodeMatch.episodes?.length) {
					// Specific episode(s) - need to look up episode IDs
					seasonNumber = episodeMatch.season;
					episodeIds = lookupEpisodeIds(episodeMatch.season, episodeMatch.episodes);
				}
			}

			// Fallback to search context if no episodeMatch data
			if (seasonNumber === undefined && searchContext?.season !== undefined) {
				seasonNumber = searchContext.season;
				if (searchContext.episode !== undefined) {
					episodeIds = lookupEpisodeIds(searchContext.season, [searchContext.episode]);
				}
			}

			const response = await fetch('/api/download/grab', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					downloadUrl: release.downloadUrl,
					magnetUrl: release.magnetUrl,
					infoHash: release.infoHash,
					title: release.title,
					indexerId: release.indexerId,
					indexerName: release.indexerName,
					protocol: release.protocol,
					seriesId: data.series.id,
					mediaType: 'tv',
					seasonNumber,
					episodeIds
				})
			});

			const result = await response.json();

			// For streaming grabs, refresh the page since files are created instantly
			if (result.success && release.protocol === 'streaming') {
				setTimeout(() => window.location.reload(), 500);
			}

			return { success: result.success, error: result.error };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to grab release'
			};
		}
	}

	// Build search title with season/episode info
	const searchTitle = $derived(() => {
		if (!searchContext) return data.series.title;
		let title = data.series.title;
		if (searchContext.season !== undefined) {
			title += ` S${String(searchContext.season).padStart(2, '0')}`;
			if (searchContext.episode !== undefined) {
				title += `E${String(searchContext.episode).padStart(2, '0')}`;
			}
		}
		return title;
	});
</script>

<svelte:head>
	<title>{data.series.title} - Library - Cinephage</title>
</svelte:head>

<div class="flex w-full flex-col gap-6 px-4 pb-20 lg:px-8">
	<!-- Header -->
	<LibrarySeriesHeader
		series={data.series}
		{qualityProfileName}
		refreshing={isRefreshing}
		{refreshProgress}
		{missingEpisodeCount}
		{downloadingCount}
		{searchingMissing}
		{missingSearchProgress}
		{missingSearchResult}
		onMonitorToggle={handleMonitorToggle}
		onSearch={handleSearch}
		onSearchMissing={handleSearchMissing}
		onEdit={handleEdit}
		onDelete={handleDelete}
		onRefresh={handleRefresh}
	/>

	<!-- Main Content -->
	<div class="grid gap-6 lg:grid-cols-3">
		<!-- Seasons (takes 2 columns) -->
		<div class="space-y-4 lg:col-span-2">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold">Seasons</h2>
				<div class="flex gap-1">
					<button
						class="btn gap-1 btn-ghost btn-sm"
						onclick={() => (isRenameModalOpen = true)}
						title="Rename files"
					>
						<FileEdit class="h-4 w-4" />
						Rename
					</button>
					<button
						class="btn gap-2 btn-ghost btn-sm"
						onclick={toggleSelectionMode}
						title={showCheckboxes ? 'Exit selection mode' : 'Select episodes'}
					>
						<CheckSquare size={16} />
						{showCheckboxes ? 'Done' : 'Select'}
					</button>
				</div>
			</div>

			{#if data.seasons.length === 0}
				<div class="rounded-xl bg-base-200 p-8 text-center text-base-content/60">
					No seasons found
				</div>
			{:else}
				{#each data.seasons as season (season.id)}
					<SeasonAccordion
						{season}
						seriesMonitored={data.series.monitored ?? false}
						defaultOpen={data.seasons.length === 1 ||
							season.seasonNumber === data.seasons[data.seasons.length - 1].seasonNumber}
						{selectedEpisodes}
						{showCheckboxes}
						{downloadingEpisodeIds}
						{downloadingSeasons}
						autoSearchingSeason={autoSearchingSeasons.has(season.id)}
						autoSearchSeasonResult={autoSearchSeasonResults.get(season.id) ?? null}
						{autoSearchingEpisodes}
						{autoSearchEpisodeResults}
						{subtitleAutoSearchingEpisodes}
						onSeasonMonitorToggle={handleSeasonMonitorToggle}
						onEpisodeMonitorToggle={handleEpisodeMonitorToggle}
						onSeasonSearch={handleSeasonSearch}
						onAutoSearchSeason={handleAutoSearchSeason}
						onEpisodeSearch={handleEpisodeSearch}
						onAutoSearchEpisode={handleAutoSearchEpisode}
						onEpisodeSelectChange={handleEpisodeSelectChange}
						onSelectAllInSeason={handleSelectAllInSeason}
						onSubtitleSearch={handleSubtitleSearch}
						onSubtitleAutoSearch={handleSubtitleAutoSearch}
						onSeasonDelete={handleSeasonDelete}
						onEpisodeDelete={handleEpisodeDelete}
					/>
				{/each}
			{/if}
		</div>

		<!-- Sidebar -->
		<TVSeriesSidebar series={data.series} />
	</div>
</div>

<!-- Bulk Action Bar -->
<BulkActionBar
	{selectedCount}
	searching={autoSearchingEpisodes.size > 0}
	onSearch={handleBulkAutoSearch}
	onClear={clearSelection}
/>

<!-- Edit Modal -->
<SeriesEditModal
	open={isEditModalOpen}
	series={data.series}
	qualityProfiles={data.qualityProfiles}
	rootFolders={data.rootFolders}
	saving={isSaving}
	onClose={() => (isEditModalOpen = false)}
	onSave={handleEditSave}
/>

<!-- Search Modal -->
<InteractiveSearchModal
	open={isSearchModalOpen}
	title={searchTitle()}
	tmdbId={data.series.tmdbId}
	imdbId={data.series.imdbId}
	year={data.series.year}
	mediaType="tv"
	scoringProfileId={data.series.scoringProfileId}
	season={searchContext?.season}
	episode={searchContext?.episode}
	searchMode={searchContext?.searchMode ?? 'all'}
	onClose={() => {
		isSearchModalOpen = false;
		searchContext = null;
	}}
	onGrab={handleGrab}
/>

<!-- Subtitle Search Modal -->
<SubtitleSearchModal
	open={isSubtitleSearchModalOpen}
	title={subtitleSearchContext?.title ?? ''}
	episodeId={subtitleSearchContext?.episodeId}
	onClose={() => {
		isSubtitleSearchModalOpen = false;
		subtitleSearchContext = null;
	}}
	onDownloaded={handleSubtitleDownloaded}
/>

<!-- Rename Preview Modal -->
<RenamePreviewModal
	open={isRenameModalOpen}
	mediaType="series"
	mediaId={data.series.id}
	mediaTitle={data.series.title}
	onClose={() => (isRenameModalOpen = false)}
	onRenamed={() => location.reload()}
/>

<!-- Delete Confirmation Modal -->
<DeleteConfirmationModal
	open={isDeleteModalOpen}
	title="Delete Series"
	itemName={data.series.title}
	loading={isDeleting}
	onConfirm={performDelete}
	onCancel={() => (isDeleteModalOpen = false)}
/>

<!-- Season Delete Confirmation Modal -->
<DeleteConfirmationModal
	open={isSeasonDeleteModalOpen}
	title="Delete Season"
	itemName={deletingSeasonName}
	loading={isDeletingSeason}
	onConfirm={performSeasonDelete}
	onCancel={() => (isSeasonDeleteModalOpen = false)}
/>

<!-- Episode Delete Confirmation Modal -->
<DeleteConfirmationModal
	open={isEpisodeDeleteModalOpen}
	title="Delete Episode"
	itemName={deletingEpisodeName}
	loading={isDeletingEpisode}
	onConfirm={performEpisodeDelete}
	onCancel={() => (isEpisodeDeleteModalOpen = false)}
/>
