<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowLeft, Loader2, Film, Tv, Save } from 'lucide-svelte';
	import type { SmartListRecord, SmartListFilters } from '$lib/server/db/schema.js';
	import FilterBuilder from './FilterBuilder.svelte';
	import PreviewPanel from './PreviewPanel.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import ExternalSourceConfig from './ExternalSourceConfig.svelte';

	interface RootFolder {
		id: string;
		path: string;
	}

	interface ScoringProfile {
		id: string;
		name: string;
	}

	interface PreviewItem {
		id: number;
		title?: string;
		name?: string;
		poster_path: string | null;
		vote_average: number;
		release_date?: string;
		first_air_date?: string;
		overview?: string;
		inLibrary?: boolean;
	}

	interface Props {
		list?: SmartListRecord | null;
		rootFolders: RootFolder[];
		scoringProfiles: ScoringProfile[];
	}

	let { list = null, rootFolders, scoringProfiles }: Props = $props();

	// Form state
	let saving = $state(false);
	let error = $state<string | null>(null);

	// Basic info
	let name = $state('');
	let description = $state('');
	let mediaType = $state<'movie' | 'tv'>('movie');

	// List source type
	let listSourceType = $state<'tmdb-discover' | 'external-json'>('tmdb-discover');

	// External source config
	let externalSourceConfig = $state<{
		url?: string;
		headers?: Record<string, string>;
		listId?: string;
		username?: string;
	}>({});

	// Preset configuration
	let presetId = $state<string | undefined>(undefined);
	let presetProvider = $state<string | undefined>(undefined);
	let presetSettings = $state<Record<string, unknown>>(Object.create(null));

	// Filters
	let filters = $state<SmartListFilters>({});

	// Settings
	let sortBy = $state('popularity.desc');
	let itemLimit = $state(100);
	let excludeInLibrary = $state(true);
	let refreshIntervalHours = $state(24);

	// Auto-add
	let autoAddBehavior = $state<'disabled' | 'add_only' | 'add_and_search'>('disabled');
	let rootFolderId = $state('');
	let scoringProfileId = $state('');
	let autoAddMonitored = $state(true);

	// Sync form state when list prop changes
	$effect(() => {
		if (list) {
			name = list.name ?? '';
			description = list.description ?? '';
			mediaType = (list.mediaType as 'movie' | 'tv') ?? 'movie';
			listSourceType = (list.listSourceType as typeof listSourceType) ?? 'tmdb-discover';
			externalSourceConfig = list.externalSourceConfig ?? {};
			presetId = list.presetId ?? undefined;
			presetProvider = list.presetProvider ?? undefined;
			presetSettings = (list.presetSettings as Record<string, unknown>) ?? Object.create(null);
			filters = list.filters ?? {};
			sortBy = list.sortBy ?? 'popularity.desc';
			itemLimit = list.itemLimit ?? 100;
			excludeInLibrary = list.excludeInLibrary ?? true;
			refreshIntervalHours = list.refreshIntervalHours ?? 24;
			autoAddBehavior =
				(list.autoAddBehavior as 'disabled' | 'add_only' | 'add_and_search') ?? 'disabled';
			rootFolderId = list.rootFolderId ?? '';
			scoringProfileId = list.scoringProfileId ?? '';
			autoAddMonitored = list.autoAddMonitored ?? true;
		}
	});

	// Preview state
	let previewItems = $state<PreviewItem[]>([]);
	let previewLoading = $state(false);
	let previewError = $state<string | null>(null);
	let previewPage = $state(1);
	let previewTotalResults = $state(0);
	let previewTotalPages = $state(0);
	let previewUnfilteredTotal = $state(0);
	let previewDebugData = $state<
		| {
				failedItems?: Array<{ imdbId?: string; title: string; year?: number; error?: string }>;
				resolvedCount?: number;
				failedCount?: number;
				duplicatesRemoved?: number;
		  }
		| undefined
	>(undefined);

	// Debounce timer
	let debounceTimer: ReturnType<typeof setTimeout>;

	// Fetch preview with debounce
	async function fetchPreview() {
		previewLoading = true;
		previewError = null;
		previewItems = []; // Clear old items immediately to prevent showing stale data

		try {
			const res = await fetch('/api/smartlists/preview', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mediaType,
					filters,
					sortBy,
					itemLimit,
					page: previewPage
				})
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Preview failed');
			}

			const data = await res.json();
			previewItems = data.items;
			previewTotalResults = data.totalResults;
			previewTotalPages = data.totalPages;
			previewUnfilteredTotal = data.unfilteredTotal ?? data.totalResults;
			previewDebugData = undefined; // No debug data for TMDB discover
		} catch (e) {
			previewError = e instanceof Error ? e.message : 'An error occurred';
		} finally {
			previewLoading = false;
		}
	}

	// Fetch external list preview
	async function fetchExternalPreview() {
		previewLoading = true;
		previewError = null;
		previewItems = []; // Clear old items immediately to prevent showing stale data

		try {
			const res = await fetch('/api/smartlists/external/preview', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mediaType,
					url: externalSourceConfig.url,
					headers: externalSourceConfig.headers,
					presetId,
					config: presetSettings,
					itemLimit,
					page: previewPage
				})
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Preview failed');
			}

			const data = await res.json();
			previewItems = data.items;
			previewTotalResults = data.totalResults;
			previewTotalPages = data.totalPages;
			previewUnfilteredTotal = data.unfilteredTotal ?? data.totalResults;
			// Capture debug data for external lists
			previewDebugData = {
				failedItems: data.failedItems,
				resolvedCount: data.resolvedCount,
				failedCount: data.failedCount,
				duplicatesRemoved: data.duplicatesRemoved
			};
		} catch (e) {
			previewError = e instanceof Error ? e.message : 'An error occurred';
		} finally {
			previewLoading = false;
		}
	}

	// Debounced effect for filter changes
	$effect(() => {
		// Deep track filters by serializing (shallow tracking doesn't detect nested property changes)
		const _filtersJson = JSON.stringify(filters);
		const _externalConfigJson = JSON.stringify(externalSourceConfig);
		const _presetSettingsJson = JSON.stringify(presetSettings);
		void [sortBy, mediaType, itemLimit, listSourceType, presetId, presetProvider];

		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			previewPage = 1;
			if (listSourceType === 'external-json') {
				fetchExternalPreview();
			} else {
				fetchPreview();
			}
		}, 300);

		return () => clearTimeout(debounceTimer);
	});

	// Fetch on page change (no debounce needed)
	function handlePageChange(newPage: number) {
		previewPage = newPage;
		if (listSourceType === 'external-json') {
			fetchExternalPreview();
		} else {
			fetchPreview();
		}
	}

	// Handle media type change - reset filters
	function handleMediaTypeChange(newType: 'movie' | 'tv') {
		mediaType = newType;
		// Reset genre filters since movie/tv have different genres
		filters = {
			...filters,
			withGenres: [],
			withoutGenres: []
		};
	}

	async function handleSubmit() {
		if (!name.trim()) {
			error = 'Name is required';
			return;
		}

		saving = true;
		error = null;

		try {
			const body = {
				name,
				description: description || undefined,
				mediaType,
				listSourceType,
				externalSourceConfig,
				presetId,
				presetProvider,
				presetSettings,
				filters,
				sortBy,
				itemLimit,
				excludeInLibrary,
				refreshIntervalHours,
				autoAddBehavior,
				rootFolderId: rootFolderId || undefined,
				scoringProfileId: scoringProfileId || undefined,
				autoAddMonitored
			};

			const url = list ? `/api/smartlists/${list.id}` : '/api/smartlists';
			const method = list ? 'PUT' : 'POST';

			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to save');
			}

			const result = await res.json();
			await goto(`/smartlists/${result.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'An error occurred';
		} finally {
			saving = false;
		}
	}

	function handleCancel() {
		if (list) {
			goto(`/smartlists/${list.id}`);
		} else {
			goto('/smartlists');
		}
	}

	const isEditMode = $derived(!!list);
</script>

<div class="w-full">
	<!-- Header -->
	<div class="mb-6">
		<button class="btn gap-1 btn-ghost btn-sm" onclick={handleCancel}>
			<ArrowLeft class="h-4 w-4" />
			Back to Smart Lists
		</button>
	</div>

	<div class="mb-6 flex flex-wrap items-start justify-between gap-4">
		<div class="flex items-center gap-4">
			{#if mediaType === 'movie'}
				<Film class="h-8 w-8 text-primary" />
			{:else}
				<Tv class="h-8 w-8 text-secondary" />
			{/if}
			<div>
				<input
					type="text"
					bind:value={name}
					placeholder="Smart List Name"
					class="input -ml-4 w-64 input-ghost text-2xl font-bold focus:bg-base-200"
				/>
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<!-- Media Type Toggle -->
			<div class="join">
				<button
					class="btn join-item btn-sm {mediaType === 'movie' ? 'btn-active' : ''}"
					onclick={() => handleMediaTypeChange('movie')}
				>
					<Film class="h-4 w-4" />
					Movies
				</button>
				<button
					class="btn join-item btn-sm {mediaType === 'tv' ? 'btn-active' : ''}"
					onclick={() => handleMediaTypeChange('tv')}
				>
					<Tv class="h-4 w-4" />
					TV Shows
				</button>
			</div>

			<button class="btn btn-primary" onclick={handleSubmit} disabled={saving}>
				{#if saving}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<Save class="h-4 w-4" />
				{/if}
				{isEditMode ? 'Save Changes' : 'Create List'}
			</button>
		</div>
	</div>

	{#if error}
		<div class="mb-4 alert py-2 alert-error">
			<span>{error}</span>
		</div>
	{/if}

	<!-- Main content - side by side -->
	<div class="flex flex-col gap-6 lg:flex-row">
		<!-- Left Panel: Filters -->
		<div class="w-full space-y-4 lg:w-2/5">
			<!-- Description -->
			<div class="form-control">
				<textarea
					bind:value={description}
					placeholder="Description (optional)"
					class="textarea-bordered textarea h-16 resize-none"
				></textarea>
			</div>

			<!-- Source Configuration -->
			<ExternalSourceConfig
				bind:sourceType={listSourceType}
				bind:presetId
				bind:presetProvider
				bind:presetSettings
				customUrl={externalSourceConfig.url}
				customHeaders={externalSourceConfig.headers}
				{mediaType}
				onChange={(data) => {
					externalSourceConfig.url = data.customUrl;
					externalSourceConfig.headers = data.customHeaders;
				}}
			/>

			<!-- Filters (only for TMDB Discover) -->
			{#if listSourceType === 'tmdb-discover'}
				<FilterBuilder
					{mediaType}
					bind:filters
					on:sortByChange={(e) => (sortBy = e.detail.sortBy)}
				/>
			{/if}

			<!-- Settings -->
			<SettingsPanel
				bind:sortBy
				bind:itemLimit
				bind:excludeInLibrary
				bind:refreshIntervalHours
				bind:autoAddBehavior
				bind:rootFolderId
				bind:scoringProfileId
				bind:autoAddMonitored
				{rootFolders}
				{scoringProfiles}
				{listSourceType}
			/>
		</div>

		<!-- Right Panel: Preview -->
		<div class="w-full lg:w-3/5">
			<PreviewPanel
				items={previewItems}
				loading={previewLoading}
				error={previewError}
				page={previewPage}
				totalResults={previewTotalResults}
				totalPages={previewTotalPages}
				{mediaType}
				{itemLimit}
				unfilteredTotal={previewUnfilteredTotal}
				onPageChange={handlePageChange}
				onRetry={fetchPreview}
				debugData={{
					timestamp: new Date().toISOString(),
					listType: listSourceType,
					configuration: {
						mediaType,
						filters: filters as Record<string, unknown>,
						sortBy,
						itemLimit,
						excludeInLibrary,
						listSourceType,
						presetId,
						presetProvider,
						externalSourceConfig
					},
					pagination: {
						page: previewPage,
						totalPages: previewTotalPages,
						totalResults: previewTotalResults,
						unfilteredTotal: previewUnfilteredTotal
					},
					items: previewItems,
					failedItems: previewDebugData?.failedItems,
					metadata: previewDebugData
						? {
								resolvedCount: previewDebugData.resolvedCount,
								failedCount: previewDebugData.failedCount,
								duplicatesRemoved: previewDebugData.duplicatesRemoved
							}
						: undefined
				}}
			/>
		</div>
	</div>
</div>
