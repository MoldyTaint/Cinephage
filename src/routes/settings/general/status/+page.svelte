<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { HardDrive, RefreshCw, AlertCircle } from 'lucide-svelte';
	import { SettingsPage } from '$lib/components/ui/settings';
	import type { PageData } from './$types';
	import { StorageMaintenanceSection } from '$lib/components/libraries';
	import { MediaServerStatsSection } from '$lib/components/status';
	import { createSSE } from '$lib/sse';
	import { invalidateAll } from '$app/navigation';
	import type {
		RootFolder,
		RootFolderFormData,
		PathValidationResult,
		RootFolderMediaSubType,
		RootFolderMediaType
	} from '$lib/types/downloadClient';
	import { RootFolderModal } from '$lib/components/rootFolders';
	import { ModalWrapper, ModalHeader, ModalFooter } from '$lib/components/ui/modal';
	import { toasts } from '$lib/stores/toast.svelte';
	import type { RootFolderUpdate } from '$lib/validation/schemas.js';
	import {
		validateRootFolder,
		updateRootFolder,
		updateLibrary,
		syncMediaServerStats
	} from '$lib/api/settings.js';
	import { scanLibrary } from '$lib/api/library.js';

	let { data }: { data: PageData } = $props();

	type ScanSuccess = {
		message: string;
		unmatchedCount: number;
	};

	type ScanProgress = {
		phase: string;
		rootFolderId?: string;
		rootFolderPath?: string;
		filesFound: number;
		filesProcessed: number;
		filesAdded: number;
		filesUpdated: number;
		filesRemoved: number;
		unmatchedCount: number;
		currentFile?: string;
	};

	type RootFolderRef = {
		id: string;
		name: string;
		path: string;
		mediaType: string;
		mediaSubType?: string;
	};

	type LibraryEntity = NonNullable<PageData['libraries']>[number] & {
		rootFolders?: RootFolderRef[];
	};

	type LibraryFormData = {
		name: string;
		mediaType: RootFolderMediaType;
		mediaSubType: RootFolderMediaSubType;
		rootFolderIds: string[];
		defaultMonitored: boolean;
		defaultSearchOnAdd: boolean;
		defaultWantsSubtitles: boolean;
	};

	let scanning = $state(false);
	let scanProgress = $state<ScanProgress | null>(null);
	let scanError = $state<string | null>(null);
	let scanSuccess = $state<ScanSuccess | null>(null);

	let syncing = $state(false);

	let libraryModalOpen = $state(false);
	let editingLibrary = $state<LibraryEntity | null>(null);
	let librarySaving = $state(false);
	let librarySaveError = $state<string | null>(null);
	let libraryForm = $state<LibraryFormData>({
		name: '',
		mediaType: 'movie',
		mediaSubType: 'standard',
		rootFolderIds: [],
		defaultMonitored: true,
		defaultSearchOnAdd: true,
		defaultWantsSubtitles: false
	});

	const filteredLibraryRootFolders = $derived(
		data.rootFolders.filter(
			(folder: RootFolderRef) =>
				folder.mediaType === libraryForm.mediaType &&
				(folder.mediaSubType ?? 'standard') === libraryForm.mediaSubType
		)
	);
	const selectedLibraryRootFolderIds = $derived(new Set(libraryForm.rootFolderIds));
	const selectedLibraryRootFolderCount = $derived(selectedLibraryRootFolderIds.size);
	const editingLibraryIsSystem = $derived(editingLibrary?.isSystem ?? false);

	let folderModalOpen = $state(false);
	let editingFolder = $state<RootFolder | null>(null);
	let folderSaving = $state(false);
	let folderSaveError = $state<string | null>(null);

	const sse = createSSE<{
		status: {
			inProgress?: boolean;
			isScanning?: boolean;
		};
		progress: ScanProgress;
		scanComplete: { results?: Array<{ unmatchedFiles?: number }> };
		scanError: { error?: { message?: string } };
	}>('/api/library/scan/status', {
		status: (payload) => {
			scanning = Boolean(payload.inProgress ?? payload.isScanning ?? false);
			if (!scanning) {
				scanProgress = null;
			}
		},
		progress: (payload) => {
			scanning = true;
			scanProgress = payload;
		},
		scanComplete: (payload) => {
			const totalUnmatched =
				payload.results?.reduce(
					(sum: number, item: { unmatchedFiles?: number }) => sum + (item.unmatchedFiles ?? 0),
					0
				) ?? 0;

			scanSuccess = {
				message: `Scan complete: ${payload.results?.length ?? 0} folders scanned`,
				unmatchedCount: totalUnmatched
			};
			scanning = false;
			scanProgress = null;
		},
		scanError: (payload) => {
			scanError = payload.error?.message ?? 'Scan failed';
			scanning = false;
			scanProgress = null;
		}
	});

	function formatBytes(value: number) {
		if (!value) return '0 B';

		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		let size = value;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex += 1;
		}

		return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
	}

	function resetScanState() {
		scanError = null;
		scanSuccess = null;
		scanProgress = null;
	}

	async function triggerLibraryScan(rootFolderId?: string) {
		scanning = true;
		resetScanState();

		try {
			await scanLibrary(rootFolderId ? { rootFolderId } : { fullScan: true });
		} catch (error) {
			scanError = error instanceof Error ? error.message : m.settings_general_failedToStartScan();
			scanning = false;
		}
	}

	async function triggerServerSync() {
		syncing = true;
		try {
			await syncMediaServerStats();
			await invalidateAll();
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Sync failed');
		} finally {
			syncing = false;
		}
	}

	function openEditLibraryModal(libraryId: string) {
		const library = data.libraries.find((item) => item.id === libraryId) as
			| LibraryEntity
			| undefined;
		if (!library) {
			toasts.error('Library not found');
			return;
		}
		editingLibrary = library;
		libraryForm = {
			name: library.name,
			mediaType: library.mediaType,
			mediaSubType: library.mediaSubType,
			rootFolderIds: library.rootFolders?.map((folder: RootFolderRef) => folder.id) ?? [],
			defaultMonitored: library.defaultMonitored ?? true,
			defaultSearchOnAdd: library.defaultSearchOnAdd ?? true,
			defaultWantsSubtitles: library.defaultWantsSubtitles ?? false
		};
		librarySaveError = null;
		libraryModalOpen = true;
	}

	function closeLibraryModal() {
		libraryModalOpen = false;
	}

	async function saveLibrary() {
		if (!editingLibrary) return;
		librarySaving = true;
		librarySaveError = null;

		try {
			await updateLibrary(editingLibrary.id, libraryForm as Record<string, unknown>);

			await invalidateAll();
			closeLibraryModal();
			toasts.success(m.settings_general_libraryUpdated());
		} catch (error) {
			librarySaveError =
				error instanceof Error ? error.message : m.settings_general_failedToSaveLibrary();
		} finally {
			librarySaving = false;
		}
	}

	function openEditFolderModal(rootFolderId: string) {
		const folder = data.rootFolders.find((item) => item.id === rootFolderId);
		if (!folder) {
			toasts.error('Root folder not found');
			return;
		}
		editingFolder = folder;
		folderSaveError = null;
		folderModalOpen = true;
	}

	function closeFolderModal() {
		folderModalOpen = false;
		editingFolder = null;
		folderSaveError = null;
	}

	async function handleValidatePath(
		path: string,
		_readOnly = false,
		_folderId?: string
	): Promise<PathValidationResult> {
		try {
			const payload = await validateRootFolder(path);
			return payload as unknown as PathValidationResult;
		} catch (error) {
			return {
				valid: false,
				exists: false,
				writable: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	async function handleFolderSave(formData: RootFolderFormData) {
		if (!editingFolder) return;
		folderSaving = true;
		folderSaveError = null;

		try {
			await updateRootFolder(editingFolder.id, formData as RootFolderUpdate);

			await invalidateAll();
			closeFolderModal();
			toasts.success('Root folder updated');
		} catch (error) {
			folderSaveError = error instanceof Error ? error.message : 'Failed to save root folder';
		} finally {
			folderSaving = false;
		}
	}

	$effect(() => {
		void sse.status;
	});
</script>

<svelte:head>
	<title>Status</title>
</svelte:head>

<SettingsPage
	title="Status"
	subtitle="Storage health, library maintenance, and media server analytics"
>
	{#snippet actions()}
		<div class="flex gap-2">
			<button
				type="button"
				class="btn ml-auto w-full gap-2 btn-sm btn-primary sm:w-auto"
				onclick={() => void triggerLibraryScan()}
				disabled={scanning || data.rootFolders.length === 0}
			>
				{#if scanning}
					<RefreshCw class="h-4 w-4 animate-spin" />
					{m.settings_general_scanning()}
				{:else}
					<HardDrive class="h-4 w-4" />
					{m.settings_general_scanLibraries()}
				{/if}
			</button>
			{#if data.servers.length > 0}
				<button
					type="button"
					class="btn ml-auto w-full gap-2 btn-outline btn-sm sm:w-auto"
					onclick={() => void triggerServerSync()}
					disabled={syncing}
				>
					{#if syncing}
						<RefreshCw class="h-4 w-4 animate-spin" />
						Syncing...
					{:else}
						<RefreshCw class="h-4 w-4" />
						Sync Servers
					{/if}
				</button>
			{/if}
		</div>
	{/snippet}

	<StorageMaintenanceSection
		storage={data.storage}
		libraries={data.libraries}
		rootFolders={data.rootFolders}
		rootFolderCount={data.rootFolders.length}
		serverStatuses={data.serverStatuses}
		{scanning}
		{scanProgress}
		{scanError}
		{scanSuccess}
		{formatBytes}
		onEditLibrary={openEditLibraryModal}
		onEditRootFolder={openEditFolderModal}
		onScanRootFolder={triggerLibraryScan}
	/>

	<div class="mt-6">
		<MediaServerStatsSection
			stats={data.mediaServerStats}
			topItems={data.topItems}
			largestItems={data.largestItems}
			servers={data.servers.map((s) => ({
				id: s.id,
				name: s.name,
				serverType: s.serverType,
				enabled: s.enabled ?? false
			}))}
			totalPlays={data.servers.length > 0 ? data.mediaServerStats.totalPlays : null}
			uniqueItems={data.servers.length > 0 ? data.mediaServerStats.uniqueItems : null}
		/>
	</div>
</SettingsPage>

{#if libraryModalOpen}
	<ModalWrapper
		open={libraryModalOpen}
		onClose={closeLibraryModal}
		maxWidth="2xl"
		labelledBy="status-library-edit-modal-title"
		lockScroll={false}
	>
		<ModalHeader
			title={m.settings_general_libraryModalEditPlainTitle()}
			onClose={closeLibraryModal}
		/>
		<div class="space-y-4">
			{#if librarySaveError}
				<div class="alert alert-error">
					<AlertCircle class="h-5 w-5" />
					<span>{librarySaveError}</span>
				</div>
			{/if}

			<div class="grid gap-4 md:grid-cols-2">
				<div class="form-control">
					<label class="label py-1" for="status-library-name">
						<span class="label-text">{m.settings_general_libraryName()}</span>
					</label>
					<input
						id="status-library-name"
						class="input-bordered input input-sm {editingLibraryIsSystem ? 'input-disabled' : ''}"
						bind:value={libraryForm.name}
						disabled={editingLibraryIsSystem}
					/>
				</div>

				<div class="form-control">
					<label class="label py-1" for="status-library-media-type">
						<span class="label-text">{m.settings_general_mediaType()}</span>
					</label>
					<select
						id="status-library-media-type"
						class="select-bordered select select-sm"
						bind:value={libraryForm.mediaType}
						disabled={editingLibraryIsSystem}
					>
						<option value="movie">{m.rootFolders_movies()}</option>
						<option value="tv">{m.rootFolders_tvShows()}</option>
					</select>
				</div>

				<div class="form-control">
					<label class="label py-1" for="status-library-classification">
						<span class="label-text">{m.settings_general_classification()}</span>
					</label>
					<select
						id="status-library-classification"
						class="select-bordered select select-sm"
						bind:value={libraryForm.mediaSubType}
						disabled={editingLibraryIsSystem}
					>
						<option value="standard">{m.settings_general_standard()}</option>
						<option value="anime">{m.settings_general_badgeAnime()}</option>
					</select>
				</div>

				<div class="form-control md:col-span-2">
					<div class="space-y-3 rounded-xl border border-base-300 bg-base-100 p-4">
						<div class="flex items-center gap-2">
							<span class="text-sm font-medium text-base-content"
								>{m.settings_general_rootFoldersLabel()}</span
							>
							<span class="badge badge-ghost badge-sm">
								{m.settings_general_selectedCount({ count: selectedLibraryRootFolderCount })}
							</span>
						</div>

						<div class="max-h-64 space-y-2 overflow-y-auto pr-1">
							{#if filteredLibraryRootFolders.length === 0}
								<div
									class="flex items-start gap-3 rounded-xl border border-dashed border-base-300 bg-base-200/60 p-4"
								>
									<AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-base-content/50" />
									<div class="space-y-1 text-sm text-base-content/70">
										<div class="font-medium text-base-content">
											{m.settings_general_noMatchingRootFolders()}
										</div>
									</div>
								</div>
							{:else}
								{#each filteredLibraryRootFolders as folder (folder.id)}
									<label
										class={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
											selectedLibraryRootFolderIds.has(folder.id)
												? 'border-primary/40 bg-primary/5'
												: 'border-base-300 bg-base-100 hover:border-primary/30 hover:bg-base-200/40'
										}`}
									>
										<input
											type="checkbox"
											class="checkbox mt-1 shrink-0 checkbox-sm checkbox-primary"
											checked={selectedLibraryRootFolderIds.has(folder.id)}
											onchange={(event) => {
												const checked = (event.currentTarget as HTMLInputElement).checked;
												libraryForm.rootFolderIds = checked
													? Array.from(new Set([...libraryForm.rootFolderIds, folder.id]))
													: libraryForm.rootFolderIds.filter((id: string) => id !== folder.id);
											}}
										/>
										<div class="min-w-0 flex-1 space-y-0.5">
											<div class="flex flex-wrap items-center justify-between gap-2">
												<span class="font-medium text-base-content">{folder.name}</span>
												{#if selectedLibraryRootFolderIds.has(folder.id)}
													<span class="badge badge-sm badge-primary">{m.action_select()}</span>
												{/if}
											</div>
											<div class="truncate text-xs text-base-content/60">{folder.path}</div>
										</div>
									</label>
								{/each}
							{/if}
						</div>
					</div>
				</div>
			</div>

			<div class="grid gap-3 sm:grid-cols-2">
				<label
					class="label cursor-pointer justify-start gap-3 rounded-lg border border-base-300 p-3"
				>
					<input
						type="checkbox"
						class="checkbox shrink-0 checkbox-sm checkbox-primary"
						bind:checked={libraryForm.defaultMonitored}
					/>
					<span class="label-text text-base-content">{m.settings_general_monitorByDefault()}</span>
				</label>
				<label
					class="label cursor-pointer justify-start gap-3 rounded-lg border border-base-300 p-3"
				>
					<input
						type="checkbox"
						class="checkbox shrink-0 checkbox-sm checkbox-primary"
						bind:checked={libraryForm.defaultSearchOnAdd}
					/>
					<span class="label-text text-base-content">{m.settings_general_searchOnAddLabel()}</span>
				</label>
				<label
					class="label cursor-pointer justify-start gap-3 rounded-lg border border-base-300 p-3"
				>
					<input
						type="checkbox"
						class="checkbox shrink-0 checkbox-sm checkbox-primary"
						bind:checked={libraryForm.defaultWantsSubtitles}
					/>
					<span class="label-text text-base-content">{m.settings_general_wantSubtitles()}</span>
				</label>
			</div>
		</div>
		<ModalFooter
			onCancel={closeLibraryModal}
			onSave={saveLibrary}
			saving={librarySaving}
			saveLabel={m.settings_general_saveLibrary()}
		/>
	</ModalWrapper>
{/if}

<RootFolderModal
	open={folderModalOpen}
	mode="edit"
	folder={editingFolder}
	saving={folderSaving}
	error={folderSaveError}
	onClose={closeFolderModal}
	lockScroll={false}
	onSave={handleFolderSave}
	onValidatePath={handleValidatePath}
/>
