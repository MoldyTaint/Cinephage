<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { Plus, FolderOpen, AlertCircle } from 'lucide-svelte';
	import { SettingsPage } from '$lib/components/ui/settings';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	import type { RootFolderMediaSubType, RootFolderMediaType } from '$lib/types/downloadClient';
	import { LibraryList } from '$lib/components/libraries';
	import { ModalWrapper, ModalHeader, ModalFooter } from '$lib/components/ui/modal';
	import { toasts } from '$lib/stores/toast.svelte';
	import { getResponseErrorMessage, readResponsePayload } from '$lib/utils/http';

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
	type LibraryDeleteOption = {
		targetLibraryId: string | null;
		targetLibraryName: string;
		selectionMode: 'system' | 'choose-custom' | 'none';
		customCandidates: LibraryEntity[];
	};

	let { data }: { data: PageData } = $props();

	const filteredLibraryRootFolders = $derived(
		data.rootFolders.filter(
			(folder: RootFolderRef) =>
				folder.mediaType === libraryForm.mediaType &&
				(folder.mediaSubType ?? 'standard') === libraryForm.mediaSubType
		)
	);

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
		defaultWantsSubtitles: false
	});

	const selectedLibraryRootFolderIds = $derived(new Set(libraryForm.rootFolderIds));
	const selectedLibraryRootFolderCount = $derived(selectedLibraryRootFolderIds.size);
	const editingLibraryIsSystem = $derived(editingLibrary?.isSystem ?? false);

	async function clearEditQueryParam() {
		const url = new URL($page.url);
		if (!url.searchParams.has('edit')) return;
		url.searchParams.delete('edit');
		await goto(url.toString(), { replaceState: true, noScroll: true, keepFocus: true });
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
	}

	function openAddLibraryModal() {
		libraryModalMode = 'add';
		editingLibrary = null;
		libraryForm = {
			name: '',
			mediaType: 'movie',
			mediaSubType: 'standard',
			rootFolderIds: [],
			defaultMonitored: true,
			defaultSearchOnAdd: true,
			defaultWantsSubtitles: false
		};
		librarySaveError = null;
		libraryModalOpen = true;
	}

	function openEditLibraryModal(library: LibraryEntity) {
		libraryModalMode = 'edit';
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

	$effect(() => {
		const editLibraryId = $page.url.searchParams.get('edit');
		if (!editLibraryId || libraryModalOpen) return;
		const target = data.libraries.find((library) => library.id === editLibraryId) as
			| LibraryEntity
			| undefined;
		if (!target) return;
		openEditLibraryModal(target);
		void clearEditQueryParam();
	});

	async function saveLibrary() {
		librarySaving = true;
		librarySaveError = null;

		try {
			const response = editingLibrary
				? await fetch(`/api/libraries/${editingLibrary.id}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(libraryForm)
					})
				: await fetch('/api/libraries', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(libraryForm)
					});

			const payload = await readResponsePayload<Record<string, unknown>>(response);

			if (!response.ok) {
				librarySaveError = getResponseErrorMessage(payload, 'Failed to save library');
				return;
			}

			toasts.success(editingLibrary ? 'Library updated' : 'Library created');
			libraryModalOpen = false;
			location.reload();
		} catch (error) {
			librarySaveError = error instanceof Error ? error.message : 'Failed to save library';
		} finally {
			librarySaving = false;
		}
	}

	function confirmLibraryDelete(library: LibraryEntity) {
		deleteLibraryTarget = library;
		deleteLibraryDestinationId = '';
		deleteLibraryLoading = false;

		const compatibleCustomLibraries = data.libraries.filter(
			(l: LibraryEntity) =>
				l.id !== library.id &&
				l.mediaType === library.mediaType &&
				l.mediaSubType === library.mediaSubType
		);

		const systemLibrary = data.libraries.find(
			(l: LibraryEntity) => l.isSystem && l.mediaType === library.mediaType && l.id !== library.id
		);

		if (systemLibrary) {
			deleteLibraryTargetOption = {
				targetLibraryId: systemLibrary.id,
				targetLibraryName: systemLibrary.name,
				selectionMode: 'system',
				customCandidates: []
			};
		} else if (compatibleCustomLibraries.length > 0) {
			const candidate = compatibleCustomLibraries[0];
			deleteLibraryTargetOption = {
				targetLibraryId: candidate.id,
				targetLibraryName: candidate.name,
				selectionMode: 'choose-custom',
				customCandidates: compatibleCustomLibraries
			};
		} else {
			deleteLibraryTargetOption = {
				targetLibraryId: null,
				targetLibraryName: '',
				selectionMode: 'none',
				customCandidates: []
			};
		}

		confirmLibraryDeleteOpen = true;
	}

	function closeLibraryDeleteModal() {
		confirmLibraryDeleteOpen = false;
	}

	async function handleConfirmLibraryDelete() {
		if (!deleteLibraryTarget) return;
		deleteLibraryLoading = true;

		try {
			const body: Record<string, unknown> = {};
			if (deleteLibraryDestinationId) {
				body.targetLibraryId = deleteLibraryDestinationId;
			}

			const response = await fetch(`/api/libraries/${deleteLibraryTarget.id}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const payload = await readResponsePayload<Record<string, unknown>>(response);

			if (!response.ok) {
				toasts.error(getResponseErrorMessage(payload, 'Failed to delete library'));
				return;
			}

			toasts.success('Library deleted');
			confirmLibraryDeleteOpen = false;
			location.reload();
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to delete library');
		} finally {
			deleteLibraryLoading = false;
		}
	}
</script>

<svelte:head>
	<title>{m.settings_general_tabLibraries()}</title>
</svelte:head>

<SettingsPage
	title={m.settings_general_tabLibraries()}
	subtitle={m.settings_general_librariesDescription()}
>
	{#snippet actions()}
		<button
			type="button"
			class="btn ml-auto w-full gap-2 btn-sm btn-primary sm:w-auto"
			onclick={openAddLibraryModal}
		>
			<Plus class="h-4 w-4" />
			{m.action_add()}
		</button>
	{/snippet}

	<LibraryList
		libraries={data.libraries}
		storageBreakdown={data.storage.libraryBreakdown}
		onEdit={openEditLibraryModal}
		onDelete={confirmLibraryDelete}
		{formatBytes}
	/>
</SettingsPage>

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
									{#each filteredLibraryRootFolders.filter( (folder: RootFolderRef) => selectedLibraryRootFolderIds.has(folder.id) ) as folder (folder.id)}
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
