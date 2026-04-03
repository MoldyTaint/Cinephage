<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		Plus,
		HardDrive,
		RefreshCw,
		AlertCircle,
		FolderOpen,
		Library,
		Settings
	} from 'lucide-svelte';
	import { SettingsPage, SettingsSection } from '$lib/components/ui/settings';
	import type { PageData } from './$types';
	import type {
		RootFolder,
		RootFolderFormData,
		PathValidationResult,
		RootFolderMediaSubType,
		RootFolderMediaType
	} from '$lib/types/downloadClient';
	import { createSSE } from '$lib/sse';
	import { layoutState, deriveMobileSseStatus } from '$lib/layout.svelte';
	import { RootFolderModal, RootFolderList } from '$lib/components/rootFolders';
	import { LibraryList, StorageMaintenanceSection } from '$lib/components/libraries';
	import {
		ConfirmationModal,
		ModalWrapper,
		ModalHeader,
		ModalFooter
	} from '$lib/components/ui/modal';
	import { toasts } from '$lib/stores/toast.svelte';
	import { getResponseErrorMessage, readResponsePayload } from '$lib/utils/http';

	type TabId = 'libraries' | 'rootFolders' | 'maintenance';
	type LibraryEntity = PageData['libraries'][number] & {
		rootFolders?: Array<{ id: string; name: string; path: string }>;
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

	let { data }: { data: PageData } = $props();

	const activeTab = $derived(($page.url.searchParams.get('tab') as TabId) || 'libraries');
	let scanning = $state(false);
	let scanProgress = $state<ScanProgress | null>(null);
	let scanError = $state<string | null>(null);
	let scanSuccess = $state<{ message: string; unmatchedCount: number } | null>(null);

	let folderModalOpen = $state(false);
	let folderModalMode = $state<'add' | 'edit'>('add');
	let editingFolder = $state<RootFolder | null>(null);
	let folderSaving = $state(false);
	let folderSaveError = $state<string | null>(null);
	let confirmFolderDeleteOpen = $state(false);
	let deleteFolderTarget = $state<RootFolder | null>(null);

	let enforceAnimeSubtype = $state(false);
	let savingAnimeSubtype = $state(false);

	let libraryModalOpen = $state(false);
	let libraryModalMode = $state<'add' | 'edit'>('add');
	let editingLibrary = $state<LibraryEntity | null>(null);
	let librarySaving = $state(false);
	let librarySaveError = $state<string | null>(null);
	let confirmLibraryDeleteOpen = $state(false);
	let deleteLibraryTarget = $state<LibraryEntity | null>(null);
	let libraryForm = $state<LibraryFormData>({
		name: '',
		mediaType: 'movie',
		mediaSubType: 'standard',
		rootFolderIds: [],
		defaultMonitored: true,
		defaultSearchOnAdd: true,
		defaultWantsSubtitles: true
	});

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
			if (!scanning) scanProgress = null;
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

	const hasAnimeSubtypeFolder = $derived(
		data.rootFolders.some((folder) => folder.mediaSubType === 'anime')
	);
	const filteredLibraryRootFolders = $derived(
		data.rootFolders.filter(
			(folder) =>
				folder.mediaType === libraryForm.mediaType &&
				(folder.mediaSubType ?? 'standard') === libraryForm.mediaSubType
		)
	);
	const selectedLibraryRootFolderIds = $derived(new Set(libraryForm.rootFolderIds));
	const selectedLibraryRootFolderCount = $derived(libraryForm.rootFolderIds.length);
	const editingLibraryIsSystem = $derived(editingLibrary?.isSystem === true);

	$effect(() => {
		layoutState.setMobileSseStatus(deriveMobileSseStatus(sse));
		return () => {
			layoutState.clearMobileSseStatus();
		};
	});

	$effect(() => {
		enforceAnimeSubtype = data.enforceAnimeSubtype ?? false;
	});

	function setTab(tab: TabId) {
		const url = new URL($page.url);
		url.searchParams.set('tab', tab);
		goto(url.toString(), { replaceState: true });
	}

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
			const response = await fetch('/api/library/scan', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(rootFolderId ? { rootFolderId } : { fullScan: true })
			});

			if (!response.ok) {
				const payload = await readResponsePayload<Record<string, unknown>>(response);
				throw new Error(getResponseErrorMessage(payload, 'Failed to start scan'));
			}
		} catch (error) {
			scanError = error instanceof Error ? error.message : m.settings_general_failedToStartScan();
			scanning = false;
			scanProgress = null;
		}
	}

	function showAnimeEnforcementAutoDisabledWarning(payload: unknown) {
		if (
			payload &&
			typeof payload === 'object' &&
			'autoDisabledAnimeEnforcement' in payload &&
			payload.autoDisabledAnimeEnforcement === true
		) {
			toasts.warning(m.settings_general_animeRootEnforcementAutoDisabled());
		}
	}

	function openAddFolderModal() {
		folderModalMode = 'add';
		editingFolder = null;
		folderSaveError = null;
		folderModalOpen = true;
	}

	function openEditFolderModal(folder: RootFolder) {
		folderModalMode = 'edit';
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
		readOnly = false,
		folderId?: string
	): Promise<PathValidationResult> {
		try {
			const response = await fetch('/api/root-folders/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path, readOnly, folderId })
			});
			const payload = await readResponsePayload<PathValidationResult>(response);

			if (!response.ok) {
				return {
					valid: false,
					exists: false,
					writable: false,
					error: getResponseErrorMessage(payload, 'Failed to validate path')
				};
			}

			return payload && typeof payload === 'object'
				? (payload as PathValidationResult)
				: {
						valid: false,
						exists: false,
						writable: false,
						error: 'Invalid response from path validation'
					};
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
		folderSaving = true;
		folderSaveError = null;

		try {
			const isCreating = folderModalMode === 'add';
			const response =
				folderModalMode === 'edit' && editingFolder
					? await fetch(`/api/root-folders/${editingFolder.id}`, {
							method: 'PUT',
							headers: {
								'Content-Type': 'application/json',
								Accept: 'application/json'
							},
							body: JSON.stringify(formData)
						})
					: await fetch('/api/root-folders', {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								Accept: 'application/json'
							},
							body: JSON.stringify(formData)
						});

			const payload = await readResponsePayload<{
				folder?: { id?: string };
				autoDisabledAnimeEnforcement?: boolean;
				error?: string;
			}>(response);

			if (!response.ok) {
				folderSaveError = getResponseErrorMessage(payload, 'Failed to save root folder');
				return;
			}

			await invalidateAll();
			closeFolderModal();
			showAnimeEnforcementAutoDisabledWarning(payload);

			if (
				isCreating &&
				payload &&
				typeof payload === 'object' &&
				'folder' in payload &&
				payload.folder?.id
			) {
				triggerLibraryScan(payload.folder.id);
			}
		} catch (error) {
			folderSaveError =
				error instanceof Error ? error.message : m.settings_general_unexpectedError();
		} finally {
			folderSaving = false;
		}
	}

	function confirmFolderDelete(folder: RootFolder) {
		deleteFolderTarget = folder;
		confirmFolderDeleteOpen = true;
	}

	async function handleConfirmFolderDelete() {
		if (!deleteFolderTarget) return;

		try {
			const response = await fetch(`/api/root-folders/${deleteFolderTarget.id}`, {
				method: 'DELETE',
				headers: { Accept: 'application/json' }
			});
			const payload = await readResponsePayload<Record<string, unknown>>(response);

			if (!response.ok) {
				throw new Error(getResponseErrorMessage(payload, 'Failed to delete root folder'));
			}

			showAnimeEnforcementAutoDisabledWarning(payload);
			await invalidateAll();
			confirmFolderDeleteOpen = false;
			deleteFolderTarget = null;
		} catch (error) {
			toasts.error(
				error instanceof Error ? error.message : m.settings_general_unexpectedDeleteError()
			);
		}
	}

	async function updateAnimeSubtypeEnforcement(enabled: boolean) {
		if (enabled && !hasAnimeSubtypeFolder) {
			toasts.warning(m.settings_general_animeRootEnforcementNeedsAnimeFolder());
			return;
		}

		const previous = enforceAnimeSubtype;
		enforceAnimeSubtype = enabled;
		savingAnimeSubtype = true;

		try {
			const response = await fetch('/api/settings/library/classification', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enforceAnimeSubtype: enabled })
			});

			if (!response.ok) {
				const payload = await readResponsePayload<Record<string, unknown>>(response);
				throw new Error(getResponseErrorMessage(payload, 'Failed to save anime subtype setting'));
			}

			toasts.success(`Anime root folder enforcement ${enabled ? 'enabled' : 'disabled'}`);
		} catch (error) {
			enforceAnimeSubtype = previous;
			toasts.error(error instanceof Error ? error.message : 'Failed to save anime subtype setting');
		} finally {
			savingAnimeSubtype = false;
		}
	}

	function openAddLibraryModal(mediaType: RootFolderMediaType = 'movie') {
		libraryModalMode = 'add';
		editingLibrary = null;
		librarySaveError = null;
		libraryForm = {
			name: '',
			mediaType,
			mediaSubType: 'standard',
			rootFolderIds: [],
			defaultMonitored: true,
			defaultSearchOnAdd: true,
			defaultWantsSubtitles: true
		};
		libraryModalOpen = true;
	}

	function openEditLibraryModal(library: LibraryEntity) {
		libraryModalMode = 'edit';
		editingLibrary = library;
		librarySaveError = null;
		libraryForm = {
			name: library.name,
			mediaType: library.mediaType,
			mediaSubType: library.mediaSubType,
			rootFolderIds: library.rootFolders?.map((folder) => folder.id) ?? [],
			defaultMonitored: library.defaultMonitored,
			defaultSearchOnAdd: library.defaultSearchOnAdd,
			defaultWantsSubtitles: library.defaultWantsSubtitles
		};
		libraryModalOpen = true;
	}

	function closeLibraryModal() {
		libraryModalOpen = false;
		editingLibrary = null;
		librarySaveError = null;
	}

	async function saveLibrary() {
		librarySaving = true;
		librarySaveError = null;

		try {
			const response =
				libraryModalMode === 'edit' && editingLibrary
					? await fetch(`/api/libraries/${editingLibrary.id}`, {
							method: 'PUT',
							headers: {
								'Content-Type': 'application/json',
								Accept: 'application/json'
							},
							body: JSON.stringify({
								...libraryForm,
								rootFolderIds: libraryForm.rootFolderIds.filter(Boolean)
							})
						})
					: await fetch('/api/libraries', {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								Accept: 'application/json'
							},
							body: JSON.stringify({
								...libraryForm,
								rootFolderIds: libraryForm.rootFolderIds.filter(Boolean)
							})
						});

			const payload = await readResponsePayload<Record<string, unknown>>(response);

			if (!response.ok) {
				librarySaveError = getResponseErrorMessage(payload, 'Failed to save library');
				return;
			}

			await invalidateAll();
			closeLibraryModal();
			toasts.success(`Library ${libraryModalMode === 'add' ? 'created' : 'updated'}`);
		} catch (error) {
			librarySaveError = error instanceof Error ? error.message : 'Failed to save library';
		} finally {
			librarySaving = false;
		}
	}

	function confirmLibraryDelete(library: LibraryEntity) {
		deleteLibraryTarget = library;
		confirmLibraryDeleteOpen = true;
	}

	async function handleConfirmLibraryDelete() {
		if (!deleteLibraryTarget) return;

		try {
			const response = await fetch(`/api/libraries/${deleteLibraryTarget.id}`, {
				method: 'DELETE',
				headers: { Accept: 'application/json' }
			});
			const payload = await readResponsePayload<Record<string, unknown>>(response);

			if (!response.ok) {
				throw new Error(getResponseErrorMessage(payload, 'Failed to delete library'));
			}

			await invalidateAll();
			confirmLibraryDeleteOpen = false;
			deleteLibraryTarget = null;
			toasts.success('Library deleted');
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to delete library');
		}
	}
</script>

<svelte:head>
	<title>Library & Storage</title>
</svelte:head>

<SettingsPage title="Library & Storage" subtitle="Manage libraries, root folders, and storage.">
	<div role="tablist" class="tabs-boxed tabs">
		<button
			type="button"
			role="tab"
			class="tab gap-2"
			class:tab-active={activeTab === 'libraries'}
			onclick={() => void setTab('libraries')}
		>
			<Library class="h-4 w-4" />
			Libraries
		</button>
		<button
			type="button"
			role="tab"
			class="tab gap-2"
			class:tab-active={activeTab === 'rootFolders'}
			onclick={() => void setTab('rootFolders')}
		>
			<FolderOpen class="h-4 w-4" />
			Root Folders
		</button>
		<button
			type="button"
			role="tab"
			class="tab gap-2"
			class:tab-active={activeTab === 'maintenance'}
			onclick={() => void setTab('maintenance')}
		>
			<Settings class="h-4 w-4" />
			Storage Maintenance
		</button>
	</div>

	{#if activeTab === 'libraries'}
		<SettingsSection
			title="Libraries"
			description="Create Movie and TV libraries, and attach root folders."
			variant="flat"
		>
			{#snippet actions()}
				<div class="flex flex-wrap gap-2">
					<button
						class="btn gap-2 btn-ghost btn-sm"
						onclick={() => triggerLibraryScan()}
						disabled={scanning}
					>
						{#if scanning}
							<RefreshCw class="h-4 w-4 animate-spin" />
							Scanning
						{:else}
							<RefreshCw class="h-4 w-4" />
							Scan libraries
						{/if}
					</button>
					<button class="btn gap-2 btn-sm btn-primary" onclick={() => openAddLibraryModal('movie')}>
						<Plus class="h-4 w-4" />
						Create library
					</button>
				</div>
			{/snippet}

			<LibraryList
				libraries={data.libraries}
				storageBreakdown={data.storage.libraryBreakdown}
				onEdit={openEditLibraryModal}
				onDelete={confirmLibraryDelete}
				{formatBytes}
			/>
		</SettingsSection>
	{:else if activeTab === 'rootFolders'}
		<SettingsSection
			title="Root Folders"
			description="Configure media library folders where content will be organized."
			variant="flat"
		>
			{#snippet actions()}
				<div class="flex flex-wrap gap-2">
					<button
						class="btn gap-2 btn-ghost btn-sm"
						onclick={() => triggerLibraryScan()}
						disabled={scanning}
					>
						{#if scanning}
							<RefreshCw class="h-4 w-4 animate-spin" />
							Scanning
						{:else}
							<RefreshCw class="h-4 w-4" />
							Scan root folders
						{/if}
					</button>
					<button class="btn gap-2 btn-sm btn-primary" onclick={openAddFolderModal}>
						<Plus class="h-4 w-4" />
						{m.settings_general_addFolder()}
					</button>
				</div>
			{/snippet}

			<RootFolderList
				folders={data.rootFolders}
				onEdit={openEditFolderModal}
				onDelete={confirmFolderDelete}
			/>

			<div class="mt-4 rounded-lg border border-base-300 bg-base-200 p-4">
				<label class="flex cursor-pointer items-start gap-4">
					<input
						type="checkbox"
						class="toggle mt-0.5 toggle-primary"
						checked={enforceAnimeSubtype}
						disabled={savingAnimeSubtype || !hasAnimeSubtypeFolder}
						onchange={(event) =>
							updateAnimeSubtypeEnforcement((event.currentTarget as HTMLInputElement).checked)}
					/>
					<div class="min-w-0">
						<div class="font-medium">{m.settings_general_enforceAnimeRootFoldersLabel()}</div>
						<div class="text-sm text-base-content/70">
							{m.settings_general_enforceAnimeRootFoldersDesc()}
						</div>
						{#if !hasAnimeSubtypeFolder}
							<div class="mt-1 text-sm text-warning">
								{m.settings_general_animeRootEnforcementNeedsAnimeFolder()}
							</div>
						{/if}
					</div>
				</label>
			</div>
		</SettingsSection>
	{:else}
		<SettingsSection
			title="Storage Maintenance"
			description="Review scan progress, storage totals, and library or root-folder usage."
			variant="flat"
		>
			{#snippet actions()}
				<button
					class="btn gap-2 self-start btn-sm btn-primary sm:w-auto"
					onclick={() => triggerLibraryScan()}
					disabled={scanning || data.rootFolders.length === 0}
				>
					{#if scanning}
						<RefreshCw class="h-4 w-4 animate-spin" />
						{m.settings_general_scanning()}
					{:else}
						<HardDrive class="h-4 w-4" />
						Run maintenance scan
					{/if}
				</button>
			{/snippet}

			<StorageMaintenanceSection
				storage={data.storage}
				rootFolderCount={data.rootFolders.length}
				{scanning}
				{scanProgress}
				{scanError}
				{scanSuccess}
				{formatBytes}
			/>
		</SettingsSection>
	{/if}
</SettingsPage>

<RootFolderModal
	open={folderModalOpen}
	mode={folderModalMode}
	folder={editingFolder}
	saving={folderSaving}
	error={folderSaveError}
	onClose={closeFolderModal}
	onSave={handleFolderSave}
	onDelete={() => {}}
	onValidatePath={handleValidatePath}
/>

<ConfirmationModal
	open={confirmFolderDeleteOpen}
	title={m.settings_general_confirmDelete()}
	messagePrefix={m.settings_general_confirmDeleteMessagePrefix()}
	messageEmphasis={deleteFolderTarget?.name ?? ''}
	messageSuffix={m.settings_general_confirmDeleteMessageSuffix()}
	confirmLabel={m.action_delete()}
	confirmVariant="error"
	onConfirm={handleConfirmFolderDelete}
	onCancel={() => (confirmFolderDeleteOpen = false)}
/>

<ConfirmationModal
	open={confirmLibraryDeleteOpen}
	title={m.settings_general_confirmDelete()}
	messagePrefix={m.settings_general_confirmDeleteMessagePrefix()}
	messageEmphasis={deleteLibraryTarget?.name ?? ''}
	messageSuffix={m.settings_general_confirmDeleteMessageSuffix()}
	confirmLabel={m.action_delete()}
	confirmVariant="error"
	onConfirm={handleConfirmLibraryDelete}
	onCancel={() => (confirmLibraryDeleteOpen = false)}
/>

{#if libraryModalOpen}
	<ModalWrapper
		open={libraryModalOpen}
		onClose={closeLibraryModal}
		maxWidth="2xl"
		labelledBy="library-edit-modal-title"
	>
		<ModalHeader
			title={libraryModalMode === 'add' ? 'Create Library' : 'Edit Library'}
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
					<label class="label py-1" for="library-name">
						<span class="label-text">Library name</span>
					</label>
					<input
						id="library-name"
						class="input-bordered input input-sm {editingLibraryIsSystem ? 'input-disabled' : ''}"
						bind:value={libraryForm.name}
						disabled={editingLibraryIsSystem}
					/>
				</div>

				<div class="form-control">
					<label class="label py-1" for="library-media-type">
						<span class="label-text">Media type</span>
					</label>
					<select
						id="library-media-type"
						class="select-bordered select select-sm"
						bind:value={libraryForm.mediaType}
						disabled={editingLibraryIsSystem}
					>
						<option value="movie">Movies</option>
						<option value="tv">TV</option>
					</select>
				</div>

				<div class="form-control">
					<label class="label py-1" for="library-classification">
						<span class="label-text">Classification</span>
					</label>
					<select
						id="library-classification"
						class="select-bordered select select-sm"
						bind:value={libraryForm.mediaSubType}
						disabled={editingLibraryIsSystem}
					>
						<option value="standard">Standard</option>
						<option value="anime">Anime</option>
					</select>
				</div>

				<div class="form-control md:col-span-2">
					<div class="label py-1">
						<span class="label-text">Default root folders</span>
						<span class="label-text-alt">
							{selectedLibraryRootFolderCount} selected
						</span>
					</div>
					<div
						class="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-base-300 bg-base-200 p-3"
					>
						{#if filteredLibraryRootFolders.length === 0}
							<div class="text-sm text-base-content/60">No matching root folders available.</div>
						{:else}
							{#each filteredLibraryRootFolders as folder (folder.id)}
								<label class="label cursor-pointer justify-start gap-3 rounded-lg px-0 py-2">
									<input
										type="checkbox"
										class="checkbox checkbox-sm checkbox-primary"
										checked={selectedLibraryRootFolderIds.has(folder.id)}
										onchange={(event) => {
											const checked = (event.currentTarget as HTMLInputElement).checked;
											libraryForm.rootFolderIds = checked
												? Array.from(new Set([...libraryForm.rootFolderIds, folder.id]))
												: libraryForm.rootFolderIds.filter((id) => id !== folder.id);
										}}
									/>
									<div class="min-w-0">
										<div class="text-sm font-medium">{folder.name}</div>
										<div class="text-xs text-base-content/60">{folder.path}</div>
									</div>
								</label>
							{/each}
						{/if}
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
					<span class="label-text text-base-content">Monitor by default</span>
				</label>
				<label
					class="label cursor-pointer justify-start gap-3 rounded-lg border border-base-300 p-3"
				>
					<input
						type="checkbox"
						class="checkbox shrink-0 checkbox-sm checkbox-primary"
						bind:checked={libraryForm.defaultSearchOnAdd}
					/>
					<span class="label-text text-base-content">Search on add</span>
				</label>
				<label
					class="label cursor-pointer justify-start gap-3 rounded-lg border border-base-300 p-3"
				>
					<input
						type="checkbox"
						class="checkbox shrink-0 checkbox-sm checkbox-primary"
						bind:checked={libraryForm.defaultWantsSubtitles}
					/>
					<span class="label-text text-base-content">Want subtitles</span>
				</label>
			</div>
		</div>

		<ModalFooter
			onCancel={closeLibraryModal}
			onSave={saveLibrary}
			saving={librarySaving}
			saveLabel="Save library"
		/>
	</ModalWrapper>
{/if}
