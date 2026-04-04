<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { SvelteURL } from 'svelte/reactivity';
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
	type LibraryDeleteOption = {
		targetLibraryId: string | null;
		targetLibraryName: string;
		selectionMode: 'system' | 'choose-custom' | 'none';
		customCandidates: LibraryEntity[];
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
	let deleteLibraryTargetOption = $state<LibraryDeleteOption | null>(null);
	let deleteLibraryDestinationId = $state<string>('');
	let deleteLibraryLoading = $state(false);
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

	function getSystemLibraryFallbackName(library: LibraryEntity): string {
		if (library.mediaType === 'movie') {
			return library.mediaSubType === 'anime' ? 'Anime Movies' : 'Movies';
		}
		return library.mediaSubType === 'anime' ? 'Anime Series' : 'TV Shows';
	}

	function getLibraryDeleteOption(library: LibraryEntity): LibraryDeleteOption {
		if ((library.rootFolders?.length ?? 0) === 0) {
			return {
				targetLibraryId: null,
				targetLibraryName: '',
				selectionMode: 'none',
				customCandidates: []
			};
		}

		const compatibleCustomLibraries = data.libraries.filter(
			(candidate) =>
				!candidate.isSystem &&
				candidate.id !== library.id &&
				candidate.mediaType === library.mediaType &&
				candidate.mediaSubType === library.mediaSubType
		);

		if (compatibleCustomLibraries.length > 0) {
			return {
				targetLibraryId: null,
				targetLibraryName: getSystemLibraryFallbackName(library),
				selectionMode: 'choose-custom',
				customCandidates: compatibleCustomLibraries
			};
		}

		return {
			targetLibraryId: null,
			targetLibraryName: getSystemLibraryFallbackName(library),
			selectionMode: 'system',
			customCandidates: []
		};
	}

	$effect(() => {
		layoutState.setMobileSseStatus(deriveMobileSseStatus(sse));
		return () => {
			layoutState.clearMobileSseStatus();
		};
	});

	$effect(() => {
		enforceAnimeSubtype = data.enforceAnimeSubtype ?? false;
	});

	$effect(() => {
		if (activeTab === 'maintenance' || !$page.url.hash) return;
		const url = new SvelteURL($page.url);
		url.hash = '';
		goto(url.toString(), { replaceState: true, noScroll: true, keepFocus: true });
	});

	function setTab(tab: TabId) {
		const url = new SvelteURL($page.url);
		url.searchParams.set('tab', tab);
		if (tab !== 'maintenance') {
			url.hash = '';
		}
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
				throw new Error(
					getResponseErrorMessage(payload, m.settings_general_failedToSaveAnimeSubtypeSetting())
				);
			}

			toasts.success(
				enabled
					? m.settings_general_animeRootEnforcementEnabled()
					: m.settings_general_animeRootEnforcementDisabled()
			);
		} catch (error) {
			enforceAnimeSubtype = previous;
			toasts.error(
				error instanceof Error
					? error.message
					: m.settings_general_failedToSaveAnimeSubtypeSetting()
			);
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

	function openEditLibraryModalById(libraryId: string) {
		const library = data.libraries.find((item) => item.id === libraryId);
		if (!library) return;
		openEditLibraryModal(library as LibraryEntity);
	}

	function openEditFolderModalById(folderId: string) {
		const folder = data.rootFolders.find((item) => item.id === folderId);
		if (!folder) return;
		openEditFolderModal(folder);
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
				librarySaveError = getResponseErrorMessage(
					payload,
					m.settings_general_failedToSaveLibrary()
				);
				return;
			}

			await invalidateAll();
			closeLibraryModal();
			toasts.success(
				libraryModalMode === 'add'
					? m.settings_general_libraryCreated()
					: m.settings_general_libraryUpdated()
			);
		} catch (error) {
			librarySaveError =
				error instanceof Error ? error.message : m.settings_general_failedToSaveLibrary();
		} finally {
			librarySaving = false;
		}
	}

	function confirmLibraryDelete(library: LibraryEntity) {
		deleteLibraryTarget = library;
		deleteLibraryTargetOption = getLibraryDeleteOption(library);
		deleteLibraryDestinationId = '';
		confirmLibraryDeleteOpen = true;
	}

	function closeLibraryDeleteModal() {
		confirmLibraryDeleteOpen = false;
		deleteLibraryTarget = null;
		deleteLibraryTargetOption = null;
		deleteLibraryDestinationId = '';
		deleteLibraryLoading = false;
	}

	async function handleConfirmLibraryDelete() {
		if (!deleteLibraryTarget) return;
		deleteLibraryLoading = true;

		try {
			const response = await fetch(`/api/libraries/${deleteLibraryTarget.id}`, {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify({
					targetLibraryId:
						deleteLibraryTargetOption?.selectionMode === 'choose-custom'
							? deleteLibraryDestinationId || null
							: (deleteLibraryTargetOption?.targetLibraryId ?? null)
				})
			});
			const payload = await readResponsePayload<Record<string, unknown>>(response);

			if (!response.ok) {
				throw new Error(
					getResponseErrorMessage(payload, m.settings_general_failedToDeleteLibrary())
				);
			}

			await invalidateAll();
			closeLibraryDeleteModal();
			toasts.success(m.settings_general_libraryDeleted());
		} catch (error) {
			toasts.error(
				error instanceof Error ? error.message : m.settings_general_failedToDeleteLibrary()
			);
		} finally {
			deleteLibraryLoading = false;
		}
	}

	const activeTabActionLabel = $derived.by(() => {
		if (activeTab === 'libraries') return m.settings_general_addLibrary();
		if (activeTab === 'rootFolders') return m.settings_general_addFolder();
		return m.settings_general_runLibraryScan();
	});

	function handleActiveTabAction() {
		if (activeTab === 'libraries') {
			openAddLibraryModal('movie');
			return;
		}
		if (activeTab === 'rootFolders') {
			openAddFolderModal();
			return;
		}
		void triggerLibraryScan();
	}
</script>

<svelte:head>
	<title>{m.settings_general_heading()}</title>
</svelte:head>

<SettingsPage title={m.settings_general_heading()} subtitle={m.settings_general_subtitle()}>
	<div class="overflow-x-auto">
		<div role="tablist" class="tabs-boxed tabs inline-flex min-w-max flex-nowrap">
			<button
				type="button"
				role="tab"
				class="tab gap-2 whitespace-nowrap"
				class:tab-active={activeTab === 'libraries'}
				onclick={() => void setTab('libraries')}
			>
				<Library class="h-4 w-4" />
				{m.settings_general_tabLibraries()}
			</button>
			<button
				type="button"
				role="tab"
				class="tab gap-2 whitespace-nowrap"
				class:tab-active={activeTab === 'rootFolders'}
				onclick={() => void setTab('rootFolders')}
			>
				<FolderOpen class="h-4 w-4" />
				{m.settings_general_tabRootFolders()}
			</button>
			<button
				type="button"
				role="tab"
				class="tab gap-2 whitespace-nowrap"
				class:tab-active={activeTab === 'maintenance'}
				onclick={() => void setTab('maintenance')}
			>
				<Settings class="h-4 w-4" />
				{m.settings_general_tabMaintenance()}
			</button>
		</div>
	</div>

	{#if activeTab === 'libraries'}
		<SettingsSection
			title={m.settings_general_librariesTitle()}
			description={m.settings_general_librariesDescription()}
			variant="flat"
		>
			{#snippet actions()}
				<button class="btn ml-auto gap-2 btn-sm btn-primary" onclick={handleActiveTabAction}>
					<Plus class="h-4 w-4" />
					{activeTabActionLabel}
				</button>
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
			title={m.settings_general_rootFoldersTitle()}
			description={m.settings_general_rootFoldersDescription()}
			variant="flat"
		>
			{#snippet actions()}
				<button class="btn ml-auto gap-2 btn-sm btn-primary" onclick={handleActiveTabAction}>
					<Plus class="h-4 w-4" />
					{activeTabActionLabel}
				</button>
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
			title={m.settings_general_maintenanceTitle()}
			description={m.settings_general_maintenanceDescription()}
			variant="flat"
		>
			{#snippet actions()}
				<button
					class="btn ml-auto gap-2 btn-sm btn-primary"
					onclick={handleActiveTabAction}
					disabled={scanning || data.rootFolders.length === 0}
				>
					{#if scanning}
						<RefreshCw class="h-4 w-4 animate-spin" />
						{m.settings_general_scanning()}
					{:else}
						<HardDrive class="h-4 w-4" />
						{activeTabActionLabel}
					{/if}
				</button>
			{/snippet}

			<StorageMaintenanceSection
				storage={data.storage}
				libraries={data.libraries}
				rootFolders={data.rootFolders}
				rootFolderCount={data.rootFolders.length}
				{scanning}
				{scanProgress}
				{scanError}
				{scanSuccess}
				{formatBytes}
				onEditLibrary={openEditLibraryModalById}
				onEditRootFolder={openEditFolderModalById}
				onScanRootFolder={triggerLibraryScan}
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

{#if confirmLibraryDeleteOpen}
	<ModalWrapper
		open={confirmLibraryDeleteOpen}
		onClose={closeLibraryDeleteModal}
		maxWidth="md"
		labelledBy="library-delete-modal-title"
	>
		<ModalHeader title={m.settings_general_confirmDelete()} onClose={closeLibraryDeleteModal} />
		<div class="space-y-4">
			<p>
				{m.settings_general_confirmDeleteMessagePrefix()}
				<strong>{deleteLibraryTarget?.name ?? ''}</strong>
				{m.settings_general_confirmDeleteMessageSuffix()}
			</p>

			{#if deleteLibraryTargetOption?.selectionMode === 'system'}
				<div class="rounded-lg border border-base-300 bg-base-200 p-3 text-sm text-base-content/80">
					{m.settings_general_attachedRootFoldersWillMoveTo()}
					<strong>{deleteLibraryTargetOption.targetLibraryName}</strong>.
				</div>
			{:else if deleteLibraryTargetOption?.selectionMode === 'choose-custom'}
				<div class="space-y-3">
					<div
						class="rounded-lg border border-base-300 bg-base-200 p-3 text-sm text-base-content/80"
					>
						{m.settings_general_attachedRootFoldersDefaultMoveTo()}
						<strong>{deleteLibraryTargetOption.targetLibraryName}</strong>.
					</div>
					<div class="space-y-2">
						<p class="text-sm text-base-content/80">
							{m.settings_general_optionalChooseCompatibleLibrary()}
						</p>
						<select
							class="select-bordered select w-full"
							bind:value={deleteLibraryDestinationId}
							disabled={deleteLibraryLoading}
						>
							<option value="">{deleteLibraryTargetOption.targetLibraryName}</option>
							{#each deleteLibraryTargetOption.customCandidates as candidate (candidate.id)}
								<option value={candidate.id}>{candidate.name}</option>
							{/each}
						</select>
					</div>
				</div>
			{/if}
		</div>
		<div class="modal-action mt-6 flex-wrap gap-2 border-t border-base-300 pt-4">
			<button
				type="button"
				class="btn btn-ghost"
				onclick={closeLibraryDeleteModal}
				disabled={deleteLibraryLoading}
			>
				{m.action_cancel()}
			</button>
			<button
				type="button"
				class="btn btn-error"
				onclick={handleConfirmLibraryDelete}
				disabled={deleteLibraryLoading}
			>
				{m.action_delete()}
			</button>
		</div>
	</ModalWrapper>
{/if}

{#if libraryModalOpen}
	<ModalWrapper
		open={libraryModalOpen}
		onClose={closeLibraryModal}
		maxWidth="2xl"
		labelledBy="library-edit-modal-title"
	>
		<ModalHeader
			title={libraryModalMode === 'add'
				? m.settings_general_libraryModalCreateTitle()
				: m.settings_general_libraryModalEditPlainTitle()}
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
						<span class="label-text">{m.settings_general_libraryName()}</span>
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
						<span class="label-text">{m.settings_general_mediaType()}</span>
					</label>
					<select
						id="library-media-type"
						class="select-bordered select select-sm"
						bind:value={libraryForm.mediaType}
						disabled={editingLibraryIsSystem}
					>
						<option value="movie">{m.rootFolders_movies()}</option>
						<option value="tv">{m.rootFolders_tvShows()}</option>
					</select>
				</div>

				<div class="form-control">
					<label class="label py-1" for="library-classification">
						<span class="label-text">{m.settings_general_classification()}</span>
					</label>
					<select
						id="library-classification"
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
						<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
							<div class="space-y-1">
								<div class="flex items-center gap-2">
									<span class="text-sm font-medium text-base-content"
										>{m.settings_general_rootFoldersLabel()}</span
									>
									<span class="badge badge-ghost badge-sm">
										{m.settings_general_selectedCount({ count: selectedLibraryRootFolderCount })}
									</span>
								</div>
								<p class="text-xs text-base-content/60">
									{m.settings_general_rootFoldersHelper()}
								</p>
							</div>
						</div>

						{#if selectedLibraryRootFolderCount > 0}
							{#if selectedLibraryRootFolderCount <= 4}
								<div class="flex flex-wrap gap-2">
									{#each filteredLibraryRootFolders.filter( (folder) => selectedLibraryRootFolderIds.has(folder.id) ) as folder (folder.id)}
										<span class="badge gap-1 badge-outline px-3 py-3 badge-primary">
											<FolderOpen class="h-3.5 w-3.5" />
											{folder.name}
										</span>
									{/each}
								</div>
							{:else}
								<div class="rounded-lg bg-base-200 px-3 py-2 text-sm text-base-content/70">
									{m.settings_general_rootFoldersSelected({
										count: selectedLibraryRootFolderCount
									})}
								</div>
							{/if}
						{/if}

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
										<div>
											{m.settings_general_createCompatibleRootFolder({
												classification:
													libraryForm.mediaSubType === 'anime'
														? m.settings_general_badgeAnime()
														: m.settings_general_standard().toLowerCase(),
												mediaType:
													libraryForm.mediaType === 'movie'
														? m.rootFolders_movies().toLowerCase()
														: m.settings_general_tv().toLowerCase()
											})}
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
													: libraryForm.rootFolderIds.filter((id) => id !== folder.id);
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
