<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { ConfirmationModal } from '$lib/components/ui/modal';
	import { resolvePath } from '$lib/utils/routing';
	import { getResponseErrorMessage, readResponsePayload } from '$lib/utils/http';
	import { sortRootFoldersForMediaType } from '$lib/utils/root-folders.js';
	import { isLikelyAnimeMedia } from '$lib/shared/anime-classification.js';
	import { toasts } from '$lib/stores/toast.svelte';
	import {
		ArrowUp,
		Check,
		ChevronRight,
		Clapperboard,
		FileVideo,
		Folder,
		Home,
		Loader2,
		Search,
		Sparkles,
		Tv,
		X
	} from 'lucide-svelte';

	type MediaType = 'movie' | 'tv';

	interface BrowseEntry {
		name: string;
		path: string;
		isDirectory: boolean;
		size?: number;
	}

	interface RootFolder {
		id: string;
		name: string;
		path: string;
		mediaType: string;
		mediaSubType?: string | null;
		isDefault?: boolean;
		readOnly?: boolean;
	}

	interface DestinationLibrary {
		id: string;
		name: string;
		slug: string;
		mediaType: MediaType;
		mediaSubType?: string | null;
		isDefault?: boolean;
		defaultRootFolderId?: string | null;
		defaultRootFolderPath?: string | null;
	}

	interface MatchResult {
		tmdbId: number;
		title: string;
		year?: number;
		mediaType: MediaType;
		isAnime?: boolean;
		confidence: number;
		inLibrary: boolean;
		libraryId?: string;
		rootFolderId?: string | null;
		rootFolderPath?: string | null;
	}

	interface DetectionGroup {
		id: string;
		displayName: string;
		sourceType: 'file' | 'folder';
		sourcePath: string;
		selectedFilePath: string;
		fileName: string;
		detectedFileCount: number;
		detectedSeasons?: number[];
		suggestedSeason?: number;
		parsedTitle: string;
		parsedYear?: number;
		parsedSeason?: number;
		parsedEpisode?: number;
		inferredMediaType: MediaType;
		matches: MatchResult[];
	}

	interface DetectionResult extends DetectionGroup {
		grouped: boolean;
		totalGroups: number;
		selectedGroupId: string;
		groups: DetectionGroup[];
	}

	interface GroupReviewState {
		selectedMediaType: MediaType;
		selectedMatch: MatchResult | null;
		searchQuery: string;
		matchCandidates: MatchResult[];
		importTarget: 'new' | 'existing';
		seasonNumber: number;
		episodeNumber: number;
		batchSeasonOverride: number | null;
		selectedRootFolder: string;
	}

	interface ExecuteResult {
		success: boolean;
		mediaType: MediaType;
		tmdbId: number;
		libraryId: string;
		importedPath: string;
		importedCount?: number;
		importedPaths?: string[];
	}

	interface ImportRouteContext {
		mediaType: MediaType;
		tmdbId: number;
		libraryId: string | null;
		title: string | null;
		year: number | null;
	}

	interface PendingNavigation {
		href: string;
		external: boolean;
	}

	type QueueMediaFilter = 'all' | MediaType;

	interface DetectionSection {
		id: string;
		label: string;
		mediaType: MediaType;
		items: DetectionGroup[];
		seasonSections?: TvSeasonSection[];
	}

	interface TvSeasonSection {
		key: string;
		label: string;
		seasonNumber: number | null;
		items: DetectionGroup[];
	}

	type WizardStep = 1 | 2 | 3 | 4;

	let step = $state<WizardStep>(1);
	let preferredMediaType = $state<'auto' | MediaType>('auto');

	let sourcePath = $state('/');
	let browserPath = $state('/');
	let browserEntries = $state<BrowseEntry[]>([]);
	let browserParentPath = $state<string | null>(null);
	let browserLoading = $state(false);
	let browserError = $state<string | null>(null);

	let rootFolders = $state<RootFolder[]>([]);
	let destinationLibraries = $state<DestinationLibrary[]>([]);
	let loadingRootFolders = $state(true);
	let enforceAnimeSubtype = $state(false);

	let detecting = $state(false);
	let detection = $state<DetectionResult | null>(null);
	let selectedGroupId = $state<string | null>(null);
	let importedGroupIds = $state<string[]>([]);
	let skippedGroupIds = $state<string[]>([]);
	let showSelectedItemEditor = $state(false);
	let groupReviewState = $state<Record<string, GroupReviewState>>({});
	let detectedGroupQuery = $state('');
	let detectedGroupFilter = $state<'all' | 'pending' | 'ready' | 'imported' | 'skipped'>('pending');
	let detectedMediaFilter = $state<QueueMediaFilter>('all');
	let importMediaFilter = $state<QueueMediaFilter>('all');
	let reviewSelectedSeriesSectionId = $state<string | null>(null);
	let reviewSelectedSeasonSectionKey = $state<string | null>(null);
	let importSelectedSeriesSectionId = $state<string | null>(null);
	let importSelectedSeasonSectionKey = $state<string | null>(null);
	let tmdbSearchDebounce: ReturnType<typeof setTimeout> | null = null;

	let selectedMediaType = $state<MediaType>('movie');
	let selectedMatch = $state<MatchResult | null>(null);
	let searchQuery = $state('');
	let searchingMatches = $state(false);
	let matchCandidates = $state<MatchResult[]>([]);
	let importTarget = $state<'new' | 'existing'>('new');
	let applySelectedMatchToSeasonOnSelect = $state(false);

	let seasonNumber = $state(1);
	let episodeNumber = $state(1);
	let batchSeasonOverride = $state<number | null>(null);
	let selectedRootFolder = $state('');
	let bulkDestinationBySectionId = $state<Record<string, string>>({});
	let executingImport = $state(false);
	let executeResult = $state<ExecuteResult | null>(null);
	let executeError = $state<string | null>(null);
	let bulkImportSummary = $state<{ importedGroups: number; failedGroups: number } | null>(null);
	let bypassNavigationGuard = false;
	let leaveImportModalOpen = $state(false);
	let pendingNavigation = $state<PendingNavigation | null>(null);
	let lastNewSessionToken = $state<string | null>(null);
	const routeImportContext = $derived.by(() => parseImportContext($page.url.searchParams));
	const isDirectLibraryImportContext = $derived.by(() => Boolean(routeImportContext?.libraryId));
	const isMediaTypeLockedByContext = $derived.by(() => Boolean(routeImportContext));
	const isFileOnlyContext = $derived.by(() =>
		Boolean(
			routeImportContext && routeImportContext.mediaType === 'movie' && routeImportContext.libraryId
		)
	);

	const detectionGroups = $derived.by(() => {
		if (!detection) return [];
		if (Array.isArray(detection.groups) && detection.groups.length > 0) {
			return detection.groups;
		}
		return [toDetectionGroup(detection)];
	});

	const activeGroup = $derived.by(() => {
		if (detectionGroups.length === 0) return null;
		if (!selectedGroupId) return detectionGroups[0];
		return detectionGroups.find((group) => group.id === selectedGroupId) ?? detectionGroups[0];
	});
	const isSingleFileSelection = $derived.by(() =>
		Boolean(activeGroup && detectionGroups.length === 1 && activeGroup.sourceType === 'file')
	);
	const skipActionsEnabled = $derived.by(() => !isSingleFileSelection);
	const selectedMatchContextMismatch = $derived.by(() => {
		const context = routeImportContext;
		if (!context || !selectedMatch) {
			return false;
		}
		return selectedMatch.mediaType === context.mediaType && selectedMatch.tmdbId !== context.tmdbId;
	});
	const parsedSourceContextMismatch = $derived.by(() => {
		const context = routeImportContext;
		const group = activeGroup;
		if (!context || !group || !context.title) {
			return false;
		}

		const normalizedParsedTitle = normalizeTitleForComparison(group.parsedTitle || '');
		const normalizedContextTitle = normalizeTitleForComparison(context.title);
		if (!normalizedParsedTitle || !normalizedContextTitle) {
			return false;
		}

		if (normalizedParsedTitle !== normalizedContextTitle) {
			return true;
		}

		if (context.year && group.parsedYear && Math.abs(context.year - group.parsedYear) > 1) {
			return true;
		}

		return false;
	});

	const isActiveGroupImported = $derived.by(() =>
		Boolean(activeGroup && importedGroupIds.includes(activeGroup.id))
	);
	const step2Ready = $derived(Boolean(activeGroup && selectedMatch && !isActiveGroupImported));
	const destinationLibrariesForType = $derived(
		getAvailableDestinationLibrariesForType(selectedMediaType, selectedMatch)
	);
	const isBatchTvImport = $derived(
		Boolean(activeGroup && selectedMediaType === 'tv' && activeGroup.detectedFileCount > 1)
	);
	const remainingGroupCount = $derived.by(
		() =>
			detectionGroups.filter(
				(group) => !importedGroupIds.includes(group.id) && !skippedGroupIds.includes(group.id)
			).length
	);
	const pendingGroupCount = $derived.by(
		() =>
			detectionGroups.filter(
				(group) =>
					!importedGroupIds.includes(group.id) &&
					!skippedGroupIds.includes(group.id) &&
					!canImportGroup(group)
			).length
	);
	const skippedGroupCount = $derived.by(
		() => detectionGroups.filter((group) => skippedGroupIds.includes(group.id)).length
	);
	const readyGroupCount = $derived.by(
		() =>
			detectionGroups.filter(
				(group) =>
					!importedGroupIds.includes(group.id) &&
					!skippedGroupIds.includes(group.id) &&
					canImportGroup(group)
			).length
	);
	const isMultiGroupReview = $derived(detectionGroups.length > 1);
	const selectedImportGroupCount = $derived.by(
		() =>
			detectionGroups.filter(
				(group) => !importedGroupIds.includes(group.id) && !skippedGroupIds.includes(group.id)
			).length
	);
	const selectedNeedsInputCount = $derived.by(
		() =>
			detectionGroups.filter(
				(group) =>
					!importedGroupIds.includes(group.id) &&
					!skippedGroupIds.includes(group.id) &&
					!canImportGroup(group)
			).length
	);
	const canProceedFromReview = $derived.by(() => {
		if (isMultiGroupReview) {
			return selectedImportGroupCount > 0;
		}
		return step2Ready && !isGroupSkipped(activeGroup?.id ?? '');
	});
	const filteredDetectionGroups = $derived.by(() => {
		const query = detectedGroupQuery.trim().toLowerCase();

		const filtered = detectionGroups.filter((group) => {
			const isImported = importedGroupIds.includes(group.id);
			const isSkipped = skippedGroupIds.includes(group.id);
			const isRemaining = !isImported && !isSkipped;
			const isReady = isRemaining && canImportGroup(group);
			const isPending = isRemaining && !isReady;

			if (detectedGroupFilter === 'imported' && !isImported) return false;
			if (detectedGroupFilter === 'skipped' && !isSkipped) return false;
			if (detectedGroupFilter === 'pending' && !isPending) return false;
			if (detectedGroupFilter === 'ready' && !isReady) return false;

			if (!query) return true;

			return (
				group.displayName.toLowerCase().includes(query) ||
				group.sourcePath.toLowerCase().includes(query) ||
				group.parsedTitle.toLowerCase().includes(query)
			);
		});

		return filtered.sort(
			(a, b) =>
				a.displayName.localeCompare(b.displayName, undefined, { numeric: true }) ||
				a.id.localeCompare(b.id, undefined, { numeric: true })
		);
	});
	const filteredDetectionGroupsByMedia = $derived.by(() =>
		filteredDetectionGroups.filter((group) => {
			if (detectedMediaFilter === 'all') {
				return true;
			}
			return getEffectiveMediaType(group) === detectedMediaFilter;
		})
	);
	const reviewDetectionSections = $derived.by(() =>
		buildDetectionSections(filteredDetectionGroupsByMedia)
	);
	const selectedImportGroups = $derived.by(() =>
		detectionGroups.filter((group) => !isGroupImported(group.id) && !isGroupSkipped(group.id))
	);
	const selectedImportGroupsByMedia = $derived.by(() =>
		selectedImportGroups.filter((group) => {
			if (importMediaFilter === 'all') {
				return true;
			}
			return getEffectiveMediaType(group) === importMediaFilter;
		})
	);
	const importSelectionSections = $derived.by(() =>
		buildDetectionSections(selectedImportGroupsByMedia)
	);
	const reviewMovieSections = $derived.by(() =>
		reviewDetectionSections.filter((section) => section.mediaType === 'movie')
	);
	const reviewTvSections = $derived.by(() =>
		reviewDetectionSections.filter((section) => section.mediaType === 'tv')
	);
	const activeReviewTvSection = $derived.by(() => {
		if (reviewTvSections.length === 0) return null;
		if (!reviewSelectedSeriesSectionId) return reviewTvSections[0];
		return (
			reviewTvSections.find((section) => section.id === reviewSelectedSeriesSectionId) ??
			reviewTvSections[0]
		);
	});
	const activeReviewSeasonSection = $derived.by(() => {
		if (!activeReviewTvSection?.seasonSections || activeReviewTvSection.seasonSections.length === 0)
			return null;
		if (!reviewSelectedSeasonSectionKey) {
			return activeReviewTvSection.seasonSections[0];
		}
		return (
			activeReviewTvSection.seasonSections.find(
				(seasonSection) => seasonSection.key === reviewSelectedSeasonSectionKey
			) ?? activeReviewTvSection.seasonSections[0]
		);
	});
	const canApplyMatchSelectionToActiveSeason = $derived.by(() =>
		Boolean(
			selectedMediaType === 'tv' &&
			activeReviewSeasonSection &&
			getSkippableSeasonGroups(activeReviewSeasonSection).length > 0
		)
	);
	const hasMultipleReviewTvSeries = $derived.by(() => reviewTvSections.length > 1);

	const importMovieSections = $derived.by(() =>
		importSelectionSections.filter((section) => section.mediaType === 'movie')
	);
	const importTvSections = $derived.by(() =>
		importSelectionSections.filter((section) => section.mediaType === 'tv')
	);
	const activeImportTvSection = $derived.by(() => {
		if (importTvSections.length === 0) return null;
		if (!importSelectedSeriesSectionId) return importTvSections[0];
		return (
			importTvSections.find((section) => section.id === importSelectedSeriesSectionId) ??
			importTvSections[0]
		);
	});
	const activeImportSeasonSection = $derived.by(() => {
		if (!activeImportTvSection?.seasonSections || activeImportTvSection.seasonSections.length === 0)
			return null;
		if (!importSelectedSeasonSectionKey) {
			return activeImportTvSection.seasonSections[0];
		}
		return (
			activeImportTvSection.seasonSections.find(
				(seasonSection) => seasonSection.key === importSelectedSeasonSectionKey
			) ?? activeImportTvSection.seasonSections[0]
		);
	});
	const hasMultipleImportTvSeries = $derived.by(() => importTvSections.length > 1);

	const canProceedToImport = $derived.by(() => {
		if (
			!selectedMatch ||
			!activeGroup ||
			isActiveGroupImported ||
			skippedGroupIds.includes(activeGroup.id)
		)
			return false;
		if (!isBatchTvImport && selectedMediaType === 'tv' && (seasonNumber < 0 || episodeNumber < 1))
			return false;
		if (selectedMatch.inLibrary && importTarget !== 'existing') return false;

		if (importTarget === 'existing') {
			return selectedMatch.inLibrary;
		}

		if (destinationLibrariesForType.length === 0) return false;
		if (destinationLibrariesForType.length === 1) return true;
		return selectedRootFolder.length > 0;
	});
	const hasActiveImportSession = $derived.by(
		() => Boolean(detection) && (step === 2 || step === 3 || executingImport)
	);

	beforeNavigate((navigation) => {
		if (bypassNavigationGuard || !hasActiveImportSession) {
			return;
		}
		if (navigation.willUnload) {
			return;
		}

		const destinationUrl = navigation.to?.url;
		if (destinationUrl && destinationUrl.href === $page.url.href) {
			return;
		}

		if (destinationUrl) {
			pendingNavigation = {
				href: destinationUrl.href,
				external: destinationUrl.origin !== window.location.origin
			};
			leaveImportModalOpen = true;
		}
		navigation.cancel();
	});

	$effect(() => {
		loadRootFolders();
		browse('/');
	});

	$effect(() => {
		const context = routeImportContext;
		if (!context) return;
		if (preferredMediaType !== context.mediaType) {
			preferredMediaType = context.mediaType;
		}
	});

	$effect(() => {
		const newSessionToken = $page.url.searchParams.get('newSession');
		if (!newSessionToken || newSessionToken === lastNewSessionToken) {
			return;
		}
		lastNewSessionToken = newSessionToken;
		resetWizard();
	});

	$effect(() => {
		let nextRootFolder = selectedRootFolder;
		if (destinationLibrariesForType.length === 0) {
			nextRootFolder = '';
		} else if (!destinationLibrariesForType.some((library) => library.id === selectedRootFolder)) {
			nextRootFolder =
				getRecommendedDestinationLibraryId(destinationLibrariesForType, {
					preferAnime: selectedMatch?.isAnime === true
				}) ?? '';
		}

		if (nextRootFolder !== selectedRootFolder) {
			selectedRootFolder = nextRootFolder;
			persistActiveGroupState();
		}
	});

	$effect(() => {
		if (!detection || detectionGroups.length === 0) return;
		if (Object.keys(groupReviewState).length === 0) return;

		let updated = false;
		const nextState: Record<string, GroupReviewState> = { ...groupReviewState };

		for (const group of detectionGroups) {
			const state = nextState[group.id];
			if (!state) continue;

			const libraries = getAvailableDestinationLibrariesForType(
				state.selectedMediaType,
				state.selectedMatch
			);
			const hasValidSelection =
				state.selectedRootFolder.length > 0 &&
				libraries.some((library) => library.id === state.selectedRootFolder);
			const recommendedRootFolder =
				getRecommendedDestinationLibraryId(libraries, {
					preferAnime: state.selectedMatch?.isAnime === true
				}) ?? '';

			if (!hasValidSelection && state.selectedRootFolder !== recommendedRootFolder) {
				nextState[group.id] = {
					...state,
					selectedRootFolder: recommendedRootFolder
				};
				updated = true;
			}
		}

		if (updated) {
			groupReviewState = nextState;
			if (selectedGroupId && nextState[selectedGroupId]) {
				selectedRootFolder = nextState[selectedGroupId].selectedRootFolder;
			}
		}
	});

	$effect(() => {
		if (!selectedMatch) {
			return;
		}

		const nextImportTarget = selectedMatch.inLibrary
			? 'existing'
			: importTarget === 'existing'
				? 'new'
				: importTarget;
		if (nextImportTarget !== importTarget) {
			importTarget = nextImportTarget;
			persistActiveGroupState();
		}
	});

	$effect(() => {
		if (step !== 2) {
			return;
		}
		if (reviewTvSections.length === 0) {
			reviewSelectedSeriesSectionId = null;
			reviewSelectedSeasonSectionKey = null;
			return;
		}

		if (!reviewTvSections.some((section) => section.id === reviewSelectedSeriesSectionId)) {
			reviewSelectedSeriesSectionId = reviewTvSections[0].id;
			reviewSelectedSeasonSectionKey = null;
		}
	});

	$effect(() => {
		if (!canApplyMatchSelectionToActiveSeason) {
			applySelectedMatchToSeasonOnSelect = false;
		}
	});

	$effect(() => {
		if (step !== 2) {
			return;
		}
		const activeSection = activeReviewTvSection;
		if (
			!activeSection ||
			!activeSection.seasonSections ||
			activeSection.seasonSections.length === 0
		) {
			reviewSelectedSeasonSectionKey = null;
			return;
		}
		if (
			!reviewSelectedSeasonSectionKey ||
			!activeSection.seasonSections.some(
				(seasonSection) => seasonSection.key === reviewSelectedSeasonSectionKey
			)
		) {
			reviewSelectedSeasonSectionKey = activeSection.seasonSections[0].key;
		}
	});

	$effect(() => {
		if (step !== 3) {
			return;
		}
		if (importTvSections.length === 0) {
			importSelectedSeriesSectionId = null;
			importSelectedSeasonSectionKey = null;
			return;
		}
		if (!importTvSections.some((section) => section.id === importSelectedSeriesSectionId)) {
			importSelectedSeriesSectionId = importTvSections[0].id;
			importSelectedSeasonSectionKey = null;
		}
	});

	$effect(() => {
		if (step !== 3) {
			return;
		}

		const nextSelections = { ...bulkDestinationBySectionId };
		let changed = false;

		for (const section of importSelectionSections) {
			const options = getSectionDestinationOptions(section);
			if (options.length === 0) {
				if (nextSelections[section.id]) {
					delete nextSelections[section.id];
					changed = true;
				}
				continue;
			}

			const current = nextSelections[section.id];
			if (!current || !options.some((folder) => folder.id === current)) {
				nextSelections[section.id] = getRecommendedSectionDestinationId(section, options);
				changed = true;
			}
		}

		if (changed) {
			bulkDestinationBySectionId = nextSelections;
		}
	});

	$effect(() => {
		if (step !== 3) {
			return;
		}
		const activeSection = activeImportTvSection;
		if (
			!activeSection ||
			!activeSection.seasonSections ||
			activeSection.seasonSections.length === 0
		) {
			importSelectedSeasonSectionKey = null;
			return;
		}
		if (
			!importSelectedSeasonSectionKey ||
			!activeSection.seasonSections.some(
				(seasonSection) => seasonSection.key === importSelectedSeasonSectionKey
			)
		) {
			importSelectedSeasonSectionKey = activeSection.seasonSections[0].key;
		}
	});

	$effect(() => {
		if (step !== 2) {
			return;
		}
		if (detectedGroupFilter !== 'pending') {
			return;
		}
		if (pendingGroupCount === 0 && readyGroupCount > 0) {
			detectedGroupFilter = 'ready';
		}
	});

	async function loadRootFolders() {
		loadingRootFolders = true;
		try {
			const [foldersResponse, classificationResponse, librariesResponse] = await Promise.all([
				fetch('/api/root-folders'),
				fetch('/api/settings/library/classification'),
				fetch('/api/libraries?includeSystem=true')
			]);

			const foldersPayload = await readResponsePayload<RootFolder[] | { folders?: RootFolder[] }>(
				foldersResponse
			);
			const classificationPayload = await readResponsePayload<{
				enforceAnimeSubtype?: boolean;
			}>(classificationResponse);
			const librariesPayload = await readResponsePayload<{
				libraries?: DestinationLibrary[];
			}>(librariesResponse);

			if (!foldersResponse.ok) {
				throw new Error(getResponseErrorMessage(foldersPayload, 'Failed to load root folders'));
			}
			if (Array.isArray(foldersPayload)) {
				rootFolders = foldersPayload;
			} else if (foldersPayload && typeof foldersPayload === 'object') {
				rootFolders = foldersPayload.folders ?? [];
			} else {
				rootFolders = [];
			}

			enforceAnimeSubtype = Boolean(
				classificationResponse.ok &&
				classificationPayload &&
				typeof classificationPayload === 'object' &&
				classificationPayload.enforceAnimeSubtype === true
			);

			if (
				librariesResponse.ok &&
				librariesPayload &&
				typeof librariesPayload === 'object' &&
				Array.isArray(librariesPayload.libraries)
			) {
				destinationLibraries = librariesPayload.libraries;
			} else {
				destinationLibraries = [];
			}
		} catch {
			toasts.error(m.toast_library_import_failedToLoadRootFolders());
		} finally {
			loadingRootFolders = false;
		}
	}

	async function browse(path?: string) {
		browserLoading = true;
		browserError = null;
		try {
			const query = new URLSearchParams({
				includeFiles: 'true',
				fileFilter: 'video',
				excludeManagedRoots: 'true',
				...(path ? { path } : {})
			});
			const response = await fetch(`/api/filesystem/browse?${query.toString()}`);
			const payload = await readResponsePayload<{
				currentPath?: string;
				parentPath?: string | null;
				entries?: BrowseEntry[];
				error?: string;
			}>(response);
			if (!response.ok) {
				browserError = getResponseErrorMessage(payload, 'Failed to browse path');
				return;
			}
			if (!payload || typeof payload !== 'object') {
				browserError = 'Invalid response from filesystem browser';
				return;
			}
			if (payload.error) {
				browserError = payload.error;
			}
			browserPath = payload.currentPath ?? path ?? '';
			if (!sourcePath && payload.currentPath) {
				sourcePath = payload.currentPath;
			}
			browserParentPath = payload.parentPath ?? null;
			browserEntries = payload.entries ?? [];
		} catch (error) {
			browserError = error instanceof Error ? error.message : 'Failed to browse path';
		} finally {
			browserLoading = false;
		}
	}

	function formatSize(bytes?: number) {
		if (!bytes) return '';
		const gb = bytes / (1024 * 1024 * 1024);
		if (gb >= 1) {
			return `${gb.toFixed(2)} GB`;
		}
		const mb = bytes / (1024 * 1024);
		return `${mb.toFixed(1)} MB`;
	}

	function parseImportContext(searchParams: URLSearchParams): ImportRouteContext | null {
		const mediaType = searchParams.get('mediaType');
		if (mediaType !== 'movie' && mediaType !== 'tv') {
			return null;
		}

		const tmdbIdRaw = searchParams.get('tmdbId');
		const tmdbId = tmdbIdRaw ? Number.parseInt(tmdbIdRaw, 10) : Number.NaN;
		if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
			return null;
		}

		const libraryIdValue = searchParams.get('libraryId');
		const titleValue = searchParams.get('title');
		const yearRaw = searchParams.get('year');
		let parsedYear: number | null = null;
		if (yearRaw) {
			const year = Number.parseInt(yearRaw, 10);
			if (Number.isFinite(year) && year > 0) {
				parsedYear = year;
			}
		}

		return {
			mediaType,
			tmdbId,
			libraryId: libraryIdValue?.trim() || null,
			title: titleValue?.trim() || null,
			year: parsedYear
		};
	}

	function buildRouteContextMatch(group: DetectionGroup): MatchResult | null {
		const context = routeImportContext;
		if (!context) return null;

		return {
			tmdbId: context.tmdbId,
			title: context.title || group.parsedTitle || group.displayName,
			year: context.year ?? group.parsedYear,
			mediaType: context.mediaType,
			confidence: 1,
			inLibrary: Boolean(context.libraryId),
			libraryId: context.libraryId ?? undefined
		} satisfies MatchResult;
	}

	function toDetectionGroup(result: DetectionResult): DetectionGroup {
		return {
			id: result.id || result.sourcePath,
			displayName: result.displayName || result.fileName,
			sourceType: result.sourceType || 'file',
			sourcePath: result.sourcePath,
			selectedFilePath: result.selectedFilePath,
			fileName: result.fileName,
			detectedFileCount: result.detectedFileCount,
			detectedSeasons: result.detectedSeasons,
			suggestedSeason: result.suggestedSeason,
			parsedTitle: result.parsedTitle,
			parsedYear: result.parsedYear,
			parsedSeason: result.parsedSeason,
			parsedEpisode: result.parsedEpisode,
			inferredMediaType: result.inferredMediaType,
			matches: result.matches ?? []
		};
	}

	function createInitialGroupState(group: DetectionGroup): GroupReviewState {
		const initialCandidates = group.matches ?? [];
		const initialMatch = initialCandidates[0] ?? null;
		const initialRootFolder = getRecommendedDestinationLibraryId(
			getAvailableDestinationLibrariesForType(group.inferredMediaType, initialMatch),
			{
				preferAnime: initialMatch?.isAnime === true
			}
		);
		return {
			selectedMediaType: group.inferredMediaType,
			selectedMatch: initialMatch,
			searchQuery: group.parsedTitle,
			matchCandidates: initialCandidates,
			importTarget: initialMatch?.inLibrary ? 'existing' : 'new',
			seasonNumber: group.parsedSeason ?? 1,
			episodeNumber: group.parsedEpisode ?? 1,
			batchSeasonOverride: group.suggestedSeason ?? null,
			selectedRootFolder: initialRootFolder ?? ''
		};
	}

	function loadGroupState(groupId: string) {
		const existing = groupReviewState[groupId];
		const group = detectionGroups.find((item) => item.id === groupId);
		const state = existing ?? (group ? createInitialGroupState(group) : null);
		if (!state) return;

		if (!existing) {
			groupReviewState = {
				...groupReviewState,
				[groupId]: state
			};
		}

		selectedMediaType = state.selectedMediaType;
		selectedMatch = state.selectedMatch;
		searchQuery = state.searchQuery;
		matchCandidates = state.matchCandidates;
		importTarget = state.importTarget;
		seasonNumber = state.seasonNumber;
		episodeNumber = state.episodeNumber;
		batchSeasonOverride = state.batchSeasonOverride;
		selectedRootFolder = state.selectedRootFolder;
	}

	function persistActiveGroupState() {
		if (!selectedGroupId) return;
		groupReviewState = {
			...groupReviewState,
			[selectedGroupId]: {
				selectedMediaType,
				selectedMatch,
				searchQuery,
				matchCandidates,
				importTarget,
				seasonNumber,
				episodeNumber,
				batchSeasonOverride,
				selectedRootFolder
			}
		};
	}

	function handleSeasonNumberChange() {
		if (!selectedGroupId) {
			return;
		}

		const group = detectionGroups.find((item) => item.id === selectedGroupId);
		if (!group) {
			persistActiveGroupState();
			return;
		}

		let nextBatchSeasonOverride = batchSeasonOverride;
		if (selectedMediaType === 'tv' && !isBatchTvImport && typeof group.parsedSeason !== 'number') {
			nextBatchSeasonOverride = seasonNumber >= 0 ? seasonNumber : null;
			batchSeasonOverride = nextBatchSeasonOverride;
		}

		groupReviewState = {
			...groupReviewState,
			[selectedGroupId]: {
				selectedMediaType,
				selectedMatch,
				searchQuery,
				matchCandidates,
				importTarget,
				seasonNumber,
				episodeNumber,
				batchSeasonOverride: nextBatchSeasonOverride,
				selectedRootFolder
			}
		};
	}

	function canApplyActiveSeasonOverride(): boolean {
		if (!activeGroup) return false;
		if (selectedMediaType !== 'tv' || isBatchTvImport) return false;
		return typeof activeGroup.parsedSeason !== 'number';
	}

	function shouldPreserveSelectedItemEditor(nextGroupId: string): boolean {
		if (!showSelectedItemEditor || !isMultiGroupReview || step !== 2) {
			return false;
		}

		const nextGroup = detectionGroups.find((group) => group.id === nextGroupId);
		if (!nextGroup) {
			return false;
		}

		return getEffectiveMediaType(nextGroup) === 'tv';
	}

	function switchGroup(groupId: string) {
		if (groupId === selectedGroupId) return;
		const preserveSelectedItemEditor = shouldPreserveSelectedItemEditor(groupId);
		persistActiveGroupState();
		selectedGroupId = groupId;
		loadGroupState(groupId);
		if (isMultiGroupReview && !preserveSelectedItemEditor) {
			showSelectedItemEditor = false;
		}
	}

	function markGroupImported(groupId: string) {
		if (importedGroupIds.includes(groupId)) return;
		importedGroupIds = [...importedGroupIds, groupId];
		skippedGroupIds = skippedGroupIds.filter((id) => id !== groupId);
	}

	function markGroupSkipped(groupId: string) {
		if (!skipActionsEnabled) return;
		if (importedGroupIds.includes(groupId)) return;
		if (skippedGroupIds.includes(groupId)) return;
		skippedGroupIds = [...skippedGroupIds, groupId];
	}

	function unskipGroup(groupId: string) {
		if (!skippedGroupIds.includes(groupId)) return;
		skippedGroupIds = skippedGroupIds.filter((id) => id !== groupId);
	}

	function toggleSkipActiveGroup() {
		if (!skipActionsEnabled) return;
		if (!activeGroup) return;
		if (skippedGroupIds.includes(activeGroup.id)) {
			unskipGroup(activeGroup.id);
			return;
		}
		markGroupSkipped(activeGroup.id);
	}

	function continueWithNextDetected() {
		const nextGroup = detectionGroups.find(
			(group) => !importedGroupIds.includes(group.id) && !skippedGroupIds.includes(group.id)
		);
		if (!nextGroup) {
			resetWizard();
			return;
		}
		switchGroup(nextGroup.id);
		step = 2;
	}

	function getRequiredRootFolderSubType(
		match: MatchResult | null | undefined
	): 'standard' | 'anime' | undefined {
		if (!enforceAnimeSubtype) return undefined;
		if (match?.isAnime === true) return 'anime';
		if (match?.isAnime === false) return 'standard';
		return undefined;
	}

	function getWritableRootFoldersForType(
		mediaType: MediaType,
		match: MatchResult | null = null
	): RootFolder[] {
		const writableFolders = rootFolders.filter((folder) => !folder.readOnly);
		return sortRootFoldersForMediaType(
			writableFolders,
			mediaType,
			getRequiredRootFolderSubType(match)
		);
	}

	function getAvailableDestinationLibrariesForType(
		mediaType: MediaType,
		match: MatchResult | null = null
	): DestinationLibrary[] {
		const allowedFolders = getWritableRootFoldersForType(mediaType, match);
		if (allowedFolders.length === 0) {
			return [];
		}

		const allowedRootFolderIds = new Set(allowedFolders.map((folder) => folder.id));
		const eligibleLibraries = destinationLibraries.filter((library) => {
			if (library.mediaType !== mediaType) return false;
			if (!library.defaultRootFolderId) return false;
			return allowedRootFolderIds.has(library.defaultRootFolderId);
		});

		return eligibleLibraries.sort((a, b) => {
			const defaultOrder = Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault));
			if (defaultOrder !== 0) return defaultOrder;
			return a.name.localeCompare(b.name);
		});
	}

	function getRecommendedDestinationLibraryId(
		libraries: DestinationLibrary[],
		options?: { preferAnime?: boolean }
	): string | undefined {
		if (libraries.length === 0) return undefined;

		const preferAnime = options?.preferAnime === true;
		if (preferAnime) {
			return (
				libraries.find(
					(library) => library.isDefault && (library.mediaSubType ?? 'standard') === 'anime'
				)?.id ??
				libraries.find(
					(library) => library.isDefault && (library.mediaSubType ?? 'standard') === 'standard'
				)?.id ??
				libraries.find((library) => library.isDefault)?.id ??
				libraries[0].id
			);
		}

		return (
			libraries.find(
				(library) => library.isDefault && (library.mediaSubType ?? 'standard') === 'standard'
			)?.id ??
			libraries.find((library) => library.isDefault)?.id ??
			libraries[0].id
		);
	}

	function isGroupImported(groupId: string): boolean {
		return importedGroupIds.includes(groupId);
	}

	function isGroupSkipped(groupId: string): boolean {
		return skippedGroupIds.includes(groupId);
	}

	function isGroupPending(groupId: string): boolean {
		return !isGroupImported(groupId) && !isGroupSkipped(groupId);
	}

	function getGroupState(group: DetectionGroup): GroupReviewState {
		return groupReviewState[group.id] ?? createInitialGroupState(group);
	}

	function getEffectiveMediaType(group: DetectionGroup): MediaType {
		return getGroupState(group).selectedMediaType;
	}

	function buildDetectionSections(groups: DetectionGroup[]): DetectionSection[] {
		const sections: DetectionSection[] = [];
		const tvSectionIndex: Record<string, number> = {};

		for (const group of groups) {
			const mediaType = getEffectiveMediaType(group);
			if (mediaType === 'movie') {
				sections.push({
					id: `movie:${group.id}`,
					label: group.displayName,
					mediaType: 'movie',
					items: [group]
				});
				continue;
			}

			const key = getTvSeriesSectionKey(group);
			const existingIndex = tvSectionIndex[key];
			if (existingIndex === undefined) {
				const section: DetectionSection = {
					id: key,
					label: getTvSeriesSectionLabel(group),
					mediaType: 'tv',
					items: [],
					seasonSections: []
				};
				sections.push(section);
				tvSectionIndex[key] = sections.length - 1;
			} else {
				sections[existingIndex].items.push(group);
				continue;
			}
			sections[tvSectionIndex[key]].items.push(group);
		}

		for (const section of sections) {
			section.items.sort((a, b) =>
				a.displayName.localeCompare(b.displayName, undefined, { numeric: true })
			);
			if (section.mediaType === 'tv') {
				section.seasonSections = buildTvSeasonSections(section.items);
			}
		}

		return sections;
	}

	function getTvSeriesSectionKey(group: DetectionGroup): string {
		const state = getGroupState(group);
		const match = state.selectedMatch;
		if (match && match.mediaType === 'tv') {
			return `tv:tmdb:${match.tmdbId}`;
		}
		const normalizedParsedTitle = normalizeGroupingKey(group.parsedTitle || group.displayName);
		const year = group.parsedYear ? `:${group.parsedYear}` : '';
		return `tv:parsed:${normalizedParsedTitle}${year}`;
	}

	function getTvSeriesSectionLabel(group: DetectionGroup): string {
		const state = getGroupState(group);
		const match = state.selectedMatch;
		if (match && match.mediaType === 'tv') {
			return match.year ? `${match.title} (${match.year})` : match.title;
		}
		const parsedTitle = group.parsedTitle?.trim();
		if (parsedTitle) {
			return group.parsedYear ? `${parsedTitle} (${group.parsedYear})` : parsedTitle;
		}
		return m.library_import_unmatchedTvSeries();
	}

	function normalizeGroupingKey(value: string): string {
		return value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ')
			.trim()
			.replace(/\s+/g, '-');
	}

	function normalizeTitleForComparison(value: string): string {
		return value
			.toLowerCase()
			.replace(/^(?:the|an?)\s+/, '') // Remove leading articles before stripping spaces
			.replace(/[^a-z0-9]/g, '');
	}

	function buildTvSeasonSections(items: DetectionGroup[]): TvSeasonSection[] {
		const sectionIndex: Record<string, number> = {};
		const sections: TvSeasonSection[] = [];

		for (const group of items) {
			const seasonNumber = getGroupSeasonNumber(group);
			const key = seasonNumber === null ? 'unknown' : `s${seasonNumber}`;
			const existingIndex = sectionIndex[key];

			if (existingIndex === undefined) {
				sections.push({
					key,
					label:
						seasonNumber === null
							? m.library_import_seasonUnmapped()
							: m.library_import_seasonNumber({ number: seasonNumber }),
					seasonNumber,
					items: [group]
				});
				sectionIndex[key] = sections.length - 1;
				continue;
			}

			sections[existingIndex].items.push(group);
		}

		for (const section of sections) {
			section.items.sort((a, b) =>
				a.displayName.localeCompare(b.displayName, undefined, { numeric: true })
			);
		}

		return sections.sort((a, b) => {
			if (a.seasonNumber === null && b.seasonNumber === null) return 0;
			if (a.seasonNumber === null) return 1;
			if (b.seasonNumber === null) return -1;
			return a.seasonNumber - b.seasonNumber;
		});
	}

	function getGroupSeasonNumber(group: DetectionGroup): number | null {
		if (typeof group.parsedSeason === 'number') {
			return group.parsedSeason;
		}
		const state = getGroupState(group);
		if (typeof state.batchSeasonOverride === 'number') {
			return state.batchSeasonOverride;
		}
		if (typeof group.suggestedSeason === 'number') {
			return group.suggestedSeason;
		}
		return null;
	}

	function getDetectedSeasonsLabel(section: DetectionSection): string {
		if (
			section.mediaType !== 'tv' ||
			!section.seasonSections ||
			section.seasonSections.length === 0
		) {
			return 'none';
		}
		const seasons = section.seasonSections
			.filter((season) => season.seasonNumber !== null)
			.map((season) => season.seasonNumber as number);
		if (seasons.length === 0) {
			return 'none';
		}
		return seasons.join(', ');
	}

	function hasUnknownSeasonItems(section: DetectionSection): boolean {
		if (section.mediaType !== 'tv' || !section.seasonSections) {
			return false;
		}
		return section.seasonSections.some((season) => season.seasonNumber === null);
	}

	function getSectionSeasonOverride(section: DetectionSection): number | null {
		if (section.mediaType !== 'tv') {
			return null;
		}
		for (const group of section.items) {
			const override = getGroupState(group).batchSeasonOverride;
			if (typeof override === 'number') {
				return override;
			}
		}
		return null;
	}

	function applySeasonOverrideToSection(section: DetectionSection, seasonNumber: number | null) {
		if (section.mediaType !== 'tv') return;
		const nextState = { ...groupReviewState };
		for (const group of section.items) {
			const state = getGroupState(group);
			const nextSeason =
				seasonNumber !== null && group.parsedSeason === undefined
					? seasonNumber
					: state.seasonNumber;
			nextState[group.id] = {
				...state,
				seasonNumber: nextSeason,
				batchSeasonOverride: seasonNumber
			};
		}
		groupReviewState = nextState;

		if (activeGroup && section.items.some((group) => group.id === activeGroup.id)) {
			loadGroupState(activeGroup.id);
		}
	}

	function handleSectionSeasonOverrideChange(section: DetectionSection, event: Event) {
		const target = event.target as HTMLInputElement;
		const value = target.value.trim();
		if (!value) {
			applySeasonOverrideToSection(section, null);
			return;
		}
		const parsed = parseInt(value, 10);
		if (isNaN(parsed) || parsed < 0) {
			return;
		}
		applySeasonOverrideToSection(section, parsed);
	}

	function selectReviewSeriesSection(sectionId: string) {
		if (reviewSelectedSeriesSectionId === sectionId) {
			return;
		}
		reviewSelectedSeriesSectionId = sectionId;
		reviewSelectedSeasonSectionKey = null;
	}

	function selectReviewSeasonSection(seasonKey: string) {
		reviewSelectedSeasonSectionKey = seasonKey;
	}

	function getSkippableSeasonGroups(
		seasonSection: TvSeasonSection | null | undefined
	): DetectionGroup[] {
		if (!seasonSection) return [];
		return seasonSection.items.filter((group) => !isGroupImported(group.id));
	}

	function isSeasonSectionFullySkipped(seasonSection: TvSeasonSection | null | undefined): boolean {
		const groups = getSkippableSeasonGroups(seasonSection);
		return groups.length > 0 && groups.every((group) => isGroupSkipped(group.id));
	}

	function getSeasonSectionSkippedCount(seasonSection: TvSeasonSection | null | undefined): number {
		return getSkippableSeasonGroups(seasonSection).filter((group) => isGroupSkipped(group.id))
			.length;
	}

	function toggleSeasonSectionSkipped(seasonSection: TvSeasonSection | null | undefined) {
		if (!skipActionsEnabled || !seasonSection) return;

		const groups = getSkippableSeasonGroups(seasonSection);
		if (groups.length === 0) return;

		if (isSeasonSectionFullySkipped(seasonSection)) {
			const groupIds = groups.map((group) => group.id);
			skippedGroupIds = skippedGroupIds.filter((groupId) => !groupIds.includes(groupId));
			return;
		}

		const nextSkippedIds = [...skippedGroupIds];
		for (const group of groups) {
			if (!nextSkippedIds.includes(group.id)) {
				nextSkippedIds.push(group.id);
			}
		}
		skippedGroupIds = nextSkippedIds;
	}

	function canApplySelectedMatchToSeason(
		seasonSection: TvSeasonSection | null | undefined,
		match: MatchResult | null = selectedMatch
	): boolean {
		if (!seasonSection || !match) return false;
		if (match.mediaType !== 'tv') return false;
		return getSkippableSeasonGroups(seasonSection).length > 0;
	}

	function applySelectedMatchToSeason(
		seasonSection: TvSeasonSection | null | undefined,
		matchToApply: MatchResult | null = selectedMatch,
		options?: { showToast?: boolean }
	): boolean {
		const showToast = options?.showToast ?? true;
		if (!seasonSection) return false;
		if (!matchToApply || matchToApply.mediaType !== 'tv') {
			if (showToast) {
				toasts.warning(m.toast_library_import_selectTvMatchForSeasonApply());
			}
			return false;
		}
		const selectedTvMatch = matchToApply;

		const groups = getSkippableSeasonGroups(seasonSection);
		if (groups.length === 0) return false;

		const librariesForTv = getAvailableDestinationLibrariesForType('tv', selectedTvMatch);
		const recommendedRootFolder =
			getRecommendedDestinationLibraryId(librariesForTv, {
				preferAnime: selectedTvMatch.isAnime === true
			}) ?? '';
		const nextState = { ...groupReviewState };

		for (const group of groups) {
			const state = getGroupState(group);
			const hasSelectedMatch = state.matchCandidates.some(
				(match) =>
					match.mediaType === selectedTvMatch.mediaType && match.tmdbId === selectedTvMatch.tmdbId
			);
			const nextCandidates = hasSelectedMatch
				? state.matchCandidates
				: [selectedTvMatch, ...state.matchCandidates];
			const hasValidRootFolder =
				state.selectedRootFolder.length > 0 &&
				librariesForTv.some((library) => library.id === state.selectedRootFolder);

			nextState[group.id] = {
				...state,
				selectedMediaType: 'tv',
				selectedMatch: selectedTvMatch,
				searchQuery: selectedTvMatch.title,
				matchCandidates: nextCandidates,
				importTarget: selectedTvMatch.inLibrary ? 'existing' : 'new',
				selectedRootFolder: selectedTvMatch.inLibrary
					? state.selectedRootFolder
					: hasValidRootFolder
						? state.selectedRootFolder
						: recommendedRootFolder
			};
		}

		groupReviewState = nextState;
		if (activeGroup && nextState[activeGroup.id]) {
			loadGroupState(activeGroup.id);
		}

		if (showToast) {
			toasts.success(m.toast_library_import_appliedMatchToSeason({ count: groups.length }));
		}
		return true;
	}

	function getSectionDestinationGroups(section: DetectionSection): DetectionGroup[] {
		return section.items.filter((group) => !isGroupImported(group.id) && !isGroupSkipped(group.id));
	}

	function getSectionDestinationEligibleGroups(section: DetectionSection): DetectionGroup[] {
		return getSectionDestinationGroups(section).filter((group) => {
			const state = getGroupState(group);
			return !(state.selectedMatch?.inLibrary && state.importTarget === 'existing');
		});
	}

	function getSectionDestinationOptions(section: DetectionSection): DestinationLibrary[] {
		const groups = getSectionDestinationEligibleGroups(section);

		if (groups.length === 0) return [];

		const allowedLibraryIds: string[] = [];
		for (const group of groups) {
			const state = getGroupState(group);
			const groupLibraries = getAvailableDestinationLibrariesForType(
				state.selectedMediaType,
				state.selectedMatch
			);
			for (const library of groupLibraries) {
				if (!allowedLibraryIds.includes(library.id)) {
					allowedLibraryIds.push(library.id);
				}
			}
		}

		return destinationLibraries
			.filter((library) => library.mediaType === section.mediaType)
			.filter((library) => allowedLibraryIds.includes(library.id))
			.sort((a, b) => {
				const defaultOrder = Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault));
				if (defaultOrder !== 0) return defaultOrder;
				return a.name.localeCompare(b.name);
			});
	}

	function getRecommendedSectionDestinationId(
		section: DetectionSection,
		options: DestinationLibrary[]
	): string {
		const shouldPreferAnime = getSectionDestinationGroups(section).some(
			(group) => getGroupState(group).selectedMatch?.isAnime === true
		);
		return getRecommendedDestinationLibraryId(options, { preferAnime: shouldPreferAnime }) ?? '';
	}

	function updateSectionDestination(sectionId: string, value: string) {
		bulkDestinationBySectionId = {
			...bulkDestinationBySectionId,
			[sectionId]: value
		};
	}

	function canApplySelectedDestinationToMedia(section: DetectionSection): boolean {
		const selectedDestination = bulkDestinationBySectionId[section.id] ?? '';
		if (!selectedDestination) return false;

		const groups = getSectionDestinationEligibleGroups(section);
		if (groups.length === 0) return false;

		return groups.some((group) => {
			const state = getGroupState(group);
			const libraries = getAvailableDestinationLibrariesForType(
				state.selectedMediaType,
				state.selectedMatch
			);
			return libraries.some((library) => library.id === selectedDestination);
		});
	}

	function applySelectedDestinationToMedia(section: DetectionSection) {
		const selectedDestination = bulkDestinationBySectionId[section.id] ?? '';
		if (!selectedDestination) {
			toasts.warning(m.toast_library_import_selectDestinationFirst());
			return;
		}

		const groups = getSectionDestinationEligibleGroups(section);
		if (groups.length === 0) return;

		let updatedCount = 0;
		let restrictedCount = 0;
		const nextState = { ...groupReviewState };

		for (const group of groups) {
			const state = getGroupState(group);

			const libraries = getAvailableDestinationLibrariesForType(
				state.selectedMediaType,
				state.selectedMatch
			);
			if (!libraries.some((library) => library.id === selectedDestination)) {
				restrictedCount += 1;
				continue;
			}

			const nextImportTarget = state.selectedMatch?.inLibrary ? state.importTarget : 'new';
			if (
				state.selectedRootFolder === selectedDestination &&
				state.importTarget === nextImportTarget
			) {
				continue;
			}

			nextState[group.id] = {
				...state,
				selectedRootFolder: selectedDestination,
				importTarget: nextImportTarget
			};
			updatedCount += 1;
		}

		if (updatedCount > 0) {
			groupReviewState = nextState;
			if (activeGroup && nextState[activeGroup.id]) {
				loadGroupState(activeGroup.id);
			}
			toasts.success(m.toast_library_import_appliedDestinationToMedia({ count: updatedCount }));
		}

		if (restrictedCount > 0) {
			toasts.warning(m.toast_library_import_destinationRestrictedForMediaItems());
		}
	}

	function selectImportSeriesSection(sectionId: string) {
		if (importSelectedSeriesSectionId === sectionId) {
			return;
		}
		importSelectedSeriesSectionId = sectionId;
		importSelectedSeasonSectionKey = null;
	}

	function selectImportSeasonSection(seasonKey: string) {
		importSelectedSeasonSectionKey = seasonKey;
	}

	function canImportGroup(group: DetectionGroup): boolean {
		if (importedGroupIds.includes(group.id) || skippedGroupIds.includes(group.id)) {
			return false;
		}

		const state = getGroupState(group);
		const match = state.selectedMatch;
		if (!match) {
			return false;
		}
		if (match.inLibrary && state.importTarget !== 'existing') {
			return false;
		}

		const isBatchTv = state.selectedMediaType === 'tv' && group.detectedFileCount > 1;
		if (
			!isBatchTv &&
			state.selectedMediaType === 'tv' &&
			(state.seasonNumber < 0 || state.episodeNumber < 1)
		) {
			return false;
		}

		if (state.importTarget === 'existing') {
			return match.inLibrary;
		}

		const libraries = getAvailableDestinationLibrariesForType(
			state.selectedMediaType,
			state.selectedMatch
		);
		if (libraries.length === 0) return false;
		if (libraries.length === 1) return true;
		return state.selectedRootFolder.length > 0;
	}

	function findDefaultReviewGroupId(
		groups: DetectionGroup[],
		preferredGroupId: string | null
	): string | null {
		if (groups.length === 0) return null;

		const firstNeedsInput = groups.find((group) => !canImportGroup(group));
		if (firstNeedsInput) {
			return firstNeedsInput.id;
		}

		if (preferredGroupId && groups.some((group) => group.id === preferredGroupId)) {
			return preferredGroupId;
		}

		return groups[0].id;
	}

	function buildImportPayload(group: DetectionGroup) {
		const state = getGroupState(group);
		if (!state.selectedMatch) {
			throw new Error(`No match selected for "${group.displayName}"`);
		}
		const resolvedImportTarget = state.selectedMatch.inLibrary ? 'existing' : state.importTarget;

		const librariesForType = getAvailableDestinationLibrariesForType(
			state.selectedMediaType,
			state.selectedMatch
		);
		const isBatchTv = state.selectedMediaType === 'tv' && group.detectedFileCount > 1;

		return {
			sourcePath: group.sourcePath,
			mediaType: state.selectedMediaType,
			tmdbId: state.selectedMatch.tmdbId,
			importTarget: resolvedImportTarget,
			...(resolvedImportTarget === 'new'
				? { libraryId: state.selectedRootFolder || librariesForType[0]?.id }
				: {}),
			...(state.selectedMediaType === 'tv' && !isBatchTv
				? { seasonNumber: state.seasonNumber, episodeNumber: state.episodeNumber }
				: {}),
			...(state.selectedMediaType === 'tv' && isBatchTv && state.batchSeasonOverride !== null
				? { seasonNumber: state.batchSeasonOverride }
				: {})
		};
	}

	async function executeImportRequest(payload: Record<string, unknown>): Promise<ExecuteResult> {
		const response = await fetch('/api/library/import/execute', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const data = await response.json();
		if (!response.ok || !data.success) {
			throw new Error(data.error || 'Import failed');
		}
		return data.data as ExecuteResult;
	}

	function clearMatchSearch() {
		if (!activeGroup) return;
		searchQuery = '';
		const state = getGroupState(activeGroup);
		matchCandidates =
			state.matchCandidates.length > 0 ? state.matchCandidates : activeGroup.matches;
		if (selectedMatch && !matchCandidates.some((match) => match.tmdbId === selectedMatch?.tmdbId)) {
			selectedMatch = matchCandidates[0] ?? null;
		}
		persistActiveGroupState();
	}

	function handleMatchSearchInput(event: Event) {
		const target = event.target as HTMLInputElement;
		searchQuery = target.value.replace(/^\s+/, '');
		persistActiveGroupState();

		if (tmdbSearchDebounce) {
			clearTimeout(tmdbSearchDebounce);
		}

		if (searchQuery.trim().length < 2) {
			if (activeGroup) {
				matchCandidates = activeGroup.matches ?? [];
				if (matchCandidates.length > 0) {
					selectedMatch = matchCandidates[0] ?? selectedMatch;
				}
				persistActiveGroupState();
			}
			return;
		}

		tmdbSearchDebounce = setTimeout(() => {
			searchTmdb();
		}, 300);
	}

	async function runDetection() {
		if (!sourcePath.trim()) {
			toasts.error(m.toast_library_import_selectSourcePath());
			return;
		}

		detecting = true;
		try {
			const response = await fetch('/api/library/import/detect', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sourcePath,
					...(preferredMediaType !== 'auto' ? { mediaType: preferredMediaType } : {}),
					...(isFileOnlyContext ? { requireFile: true } : {})
				})
			});
			const data = await response.json();
			if (!response.ok || !data.success) {
				throw new Error(data.error || 'Failed to detect media');
			}

			const detectedData = data.data as DetectionResult;
			executeResult = null;
			bulkImportSummary = null;
			importedGroupIds = [];
			skippedGroupIds = [];
			detectedGroupQuery = '';
			detectedGroupFilter = 'pending';
			detectedMediaFilter = 'all';
			importMediaFilter = 'all';
			showSelectedItemEditor = false;
			reviewSelectedSeriesSectionId = null;
			reviewSelectedSeasonSectionKey = null;
			importSelectedSeriesSectionId = null;
			importSelectedSeasonSectionKey = null;
			if (tmdbSearchDebounce) {
				clearTimeout(tmdbSearchDebounce);
				tmdbSearchDebounce = null;
			}

			const groups =
				Array.isArray(detectedData.groups) && detectedData.groups.length > 0
					? detectedData.groups
					: [toDetectionGroup(detectedData)];

			const nextGroupState: Record<string, GroupReviewState> = {};
			for (const group of groups) {
				const state = createInitialGroupState(group);
				const contextMatch = buildRouteContextMatch(group);
				if (contextMatch) {
					const mergedMatches = [
						contextMatch,
						...state.matchCandidates.filter(
							(match) =>
								!(
									match.mediaType === contextMatch.mediaType && match.tmdbId === contextMatch.tmdbId
								)
						)
					];
					group.matches = mergedMatches;
					state.selectedMediaType = contextMatch.mediaType;
					state.matchCandidates = mergedMatches;
					state.selectedMatch = contextMatch;
					state.searchQuery = contextMatch.title;
					state.importTarget = contextMatch.inLibrary ? 'existing' : 'new';
				}
				nextGroupState[group.id] = state;
			}
			detection = {
				...detectedData,
				groups,
				totalGroups: groups.length
			};
			groupReviewState = nextGroupState;
			const hasNeedsInputGroups = groups.some((group) => !canImportGroup(group));
			detectedGroupFilter = hasNeedsInputGroups ? 'pending' : 'ready';

			const preferredGroupId =
				detectedData.selectedGroupId &&
				groups.some((group) => group.id === detectedData.selectedGroupId)
					? detectedData.selectedGroupId
					: null;
			const nextSelectedGroupId = findDefaultReviewGroupId(groups, preferredGroupId);
			selectedGroupId = nextSelectedGroupId;
			if (nextSelectedGroupId) {
				loadGroupState(nextSelectedGroupId);
			}
			step = 2;
		} catch (error) {
			toasts.error(
				error instanceof Error ? error.message : m.toast_library_import_detectionFailed()
			);
		} finally {
			detecting = false;
		}
	}

	async function searchTmdb() {
		if (routeImportContext) {
			return;
		}
		const currentGroup = activeGroup;
		if (!currentGroup) return;
		if (tmdbSearchDebounce) {
			clearTimeout(tmdbSearchDebounce);
			tmdbSearchDebounce = null;
		}

		if (!searchQuery.trim()) {
			toasts.error(m.toast_library_import_enterTitle());
			return;
		}

		searchingMatches = true;
		try {
			const searchResponse = await fetch(
				`/api/discover/search?query=${encodeURIComponent(searchQuery)}&type=${selectedMediaType}`
			);
			const searchData = await searchResponse.json();
			const results = searchData.results ?? [];

			const tmdbIds = results.map((item: { id: number }) => item.id);
			const statusResponse = await fetch('/api/library/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tmdbIds,
					mediaType: selectedMediaType
				})
			});
			const statusData = await statusResponse.json();
			const statusMap = statusData.status ?? {};

			matchCandidates = results.map((item: Record<string, unknown>) => {
				const tmdbId = item.id as number;
				const date = (item.release_date || item.first_air_date) as string | undefined;
				const year = date ? parseInt(date.split('-')[0], 10) : undefined;
				const status = statusMap[tmdbId];
				const genreIds = Array.isArray(item.genre_ids)
					? item.genre_ids.filter((value): value is number => typeof value === 'number')
					: [];
				const originCountries = Array.isArray(item.origin_country)
					? item.origin_country.filter((value): value is string => typeof value === 'string')
					: [];
				const isAnime = isLikelyAnimeMedia({
					genres: genreIds.map((id) => ({ id })),
					originalLanguage:
						typeof item.original_language === 'string' ? item.original_language : null,
					originCountries,
					title: typeof item.title === 'string' ? item.title : null,
					originalTitle:
						typeof item.original_title === 'string'
							? item.original_title
							: typeof item.original_name === 'string'
								? item.original_name
								: null
				});
				return {
					tmdbId,
					title: (item.title || item.name || m.common_unknown()) as string,
					year,
					mediaType: selectedMediaType,
					isAnime,
					confidence: 0,
					inLibrary: Boolean(status?.inLibrary),
					libraryId: status?.libraryId
				} satisfies MatchResult;
			});

			if (matchCandidates.length === 0) {
				toasts.warning(m.toast_library_import_noMatchesFound());
			}
		} catch {
			toasts.error(m.toast_library_import_failedToSearchTmdb());
		} finally {
			persistActiveGroupState();
			searchingMatches = false;
		}
	}

	function chooseMatch(match: MatchResult) {
		selectedMatch = match;
		importTarget = match.inLibrary ? 'existing' : 'new';
		if (importTarget === 'new') {
			selectedRootFolder =
				getRecommendedDestinationLibraryId(
					getAvailableDestinationLibrariesForType(selectedMediaType, match),
					{
						preferAnime: match.isAnime === true
					}
				) ?? '';
		}

		if (
			applySelectedMatchToSeasonOnSelect &&
			canApplySelectedMatchToSeason(activeReviewSeasonSection, match)
		) {
			const applied = applySelectedMatchToSeason(activeReviewSeasonSection, match);
			if (applied) {
				return;
			}
		}

		persistActiveGroupState();
	}

	function switchMediaType(nextType: MediaType) {
		if (routeImportContext) {
			return;
		}
		if (selectedMediaType === nextType) return;
		selectedMediaType = nextType;
		selectedMatch = null;
		matchCandidates = [];
		importTarget = 'new';
		selectedRootFolder =
			getRecommendedDestinationLibraryId(getAvailableDestinationLibrariesForType(nextType, null)) ??
			'';
		batchSeasonOverride = nextType === 'tv' ? (activeGroup?.suggestedSeason ?? null) : null;
		persistActiveGroupState();
	}

	function goToStep(targetStep: WizardStep) {
		persistActiveGroupState();
		if (targetStep === 3) {
			if (isMultiGroupReview) {
				if (selectedImportGroupCount === 0) return;
			} else if (!step2Ready) {
				return;
			}
		}
		step = targetStep;
	}

	function resetWizard() {
		preferredMediaType = routeImportContext?.mediaType ?? 'auto';
		sourcePath = '/';
		browserPath = '/';
		browserParentPath = null;
		browserEntries = [];
		browserError = null;
		step = 1;
		detection = null;
		selectedMatch = null;
		selectedMediaType = routeImportContext?.mediaType ?? 'movie';
		matchCandidates = [];
		searchQuery = '';
		seasonNumber = 1;
		episodeNumber = 1;
		batchSeasonOverride = null;
		executeResult = null;
		executeError = null;
		bulkImportSummary = null;
		importTarget = 'new';
		selectedGroupId = null;
		importedGroupIds = [];
		skippedGroupIds = [];
		groupReviewState = {};
		selectedRootFolder = '';
		detectedGroupQuery = '';
		detectedGroupFilter = 'pending';
		detectedMediaFilter = 'all';
		importMediaFilter = 'all';
		showSelectedItemEditor = false;
		reviewSelectedSeriesSectionId = null;
		reviewSelectedSeasonSectionKey = null;
		importSelectedSeriesSectionId = null;
		importSelectedSeasonSectionKey = null;
		if (tmdbSearchDebounce) {
			clearTimeout(tmdbSearchDebounce);
			tmdbSearchDebounce = null;
		}
		void browse('/');
	}

	async function executeImportFlow() {
		const currentGroup = activeGroup;
		if (!currentGroup || !selectedMatch) return;
		if (!canProceedToImport) return;
		persistActiveGroupState();

		executingImport = true;
		executeError = null;
		try {
			const payload = buildImportPayload(currentGroup);
			const result = await executeImportRequest(payload);
			executeResult = result;
			bulkImportSummary = null;
			if (selectedGroupId) {
				markGroupImported(selectedGroupId);
			}
			if (isDirectLibraryImportContext && originLibraryLink) {
				toasts.success(m.toast_library_import_importComplete());
				bypassNavigationGuard = true;
				await goto(originLibraryLink);
				return;
			}
			step = 4;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Import failed';
			if (isDirectLibraryImportContext) {
				executeError = message;
				step = 4;
			} else {
				toasts.error(message);
			}
		} finally {
			executingImport = false;
		}
	}

	async function executeBulkImportFlow() {
		if (selectedImportGroupCount === 0) {
			toasts.warning(m.toast_library_import_noSelectedItems());
			return;
		}

		if (selectedNeedsInputCount > 0) {
			toasts.warning(m.toast_library_import_itemsNeedInput());
			return;
		}

		persistActiveGroupState();
		executingImport = true;
		let imported = 0;
		let failed = 0;
		let lastSuccess: ExecuteResult | null = null;
		const failures: string[] = [];

		try {
			for (const group of detectionGroups) {
				if (importedGroupIds.includes(group.id)) {
					continue;
				}
				if (skippedGroupIds.includes(group.id)) {
					continue;
				}
				if (!canImportGroup(group)) {
					continue;
				}

				try {
					const payload = buildImportPayload(group);
					lastSuccess = await executeImportRequest(payload);
					markGroupImported(group.id);
					imported++;
				} catch (error) {
					failed++;
					failures.push(
						`${group.displayName}: ${error instanceof Error ? error.message : 'Import failed'}`
					);
				}
			}
		} finally {
			executingImport = false;
		}

		if (imported === 0) {
			toasts.error(failures[0] ?? m.toast_library_import_noGroupsImported());
			return;
		}

		executeResult = lastSuccess;
		bulkImportSummary = { importedGroups: imported, failedGroups: failed };
		step = 4;

		if (failed > 0) {
			toasts.warning(m.toast_library_import_bulkImportPartial({ imported, failed }));
			toasts.error(failures[0]);
		} else {
			toasts.success(m.toast_library_import_bulkImportSuccess({ count: imported }));
		}
	}

	const completionLink = $derived.by(() => {
		if (!executeResult) return null;
		const path =
			executeResult.mediaType === 'movie'
				? `/library/movie/${executeResult.libraryId}`
				: `/library/tv/${executeResult.libraryId}`;
		return resolvePath(path);
	});
	const originLibraryLink = $derived.by(() => {
		if (!routeImportContext?.libraryId) return null;
		const path =
			routeImportContext.mediaType === 'movie'
				? `/library/movie/${routeImportContext.libraryId}`
				: `/library/tv/${routeImportContext.libraryId}`;
		return resolvePath(path);
	});

	function formatMediaTypeLabel(mediaType: MediaType): string {
		return mediaType === 'movie' ? m.library_import_movieLabel() : m.library_import_tvShowLabel();
	}

	function closeLeaveImportModal() {
		leaveImportModalOpen = false;
		pendingNavigation = null;
	}

	async function confirmLeaveImportModal() {
		const destination = pendingNavigation;
		if (!destination) {
			closeLeaveImportModal();
			return;
		}

		leaveImportModalOpen = false;
		pendingNavigation = null;
		bypassNavigationGuard = true;

		if (destination.external) {
			window.location.assign(destination.href);
			return;
		}

		await goto(destination.href);
	}
</script>

<svelte:head>
	<title>{m.library_import_pageTitle()}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-5">
	<div class="flex flex-col gap-2">
		<h1 class="text-3xl font-bold">{m.library_import_heading()}</h1>
		<p class="text-base-content/70">{m.library_import_subtitle()}</p>
	</div>

	<ul class="steps w-full">
		<li class="step {step >= 1 ? 'step-primary' : ''}">{m.library_import_stepSelectPath()}</li>
		<li class="step {step >= 2 ? 'step-primary' : ''}">{m.library_import_stepReviewMatches()}</li>
		<li class="step {step >= 3 ? 'step-primary' : ''}">{m.library_import_stepImport()}</li>
		<li class="step {step >= 4 ? 'step-primary' : ''}">{m.library_import_stepComplete()}</li>
	</ul>

	{#if step === 1}
		<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
			<div class="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-start">
				<label class="form-control">
					<span class="label-text text-sm font-medium">{m.library_import_mediaTypeLabel()}</span>
					<select
						class="select-bordered select w-full"
						bind:value={preferredMediaType}
						disabled={isMediaTypeLockedByContext}
					>
						<option value="auto">{m.library_import_autoDetect()}</option>
						<option value="movie">{m.common_movie()}</option>
						<option value="tv">{m.ui_mediaType_tv()}</option>
					</select>
				</label>

				<label class="form-control">
					<span class="label-text text-sm font-medium">{m.library_import_sourcePathLabel()}</span>
					<span class="text-xs text-base-content/60 md:col-span-2 md:col-start-2">
						{#if isFileOnlyContext}
							{m.library_import_sourcePathHintFile()}
						{:else}
							{m.library_import_sourcePathHintGeneral()}
						{/if}</span
					>
					<input
						class="input-bordered input w-full"
						placeholder={m.library_import_sourcePathPlaceholder()}
						bind:value={sourcePath}
					/>
				</label>

				<div class="md:self-end">
					<span class="label-text invisible hidden text-sm font-medium md:block"
						>{m.library_import_detectMedia()}</span
					>
					<button
						type="button"
						class="btn w-full btn-primary md:w-auto"
						onclick={runDetection}
						disabled={detecting}
					>
						{#if detecting}
							<Loader2 class="h-4 w-4 animate-spin" />
							{m.library_import_detecting()}
						{:else}
							<Sparkles class="h-4 w-4" />
							{m.library_import_detectMedia()}
						{/if}
					</button>
				</div>
			</div>

			<div class="mt-4 overflow-hidden rounded-lg border border-base-300">
				<div class="flex items-center gap-2 border-b border-base-300 bg-base-200 p-3">
					<button
						type="button"
						class="btn btn-square btn-ghost btn-sm"
						onclick={() => browse('/')}
						title={m.library_import_goToRoot()}
					>
						<Home class="h-4 w-4" />
					</button>
					<button
						class="btn btn-square btn-ghost btn-sm"
						disabled={!browserParentPath}
						onclick={() => browserParentPath && browse(browserParentPath)}
					>
						<ArrowUp class="h-4 w-4" />
					</button>
					<div class="min-w-0 flex-1 truncate rounded bg-base-100 px-2 py-1 font-mono text-sm">
						{browserPath}
					</div>
					{#if !isFileOnlyContext}
						<button class="btn btn-outline btn-xs" onclick={() => (sourcePath = browserPath)}>
							{m.library_import_useFolder()}
						</button>
					{/if}
				</div>

				<div class="max-h-80 overflow-y-auto p-2">
					{#if browserLoading}
						<div class="flex items-center justify-center py-8">
							<Loader2 class="h-5 w-5 animate-spin text-base-content/60" />
						</div>
					{:else if browserError}
						<div class="alert text-sm alert-error">
							<span>{browserError}</span>
						</div>
					{:else if browserEntries.length === 0}
						<div class="py-6 text-center text-sm text-base-content/60">
							{m.library_import_noFoldersOrFiles()}
						</div>
					{:else}
						<div class="space-y-1">
							{#each browserEntries as entry (entry.path)}
								<button
									type="button"
									class="flex w-full items-center gap-2 rounded px-2 py-2 text-left transition-colors hover:bg-base-200"
									onclick={() =>
										entry.isDirectory ? browse(entry.path) : (sourcePath = entry.path)}
								>
									{#if entry.isDirectory}
										<Folder class="h-4 w-4 shrink-0 text-warning" />
									{:else}
										<FileVideo class="h-4 w-4 shrink-0 text-info" />
									{/if}
									<div class="min-w-0 flex-1">
										<div class="truncate text-sm font-medium">{entry.name}</div>
										{#if !entry.isDirectory}
											<div class="text-xs text-base-content/60">{formatSize(entry.size)}</div>
										{/if}
									</div>
									{#if sourcePath === entry.path}
										<Check class="h-4 w-4 text-success" />
									{/if}
									{#if entry.isDirectory}
										<ChevronRight class="h-4 w-4 text-base-content/40" />
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	{#if step === 2 && detection && activeGroup}
		<div class="space-y-4">
			{#if detectionGroups.length > 1}
				<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div>
							<h2 class="text-lg font-semibold">{m.library_import_detectedItems()}</h2>
							<p class="mt-1 text-sm text-base-content/70">
								{m.library_import_detectedItemsHint()}
							</p>
						</div>
						<div class="flex flex-wrap items-center gap-2 text-xs">
							<span class="badge badge-outline"
								>{m.library_import_needsInputCount({ count: pendingGroupCount })}</span
							>
							<span class="badge badge-primary"
								>{m.library_import_selectedCount({ count: remainingGroupCount })}</span
							>
							<span class="badge badge-success"
								>{m.library_import_importedCount({ count: importedGroupIds.length })}</span
							>
							{#if skippedGroupCount > 0}
								<span class="badge badge-ghost"
									>{m.library_import_skippedCount({ count: skippedGroupCount })}</span
								>
							{/if}
						</div>
					</div>

					<div class="mt-3 flex flex-col gap-2 lg:flex-row">
						<div class="group relative flex-1">
							<div class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2">
								<Search
									class="h-4 w-4 text-base-content/40 transition-colors group-focus-within:text-primary"
								/>
							</div>
							<input
								type="text"
								placeholder={m.library_import_searchDetectedItems()}
								class="input input-md w-full rounded-full border-base-content/20 bg-base-200/60 pr-9 pl-10 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none"
								bind:value={detectedGroupQuery}
							/>
							{#if detectedGroupQuery}
								<button
									class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-base-content/40 transition-colors hover:bg-base-300 hover:text-base-content"
									onclick={() => (detectedGroupQuery = '')}
									aria-label={m.library_import_clearDetectedSearch()}
								>
									<X class="h-3.5 w-3.5" />
								</button>
							{/if}
						</div>
						<div class="flex flex-wrap items-center gap-2">
							<div class="join">
								<button
									type="button"
									class="btn join-item btn-sm {detectedGroupFilter === 'pending'
										? 'btn-primary'
										: 'btn-ghost'}"
									onclick={() => (detectedGroupFilter = 'pending')}
								>
									{m.library_import_filterNeedsInput()}
								</button>
								<button
									type="button"
									class="btn join-item btn-sm {detectedGroupFilter === 'ready'
										? 'btn-primary'
										: 'btn-ghost'}"
									onclick={() => (detectedGroupFilter = 'ready')}
								>
									{m.library_import_filterReady()}
								</button>
								<button
									type="button"
									class="btn join-item btn-sm {detectedGroupFilter === 'skipped'
										? 'btn-primary'
										: 'btn-ghost'}"
									onclick={() => (detectedGroupFilter = 'skipped')}
								>
									{m.library_import_filterSkipped()}
								</button>
								<button
									type="button"
									class="btn join-item btn-sm {detectedGroupFilter === 'imported'
										? 'btn-primary'
										: 'btn-ghost'}"
									onclick={() => (detectedGroupFilter = 'imported')}
								>
									{m.library_import_filterImported()}
								</button>
								<button
									type="button"
									class="btn join-item btn-sm {detectedGroupFilter === 'all'
										? 'btn-primary'
										: 'btn-ghost'}"
									onclick={() => (detectedGroupFilter = 'all')}
								>
									{m.common_all()}
								</button>
							</div>
							<div class="join">
								<button
									type="button"
									class="btn join-item btn-sm {detectedMediaFilter === 'all'
										? 'btn-primary'
										: 'btn-ghost'}"
									onclick={() => (detectedMediaFilter = 'all')}
								>
									{m.library_import_filterAllMedia()}
								</button>
								<button
									type="button"
									class="btn join-item btn-sm {detectedMediaFilter === 'movie'
										? 'btn-primary'
										: 'btn-ghost'}"
									onclick={() => (detectedMediaFilter = 'movie')}
								>
									{m.common_movies()}
								</button>
								<button
									type="button"
									class="btn join-item btn-sm {detectedMediaFilter === 'tv'
										? 'btn-primary'
										: 'btn-ghost'}"
									onclick={() => (detectedMediaFilter = 'tv')}
								>
									{m.common_tvShows()}
								</button>
							</div>
						</div>
					</div>

					<div class="mt-3 space-y-3">
						{#if reviewDetectionSections.length === 0}
							<div
								class="rounded-lg border border-dashed border-base-300 p-4 text-center text-sm text-base-content/60"
							>
								{m.library_import_noDetectedItemsMatch()}
							</div>
						{:else}
							{#if reviewMovieSections.length > 0}
								<div class="max-h-72 space-y-2 overflow-y-auto pr-1">
									{#each reviewMovieSections as section (section.id)}
										{#each section.items as group (group.id)}
											<div class="rounded-lg border border-base-300 p-2">
												<div
													class="flex items-center gap-2 rounded-lg border p-2 sm:p-3 {selectedGroupId ===
													group.id
														? 'border-primary bg-primary/5'
														: 'border-base-300'}"
												>
													<button
														type="button"
														class="min-w-0 flex-1 text-left"
														onclick={() => switchGroup(group.id)}
													>
														<div class="truncate text-sm font-medium sm:text-base">
															{group.displayName}
														</div>
														<div
															class="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-content/70"
														>
															<span>{formatMediaTypeLabel(getEffectiveMediaType(group))}</span>
															<span>•</span>
															<span
																>{group.detectedFileCount === 1
																	? m.library_import_fileCountSingular({
																			count: group.detectedFileCount
																		})
																	: m.library_import_fileCount({
																			count: group.detectedFileCount
																		})}</span
															>
															{#if canImportGroup(group)}
																<span class="text-success">{m.library_import_ready()}</span>
															{:else if isGroupPending(group.id)}
																<span class="text-warning">{m.library_import_needsInput()}</span>
															{/if}
														</div>
													</button>
													<div class="flex shrink-0 items-center gap-2">
														{#if isGroupImported(group.id)}
															<span class="badge badge-sm badge-success"
																>{m.library_import_badgeImported()}</span
															>
														{:else if isGroupSkipped(group.id)}
															<span class="badge badge-ghost badge-sm"
																>{m.library_import_badgeSkipped()}</span
															>
														{/if}
														{#if !isGroupImported(group.id) && skipActionsEnabled}
															<button
																type="button"
																class="btn btn-ghost btn-xs"
																onclick={() =>
																	isGroupSkipped(group.id)
																		? unskipGroup(group.id)
																		: markGroupSkipped(group.id)}
															>
																{isGroupSkipped(group.id)
																	? m.action_select()
																	: m.library_import_skipItem()}
															</button>
														{/if}
													</div>
												</div>
											</div>
										{/each}
									{/each}
								</div>
							{/if}

							{#if reviewTvSections.length > 0}
								<div class="overflow-hidden rounded-lg border border-base-300 p-2">
									<div
										class="grid gap-3 {hasMultipleReviewTvSeries
											? 'xl:grid-cols-[280px_minmax(0,1fr)]'
											: ''}"
									>
										{#if hasMultipleReviewTvSeries}
											<div class="max-h-80 space-y-1 overflow-y-auto pr-1">
												{#each reviewTvSections as section (section.id)}
													<button
														type="button"
														class="w-full rounded-md border px-3 py-2 text-left transition-colors {activeReviewTvSection?.id ===
														section.id
															? 'border-primary bg-primary/5'
															: 'border-base-300 hover:bg-base-200/50'}"
														onclick={() => selectReviewSeriesSection(section.id)}
													>
														<div class="truncate text-sm font-medium">{section.label}</div>
														<div class="mt-1 text-xs text-base-content/70">
															{section.items.length === 1
																? m.library_import_episodeCountSingular({
																		count: section.items.length
																	})
																: m.library_import_episodeCount({ count: section.items.length })} •
															{m.library_import_seasonsLabel({
																seasons: getDetectedSeasonsLabel(section)
															})}
														</div>
													</button>
												{/each}
											</div>
										{/if}

										<div class="min-w-0 overflow-hidden rounded-md border border-base-300 p-2">
											{#if activeReviewTvSection}
												<div class="flex flex-wrap items-center justify-between gap-2">
													<div class="min-w-0">
														<div class="truncate font-medium">{activeReviewTvSection.label}</div>
														<div class="text-xs text-base-content/70">
															{activeReviewTvSection.items.length === 1
																? m.library_import_episodeCountSingular({
																		count: activeReviewTvSection.items.length
																	})
																: m.library_import_episodeCount({
																		count: activeReviewTvSection.items.length
																	})}
														</div>
													</div>
													{#if hasUnknownSeasonItems(activeReviewTvSection)}
														<div class="flex items-center gap-2">
															<span class="text-xs text-base-content/70"
																>{m.library_import_overrideSeason()}</span
															>
															<input
																type="number"
																min="0"
																class="input-bordered input input-xs w-20"
																value={getSectionSeasonOverride(activeReviewTvSection) ?? ''}
																onchange={(event) =>
																	handleSectionSeasonOverrideChange(activeReviewTvSection, event)}
															/>
														</div>
													{/if}
												</div>

												{#if activeReviewTvSection.seasonSections}
													<div class="mt-2 flex flex-wrap gap-2">
														{#each activeReviewTvSection.seasonSections as seasonSection (seasonSection.key)}
															<button
																type="button"
																class="btn btn-xs {activeReviewSeasonSection?.key ===
																seasonSection.key
																	? 'btn-primary'
																	: 'btn-ghost'}"
																onclick={() => selectReviewSeasonSection(seasonSection.key)}
															>
																{seasonSection.label} ({seasonSection.items.length})
															</button>
														{/each}
													</div>
												{/if}
												{#if activeReviewSeasonSection && getSkippableSeasonGroups(activeReviewSeasonSection).length > 0}
													<div
														class="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-base-300 bg-base-200/40 p-2"
													>
														<div class="text-xs text-base-content/70">
															{activeReviewSeasonSection.label}: {m.library_import_skippedOfTotal({
																skipped: getSeasonSectionSkippedCount(activeReviewSeasonSection),
																total: getSkippableSeasonGroups(activeReviewSeasonSection).length
															})}
														</div>
														<div class="flex flex-wrap items-center gap-2">
															<button
																type="button"
																class="btn btn-ghost btn-xs"
																disabled={!canApplySelectedMatchToSeason(activeReviewSeasonSection)}
																onclick={() =>
																	applySelectedMatchToSeason(activeReviewSeasonSection)}
															>
																{m.library_import_applyMatchToSeason()}
															</button>
															<button
																type="button"
																class="btn btn-ghost btn-xs"
																onclick={() =>
																	toggleSeasonSectionSkipped(activeReviewSeasonSection)}
															>
																{isSeasonSectionFullySkipped(activeReviewSeasonSection)
																	? m.library_import_selectSeason()
																	: m.library_import_skipSeason()}
															</button>
														</div>
													</div>
												{/if}

												<div class="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
													{#each activeReviewSeasonSection?.items ?? activeReviewTvSection.items as group (group.id)}
														<div
															class="flex items-center gap-2 rounded-lg border p-2 sm:p-3 {selectedGroupId ===
															group.id
																? 'border-primary bg-primary/5'
																: 'border-base-300'}"
														>
															<button
																type="button"
																class="min-w-0 flex-1 text-left"
																onclick={() => switchGroup(group.id)}
															>
																<div class="truncate text-sm font-medium sm:text-base">
																	{group.displayName}
																</div>
																<div
																	class="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-content/70"
																>
																	<span>{formatMediaTypeLabel(getEffectiveMediaType(group))}</span>
																	<span>•</span>
																	<span
																		>{group.detectedFileCount === 1
																			? m.library_import_fileCountSingular({
																					count: group.detectedFileCount
																				})
																			: m.library_import_fileCount({
																					count: group.detectedFileCount
																				})}</span
																	>
																	{#if canImportGroup(group)}
																		<span class="text-success">{m.library_import_ready()}</span>
																	{:else if isGroupPending(group.id)}
																		<span class="text-warning">{m.library_import_needsInput()}</span
																		>
																	{/if}
																</div>
															</button>
															<div class="flex shrink-0 items-center gap-2">
																{#if isGroupImported(group.id)}
																	<span class="badge badge-sm badge-success"
																		>{m.library_import_badgeImported()}</span
																	>
																{:else if isGroupSkipped(group.id)}
																	<span class="badge badge-ghost badge-sm"
																		>{m.library_import_badgeSkipped()}</span
																	>
																{/if}
																{#if !isGroupImported(group.id) && skipActionsEnabled}
																	<button
																		type="button"
																		class="btn btn-ghost btn-xs"
																		onclick={() =>
																			isGroupSkipped(group.id)
																				? unskipGroup(group.id)
																				: markGroupSkipped(group.id)}
																	>
																		{isGroupSkipped(group.id)
																			? m.action_select()
																			: m.library_import_skipItem()}
																	</button>
																{/if}
															</div>
														</div>
													{/each}
												</div>
											{/if}
										</div>
									</div>
								</div>
							{/if}
						{/if}
					</div>
				</div>
			{/if}

			{#if isMultiGroupReview && !showSelectedItemEditor}
				<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div class="min-w-0">
							<div class="text-sm text-base-content/60">{m.library_import_selectedItem()}</div>
							<div class="truncate text-lg font-semibold">{activeGroup.displayName}</div>
							<div class="text-sm text-base-content/70">
								{formatMediaTypeLabel(activeGroup.inferredMediaType)} • {activeGroup.detectedFileCount ===
								1
									? m.library_import_fileCountSingular({ count: activeGroup.detectedFileCount })
									: m.library_import_fileCount({ count: activeGroup.detectedFileCount })}
							</div>
						</div>
						<button
							class="btn btn-outline"
							onclick={() => (showSelectedItemEditor = true)}
							disabled={isGroupImported(activeGroup.id)}
						>
							{m.library_import_configureSelectedItem()}
						</button>
					</div>
				</div>
			{:else}
				<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
					<div class="grid gap-4 lg:grid-cols-2">
						<div class="space-y-1">
							<div class="text-sm text-base-content/60">{m.library_import_source()}</div>
							<div class="font-medium break-all">{activeGroup.sourcePath}</div>
							<div class="text-xs break-all text-base-content/60">
								{m.library_import_primaryFile({ path: activeGroup.selectedFilePath })}
							</div>
							<div class="text-sm text-base-content/70">
								{m.library_import_parsed()}
								<span class="font-medium">{activeGroup.parsedTitle}</span>
								{#if activeGroup.parsedYear}
									({activeGroup.parsedYear})
								{/if}
							</div>
							<div class="text-sm text-base-content/70">
								{m.library_import_filesDetected()}
								<span class="font-medium">{activeGroup.detectedFileCount}</span>
								{#if activeGroup.detectedSeasons && activeGroup.detectedSeasons.length > 1}
									<span class="ml-2"
										>{m.library_import_seasonsDetectedInline({
											seasons: activeGroup.detectedSeasons.join(', ')
										})}</span
									>
								{/if}
							</div>
							<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
								{#if isGroupImported(activeGroup.id)}
									<span class="badge badge-sm badge-success"
										>{m.library_import_badgeImported()}</span
									>
								{:else if isGroupSkipped(activeGroup.id)}
									<span class="badge badge-ghost badge-sm">{m.library_import_badgeSkipped()}</span>
								{:else if canImportGroup(activeGroup)}
									<span class="badge badge-sm badge-primary">{m.library_import_badgeReady()}</span>
								{:else}
									<span class="badge badge-sm badge-warning"
										>{m.library_import_badgeNeedsInput()}</span
									>
								{/if}
								{#if !isGroupImported(activeGroup.id) && skipActionsEnabled}
									<button class="btn btn-ghost btn-xs" onclick={toggleSkipActiveGroup}>
										{isGroupSkipped(activeGroup.id)
											? m.library_import_selectItem()
											: m.library_import_skipItem()}
									</button>
								{/if}
							</div>
						</div>
						<div class="space-y-2">
							<div class="text-sm text-base-content/60">{m.library_import_mediaTypeHeading()}</div>
							<div class="flex gap-2">
								<button
									type="button"
									class="btn btn-sm {selectedMediaType === 'movie' ? 'btn-primary' : 'btn-ghost'}"
									onclick={() => switchMediaType('movie')}
									disabled={isMediaTypeLockedByContext}
								>
									<Clapperboard class="h-4 w-4" />
									{m.common_movie()}
								</button>
								<button
									type="button"
									class="btn btn-sm {selectedMediaType === 'tv' ? 'btn-primary' : 'btn-ghost'}"
									onclick={() => switchMediaType('tv')}
									disabled={isMediaTypeLockedByContext}
								>
									<Tv class="h-4 w-4" />
									{m.ui_mediaType_tv()}
								</button>
							</div>
							{#if isMediaTypeLockedByContext}
								<div class="text-xs text-base-content/60">
									{m.library_import_mediaTypeLocked()}
								</div>
							{/if}
							{#if selectedMediaType === 'tv' && !isBatchTvImport}
								<div class="grid grid-cols-2 gap-2">
									<label class="form-control">
										<span class="label-text text-xs">{m.library_import_seasonLabel()}</span>
										<input
											type="number"
											min="0"
											class="input-bordered input input-sm"
											bind:value={seasonNumber}
											onchange={handleSeasonNumberChange}
										/>
										{#if canApplyActiveSeasonOverride()}
											<div class="mt-2">
												<button
													type="button"
													class="btn btn-ghost btn-xs"
													onclick={handleSeasonNumberChange}
												>
													{m.action_apply()}
												</button>
											</div>
										{/if}
									</label>
									<label class="form-control">
										<span class="label-text text-xs">{m.library_import_episodeLabel()}</span>
										<input
											type="number"
											min="1"
											class="input-bordered input input-sm"
											bind:value={episodeNumber}
											onchange={persistActiveGroupState}
										/>
									</label>
								</div>
							{:else if selectedMediaType === 'tv' && isBatchTvImport}
								<div class="space-y-2 rounded border border-base-300 bg-base-200/40 p-2">
									<div class="text-xs text-base-content/70">
										{m.library_import_episodeMappingAutoDetected()}
									</div>
									<label class="form-control">
										<span class="label-text text-xs">{m.library_import_seasonOverrideLabel()}</span>
										<input
											type="number"
											min="0"
											class="input-bordered input input-sm"
											placeholder={m.library_import_seasonOverridePlaceholder()}
											bind:value={batchSeasonOverride}
											onchange={persistActiveGroupState}
										/>
										<div class="label-text-alt text-xs text-base-content/60">
											{m.library_import_seasonOverrideHint()}
										</div>
									</label>
								</div>
							{/if}
							{#if isGroupImported(activeGroup.id)}
								<div class="text-xs text-success">
									{m.library_import_alreadyImported()}
								</div>
							{:else if isGroupSkipped(activeGroup.id)}
								<div class="text-xs text-base-content/70">
									{m.library_import_itemSkipped()}
								</div>
							{/if}
						</div>
						{#if parsedSourceContextMismatch && routeImportContext}
							<div class="alert text-sm alert-warning lg:col-span-2">
								<span>
									{m.library_import_parsedFileSuggests()}
									<strong
										>{activeGroup.parsedTitle}
										{#if activeGroup.parsedYear}
											({activeGroup.parsedYear})
										{/if}</strong
									>, {m.library_import_butImportOpenedFor()}
									<strong
										>{routeImportContext.title || `TMDB ${routeImportContext.tmdbId}`}
										{#if routeImportContext.year}
											({routeImportContext.year})
										{/if}</strong
									>.
								</span>
							</div>
						{/if}
					</div>
				</div>

				<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
					{#if routeImportContext}
						<div class="mb-3 alert text-sm alert-info">
							<span>
								{m.library_import_directImportFor()}
								<strong
									>{routeImportContext.title || `TMDB ${routeImportContext.tmdbId}`}
									{#if routeImportContext.year}
										({routeImportContext.year})
									{/if}</strong
								>.
							</span>
						</div>
					{:else}
						<div class="mb-3 flex items-center gap-2">
							<div class="group relative w-full">
								<div class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2">
									{#if searchingMatches}
										<Loader2
											class="h-4 w-4 animate-spin text-base-content/40 transition-colors group-focus-within:text-primary"
										/>
									{:else}
										<Search
											class="h-4 w-4 text-base-content/40 transition-colors group-focus-within:text-primary"
										/>
									{/if}
								</div>
								<input
									type="text"
									placeholder={m.library_import_searchTmdbPlaceholder()}
									class="input input-md w-full rounded-full border-base-content/20 bg-base-200/60 pr-9 pl-10 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none"
									value={searchQuery}
									oninput={handleMatchSearchInput}
									onkeydown={(event) => {
										if (event.key === 'Enter') {
											event.preventDefault();
											searchTmdb();
										}
										if (event.key === 'Escape') {
											clearMatchSearch();
										}
									}}
								/>
								{#if searchQuery}
									<button
										class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-base-content/40 transition-colors hover:bg-base-300 hover:text-base-content"
										onclick={clearMatchSearch}
										aria-label={m.library_import_clearTmdbSearch()}
									>
										<X class="h-3.5 w-3.5" />
									</button>
								{/if}
							</div>
						</div>
					{/if}
					{#if selectedMatchContextMismatch && routeImportContext && selectedMatch}
						<div class="mt-3 mb-3 alert text-sm alert-warning">
							<span>
								{m.library_import_importOpenedFor()}
								<strong
									>{routeImportContext.title || `TMDB ${routeImportContext.tmdbId}`}
									{#if routeImportContext.year}
										({routeImportContext.year})
									{/if}</strong
								>, {m.library_import_butSelectedMatchIs()}
								<strong
									>{selectedMatch.title}
									{#if selectedMatch.year}
										({selectedMatch.year})
									{/if}</strong
								>".
							</span>
						</div>
					{/if}
					{#if canApplyMatchSelectionToActiveSeason}
						<div class="mt-3 mb-3 rounded-lg border border-base-300 bg-base-200/40 p-3">
							<label class="flex cursor-pointer items-center justify-between gap-3">
								<span class="text-sm font-medium">
									{m.library_import_matchEntireSelectedSeason()}
								</span>
								<input
									type="checkbox"
									class="toggle toggle-sm"
									bind:checked={applySelectedMatchToSeasonOnSelect}
								/>
							</label>
							<p class="mt-1 text-xs text-base-content/70">
								{m.library_import_matchEntireSelectedSeasonHint()}
							</p>
						</div>
					{/if}

					{#if matchCandidates.length === 0}
						<div
							class="rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/60"
						>
							{m.library_import_noMatchesYet()}
						</div>
					{:else}
						<div class="max-h-80 space-y-2 overflow-y-auto pr-1">
							{#each matchCandidates as match (match.mediaType + '-' + match.tmdbId)}
								<button
									type="button"
									class="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:border-primary/50 {selectedMatch?.tmdbId ===
										match.tmdbId && selectedMatch?.mediaType === match.mediaType
										? 'border-primary bg-primary/5'
										: 'border-base-300'}"
									onclick={() => chooseMatch(match)}
								>
									<div class="min-w-0">
										<div class="truncate font-medium">
											{match.title}
											{#if match.year}
												<span class="text-base-content/60">({match.year})</span>
											{/if}
										</div>
										<div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
											<span class="badge badge-outline badge-sm">
												{match.mediaType === 'movie' ? m.common_movie() : m.ui_mediaType_tv()}
											</span>
											{#if match.confidence > 0}
												<span class="badge badge-ghost badge-sm"
													>{m.library_import_confidenceMatch({
														percent: Math.round(match.confidence * 100)
													})}</span
												>
											{/if}
											{#if match.inLibrary}
												<span class="badge badge-sm badge-success"
													>{m.library_import_inLibrary()}</span
												>
											{/if}
										</div>
									</div>
									{#if selectedMatch?.tmdbId === match.tmdbId && selectedMatch?.mediaType === match.mediaType}
										<Check class="h-4 w-4 text-primary" />
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<button class="btn btn-ghost" onclick={() => goToStep(1)}>{m.action_back()}</button>
				<button
					class="btn btn-primary"
					onclick={() => goToStep(3)}
					disabled={!canProceedFromReview}
				>
					{m.library_import_continueToImport()}
				</button>
			</div>
		</div>
	{/if}

	{#if step === 3 && isMultiGroupReview && detection}
		<div class="space-y-4">
			<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
				<h2 class="text-lg font-semibold">{m.library_import_importSelectionHeading()}</h2>
				<p class="mt-1 text-sm text-base-content/70">
					{m.library_import_importSelectionHint()}
				</p>

				<div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
					<span class="badge badge-primary"
						>{m.library_import_selectedCount({ count: selectedImportGroupCount })}</span
					>
					<span class="badge badge-success"
						>{m.library_import_readyCount({ count: readyGroupCount })}</span
					>
					{#if selectedNeedsInputCount > 0}
						<span class="badge badge-warning"
							>{m.library_import_needInputCount({ count: selectedNeedsInputCount })}</span
						>
					{/if}
					{#if skippedGroupCount > 0}
						<span class="badge badge-ghost"
							>{m.library_import_skippedCount({ count: skippedGroupCount })}</span
						>
					{/if}
				</div>
			</div>

			<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
				<h3 class="font-semibold">{m.library_import_selectedItemsHeading()}</h3>
				<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
					<p class="text-xs text-base-content/70">{m.library_import_filterByMediaType()}</p>
					<div class="join">
						<button
							type="button"
							class="btn join-item btn-sm {importMediaFilter === 'all'
								? 'btn-primary'
								: 'btn-ghost'}"
							onclick={() => (importMediaFilter = 'all')}
						>
							{m.library_import_filterAllMedia()}
						</button>
						<button
							type="button"
							class="btn join-item btn-sm {importMediaFilter === 'movie'
								? 'btn-primary'
								: 'btn-ghost'}"
							onclick={() => (importMediaFilter = 'movie')}
						>
							{m.common_movies()}
						</button>
						<button
							type="button"
							class="btn join-item btn-sm {importMediaFilter === 'tv'
								? 'btn-primary'
								: 'btn-ghost'}"
							onclick={() => (importMediaFilter = 'tv')}
						>
							{m.common_tvShows()}
						</button>
					</div>
				</div>
				{#if selectedImportGroupCount === 0}
					<div
						class="mt-3 rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/60"
					>
						{m.library_import_noItemsSelected()}
					</div>
				{:else if importSelectionSections.length === 0}
					<div
						class="mt-3 rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/60"
					>
						{m.library_import_noItemsMatchFilter()}
					</div>
				{:else}
					<div class="mt-3 space-y-3">
						{#if importMovieSections.length > 0}
							<div class="max-h-72 space-y-2 overflow-y-auto pr-1">
								{#each importMovieSections as section (section.id)}
									{#each section.items as group (group.id)}
										<div class="rounded-lg border border-base-300 p-2">
											<div
												class="flex items-center justify-between gap-3 rounded-lg border border-base-300 p-3"
											>
												<div class="min-w-0">
													<div class="truncate font-medium">{group.displayName}</div>
													<div
														class="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-content/70"
													>
														<span>{formatMediaTypeLabel(getEffectiveMediaType(group))}</span>
														<span>•</span>
														<span
															>{group.detectedFileCount === 1
																? m.library_import_fileCountSingular({
																		count: group.detectedFileCount
																	})
																: m.library_import_fileCount({
																		count: group.detectedFileCount
																	})}</span
														>
														{#if canImportGroup(group)}
															<span class="text-success">{m.library_import_ready()}</span>
														{:else}
															<span class="text-warning">{m.library_import_needsInput()}</span>
														{/if}
													</div>
												</div>
												<button
													class="btn btn-ghost btn-xs"
													onclick={() => {
														switchGroup(group.id);
														step = 2;
														showSelectedItemEditor = true;
													}}
												>
													{m.library_import_review()}
												</button>
											</div>
										</div>
									{/each}
								{/each}
							</div>
						{/if}

						{#if importTvSections.length > 0}
							<div class="overflow-hidden rounded-lg border border-base-300 p-2">
								<div
									class="grid gap-3 {hasMultipleImportTvSeries
										? 'xl:grid-cols-[280px_minmax(0,1fr)]'
										: ''}"
								>
									{#if hasMultipleImportTvSeries}
										<div class="max-h-80 space-y-1 overflow-y-auto pr-1">
											{#each importTvSections as section (section.id)}
												<button
													type="button"
													class="w-full rounded-md border px-3 py-2 text-left transition-colors {activeImportTvSection?.id ===
													section.id
														? 'border-primary bg-primary/5'
														: 'border-base-300 hover:bg-base-200/50'}"
													onclick={() => selectImportSeriesSection(section.id)}
												>
													<div class="truncate text-sm font-medium">{section.label}</div>
													<div class="mt-1 text-xs text-base-content/70">
														{section.items.length === 1
															? m.library_import_episodeCountSingular({
																	count: section.items.length
																})
															: m.library_import_episodeCount({ count: section.items.length })} • {m.library_import_seasonsLabel(
															{ seasons: getDetectedSeasonsLabel(section) }
														)}
													</div>
												</button>
											{/each}
										</div>
									{/if}

									<div class="min-w-0 overflow-hidden rounded-md border border-base-300 p-2">
										{#if activeImportTvSection}
											<div class="min-w-0">
												<div class="truncate font-medium">{activeImportTvSection.label}</div>
												<div class="text-xs text-base-content/70">
													{activeImportTvSection.items.length === 1
														? m.library_import_episodeCountSingular({
																count: activeImportTvSection.items.length
															})
														: m.library_import_episodeCount({
																count: activeImportTvSection.items.length
															})}
												</div>
											</div>

											{@const mediaDestinationOptions =
												getSectionDestinationOptions(activeImportTvSection)}
											{@const mediaDestinationEligibleCount =
												getSectionDestinationEligibleGroups(activeImportTvSection).length}
											{#if mediaDestinationOptions.length > 0}
												<div
													class="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-base-300 bg-base-200/40 p-2"
												>
													<div class="min-w-64 flex-1">
														<div class="pb-1 text-xs text-base-content/80">
															{m.library_import_destinationRootFolder()}
														</div>
														<select
															class="select-bordered select w-full select-xs"
															value={bulkDestinationBySectionId[activeImportTvSection.id] ?? ''}
															onchange={(event) =>
																updateSectionDestination(
																	activeImportTvSection.id,
																	(event.target as HTMLSelectElement).value
																)}
														>
															<option disabled value=""
																>{m.library_import_selectRootFolder()}</option
															>
															{#each mediaDestinationOptions as folder (folder.id)}
																<option value={folder.id}
																	>{folder.name}
																	{#if folder.defaultRootFolderPath}
																		- {folder.defaultRootFolderPath}
																	{/if}</option
																>
															{/each}
														</select>
													</div>
													<button
														type="button"
														class="btn btn-ghost btn-xs"
														disabled={!canApplySelectedDestinationToMedia(activeImportTvSection)}
														onclick={() => applySelectedDestinationToMedia(activeImportTvSection)}
													>
														{m.library_import_applyDestinationToMedia()}
													</button>
												</div>
											{:else}
												<div
													class="mt-2 rounded-md border border-base-300 bg-base-200/40 p-2 text-xs text-base-content/70"
												>
													{#if mediaDestinationEligibleCount === 0}
														{m.library_import_destinationNotNeededForExistingMedia()}
													{:else}
														{m.library_import_noCommonDestinationForMedia()}
													{/if}
												</div>
											{/if}

											{#if activeImportTvSection.seasonSections}
												<div class="mt-2 flex flex-wrap gap-2">
													{#each activeImportTvSection.seasonSections as seasonSection (seasonSection.key)}
														<button
															type="button"
															class="btn btn-xs {activeImportSeasonSection?.key ===
															seasonSection.key
																? 'btn-primary'
																: 'btn-ghost'}"
															onclick={() => selectImportSeasonSection(seasonSection.key)}
														>
															{seasonSection.label} ({seasonSection.items.length})
														</button>
													{/each}
												</div>
											{/if}

											<div class="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
												{#each activeImportSeasonSection?.items ?? activeImportTvSection.items as group (group.id)}
													<div
														class="flex items-center justify-between gap-3 rounded-lg border border-base-300 p-3"
													>
														<div class="min-w-0">
															<div class="truncate font-medium">{group.displayName}</div>
															<div
																class="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-content/70"
															>
																<span>{formatMediaTypeLabel(getEffectiveMediaType(group))}</span>
																<span>•</span>
																<span
																	>{group.detectedFileCount === 1
																		? m.library_import_fileCountSingular({
																				count: group.detectedFileCount
																			})
																		: m.library_import_fileCount({
																				count: group.detectedFileCount
																			})}</span
																>
																{#if canImportGroup(group)}
																	<span class="text-success">{m.library_import_ready()}</span>
																{:else}
																	<span class="text-warning">{m.library_import_needsInput()}</span>
																{/if}
															</div>
														</div>
														<button
															class="btn btn-ghost btn-xs"
															onclick={() => {
																switchGroup(group.id);
																step = 2;
																showSelectedItemEditor = true;
															}}
														>
															{m.library_import_review()}
														</button>
													</div>
												{/each}
											</div>
										{/if}
									</div>
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			{#if selectedNeedsInputCount > 0}
				<div class="alert text-sm alert-warning">
					<span>
						{m.library_import_needsInputWarning({ count: selectedNeedsInputCount })}
					</span>
				</div>
			{/if}

			<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<button class="btn btn-ghost" onclick={() => goToStep(2)}
					>{m.library_import_backToReview()}</button
				>
				<button
					class="btn btn-primary"
					onclick={executeBulkImportFlow}
					disabled={executingImport ||
						selectedImportGroupCount === 0 ||
						selectedNeedsInputCount > 0}
				>
					{#if executingImport}
						<Loader2 class="h-4 w-4 animate-spin" />
						{m.library_import_importing()}
					{:else}
						<Check class="h-4 w-4" />
						{m.library_import_startImportCount({ count: selectedImportGroupCount })}
					{/if}
				</button>
			</div>
		</div>
	{/if}

	{#if step === 3 && !isMultiGroupReview && activeGroup && selectedMatch}
		<div class="space-y-4">
			<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
				<h2 class="text-lg font-semibold">{m.library_import_importTargetHeading()}</h2>
				<p class="mt-1 text-sm text-base-content/70">
					{m.library_import_importTargetHint()}
				</p>
				<div class="mt-4 grid gap-2 sm:grid-cols-2">
					<label
						class="flex cursor-pointer items-start gap-3 rounded-lg border border-base-300 p-3 {selectedMatch.inLibrary
							? 'opacity-60'
							: ''}"
					>
						<input
							type="radio"
							name="import-target"
							class="radio mt-1 radio-primary"
							checked={importTarget === 'new'}
							onchange={() => !selectedMatch?.inLibrary && (importTarget = 'new')}
							disabled={selectedMatch?.inLibrary}
						/>
						<div>
							<div class="font-medium">{m.library_import_createNew()}</div>
							<div class="text-sm text-base-content/70">
								{m.library_import_createNewHint()}
							</div>
						</div>
					</label>
					<label
						class="flex cursor-pointer items-start gap-3 rounded-lg border border-base-300 p-3 {selectedMatch.inLibrary
							? ''
							: 'opacity-60'}"
					>
						<input
							type="radio"
							name="import-target"
							class="radio mt-1 radio-primary"
							checked={importTarget === 'existing'}
							onchange={() => selectedMatch?.inLibrary && (importTarget = 'existing')}
							disabled={!selectedMatch?.inLibrary}
						/>
						<div>
							<div class="font-medium">{m.library_import_matchExisting()}</div>
							<div class="text-sm text-base-content/70">
								{m.library_import_matchExistingHint()}
							</div>
						</div>
					</label>
				</div>
			</div>

			{#if importTarget === 'new'}
				<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
					<h3 class="font-semibold">{m.library_import_destinationRootFolder()}</h3>
					{#if loadingRootFolders}
						<div class="mt-2 flex items-center gap-2 text-sm text-base-content/70">
							<Loader2 class="h-4 w-4 animate-spin" />
							{m.library_import_loadingFolders()}
						</div>
					{:else if destinationLibrariesForType.length === 0}
						<div class="mt-3 alert text-sm alert-warning">
							<span>{m.library_import_noWritableFolders()}</span>
						</div>
					{:else}
						<select
							class="select-bordered select mt-3 w-full"
							bind:value={selectedRootFolder}
							onchange={persistActiveGroupState}
						>
							<option disabled value="">{m.library_import_selectRootFolder()}</option>
							{#each destinationLibrariesForType as library (library.id)}
								<option value={library.id}
									>{library.name}
									{#if library.defaultRootFolderPath}
										- {library.defaultRootFolderPath}
									{/if}</option
								>
							{/each}
						</select>
					{/if}
				</div>
			{:else}
				<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
					<h3 class="font-semibold">{m.library_import_existingItemMatch()}</h3>
					<div class="mt-2 text-sm text-base-content/70">
						{m.library_import_importingIntoExisting()}
						<span class="font-medium text-base-content">{selectedMatch.title}</span>
					</div>
				</div>
			{/if}

			<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
				<h3 class="font-semibold">{m.library_import_summaryHeading()}</h3>
				{#if selectedMatchContextMismatch && routeImportContext}
					<div class="mt-3 alert text-sm alert-warning">
						<span>
							{m.library_import_importOpenedFor()}
							<strong
								>{routeImportContext.title || `TMDB ${routeImportContext.tmdbId}`}
								{#if routeImportContext.year}
									({routeImportContext.year})
								{/if}</strong
							>, {m.library_import_butSelectedMatchIs()}
							<strong
								>{selectedMatch.title}
								{#if selectedMatch.year}
									({selectedMatch.year})
								{/if}</strong
							>.
						</span>
					</div>
				{/if}
				<div class="mt-2 space-y-1 text-sm">
					<div>
						<span class="text-base-content/60">{m.library_import_summarySource()}</span>
						{activeGroup.sourcePath}
					</div>
					<div>
						<span class="text-base-content/60">{m.library_import_summaryMatch()}</span>
						{selectedMatch.title}
						{#if selectedMatch.year}
							({selectedMatch.year})
						{/if}
					</div>
					<div>
						<span class="text-base-content/60">{m.library_import_summaryType()}</span>
						{formatMediaTypeLabel(selectedMediaType)}
					</div>
					{#if selectedMediaType === 'tv'}
						<div>
							{#if activeGroup.detectedFileCount > 1}
								<span class="text-base-content/60"
									>{m.library_import_summaryDetectedEpisodes()}</span
								>
								{m.library_import_summaryFilesCount({ count: activeGroup.detectedFileCount })}
								{#if activeGroup.detectedSeasons && activeGroup.detectedSeasons.length > 0}
									({m.library_import_summarySeasonsInline({
										seasons: activeGroup.detectedSeasons.join(', ')
									})})
								{/if}
								{#if batchSeasonOverride !== null}
									<span class="ml-2 text-base-content/70"
										>{m.library_import_summaryOverrideSeason({ season: batchSeasonOverride })}</span
									>
								{/if}
							{:else}
								<span class="text-base-content/60">{m.library_import_summaryEpisode()}</span>
								S{seasonNumber}E{episodeNumber}
							{/if}
						</div>
					{/if}
				</div>
			</div>

			<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<button class="btn btn-ghost" onclick={() => goToStep(2)}>{m.action_back()}</button>
				<button
					class="btn btn-primary"
					onclick={executeImportFlow}
					disabled={!canProceedToImport || executingImport}
				>
					{#if executingImport}
						<Loader2 class="h-4 w-4 animate-spin" />
						{m.library_import_importing()}
					{:else}
						<Check class="h-4 w-4" />
						{m.library_import_startImport()}
					{/if}
				</button>
			</div>
		</div>
	{/if}

	{#if step === 4 && executeError}
		<div class="rounded-xl border border-error/40 bg-error/5 p-5">
			<div class="flex items-start gap-3">
				<div class="mt-0.5 rounded-full bg-error/20 p-2">
					<X class="h-5 w-5 text-error" />
				</div>
				<div class="min-w-0 flex-1">
					<h2 class="text-xl font-semibold">{m.library_import_importFailed()}</h2>
					<p class="mt-1 text-sm text-base-content/80">
						{executeError}
					</p>
					<div class="mt-4 flex flex-wrap gap-2">
						<button
							class="btn btn-sm btn-primary"
							onclick={() => {
								executeError = null;
								step = 3;
							}}
						>
							{m.library_import_tryAgain()}
						</button>
						{#if originLibraryLink}
							<a class="btn btn-outline btn-sm" href={originLibraryLink}
								>{m.library_import_backToLibraryItem()}</a
							>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{:else if step === 4 && executeResult}
		<div class="rounded-xl border border-success/40 bg-success/5 p-5">
			<div class="flex items-start gap-3">
				<div class="mt-0.5 rounded-full bg-success/20 p-2">
					<Check class="h-5 w-5 text-success" />
				</div>
				<div class="min-w-0 flex-1">
					<h2 class="text-xl font-semibold">{m.library_import_importComplete()}</h2>
					{#if bulkImportSummary}
						<p class="mt-1 text-sm text-base-content/80">
							{#if bulkImportSummary.failedGroups > 0}
								{m.library_import_bulkImportedWithFailures({
									imported: bulkImportSummary.importedGroups,
									failed: bulkImportSummary.failedGroups
								})}
							{:else}
								{m.library_import_bulkImportedSuccess({
									imported: bulkImportSummary.importedGroups
								})}
							{/if}
						</p>
						{#if skippedGroupCount > 0}
							<p class="mt-1 text-sm text-base-content/70">
								{m.library_import_bulkSkippedItems({ count: skippedGroupCount })}
							</p>
						{/if}
					{:else}
						<p class="mt-1 text-sm text-base-content/80">
							{executeResult.importedCount && executeResult.importedCount > 1
								? m.library_import_filesImportedPlural({ count: executeResult.importedCount })
								: m.library_import_fileImportedSingular()}
						</p>
					{/if}
					<div class="mt-3 rounded-lg bg-base-100 p-3 text-sm break-all">
						<div>
							<span class="text-base-content/60">{m.library_import_importedPathLabel()}</span>
							{executeResult.importedPath}
						</div>
					</div>
					<div class="mt-4 flex flex-wrap gap-2">
						{#if completionLink}
							<a class="btn btn-sm btn-primary" href={completionLink}>
								{bulkImportSummary
									? m.library_import_viewLastImported()
									: m.library_import_viewInLibrary()}
							</a>
						{/if}
						{#if remainingGroupCount > 0}
							<button class="btn btn-outline btn-sm" onclick={continueWithNextDetected}>
								{m.library_import_importNextDetected({ count: remainingGroupCount })}
							</button>
						{/if}
						<button class="btn btn-ghost btn-sm" onclick={resetWizard}
							>{m.library_import_importAnother()}</button
						>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<ConfirmationModal
	open={leaveImportModalOpen}
	title={m.library_import_cancelImportTitle()}
	message={m.library_import_cancelImportMessage()}
	confirmLabel={m.library_import_cancelImportConfirm()}
	cancelLabel={m.library_import_cancelImportStay()}
	confirmVariant="error"
	onConfirm={confirmLeaveImportModal}
	onCancel={closeLeaveImportModal}
/>
