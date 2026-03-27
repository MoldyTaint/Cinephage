<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { invalidateAll } from '$app/navigation';
	import {
		Plus,
		HardDrive,
		RefreshCw,
		CheckCircle,
		AlertCircle,
		ExternalLink
	} from 'lucide-svelte';
	import { SettingsPage, SettingsSection } from '$lib/components/ui/settings';
	import type { PageData } from './$types';
	import type {
		RootFolder,
		RootFolderFormData,
		PathValidationResult
	} from '$lib/types/downloadClient';
	import { createSSE } from '$lib/sse';
	import { layoutState, deriveMobileSseStatus } from '$lib/layout.svelte';

	import { RootFolderModal, RootFolderList } from '$lib/components/rootFolders';
	import { ConfirmationModal } from '$lib/components/ui/modal';
	import { toasts } from '$lib/stores/toast.svelte';
	import { getResponseErrorMessage, readResponsePayload } from '$lib/utils/http';

	let { data }: { data: PageData } = $props();

	// Library Scan state
	interface ScanProgress {
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
	}

	let scanning = $state(false);
	let scanProgress = $state<ScanProgress | null>(null);
	let scanError = $state<string | null>(null);
	let scanSuccess = $state<{ message: string; unmatchedCount: number } | null>(null);

	// SSE Connection for library scan progress
	const sse = createSSE<{
		status: {
			fullScan?: boolean;
			activeScans?: unknown[];
			inProgress?: boolean;
			isScanning?: boolean;
		};
		progress: ScanProgress;
		scanComplete: { results?: Array<{ unmatchedFiles?: number }> };
		scanError: { error?: { message?: string } };
	}>('/api/library/scan/status', {
		status: (data) => {
			scanning = Boolean(data.inProgress ?? data.isScanning ?? false);
			if (!scanning) {
				scanProgress = null;
			}
		},
		progress: (data) => {
			scanning = true;
			scanProgress = data;
		},
		scanComplete: (data) => {
			const totalUnmatched =
				data.results?.reduce(
					(sum: number, r: { unmatchedFiles?: number }) => sum + (r.unmatchedFiles ?? 0),
					0
				) ?? 0;
			scanSuccess = {
				message: `Scan complete: ${data.results?.length ?? 0} folders scanned`,
				unmatchedCount: totalUnmatched
			};
			scanning = false;
			scanProgress = null;
		},
		scanError: (data) => {
			scanError = data.error?.message ?? 'Scan failed';
			scanning = false;
			scanProgress = null;
		}
	});

	$effect(() => {
		layoutState.setMobileSseStatus(deriveMobileSseStatus(sse));
		return () => {
			layoutState.clearMobileSseStatus();
		};
	});

	async function triggerLibraryScan(rootFolderId?: string) {
		scanning = true;
		scanError = null;
		scanSuccess = null;
		scanProgress = null;

		// Trigger the scan
		try {
			const body = rootFolderId ? { rootFolderId } : { fullScan: true };
			const response = await fetch('/api/library/scan', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
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

	// Root Folder state
	let folderModalOpen = $state(false);
	let folderModalMode = $state<'add' | 'edit'>('add');
	let editingFolder = $state<RootFolder | null>(null);
	let folderSaving = $state(false);
	let folderSaveError = $state<string | null>(null);
	let confirmFolderDeleteOpen = $state(false);
	let deleteFolderTarget = $state<RootFolder | null>(null);
	let enforceAnimeSubtype = $state(false);
	let savingAnimeSubtype = $state(false);

	$effect(() => {
		enforceAnimeSubtype = data.enforceAnimeSubtype ?? false;
	});

	// Root Folder Functions
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

			if (payload && typeof payload === 'object') {
				return payload as PathValidationResult;
			}

			return {
				valid: false,
				exists: false,
				writable: false,
				error: 'Invalid response from path validation'
			};
		} catch (e) {
			return {
				valid: false,
				exists: false,
				writable: false,
				error: e instanceof Error ? e.message : 'Unknown error'
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
				success?: boolean;
				folder?: { id?: string };
				error?: string;
			}>(response);

			if (!response.ok) {
				folderSaveError = getResponseErrorMessage(payload, 'Failed to save root folder');
				return;
			}

			await invalidateAll();
			closeFolderModal();

			// Auto-scan newly created folder
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

	async function handleFolderDelete() {
		if (!editingFolder) return;

		try {
			const response = await fetch(`/api/root-folders/${editingFolder.id}`, {
				method: 'DELETE',
				headers: { Accept: 'application/json' }
			});

			if (!response.ok) {
				const payload = await readResponsePayload<Record<string, unknown>>(response);
				throw new Error(getResponseErrorMessage(payload, 'Failed to delete root folder'));
			}

			await invalidateAll();
			closeFolderModal();
		} catch (error) {
			toasts.error(
				error instanceof Error ? error.message : m.settings_general_unexpectedDeleteError()
			);
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

			if (!response.ok) {
				const payload = await readResponsePayload<Record<string, unknown>>(response);
				throw new Error(getResponseErrorMessage(payload, 'Failed to delete root folder'));
			}

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
</script>

<svelte:head>
	<title>{m.settings_general_pageTitle()}</title>
</svelte:head>

<SettingsPage title={m.settings_general_heading()} subtitle={m.settings_general_subtitle()}>
	<!-- Root Folders Section -->
	<SettingsSection
		title={m.settings_general_rootFolders()}
		description={m.settings_general_rootFoldersDescription()}
		variant="flat"
	>
		{#snippet actions()}
			<button class="btn gap-2 btn-sm btn-primary sm:w-auto" onclick={openAddFolderModal}>
				<Plus class="h-4 w-4" />
				{m.settings_general_addFolder()}
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
					disabled={savingAnimeSubtype}
					onchange={(event) =>
						updateAnimeSubtypeEnforcement((event.currentTarget as HTMLInputElement).checked)}
				/>
				<div class="min-w-0">
					<div class="font-medium">Enforce Anime Root Folders</div>
					<div class="text-sm text-base-content/70">
						When enabled, anime media can only be added to root folders with subtype set to Anime.
					</div>
				</div>
			</label>
		</div>
	</SettingsSection>

	<div class="divider"></div>

	<!-- Library Scan Section -->
	<SettingsSection
		title={m.settings_general_libraryScan()}
		description={m.settings_general_libraryScanDescription()}
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
					{m.settings_general_scanLibrary()}
				{/if}
			</button>
		{/snippet}

		{#if data.rootFolders.length === 0}
			<div class="mb-4 alert alert-warning">
				<AlertCircle class="h-5 w-5" />
				<span>{m.settings_general_addFolderFirst()}</span>
			</div>
		{/if}

		{#if scanError}
			<div class="mb-4 alert alert-error">
				<AlertCircle class="h-5 w-5" />
				<span>{scanError}</span>
			</div>
		{/if}

		{#if scanSuccess}
			<div class="mb-4 alert alert-success">
				<CheckCircle class="h-5 w-5" />
				<div class="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<span>{scanSuccess.message}</span>
					{#if scanSuccess.unmatchedCount > 0}
						<a href="/library/unmatched" class="btn gap-1 btn-ghost btn-sm">
							{m.settings_general_viewUnmatchedFiles({ count: scanSuccess.unmatchedCount })}
							<ExternalLink class="h-3 w-3" />
						</a>
					{/if}
				</div>
			</div>
		{/if}

		{#if scanning && scanProgress}
			<div class="card bg-base-200 p-3 sm:p-4">
				<div
					class="mb-2 flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between"
				>
					<span class="max-w-md truncate">
						{scanProgress.phase === 'scanning' ? m.settings_general_discoveringFiles() : ''}
						{scanProgress.phase === 'processing' ? m.settings_general_processing() : ''}
						{scanProgress.phase === 'matching' ? m.settings_general_matchingFiles() : ''}
						{scanProgress.rootFolderPath ?? ''}
					</span>
					<span class="text-base-content/60">
						{scanProgress.filesProcessed} / {scanProgress.filesFound}
						{m.common_files()}
					</span>
				</div>
				<progress
					class="progress w-full progress-primary"
					value={scanProgress.filesProcessed}
					max={scanProgress.filesFound || 1}
				></progress>
				<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/60">
					<span>{m.settings_general_scanAdded()}: {scanProgress.filesAdded}</span>
					<span>{m.settings_general_scanUpdated()}: {scanProgress.filesUpdated}</span>
					<span>{m.settings_general_scanRemoved()}: {scanProgress.filesRemoved}</span>
					<span>{m.settings_general_scanUnmatched()}: {scanProgress.unmatchedCount}</span>
				</div>
				{#if scanProgress.currentFile}
					<div class="mt-2 truncate text-xs text-base-content/50">
						{scanProgress.currentFile}
					</div>
				{/if}
			</div>
		{/if}
	</SettingsSection>
</SettingsPage>

<!-- Root Folder Modal -->
<RootFolderModal
	open={folderModalOpen}
	mode={folderModalMode}
	folder={editingFolder}
	saving={folderSaving}
	error={folderSaveError}
	onClose={closeFolderModal}
	onSave={handleFolderSave}
	onDelete={handleFolderDelete}
	onValidatePath={handleValidatePath}
/>

<!-- Root Folder Delete Confirmation Modal -->
<ConfirmationModal
	open={confirmFolderDeleteOpen}
	title={m.settings_general_confirmDelete()}
	message={m.settings_general_confirmDeleteMessage({ name: deleteFolderTarget?.name ?? '' })}
	confirmLabel={m.action_delete()}
	confirmVariant="error"
	onConfirm={handleConfirmFolderDelete}
	onCancel={() => (confirmFolderDeleteOpen = false)}
/>
