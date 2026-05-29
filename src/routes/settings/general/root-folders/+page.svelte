<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Plus } from 'lucide-svelte';
	import { SettingsPage } from '$lib/components/ui/settings';
	import type { PageData } from './$types';
	import type {
		RootFolder,
		RootFolderFormData,
		PathValidationResult
	} from '$lib/types/downloadClient';
	import { RootFolderModal, RootFolderList } from '$lib/components/rootFolders';
	import { ConfirmationModal } from '$lib/components/ui/modal';
	import { toasts } from '$lib/stores/toast.svelte';
	import type { RootFolderCreate, RootFolderUpdate } from '$lib/validation/schemas.js';
	import {
		createRootFolder,
		updateRootFolder,
		deleteRootFolder,
		updateLibraryClassificationSettings,
		validateRootFolder
	} from '$lib/api/settings.js';
	import { scanLibrary } from '$lib/api/library.js';

	let { data }: { data: PageData } = $props();

	const hasAnimeSubtypeFolder = $derived(
		data.rootFolders.some((folder: RootFolder) => folder.mediaSubType === 'anime')
	);

	let folderModalOpen = $state(false);
	let folderModalMode = $state<'add' | 'edit'>('add');
	let editingFolder = $state<RootFolder | null>(null);
	let folderSaving = $state(false);
	let folderSaveError = $state<string | null>(null);
	let confirmFolderDeleteOpen = $state(false);
	let deleteFolderTarget = $state<RootFolder | null>(null);
	let enforceAnimeSubtype = $state(false);

	$effect(() => {
		enforceAnimeSubtype = data.enforceAnimeSubtype;
	});
	let savingAnimeSubtype = $state(false);

	async function clearEditQueryParam() {
		const url = new URL(page.url);
		if (!url.searchParams.has('edit')) return;
		url.searchParams.delete('edit');
		await goto(url.toString(), { replaceState: true, noScroll: true, keepFocus: true });
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

	$effect(() => {
		const editFolderId = page.url.searchParams.get('edit');
		if (!editFolderId || folderModalOpen) return;
		const target = data.rootFolders.find((folder) => folder.id === editFolderId);
		if (!target) return;
		openEditFolderModal(target);
		void clearEditQueryParam();
	});

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
		folderSaving = true;
		folderSaveError = null;

		try {
			const isCreating = folderModalMode === 'add';
			const payload =
				folderModalMode === 'edit' && editingFolder
					? await updateRootFolder(editingFolder.id, formData as RootFolderUpdate)
					: await createRootFolder(formData as RootFolderCreate);

			await invalidateAll();
			closeFolderModal();
			showAnimeEnforcementAutoDisabledWarning(payload);

			if (
				isCreating &&
				payload &&
				typeof payload === 'object' &&
				'folder' in payload &&
				(payload as Record<string, unknown>).folder &&
				typeof (payload as Record<string, unknown>).folder === 'object' &&
				((payload as Record<string, unknown>).folder as Record<string, unknown>).id
			) {
				void triggerLibraryScan(
					((payload as Record<string, unknown>).folder as Record<string, unknown>).id as string
				);
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
			const payload = await deleteRootFolder(deleteFolderTarget.id);

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
			await updateLibraryClassificationSettings({ enforceAnimeSubtype: enabled });

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

	async function triggerLibraryScan(rootFolderId?: string) {
		scanLibrary({ rootFolderId, fullScan: !rootFolderId }).catch(() => {
			// Scan start failure is non-critical; invalidateAll will refresh state on next poll
		});
	}
</script>

<svelte:head>
	<title>{m.settings_general_tabRootFolders()}</title>
</svelte:head>

<SettingsPage
	title={m.settings_general_tabRootFolders()}
	subtitle={m.settings_general_rootFoldersDescription()}
>
	{#snippet actions()}
		<button
			type="button"
			class="btn ml-auto w-full gap-2 btn-sm btn-primary sm:w-auto"
			onclick={openAddFolderModal}
		>
			<Plus class="h-4 w-4" />
			{m.action_add()}
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
