<script lang="ts">
	import type { PageData } from './$types';
	import type { EpisodeFileInfo } from './+page.server';
	import {
		LibrarySeriesHeader,
		SeasonAccordion,
		SeriesEditModal,
		RenamePreviewModal
	} from '$lib/components/library';
	import { TVSeriesSidebar, BulkActionBar } from '$lib/components/library/tv';
	import { InteractiveSearchModal } from '$lib/components/search';
	import { SubtitleSearchModal } from '$lib/components/subtitles';
	import SubtitleSyncModal from '$lib/components/subtitles/SubtitleSyncModal.svelte';
	import DeleteConfirmationModal from '$lib/components/ui/modal/DeleteConfirmationModal.svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import type { SeriesEditData } from '$lib/components/library/SeriesEditModal.svelte';
	import type { SearchMode } from '$lib/components/search/InteractiveSearchModal.svelte';
	import { CheckSquare, FileEdit, Wifi, WifiOff, Loader2, RefreshCw } from 'lucide-svelte';
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { resolvePath } from '$lib/utils/routing';
	import { createDynamicSSE } from '$lib/sse';
	import { createSearchProgress } from '$lib/stores/searchProgress.svelte';
	import { getPrimaryAutoSearchIssue } from '$lib/utils/autoSearchIssues';
	import { layoutState, deriveMobileSseStatus } from '$lib/layout.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { calculateEpisodeStats } from '$lib/utils/episode-stats.svelte';

	let { data }: { data: PageData } = $props();

	const ACTIVE_QUEUE_STATUSES = new Set([
		'queued',
		'downloading',
		'stalled',
		'paused',
		'completed',
		'postprocessing',
		'importing',
		'seeding',
		'seeding-imported'
	]);

	// Reactive data that will be updated via SSE
	let seriesState = $state<PageData['series'] | null>(null);
	let seasonsState = $state<PageData['seasons'] | null>(null);
	let queueItemsState = $state<PageData['queueItems'] | null>(null);
	let lastSeriesId = $state<string | null>(null);
	const series = $derived(seriesState ?? data.series);
	const seasons = $derived(seasonsState ?? data.seasons);
	const queueItems = $derived(queueItemsState ?? data.queueItems);
	const effectiveScoringProfileId = $derived.by(
		() => series.scoringProfileId ?? data.qualityProfiles.find((p) => p.isDefault)?.id ?? null
	);

	function computeSeriesEpisodeStats(seasonList: PageData['seasons']) {
		const regularSeasons = seasonList.filter((season) => season.seasonNumber > 0);
		const allEpisodes = regularSeasons.flatMap((season) => season.episodes);
		const stats = calculateEpisodeStats(allEpisodes);

		return {
			totalEpisodes: stats.totalAired,
			totalFiles: stats.downloaded,
			percentComplete: stats.percentComplete
		};
	}

	// Keep series completion counters aligned with the actual episode rows shown in seasons.
	const seriesForDisplay = $derived.by(() => {
		const { totalEpisodes, totalFiles, percentComplete } = computeSeriesEpisodeStats(seasons);
		return {
			...series,
			episodeCount: totalEpisodes,
			episodeFileCount: totalFiles,
			percentComplete
		};
	});

	// Calculate total size across all seasons from episode files
	const totalSeriesSize = $derived(
		seasons.reduce(
			(total, season) => total + season.episodes.reduce((sum, ep) => sum + (ep.file?.size ?? 0), 0),
			0
		)
	);

	$effect(() => {
		const incomingSeriesId = data.series.id;
		if (lastSeriesId !== incomingSeriesId) {
			seriesState = $state.snapshot(data.series);
			seasonsState = $state.snapshot(data.seasons);
			queueItemsState = $state.snapshot(data.queueItems);
			lastSeriesId = incomingSeriesId;
		}
	});

	// SSE Connection - internally handles browser/SSR
	// Shared type for queue SSE payloads
	type QueueEventPayload = {
		id: string;
		title: string;
		status: string;
		progress: number | null;
		episodeIds?: string[];
		seasonNumber?: number;
	};

	const sse = createDynamicSSE<{
		'media:updated': {
			series: typeof series;
			seasons: typeof seasons;
			queueItems: typeof queueItems;
		};
		'queue:sync': { queueItems: typeof queueItems };
		'queue:added': QueueEventPayload;
		'queue:updated': QueueEventPayload;
		'queue:removed': { id: string };
		'file:added': {
			file: EpisodeFileInfo;
			episodeIds: string[];
			seasonNumber: number;
			wasUpgrade: boolean;
			replacedFileIds?: string[];
		};
		'file:removed': { fileId: string; episodeIds: string[] };
		'search:started': { seriesId: string };
		'search:completed': { seriesId: string };
	}>(() => `/api/library/series/${series.id}/stream`, {
		'media:updated': (payload) => {
			seriesState = payload.series;
			seasonsState = payload.seasons;
			queueItemsState = payload.queueItems;
		},
		'queue:sync': (payload) => {
			queueItemsState = payload.queueItems;
		},
		'queue:added': (payload) => {
			// Add new queue item if not already tracked
			const exists = queueItems.some((q) => q.id === payload.id);
			if (!exists) {
				queueItemsState = [
					...queueItems,
					{
						id: payload.id,
						title: payload.title,
						status: payload.status,
						progress: payload.progress,
						episodeIds: payload.episodeIds || null,
						seasonNumber: payload.seasonNumber || null
					}
				];
			}
		},
		'queue:updated': (payload) => {
			if (!ACTIVE_QUEUE_STATUSES.has(payload.status)) {
				// Remove from queue state when no longer active
				queueItemsState = queueItems.filter((q) => q.id !== payload.id);
			} else {
				// Update or add queue item
				const existingIndex = queueItems.findIndex((q) => q.id === payload.id);
				const newQueueItem = {
					id: payload.id,
					title: payload.title,
					status: payload.status,
					progress: payload.progress,
					episodeIds: payload.episodeIds || null,
					seasonNumber: payload.seasonNumber || null
				};
				if (existingIndex >= 0) {
					queueItemsState = queueItems.map((q, idx) => (idx === existingIndex ? newQueueItem : q));
				} else {
					queueItemsState = [...queueItems, newQueueItem];
				}
			}
		},
		'queue:removed': (payload) => {
			queueItemsState = queueItems.filter((q) => q.id !== payload.id);
		},
		'file:added': (payload) => {
			// Work with seasonsState to ensure reactivity
			if (!seasonsState) {
				return;
			}

			const seasonIndex = seasonsState.findIndex((s) => s.seasonNumber === payload.seasonNumber);

			if (seasonIndex === -1) {
				return;
			}

			// Create new seasons array with immutable updates
			seasonsState = seasonsState.map((season, sIdx) => {
				if (sIdx !== seasonIndex) return season;

				// Update episodes immutably
				const updatedEpisodes = season.episodes.map((episode) => {
					if (!payload.episodeIds.includes(episode.id)) return episode;
					return {
						...episode,
						file: payload.file,
						hasFile: true
					};
				});

				// Calculate new file count
				const episodeFileCount = updatedEpisodes.filter((e) => e.file !== null).length;

				return {
					...season,
					episodes: updatedEpisodes,
					episodeFileCount
				};
			});

			// Update series state immutably
			if (seriesState) {
				const { totalEpisodes, totalFiles } = computeSeriesEpisodeStats(seasonsState);
				seriesState = {
					...seriesState,
					episodeFileCount: totalFiles,
					percentComplete: totalEpisodes > 0 ? Math.round((totalFiles / totalEpisodes) * 100) : 0
				};
			}
		},
		'file:removed': (payload) => {
			// Work with seasonsState to ensure reactivity
			if (!seasonsState) return;

			// Create new seasons array with immutable updates
			seasonsState = seasonsState.map((season) => {
				// Update episodes immutably
				const updatedEpisodes = season.episodes.map((episode) => {
					if (episode.file?.id !== payload.fileId) return episode;
					return {
						...episode,
						file: null,
						hasFile: false
					};
				});

				// Calculate new file count
				const episodeFileCount = updatedEpisodes.filter((e) => e.file !== null).length;

				return {
					...season,
					episodes: updatedEpisodes,
					episodeFileCount
				};
			});

			// Update series state immutably
			if (seriesState) {
				const { totalEpisodes, totalFiles } = computeSeriesEpisodeStats(seasonsState);
				seriesState = {
					...seriesState,
					episodeFileCount: totalFiles,
					percentComplete: totalEpisodes > 0 ? Math.round((totalFiles / totalEpisodes) * 100) : 0
				};
			}
		},
		'search:started': () => {
			searchingMissing = true;
		},
		'search:completed': () => {
			searchingMissing = false;
		}
	});

	$effect(() => {
		layoutState.setMobileSseStatus(deriveMobileSseStatus(sse));
		return () => {
			layoutState.clearMobileSseStatus();
		};
	});

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
	let openSeasonId = $state<string | null>(null);

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

	$effect(() => {
		searchingMissing = data.isSearching;
	});
	const isStreamerProfile = $derived.by(() => series.scoringProfileId === 'streamer');

	// Subtitle search state
	let isSubtitleSearchModalOpen = $state(false);
	let isSubtitleSyncModalOpen = $state(false);
	let syncingSubtitleId = $state<string | null>(null);
	let subtitleSyncError = $state<string | null>(null);
	let subtitleSearchContext = $state<{
		episodeId: string;
		title: string;
	} | null>(null);
	let subtitleAutoSearchingEpisodes = new SvelteSet<string>();
	let subtitleSyncingId = $state<string | null>(null);
	let subtitleDeletingId = $state<string | null>(null);
	let bulkSubtitleAutoSearching = $state(false);
	let bulkSubtitleSyncing = $state(false);

	function describeError(error: unknown, fallback: string): string {
		return error instanceof Error ? error.message : fallback;
	}

	function showActionError(message: string, error: unknown): void {
		toasts.error(message, { description: describeError(error, message) });
	}

	// Search progress store for auto-search
	const searchProgress = createSearchProgress();

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

	const deletingSeasonHasFiles = $derived.by(() => {
		if (!deletingSeasonId) return false;
		const season = seasons.find((s) => s.id === deletingSeasonId);
		return (season?.episodeFileCount ?? 0) > 0;
	});

	const deletingEpisodeHasFiles = $derived.by(() => {
		if (!deletingEpisodeId) return false;
		for (const season of seasons) {
			const ep = season.episodes.find((e) => e.id === deletingEpisodeId);
			if (ep) return ep.file !== null;
		}
		return false;
	});

	$effect(() => {
		if ($page.url.searchParams.get('edit') === '1') {
			isEditModalOpen = true;
		}
	});

	// Find quality profile name (use default if none set)
	const qualityProfileName = $derived.by(() => {
		if (series.scoringProfileId) {
			return data.qualityProfiles.find((p) => p.id === series.scoringProfileId)?.name ?? null;
		}
		// No profile set - show the default
		const defaultProfile = data.qualityProfiles.find((p) => p.isDefault);
		return defaultProfile ? m.library_tv_profileDefault({ name: defaultProfile.name }) : null;
	});

	// Build a set of episode IDs that are currently downloading
	const downloadingEpisodeIds = $derived.by(() => {
		const ids = new SvelteSet<string>();
		for (const item of queueItems) {
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
		for (const item of queueItems) {
			// Season pack: has seasonNumber but no specific episodeIds
			if (item.seasonNumber !== null && (!item.episodeIds || item.episodeIds.length === 0)) {
				seasons.add(item.seasonNumber);
			}
		}
		return seasons;
	});

	// Calculate missing aired episode count for manual auto-grab.
	const missingEpisodeCount = $derived.by(() => {
		const now = new Date().toISOString().split('T')[0];
		let count = 0;
		for (const season of seasons) {
			if (season.seasonNumber === 0) continue;
			for (const episode of season.episodes) {
				if (!episode.file && episode.airDate && episode.airDate <= now) {
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
	const downloadingCount = $derived(queueItems.length);

	// Derive selection count
	const selectedCount = $derived(selectedEpisodes.size);

	// Handlers
	async function handleMonitorToggle(newValue: boolean) {
		isSaving = true;
		try {
			const response = await fetch(`/api/library/series/${series.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ monitored: newValue })
			});

			if (response.ok) {
				series.monitored = newValue;
			}
		} catch (error) {
			showActionError(m.toast_library_tvDetail_failedToUpdateMonitor(), error);
		} finally {
			isSaving = false;
		}
	}

	function handleSearch() {
		// Top-level search is for multi-season packs / complete series only
		searchContext = {
			title: series.title,
			searchMode: 'multiSeasonPack'
		};
		isSearchModalOpen = true;
	}

	function handleImport() {
		const query = [
			`mediaType=tv`,
			`tmdbId=${encodeURIComponent(String(series.tmdbId))}`,
			`libraryId=${encodeURIComponent(series.id)}`,
			`title=${encodeURIComponent(series.title)}`,
			...(series.year ? [`year=${encodeURIComponent(String(series.year))}`] : [])
		].join('&');
		void goto(resolvePath(`/library/import?${query}`));
	}

	function handleEdit() {
		isEditModalOpen = true;
	}

	function handleEditClose() {
		isEditModalOpen = false;
		if ($page.url.searchParams.get('edit') === '1') {
			goto($page.url.pathname, { replaceState: true, keepFocus: true, noScroll: true });
		}
	}

	function updateSeriesStatsFromSeasons(updatedSeasons: typeof seasons): void {
		const { totalEpisodes, totalFiles } = computeSeriesEpisodeStats(updatedSeasons);

		seriesState = {
			...series,
			episodeCount: totalEpisodes,
			episodeFileCount: totalFiles,
			percentComplete: totalEpisodes > 0 ? Math.round((totalFiles / totalEpisodes) * 100) : 0
		};
	}

	async function refreshSeriesFromApi(): Promise<void> {
		try {
			const response = await fetch(`/api/library/series/${series.id}`);
			if (!response.ok) return;

			const result = await response.json();
			if (!result.success || !result.series) return;

			const { seasons: refreshedSeasons, ...seriesFields } = result.series;
			seriesState = { ...series, ...seriesFields };
			if (Array.isArray(refreshedSeasons)) {
				seasonsState = refreshedSeasons;
			}
		} catch (error) {
			showActionError(m.toast_library_tvDetail_failedToRefresh(), error);
		}
	}

	async function handleRefresh() {
		isRefreshing = true;
		refreshProgress = null;

		try {
			const response = await fetch(`/api/library/series/${series.id}/refresh`, {
				method: 'POST'
			});

			if (!response.ok) {
				toasts.error(m.toast_library_tvDetail_refreshFailed());
				return;
			}

			// Read the streaming response
			const reader = response.body?.getReader();
			if (!reader) {
				toasts.error(m.toast_library_tvDetail_refreshNoStream());
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
								toasts.error(eventData.message || m.toast_library_tvDetail_seriesRefreshFailed());
							}
						} catch {
							// Ignore parse errors (e.g., heartbeat comments)
						}
					}
				}
			}

			if (completed) {
				await refreshSeriesFromApi();
			}
		} catch (error) {
			showActionError(m.toast_library_tvDetail_refreshFailed(), error);
		} finally {
			isRefreshing = false;
			refreshProgress = null;
		}
	}

	async function handleEditSave(editData: SeriesEditData) {
		isSaving = true;
		try {
			const response = await fetch(`/api/library/series/${series.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(editData)
			});

			const result = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(result?.error || m.toast_library_tvDetail_failedToUpdate());
			}

			series.monitored = editData.monitored;
			series.scoringProfileId = editData.scoringProfileId;
			series.seasonFolder = editData.seasonFolder;
			series.seriesType = editData.seriesType;
			series.wantsSubtitles = editData.wantsSubtitles;

			if (result?.moveQueued) {
				toasts.success(
					'Move queued. File transfer has started and will appear in Activity until completion.'
				);
			} else {
				series.rootFolderId = editData.rootFolderId;
				const newFolder = data.rootFolders.find((f) => f.id === editData.rootFolderId);
				series.rootFolderPath = newFolder?.path ?? null;
			}

			isEditModalOpen = false;
		} catch (error) {
			showActionError(m.toast_library_tvDetail_failedToUpdate(), error);
		} finally {
			isSaving = false;
		}
	}

	function handleDelete() {
		isDeleteModalOpen = true;
	}

	async function performDelete(deleteFiles: boolean, removeFromLibrary: boolean) {
		isDeleting = true;
		try {
			const response = await fetch(
				`/api/library/series/${series.id}?deleteFiles=${deleteFiles}&removeFromLibrary=${removeFromLibrary}`,
				{ method: 'DELETE' }
			);
			const result = await response.json();

			if (result.success) {
				if (removeFromLibrary) {
					toasts.success(m.toast_library_tvDetail_seriesRemoved());
					// Navigate to library since the series no longer exists
					window.location.href = '/library/tv';
				} else {
					toasts.success(m.toast_library_tvDetail_seriesFilesDeleted());
					const updatedSeasons = seasons.map((season) => ({
						...season,
						episodeFileCount: 0,
						episodes: season.episodes.map((episode) => ({
							...episode,
							hasFile: false as boolean | null,
							file: null
						}))
					}));
					seasonsState = updatedSeasons;
					updateSeriesStatsFromSeasons(updatedSeasons);
					queueItemsState = [];
				}
			} else {
				toasts.error(m.toast_library_tvDetail_failedToDeleteSeries(), {
					description: result.error
				});
			}
		} catch (error) {
			showActionError(m.toast_library_tvDetail_failedToDeleteSeries(), error);
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
		deletingSeasonName =
			season.name || m.library_tvDetail_seasonFallback({ number: String(season.seasonNumber) });
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
				toasts.success(m.toast_library_tvDetail_seasonFilesDeleted());
				// Mark all episodes in this season as missing
				const updatedSeasons = seasons.map((s) =>
					s.id === deletingSeasonId
						? {
								...s,
								episodeFileCount: 0,
								episodes: s.episodes.map((e) => ({
									...e,
									hasFile: false as boolean | null,
									file: null
								}))
							}
						: s
				);
				seasonsState = updatedSeasons;
				updateSeriesStatsFromSeasons(updatedSeasons);
			} else {
				toasts.error(m.toast_library_tvDetail_failedToDeleteSeasonFiles(), {
					description: result.error
				});
			}
		} catch (error) {
			showActionError(m.toast_library_tvDetail_failedToDeleteSeason(), error);
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
		const epTitle =
			episode.title ||
			m.library_tvDetail_episodeFallback({ number: String(episode.episodeNumber) });
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
				toasts.success(m.toast_library_tvDetail_episodeFilesDeleted());
				// Mark episode as missing (hasFile: false) instead of removing it
				const updatedSeasons = seasons.map((season) => {
					const hasEpisode = season.episodes.some((e) => e.id === deletingEpisodeId);
					if (!hasEpisode) {
						return season;
					}

					const updatedEpisodes = season.episodes.map((e) =>
						e.id === deletingEpisodeId ? { ...e, hasFile: false as boolean | null, file: null } : e
					);
					const updatedEpisodeFileCount = updatedEpisodes.filter((e) => e.file !== null).length;
					const updatedEpisodeCount = updatedEpisodes.length;

					return {
						...season,
						episodes: updatedEpisodes,
						episodeFileCount: updatedEpisodeFileCount,
						episodeCount: updatedEpisodeCount
					};
				});
				seasonsState = updatedSeasons;
				updateSeriesStatsFromSeasons(updatedSeasons);
			} else {
				toasts.error(m.toast_library_tvDetail_failedToDeleteEpisodeFiles(), {
					description: result.error
				});
			}
		} catch (error) {
			showActionError(m.toast_library_tvDetail_failedToDeleteEpisode(), error);
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
				body: JSON.stringify({ monitored: newValue, updateEpisodes: true })
			});

			if (response.ok) {
				seasonsState = seasons.map((season) =>
					season.id === seasonId
						? {
								...season,
								monitored: newValue,
								episodes: season.episodes.map((ep) => ({ ...ep, monitored: newValue }))
							}
						: season
				);
			}
		} catch (error) {
			showActionError(m.toast_library_tvDetail_failedToUpdateSeasonMonitor(), error);
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
				seasonsState = seasons.map((season) => ({
					...season,
					episodes: season.episodes.map((ep) =>
						ep.id === episodeId ? { ...ep, monitored: newValue } : ep
					)
				}));
			}
		} catch (error) {
			showActionError(m.toast_library_tvDetail_failedToUpdateEpisodeMonitor(), error);
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
			title: series.title,
			season: season.seasonNumber
		};
		isSearchModalOpen = true;
	}

	function handleEpisodeSearch(episode: Episode) {
		searchContext = {
			title: series.title,
			season: episode.seasonNumber,
			episode: episode.episodeNumber
		};
		isSearchModalOpen = true;
	}

	// Auto-search handlers
	async function handleAutoSearchEpisode(episode: Episode & { id: string }) {
		if (autoSearchingEpisodes.has(episode.id)) return;
		autoSearchingEpisodes.add(episode.id);

		try {
			await searchProgress.startSearch(`/api/library/series/${series.id}/auto-search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: 'episode',
					episodeId: episode.id
				})
			});

			if (searchProgress.results) {
				const issue = getPrimaryAutoSearchIssue(searchProgress.results);
				const itemResult = searchProgress.results.results?.[0] as
					| { found?: boolean; grabbed?: boolean; releaseName?: string; error?: string }
					| undefined;
				autoSearchEpisodeResults.set(episode.id, {
					found: itemResult?.found ?? false,
					grabbed: itemResult?.grabbed ?? false,
					releaseName: itemResult?.releaseName,
					error: itemResult?.error ?? searchProgress.results.error ?? issue?.message
				});

				// Clear result after 5 seconds
				setTimeout(() => {
					autoSearchEpisodeResults.delete(episode.id);
				}, 5000);
			}
		} catch (error) {
			autoSearchEpisodeResults.set(episode.id, {
				found: false,
				grabbed: false,
				error: error instanceof Error ? error.message : m.toast_library_tvDetail_searchFailed()
			});
		} finally {
			autoSearchingEpisodes.delete(episode.id);
			searchProgress.reset();
		}
	}

	async function handleAutoSearchSeason(season: Season) {
		if (autoSearchingSeasons.has(season.id)) return;
		autoSearchingSeasons.add(season.id);

		try {
			await searchProgress.startSearch(`/api/library/series/${series.id}/auto-search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: 'season',
					seasonNumber: season.seasonNumber
				})
			});

			if (searchProgress.results) {
				const issue = getPrimaryAutoSearchIssue(searchProgress.results);
				const itemResult = searchProgress.results.results?.[0] as
					| { found?: boolean; grabbed?: boolean; releaseName?: string; error?: string }
					| undefined;
				autoSearchSeasonResults.set(season.id, {
					found: itemResult?.found ?? false,
					grabbed: itemResult?.grabbed ?? false,
					releaseName: itemResult?.releaseName,
					error: itemResult?.error ?? searchProgress.results.error ?? issue?.message
				});

				// Clear result after 5 seconds
				setTimeout(() => {
					autoSearchSeasonResults.delete(season.id);
				}, 5000);
			}
		} catch (error) {
			autoSearchSeasonResults.set(season.id, {
				found: false,
				grabbed: false,
				error: error instanceof Error ? error.message : m.toast_library_tvDetail_searchFailed()
			});
		} finally {
			autoSearchingSeasons.delete(season.id);
			searchProgress.reset();
		}
	}

	async function handleSearchMissing() {
		if (searchingMissing) return;
		searchingMissing = true;
		missingSearchProgress = null;
		missingSearchResult = null;

		try {
			await searchProgress.startSearch(`/api/library/series/${series.id}/auto-search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: 'missing' })
			});

			if (searchProgress.results) {
				const issue = getPrimaryAutoSearchIssue(searchProgress.results);
				const results = searchProgress.results.results as
					| Array<{ found?: boolean; grabbed?: boolean }>
					| undefined;
				missingSearchResult = searchProgress.results.summary ?? {
					searched: results?.length ?? 0,
					found: results?.filter((r) => r.found).length ?? 0,
					grabbed: results?.filter((r) => r.grabbed).length ?? 0
				};

				// Streaming grabs can complete before queue/file SSE updates arrive; refresh once so
				// the episode/file counters reflect the completed auto-grab immediately.
				if ((missingSearchResult.grabbed ?? 0) > 0) {
					toasts.success(
						m.toast_library_tvDetail_grabbedMissing({ count: String(missingSearchResult.grabbed) })
					);
					setTimeout(() => {
						void refreshSeriesFromApi();
					}, 500);
				} else if (issue) {
					toasts.error(issue.message, { description: issue.description });
				} else if ((missingSearchResult.found ?? 0) > 0) {
					toasts.info(m.toast_library_tvDetail_foundNotEligible());
				} else {
					toasts.info(m.toast_library_tvDetail_noSuitableReleases());
				}
			}

			// Clear result after 10 seconds
			setTimeout(() => {
				missingSearchResult = null;
			}, 10000);
		} catch (error) {
			showActionError(m.toast_library_tvDetail_failedToSearchMissing(), error);
		} finally {
			searchingMissing = false;
			missingSearchProgress = null;
			searchProgress.reset();
		}
	}

	async function handleBulkAutoSearch() {
		const episodeIds = [...selectedEpisodes];
		if (episodeIds.length === 0) return;

		// Mark all selected as searching
		for (const id of episodeIds) {
			autoSearchingEpisodes.add(id);
		}

		try {
			await searchProgress.startSearch(`/api/library/series/${series.id}/auto-search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: 'bulk',
					episodeIds
				})
			});

			if (searchProgress.results) {
				const results = searchProgress.results.results as
					| Array<{
							itemId?: string;
							found?: boolean;
							grabbed?: boolean;
							releaseName?: string;
							error?: string;
					  }>
					| undefined;

				// Update results for each episode
				for (const itemResult of results ?? []) {
					if (itemResult.itemId) {
						autoSearchEpisodeResults.set(itemResult.itemId, {
							found: itemResult.found ?? false,
							grabbed: itemResult.grabbed ?? false,
							releaseName: itemResult.releaseName,
							error: itemResult.error
						});
					}
				}
			}

			// Clear selection after search
			selectedEpisodes.clear();
			showCheckboxes = false;

			// Clear results after 5 seconds
			setTimeout(() => {
				for (const id of episodeIds) {
					autoSearchEpisodeResults.delete(id);
				}
			}, 5000);
		} catch (error) {
			showActionError(m.toast_library_tvDetail_bulkSearchFailed(), error);
		} finally {
			for (const id of episodeIds) {
				autoSearchingEpisodes.delete(id);
			}
			searchProgress.reset();
		}
	}

	// Subtitle search handlers
	interface EpisodeForSubtitle {
		id: string;
		title: string | null;
		seasonNumber: number;
		episodeNumber: number;
	}

	interface DownloadedSubtitle {
		id?: string;
		subtitleId?: string;
		language?: string;
		isForced?: boolean;
		isHearingImpaired?: boolean;
		format?: string;
		wasSynced?: boolean;
		syncOffset?: number | null;
	}

	function appendSubtitleToEpisode(episodeId: string, subtitle: DownloadedSubtitle): void {
		const subtitleId = subtitle.id ?? subtitle.subtitleId;
		if (!subtitleId) return;

		const normalizedSubtitle = {
			id: subtitleId,
			language: subtitle.language ?? 'unknown',
			isForced: subtitle.isForced ?? false,
			isHearingImpaired: subtitle.isHearingImpaired ?? false,
			format: subtitle.format
		};

		seasonsState = seasons.map((season) => ({
			...season,
			episodes: season.episodes.map((episode) => {
				if (episode.id !== episodeId) return episode;
				const existingSubtitles = episode.subtitles ?? [];
				if (existingSubtitles.some((existing) => existing.id === subtitleId)) {
					return episode;
				}
				return {
					...episode,
					subtitles: [...existingSubtitles, normalizedSubtitle]
				};
			})
		}));
	}

	function handleSubtitleSearch(episode: EpisodeForSubtitle) {
		const episodeTitle =
			episode.title ||
			m.library_tvDetail_episodeFallback({ number: String(episode.episodeNumber) });
		subtitleSearchContext = {
			episodeId: episode.id,
			title: `${series.title} S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')} - ${episodeTitle}`
		};
		isSubtitleSearchModalOpen = true;
	}

	function handleSubtitleSync() {
		if (isStreamerProfile) {
			return;
		}
		subtitleSyncError = null;
		isSubtitleSyncModalOpen = true;
	}

	async function handleSubtitleAutoSearch(episode: EpisodeForSubtitle) {
		subtitleAutoSearchingEpisodes.add(episode.id);

		try {
			const response = await fetch('/api/subtitles/auto-search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ episodeId: episode.id })
			});

			const result = await response.json();

			if (result.success && result.subtitle) {
				appendSubtitleToEpisode(episode.id, result.subtitle);
			}
		} catch (error) {
			showActionError(m.toast_library_tvDetail_failedToAutoSearchSubs(), error);
		} finally {
			subtitleAutoSearchingEpisodes.delete(episode.id);
		}
	}

	function handleSubtitleDownloaded(subtitle: DownloadedSubtitle) {
		const episodeId = subtitleSearchContext?.episodeId;
		if (!episodeId) return;
		appendSubtitleToEpisode(episodeId, subtitle);
	}

	const syncableSubtitles = $derived.by(() => {
		const results: Array<DownloadedSubtitle & { id: string; label: string }> = [];

		for (const season of seasons) {
			for (const episode of season.episodes) {
				for (const subtitle of episode.subtitles ?? []) {
					if ('isEmbedded' in subtitle && subtitle.isEmbedded) continue;
					results.push({
						...subtitle,
						id: subtitle.id,
						language: subtitle.language,
						label: `S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')} - ${episode.title || m.library_tvDetail_episodeFallback({ number: String(episode.episodeNumber) })}`
					});
				}
			}
		}

		return results;
	});

	async function handleSubtitleResync(
		subtitleId: string,
		settings?: { splitPenalty?: number; noSplits?: boolean }
	): Promise<void> {
		syncingSubtitleId = subtitleId;
		subtitleSyncError = null;

		try {
			const response = await fetch('/api/subtitles/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subtitleId,
					...(settings?.splitPenalty !== undefined && { splitPenalty: settings.splitPenalty }),
					...(settings?.noSplits !== undefined && { noSplits: settings.noSplits })
				})
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || m.toast_library_tvDetail_subtitleSyncFailed());
			}

			seasonsState = seasons.map((season) => ({
				...season,
				episodes: season.episodes.map((episode) => ({
					...episode,
					subtitles: (episode.subtitles ?? []).map((subtitle) =>
						subtitle.id === subtitleId
							? {
									...subtitle,
									wasSynced: true,
									syncOffset: result.offsetMs
								}
							: subtitle
					)
				}))
			}));

			toasts.success(m.toast_library_tvDetail_subtitleSynced(), {
				description: m.toast_library_tvDetail_subtitleSyncOffset({
					offset: String(result.offsetMs)
				})
			});
		} catch (error) {
			subtitleSyncError = describeError(error, m.toast_library_tvDetail_subtitleSyncFailed());
			showActionError(m.toast_library_tvDetail_failedToSyncSub(), error);
		} finally {
			syncingSubtitleId = null;
		}
	}

	// Subtitle sync from popover (individual subtitle)
	async function handleSubtitleSyncFromPopover(subtitleId: string): Promise<void> {
		subtitleSyncingId = subtitleId;
		try {
			const response = await fetch('/api/subtitles/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ subtitleId })
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || m.toast_library_tvDetail_subtitleSyncFailed());
			}

			seasonsState = seasons.map((season) => ({
				...season,
				episodes: season.episodes.map((episode) => ({
					...episode,
					subtitles: (episode.subtitles ?? []).map((subtitle) =>
						subtitle.id === subtitleId
							? { ...subtitle, wasSynced: true, syncOffset: result.offsetMs }
							: subtitle
					)
				}))
			}));

			toasts.success(m.toast_library_tvDetail_subtitleSynced(), {
				description: m.toast_library_tvDetail_subtitleSyncOffset({
					offset: String(result.offsetMs)
				})
			});
		} catch (error) {
			showActionError(m.toast_library_tvDetail_failedToSyncSub(), error);
		} finally {
			subtitleSyncingId = null;
		}
	}

	// Subtitle delete from popover
	async function handleSubtitleDeleteFromPopover(subtitleId: string): Promise<void> {
		subtitleDeletingId = subtitleId;
		try {
			const response = await fetch(`/api/subtitles/${subtitleId}`, {
				method: 'DELETE'
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || m.toast_library_tvDetail_deleteFailed());
			}

			// Remove subtitle from seasons state
			seasonsState = seasons.map((season) => ({
				...season,
				episodes: season.episodes.map((episode) => ({
					...episode,
					subtitles: (episode.subtitles ?? []).filter((s) => s.id !== subtitleId)
				}))
			}));

			toasts.success(m.toast_library_tvDetail_subtitleDeleted());
		} catch (error) {
			showActionError(m.toast_library_tvDetail_failedToDeleteSubtitle(), error);
		} finally {
			subtitleDeletingId = null;
		}
	}

	// Bulk sync handler for SubtitleSyncModal (NDJSON streaming)
	async function handleBulkSubtitleSync(
		subtitleIds: string[],
		settings: { splitPenalty: number; noSplits: boolean },
		onProgress: (result: {
			subtitleId: string;
			success: boolean;
			offsetMs: number;
			error?: string;
			index: number;
			total: number;
		}) => void,
		onComplete: () => void
	): Promise<void> {
		try {
			const response = await fetch('/api/subtitles/sync/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ subtitleIds, ...settings })
			});

			if (!response.ok) {
				throw new Error(m.toast_library_tvDetail_bulkSyncFailed());
			}

			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error(m.toast_library_tvDetail_noResponseBody());
			}

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const result = JSON.parse(line);
						onProgress(result);

						// Update seasons state for successful syncs
						if (result.success) {
							seasonsState = seasons.map((season) => ({
								...season,
								episodes: season.episodes.map((episode) => ({
									...episode,
									subtitles: (episode.subtitles ?? []).map((subtitle) =>
										subtitle.id === result.subtitleId
											? { ...subtitle, wasSynced: true, syncOffset: result.offsetMs }
											: subtitle
									)
								}))
							}));
						}
					} catch {
						// Ignore parse errors
					}
				}
			}

			onComplete();
		} catch (error) {
			showActionError(m.toast_library_tvDetail_bulkSyncError(), error);
			onComplete();
		}
	}

	// Bulk subtitle auto-search for selected episodes (BulkActionBar)
	async function handleBulkSubtitleAutoSearch(): Promise<void> {
		const episodeIds = [...selectedEpisodes];
		if (episodeIds.length === 0) return;

		bulkSubtitleAutoSearching = true;
		let successCount = 0;

		try {
			for (const episodeId of episodeIds) {
				subtitleAutoSearchingEpisodes.add(episodeId);
				try {
					const response = await fetch('/api/subtitles/auto-search', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ episodeId })
					});

					const result = await response.json();

					if (result.success && result.subtitle) {
						appendSubtitleToEpisode(episodeId, result.subtitle);
						successCount++;
					}
				} catch {
					// Continue with next episode
				} finally {
					subtitleAutoSearchingEpisodes.delete(episodeId);
				}
			}

			if (successCount > 0) {
				toasts.success(
					m.toast_library_tvDetail_downloadedSubtitles({ count: String(successCount) })
				);
			} else {
				toasts.info(m.toast_library_tvDetail_noSubtitlesFound());
			}

			selectedEpisodes.clear();
			showCheckboxes = false;
		} catch (error) {
			showActionError(m.toast_library_tvDetail_bulkSubAutoSearchFailed(), error);
		} finally {
			bulkSubtitleAutoSearching = false;
		}
	}

	// Bulk subtitle sync for selected episodes (BulkActionBar)
	async function handleBulkSubtitleSyncSelected(): Promise<void> {
		const episodeIds = [...selectedEpisodes];
		if (episodeIds.length === 0) return;

		// Collect all non-embedded subtitle IDs for selected episodes
		const subtitleIds: string[] = [];
		for (const season of seasons) {
			for (const episode of season.episodes) {
				if (!episodeIds.includes(episode.id)) continue;
				for (const subtitle of episode.subtitles ?? []) {
					if ('isEmbedded' in subtitle && subtitle.isEmbedded) continue;
					subtitleIds.push(subtitle.id);
				}
			}
		}

		if (subtitleIds.length === 0) {
			toasts.info(m.toast_library_tvDetail_noSyncableSubtitles());
			return;
		}

		bulkSubtitleSyncing = true;

		try {
			const response = await fetch('/api/subtitles/sync/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ subtitleIds })
			});

			if (!response.ok) {
				throw new Error(m.toast_library_tvDetail_bulkSyncFailed());
			}

			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error(m.toast_library_tvDetail_noResponseBody());
			}

			const decoder = new TextDecoder();
			let buffer = '';
			let successCount = 0;

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const result = JSON.parse(line);
						if (result.success) {
							successCount++;
							seasonsState = seasons.map((season) => ({
								...season,
								episodes: season.episodes.map((episode) => ({
									...episode,
									subtitles: (episode.subtitles ?? []).map((subtitle) =>
										subtitle.id === result.subtitleId
											? { ...subtitle, wasSynced: true, syncOffset: result.offsetMs }
											: subtitle
									)
								}))
							}));
						}
					} catch {
						// Ignore parse errors
					}
				}
			}

			toasts.success(m.toast_library_tvDetail_syncedSubtitles({ count: String(successCount) }));
			selectedEpisodes.clear();
			showCheckboxes = false;
		} catch (error) {
			showActionError(m.toast_library_tvDetail_bulkSyncError(), error);
		} finally {
			bulkSubtitleSyncing = false;
		}
	}

	// Selection handlers
	function handleEpisodeSelectChange(episodeId: string, selected: boolean) {
		if (selected) {
			selectedEpisodes.add(episodeId);
		} else {
			selectedEpisodes.delete(episodeId);
		}
	}

	function handleSelectAllInSeason(seasonId: string, selectAll: boolean) {
		const season = seasons.find((s) => s.id === seasonId);
		if (!season) return;

		const episodeIds = season.episodes.map((e) => e.id);

		if (selectAll) {
			for (const id of episodeIds) {
				selectedEpisodes.add(id);
			}
		} else {
			for (const id of episodeIds) {
				selectedEpisodes.delete(id);
			}
		}
	}

	function toggleSelectionMode() {
		showCheckboxes = !showCheckboxes;
		if (!showCheckboxes) {
			selectedEpisodes.clear();
		}
	}

	function clearSelection() {
		selectedEpisodes.clear();
	}

	function handleSeasonToggle(seasonId: string) {
		openSeasonId = openSeasonId === seasonId ? null : seasonId;
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
		commentsUrl?: string;
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
		for (const seasonData of seasons) {
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

	async function handleGrab(
		release: Release,
		streaming?: boolean
	): Promise<{ success: boolean; error?: string; errorCode?: string }> {
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
					guid: release.guid,
					downloadUrl: release.downloadUrl,
					magnetUrl: release.magnetUrl,
					infoHash: release.infoHash,
					title: release.title,
					indexerId: release.indexerId,
					indexerName: release.indexerName,
					protocol: release.protocol,
					seriesId: series.id,
					mediaType: 'tv',
					seasonNumber,
					episodeIds,
					streamUsenet: streaming && release.protocol === 'usenet',
					commentsUrl: release.commentsUrl
				})
			});

			const result = await response.json();

			// For streaming grabs, refresh the page since files are created instantly
			if (result.success && (release.protocol === 'streaming' || streaming)) {
				setTimeout(() => {
					void refreshSeriesFromApi();
				}, 500);
			}

			return { success: result.success, error: result.error, errorCode: result.errorCode };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : m.toast_library_tvDetail_failedToGrab()
			};
		}
	}

	// Get search title - just the series title, no episode token embedded
	// Season/episode info is passed separately and the backend handles format composition
	const searchTitle = $derived(() => {
		return series.title;
	});
</script>

<svelte:head>
	<title>{m.library_tvDetail_pageTitle({ title: series.title })}</title>
	<meta
		name="description"
		content={series.overview || m.library_tvDetail_metaDescription({ title: series.title })}
	/>
</svelte:head>

<div class="flex w-full flex-col gap-4 px-4 pb-20 md:gap-6 md:overflow-x-hidden md:px-6 lg:px-8">
	<div class="flex flex-col gap-2">
		<!-- Monitoring Status Banner -->
		<div
			class="rounded-lg px-3 py-2 text-sm font-medium text-base-100 md:px-4 md:py-3 {series.monitored
				? 'bg-success/80'
				: 'bg-error/80'}"
		>
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					{#if series.monitored}
						{m.library_tvDetail_monitoringEnabled()}
					{:else}
						<div>
							{m.library_tvDetail_monitoringDisabled()}
							<span class="block text-xs font-normal text-base-100/90">
								{m.library_tvDetail_monitoringDisabledHint()}
							</span>
						</div>
					{/if}
				</div>
				<div class="hidden shrink-0 items-center lg:flex">
					{#if sse.isConnected}
						<span
							class="inline-flex items-center gap-1 rounded-full border border-success/70 bg-success/90 px-2.5 py-1 text-xs font-medium text-success-content shadow-sm"
						>
							<Wifi class="h-3 w-3" />
							{m.library_tvDetail_sseLive()}
						</span>
					{:else if sse.status === 'error'}
						<span
							class="inline-flex items-center gap-1 rounded-full border border-warning/70 bg-warning/90 px-2.5 py-1 text-xs font-medium text-warning-content shadow-sm"
						>
							<Loader2 class="h-3 w-3 animate-spin" />
							{m.library_tvDetail_sseReconnecting()}
						</span>
					{:else if sse.status === 'connecting'}
						<span
							class="inline-flex items-center gap-1 rounded-full border border-info/70 bg-info/90 px-2.5 py-1 text-xs font-medium text-info-content shadow-sm"
						>
							<Loader2 class="h-3 w-3 animate-spin" />
							{m.library_tvDetail_sseConnecting()}
						</span>
					{:else}
						<span
							class="inline-flex items-center gap-1 rounded-full border border-base-100/35 bg-base-100/20 px-2.5 py-1 text-xs font-medium text-base-100 shadow-sm"
						>
							<WifiOff class="h-3 w-3" />
							{m.library_tvDetail_sseOffline()}
						</span>
					{/if}
				</div>
			</div>
		</div>
	</div>
	<!-- Header -->
	<LibrarySeriesHeader
		series={seriesForDisplay}
		totalSize={totalSeriesSize}
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
		onImport={handleImport}
		onEdit={handleEdit}
		onDelete={handleDelete}
		onRefresh={handleRefresh}
	/>

	<!-- Main Content -->
	<div class="grid gap-4 lg:grid-cols-2 lg:gap-6 xl:grid-cols-3">
		<!-- Seasons (takes 2 columns) -->
		<div class="min-w-0 space-y-4 md:col-span-2 lg:col-span-2">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold">{m.library_tvDetail_seasonsHeading()}</h2>
				<div class="flex gap-1">
					{#if !isStreamerProfile && syncableSubtitles.length > 0}
						<button class="btn gap-1 btn-ghost btn-sm" onclick={handleSubtitleSync}>
							<RefreshCw class="h-4 w-4" />
							{m.library_tvDetail_syncSubtitles()}
						</button>
					{/if}
					<button
						class="btn gap-1 btn-ghost btn-sm"
						onclick={() => (isRenameModalOpen = true)}
						title={m.library_tvDetail_renameFilesTitle()}
					>
						<FileEdit class="h-4 w-4" />
						{m.library_tvDetail_rename()}
					</button>
					<button
						class="btn gap-2 btn-ghost btn-sm"
						onclick={toggleSelectionMode}
						title={showCheckboxes
							? m.library_tvDetail_exitSelectionMode()
							: m.library_tvDetail_selectEpisodes()}
					>
						<CheckSquare size={16} />
						{showCheckboxes ? m.library_tvDetail_done() : m.library_tvDetail_select()}
					</button>
				</div>
			</div>

			{#if seasons.length === 0}
				<div class="rounded-xl bg-base-200 p-8 text-center text-base-content/60">
					{m.library_tvDetail_noSeasonsFound()}
				</div>
			{:else}
				{#each seasons as season (season.id)}
					<SeasonAccordion
						{season}
						seriesMonitored={series.monitored ?? false}
						{isStreamerProfile}
						wantsSubtitles={series.wantsSubtitles ?? false}
						defaultOpen={openSeasonId === season.id}
						{selectedEpisodes}
						{showCheckboxes}
						{downloadingEpisodeIds}
						{downloadingSeasons}
						autoSearchingSeason={autoSearchingSeasons.has(season.id)}
						autoSearchSeasonResult={autoSearchSeasonResults.get(season.id) ?? null}
						{autoSearchingEpisodes}
						{autoSearchEpisodeResults}
						{subtitleAutoSearchingEpisodes}
						{subtitleSyncingId}
						{subtitleDeletingId}
						onToggleOpen={handleSeasonToggle}
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
						onSubtitleSync={isStreamerProfile ? undefined : handleSubtitleSyncFromPopover}
						onSubtitleDelete={handleSubtitleDeleteFromPopover}
						onSeasonDelete={handleSeasonDelete}
						onEpisodeDelete={handleEpisodeDelete}
					/>
				{/each}
			{/if}
		</div>

		<!-- Sidebar -->
		<TVSeriesSidebar series={seriesForDisplay} />
	</div>
</div>

<!-- Bulk Action Bar -->
<BulkActionBar
	{selectedCount}
	searching={autoSearchingEpisodes.size > 0}
	subtitleAutoSearching={bulkSubtitleAutoSearching}
	subtitleSyncing={bulkSubtitleSyncing}
	onSearch={handleBulkAutoSearch}
	onClear={clearSelection}
	onSubtitleAutoSearch={handleBulkSubtitleAutoSearch}
	onSubtitleSync={isStreamerProfile ? undefined : handleBulkSubtitleSyncSelected}
/>

<!-- Edit Modal -->
<SeriesEditModal
	open={isEditModalOpen}
	{series}
	qualityProfiles={data.qualityProfiles}
	rootFolders={data.rootFolders}
	saving={isSaving}
	onClose={handleEditClose}
	onSave={handleEditSave}
/>

<!-- Search Modal -->
<InteractiveSearchModal
	open={isSearchModalOpen}
	title={searchTitle()}
	tmdbId={series.tmdbId}
	imdbId={series.imdbId}
	tvdbId={series.tvdbId}
	expectedEpisodeCount={series.episodeCount}
	year={series.year}
	mediaType="tv"
	scoringProfileId={effectiveScoringProfileId ?? undefined}
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

<SubtitleSyncModal
	open={isSubtitleSyncModalOpen}
	title={series.title}
	subtitles={syncableSubtitles.map((subtitle) => ({
		id: subtitle.id,
		language: subtitle.language ?? 'unknown',
		format: subtitle.format,
		isForced: subtitle.isForced,
		isHearingImpaired: subtitle.isHearingImpaired,
		matchScore: (subtitle as { matchScore?: number | null }).matchScore,
		dateAdded: (subtitle as { dateAdded?: string | null }).dateAdded,
		wasSynced: subtitle.wasSynced,
		syncOffset: subtitle.syncOffset,
		label: subtitle.label
	}))}
	{syncingSubtitleId}
	errorMessage={subtitleSyncError}
	onClose={() => {
		isSubtitleSyncModalOpen = false;
		subtitleSyncError = null;
	}}
	onSync={handleSubtitleResync}
	onBulkSync={handleBulkSubtitleSync}
/>

<!-- Rename Preview Modal -->
<RenamePreviewModal
	open={isRenameModalOpen}
	mediaType="tv"
	mediaId={series.id}
	mediaTitle={series.title}
	onClose={() => (isRenameModalOpen = false)}
	onRenamed={() => {
		void refreshSeriesFromApi();
	}}
/>

<!-- Delete Confirmation Modal -->
<DeleteConfirmationModal
	open={isDeleteModalOpen}
	title={m.library_tvDetail_deleteSeriesTitle()}
	itemName={series.title}
	hasFiles={(series.episodeFileCount ?? 0) > 0}
	hasActiveDownload={queueItems.length > 0}
	loading={isDeleting}
	onConfirm={performDelete}
	onCancel={() => (isDeleteModalOpen = false)}
/>

<!-- Season Delete Confirmation Modal -->
<DeleteConfirmationModal
	open={isSeasonDeleteModalOpen}
	title={m.library_tvDetail_deleteSeasonTitle()}
	itemName={deletingSeasonName}
	allowRemoveFromLibrary={false}
	hasFiles={deletingSeasonHasFiles}
	loading={isDeletingSeason}
	onConfirm={performSeasonDelete}
	onCancel={() => (isSeasonDeleteModalOpen = false)}
/>

<!-- Episode Delete Confirmation Modal -->
<DeleteConfirmationModal
	open={isEpisodeDeleteModalOpen}
	title={m.library_tvDetail_deleteEpisodeTitle()}
	itemName={deletingEpisodeName}
	allowRemoveFromLibrary={false}
	hasFiles={deletingEpisodeHasFiles}
	loading={isDeletingEpisode}
	onConfirm={performEpisodeDelete}
	onCancel={() => (isEpisodeDeleteModalOpen = false)}
/>
