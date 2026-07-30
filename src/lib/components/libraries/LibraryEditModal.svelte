<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { AlertCircle } from 'lucide-svelte';
	import { ModalWrapper, ModalHeader, ModalFooter } from '$lib/components/ui/modal';
	import { toasts } from '$lib/stores/toast.svelte';
	import { invalidateAll } from '$app/navigation';
	import { createLibrary, updateLibrary } from '$lib/api/settings.js';
	import type { LibraryCreate, LibraryUpdate } from '$lib/validation/schemas.js';
	import type { RootFolderMediaType, RootFolderMediaSubType } from '$lib/types/downloadClient';

	type LibraryRootFolderRef = {
		id: string;
		name?: string;
		path?: string;
		mediaType?: string;
		mediaSubType?: string;
	};

	type LibraryRef = {
		id: string;
		name: string;
		mediaType: RootFolderMediaType;
		mediaSubType: RootFolderMediaSubType;
		isSystem?: boolean;
		rootFolders?: LibraryRootFolderRef[];
		defaultSearchOnAdd?: boolean | null;
		defaultWantsSubtitles?: boolean | null;
	};

	type RootFolderRef = {
		id: string;
		name: string;
		path: string;
		mediaType: string;
		mediaSubType?: string;
	};

	type LibraryFormData = {
		name: string;
		mediaType: RootFolderMediaType;
		mediaSubType: RootFolderMediaSubType;
		rootFolderIds: string[];
		defaultSearchOnAdd: boolean;
		defaultWantsSubtitles: boolean;
	};

	interface Props {
		open: boolean;
		libraryId: string | null;
		libraries: LibraryRef[];
		rootFolders: RootFolderRef[];
		onClose: () => void;
	}

	let { open, libraryId, libraries, rootFolders, onClose }: Props = $props();

	let libraryForm = $state<LibraryFormData>({
		name: '',
		mediaType: 'movie',
		mediaSubType: 'standard',
		rootFolderIds: [],
		defaultSearchOnAdd: true,
		defaultWantsSubtitles: false
	});
	let librarySaving = $state(false);
	let librarySaveError = $state<string | null>(null);

	const isCreateMode = $derived(libraryId === null);
	const editingLibrary = $derived(
		!isCreateMode ? (libraries.find((l) => l.id === libraryId) ?? null) : null
	);
	const editingLibraryIsSystem = $derived(editingLibrary?.isSystem ?? false);

	const filteredLibraryRootFolders = $derived(
		rootFolders.filter(
			(folder) =>
				folder.mediaType === libraryForm.mediaType &&
				(folder.mediaSubType ?? 'standard') === libraryForm.mediaSubType
		)
	);
	const selectedLibraryRootFolderIds = $derived(new Set(libraryForm.rootFolderIds));
	const selectedLibraryRootFolderCount = $derived(selectedLibraryRootFolderIds.size);

	$effect(() => {
		if (!open) return;
		if (isCreateMode) {
			libraryForm = {
				name: '',
				mediaType: 'movie',
				mediaSubType: 'standard',
				rootFolderIds: [],
				defaultSearchOnAdd: true,
				defaultWantsSubtitles: false
			};
			librarySaveError = null;
		} else if (libraryId) {
			const library = libraries.find((l) => l.id === libraryId) ?? null;
			if (library) {
				libraryForm = {
					name: library.name,
					mediaType: library.mediaType,
					mediaSubType: library.mediaSubType,
					rootFolderIds: library.rootFolders?.map((f) => f.id) ?? [],
					defaultSearchOnAdd: library.defaultSearchOnAdd ?? true,
					defaultWantsSubtitles: library.defaultWantsSubtitles ?? false
				};
				librarySaveError = null;
			}
		}
	});

	async function saveLibrary() {
		librarySaving = true;
		librarySaveError = null;

		try {
			if (isCreateMode) {
				await createLibrary(libraryForm as LibraryCreate);
				toasts.success(m.settings_general_libraryCreated());
			} else if (libraryId) {
				await updateLibrary(libraryId, libraryForm as LibraryUpdate);
				toasts.success(m.settings_general_libraryUpdated());
			}
			await invalidateAll();
			onClose();
		} catch (error) {
			librarySaveError =
				error instanceof Error ? error.message : m.settings_general_failedToSaveLibrary();
		} finally {
			librarySaving = false;
		}
	}
</script>

<ModalWrapper
	{open}
	{onClose}
	maxWidth="2xl"
	labelledBy="status-library-edit-modal-title"
	lockScroll={false}
>
	<ModalHeader
		title={isCreateMode
			? m.settings_general_libraryModalCreateTitle()
			: m.settings_general_libraryModalEditPlainTitle()}
		{onClose}
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
						<span class="text-sm font-medium text-base-content">
							{m.settings_general_rootFoldersLabel()}
						</span>
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
									class={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${selectedLibraryRootFolderIds.has(folder.id) ? 'border-primary/40 bg-primary/5' : 'border-base-300 bg-base-100 hover:border-primary/30 hover:bg-base-200/40'}`}
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
			<label class="label cursor-pointer justify-start gap-3 rounded-lg border border-base-300 p-3">
				<input
					type="checkbox"
					class="checkbox shrink-0 checkbox-sm checkbox-primary"
					bind:checked={libraryForm.defaultSearchOnAdd}
				/>
				<span class="label-text text-base-content">{m.settings_general_searchOnAddLabel()}</span>
			</label>
			<label class="label cursor-pointer justify-start gap-3 rounded-lg border border-base-300 p-3">
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
		onCancel={onClose}
		onSave={saveLibrary}
		saving={librarySaving}
		saveLabel={m.settings_general_saveLibrary()}
	/>
</ModalWrapper>
