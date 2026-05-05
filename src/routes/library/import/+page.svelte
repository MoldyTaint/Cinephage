<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ConfirmationModal } from '$lib/components/ui/modal';
	import {
		Step1PathSelector,
		DetectionGroupList,
		GroupEditorPanel,
		Step3MultiImport,
		Step3SingleImport,
		Step4Completion
	} from '$lib/components/library/import/index.js';
	import { resolvePath } from '$lib/utils/routing';
	import {
		getRootFolders,
		getLibraryClassificationSettings,
		getLibraries,
		executeImport,
		detectMedia,
		getLibraryStatus
	} from '$lib/api';
	import { searchTmdb as searchTmdbApi } from '$lib/api';
	import { browseFilesystem } from '$lib/api';
	import { sortRootFoldersForMediaType } from '$lib/utils/root-folders.js';
	import { isLikelyAnimeMedia } from '$lib/shared/anime-classification.js';
	import { toasts } from '$lib/stores/toast.svelte';

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
	const routeImportContext = $derived.by(() => parseImportContext(page.url.searchParams));
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
		if (destinationUrl && destinationUrl.href === page.url.href) {
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
		const newSessionToken = page.url.searchParams.get('newSession');
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
			const [foldersResult, classificationResult, librariesResult] = await Promise.allSettled([
				getRootFolders(),
				getLibraryClassificationSettings(),
				getLibraries({ includeSystem: true })
			]);

			if (foldersResult.status === 'rejected') throw foldersResult.reason;

			const foldersPayload = foldersResult.value;
			if (Array.isArray(foldersPayload)) {
				rootFolders = foldersPayload;
			} else if (foldersPayload && typeof foldersPayload === 'object') {
				rootFolders = (foldersPayload as { folders?: RootFolder[] }).folders ?? [];
			} else {
				rootFolders = [];
			}

			enforceAnimeSubtype = false;
			if (classificationResult.status === 'fulfilled') {
				const classificationPayload = classificationResult.value;
				enforceAnimeSubtype = Boolean(
					classificationPayload &&
					typeof classificationPayload === 'object' &&
					(classificationPayload as { enforceAnimeSubtype?: boolean }).enforceAnimeSubtype === true
				);
			}

			destinationLibraries = [];
			if (librariesResult.status === 'fulfilled') {
				const librariesPayload = librariesResult.value;
				if (
					librariesPayload &&
					typeof librariesPayload === 'object' &&
					Array.isArray((librariesPayload as { libraries?: DestinationLibrary[] }).libraries)
				) {
					destinationLibraries = (librariesPayload as { libraries?: DestinationLibrary[] })
						.libraries;
				}
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
			const payload = await browseFilesystem(path, {
				includeFiles: true,
				fileFilter: 'video',
				excludeManagedRoots: true
			});

			if (!payload || typeof payload !== 'object') {
				browserError = 'Invalid response from filesystem browser';
				return;
			}

			const data = payload as {
				currentPath?: string;
				parentPath?: string | null;
				entries?: BrowseEntry[];
				error?: string;
			};

			if (data.error) {
				browserError = data.error;
			}
			browserPath = data.currentPath ?? path ?? '';
			if (!sourcePath && data.currentPath) {
				sourcePath = data.currentPath;
			}
			browserParentPath = data.parentPath ?? null;
			browserEntries = data.entries ?? [];
		} catch (error) {
			browserError = error instanceof Error ? error.message : 'Failed to browse path';
		} finally {
			browserLoading = false;
		}
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
		const data = await executeImport(payload);
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
			const data = await detectMedia(
				sourcePath,
				preferredMediaType !== 'auto' ? preferredMediaType : undefined,
				isFileOnlyContext || undefined
			);
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
			const searchData = await searchTmdbApi({
				query: searchQuery,
				type: selectedMediaType
			});
			const results = (searchData as { results?: Array<{ id: number }> }).results ?? [];

			const tmdbIds = results.map((item: { id: number }) => item.id);
			const statusData = await getLibraryStatus({
				tmdbIds,
				mediaType: selectedMediaType
			});
			const statusMap = (statusData as { status?: Record<string, unknown> }).status ?? {};

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
		<Step1PathSelector
			bind:preferredMediaType
			bind:sourcePath
			{browserPath}
			{browserParentPath}
			{browserEntries}
			{browserLoading}
			{browserError}
			{detecting}
			{isMediaTypeLockedByContext}
			{isFileOnlyContext}
			onBrowse={browse}
			onDetect={runDetection}
		/>
	{/if}

	{#if step === 2 && detection && activeGroup}
		<div class="space-y-4">
			{#if detectionGroups.length > 1}
				<DetectionGroupList
					{reviewDetectionSections}
					{reviewMovieSections}
					{reviewTvSections}
					{activeReviewTvSection}
					{activeReviewSeasonSection}
					{hasMultipleReviewTvSeries}
					bind:detectedGroupQuery
					bind:detectedGroupFilter
					bind:detectedMediaFilter
					{selectedGroupId}
					{importedGroupIds}
					{skippedGroupIds}
					{pendingGroupCount}
					{remainingGroupCount}
					{skippedGroupCount}
					{skipActionsEnabled}
					{getEffectiveMediaType}
					{formatMediaTypeLabel}
					{canImportGroup}
					{hasUnknownSeasonItems}
					{getSectionSeasonOverride}
					{getSkippableSeasonGroups}
					{getSeasonSectionSkippedCount}
					{isSeasonSectionFullySkipped}
					{getDetectedSeasonsLabel}
					{canApplySelectedMatchToSeason}
					onSwitchGroup={switchGroup}
					onSkipGroup={markGroupSkipped}
					onUnskipGroup={unskipGroup}
					onSelectReviewSeriesSection={selectReviewSeriesSection}
					onSelectReviewSeasonSection={selectReviewSeasonSection}
					onApplyMatchToSeason={applySelectedMatchToSeason}
					onToggleSeasonSkipped={toggleSeasonSectionSkipped}
					onSeasonOverrideChange={applySeasonOverrideToSection}
				/>
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
				<GroupEditorPanel
					{activeGroup}
					{selectedMediaType}
					{selectedMatch}
					bind:searchQuery
					{matchCandidates}
					bind:importTarget
					bind:seasonNumber
					bind:episodeNumber
					bind:batchSeasonOverride
					bind:selectedRootFolder
					{isMediaTypeLockedByContext}
					{isBatchTvImport}
					isGroupImported={isGroupImported(activeGroup?.id ?? '')}
					isGroupSkipped={isGroupSkipped(activeGroup?.id ?? '')}
					{skipActionsEnabled}
					{searchingMatches}
					{routeImportContext}
					{selectedMatchContextMismatch}
					{parsedSourceContextMismatch}
					{canApplyMatchSelectionToActiveSeason}
					bind:applyMatchToSeasonOnSelect={applySelectedMatchToSeasonOnSelect}
					{canImportGroup}
					{canApplyActiveSeasonOverride}
					onSwitchMediaType={switchMediaType}
					onChooseMatch={chooseMatch}
					onSearchInput={handleMatchSearchInput}
					onSearch={searchTmdb}
					onClearSearch={clearMatchSearch}
					onSeasonNumberChange={handleSeasonNumberChange}
					onEpisodeNumberChange={persistActiveGroupState}
					onToggleSkip={toggleSkipActiveGroup}
				/>
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
		<Step3MultiImport
			{importMovieSections}
			{importTvSections}
			{activeImportTvSection}
			{activeImportSeasonSection}
			{hasMultipleImportTvSeries}
			bind:importMediaFilter
			{bulkDestinationBySectionId}
			{selectedImportGroupCount}
			{selectedNeedsInputCount}
			{readyGroupCount}
			{skippedGroupCount}
			{executingImport}
			canImport={canImportGroup}
			{getEffectiveMediaType}
			getSectionDestinations={getSectionDestinationOptions}
			getSectionEligibleCount={(section) => getSectionDestinationEligibleGroups(section).length}
			canApplyDestination={canApplySelectedDestinationToMedia}
			onSelectImportSeriesSection={selectImportSeriesSection}
			onSelectImportSeasonSection={selectImportSeasonSection}
			onBulkImport={executeBulkImportFlow}
			onUpdateSectionDestination={updateSectionDestination}
			onApplyDestination={applySelectedDestinationToMedia}
			onReviewGroup={(groupId) => {
				switchGroup(groupId);
				step = 2;
				showSelectedItemEditor = true;
			}}
			onGoToStep={goToStep}
		/>
	{/if}

	{#if step === 3 && !isMultiGroupReview && activeGroup && selectedMatch}
		<Step3SingleImport
			{activeGroup}
			{selectedMatch}
			{selectedMediaType}
			bind:importTarget
			{destinationLibrariesForType}
			bind:selectedRootFolder
			{loadingRootFolders}
			{seasonNumber}
			{episodeNumber}
			{batchSeasonOverride}
			{canProceedToImport}
			{executingImport}
			{selectedMatchContextMismatch}
			{routeImportContext}
			onGoToStep={goToStep}
			onExecuteImport={executeImportFlow}
			onRootFolderChange={persistActiveGroupState}
		/>
	{/if}

	{#if step === 4}
		<Step4Completion
			{executeError}
			{executeResult}
			{bulkImportSummary}
			{skippedGroupCount}
			{remainingGroupCount}
			{completionLink}
			{originLibraryLink}
			onTryAgain={() => {
				executeError = null;
				step = 3;
			}}
			onReset={resetWizard}
			onContinueWithNext={continueWithNextDetected}
		/>
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
