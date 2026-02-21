<script lang="ts">
	import { X, Loader2, AlertTriangle, Trash2, Download } from 'lucide-svelte';
	import ModalWrapper from './ModalWrapper.svelte';

	interface Props {
		open: boolean;
		title?: string;
		itemName: string;
		allowRemoveFromLibrary?: boolean;
		hasFiles?: boolean;
		hasActiveDownload?: boolean;
		loading?: boolean;
		onConfirm: (deleteFiles: boolean, removeFromLibrary: boolean) => void;
		onCancel: () => void;
	}

	let {
		open,
		title = 'Delete',
		itemName,
		allowRemoveFromLibrary = true,
		hasFiles = true,
		hasActiveDownload = false,
		loading = false,
		onConfirm,
		onCancel
	}: Props = $props();

	let deleteFiles = $state(false);
	let removeFromLibrary = $state(false);

	type ActionMode = 'unmatch' | 'delete_files' | 'remove_only' | 'remove_and_delete';

	const actionMode = $derived.by<ActionMode>(() => {
		if (allowRemoveFromLibrary && removeFromLibrary && deleteFiles) return 'remove_and_delete';
		if (allowRemoveFromLibrary && removeFromLibrary) return 'remove_only';
		if (deleteFiles) return 'delete_files';
		return 'unmatch';
	});

	const confirmLabel = $derived.by(() => {
		switch (actionMode) {
			case 'remove_and_delete':
				return 'Remove + Delete Files';
			case 'remove_only':
				return 'Remove from Library';
			case 'delete_files':
				return 'Delete Files';
			default:
				return 'Unmatch Files';
		}
	});

	// Reset state when modal closes
	$effect(() => {
		if (!open) {
			deleteFiles = false;
			removeFromLibrary = false;
		}
	});

	$effect(() => {
		if (!allowRemoveFromLibrary) {
			removeFromLibrary = false;
		}
	});

	$effect(() => {
		if (!hasFiles) {
			deleteFiles = false;
		}
	});

	function handleConfirm() {
		onConfirm(deleteFiles, removeFromLibrary);
	}

	function handleClose() {
		deleteFiles = false;
		removeFromLibrary = false;
		onCancel();
	}
</script>

<ModalWrapper {open} onClose={handleClose} maxWidth="md" labelledBy="delete-modal-title">
	<div class="mb-4 flex items-center justify-between">
		<h3 id="delete-modal-title" class="text-lg font-bold">{title}</h3>
		<button
			type="button"
			class="btn btn-circle btn-ghost btn-sm"
			onclick={handleClose}
			aria-label="Close"
		>
			<X class="h-4 w-4" />
		</button>
	</div>

	<p class="py-2">
		{#if actionMode === 'remove_and_delete'}
			Remove <strong>"{itemName}"</strong> from your library and permanently delete matched files from
			disk?
		{:else if actionMode === 'remove_only'}
			Remove <strong>"{itemName}"</strong> from your library and keep existing files on disk?
		{:else if actionMode === 'delete_files'}
			Delete matched files for <strong>"{itemName}"</strong> from disk? The item will remain in your library
			but show as missing.
		{:else}
			Unmatch files for <strong>"{itemName}"</strong>? The item will stay in your library and show
			as missing.
		{/if}
	</p>

	<label
		class="mt-4 flex items-center gap-3 py-2"
		class:cursor-pointer={hasFiles}
		class:opacity-50={!hasFiles}
	>
		<input
			type="checkbox"
			class="checkbox shrink-0 checkbox-error"
			bind:checked={deleteFiles}
			disabled={!hasFiles}
		/>
		<span class="text-sm"
			>Delete files from disk{#if !hasFiles}
				<span class="text-base-content/50">&nbsp(no files on disk)</span>{/if}</span
		>
	</label>

	{#if allowRemoveFromLibrary}
		<label class="flex cursor-pointer items-center gap-3 py-2">
			<input
				type="checkbox"
				class="checkbox shrink-0 checkbox-error"
				bind:checked={removeFromLibrary}
			/>
			<span class="text-sm">Remove from library entirely</span>
		</label>
	{/if}

	{#if hasActiveDownload && (actionMode === 'remove_only' || actionMode === 'remove_and_delete')}
		<div class="mt-3 alert alert-warning">
			<Download class="h-4 w-4" />
			<span class="text-sm"
				>There is an active or paused download for this item. It will be cancelled and removed from
				the download client.
			</span>
		</div>
	{/if}

	{#if actionMode === 'remove_and_delete'}
		<div class="mt-3 alert alert-error">
			<Trash2 class="h-4 w-4" />
			<span class="text-sm"
				>This will permanently remove the item from your library and delete matched files from disk.
				Metadata, history, and settings will be lost. This cannot be undone.</span
			>
		</div>
	{:else if actionMode === 'remove_only'}
		<div class="mt-3 alert alert-error">
			<Trash2 class="h-4 w-4" />
			<span class="text-sm"
				>This will permanently remove the item from your library. Files stay on disk but become
				unmatched. Metadata, history, and settings will be lost.</span
			>
		</div>
	{:else if actionMode === 'delete_files'}
		<div class="mt-3 alert alert-warning">
			<AlertTriangle class="h-4 w-4" />
			<span class="text-sm"
				>Files will be permanently deleted from disk, and this item will show as missing in your
				library. This cannot be undone.</span
			>
		</div>
	{:else}
		<div class="mt-3 alert alert-info">
			<span class="text-sm"
				>Files will remain on disk but become unmatched. You can re-match them later.</span
			>
		</div>
	{/if}

	<div class="modal-action">
		<button type="button" class="btn btn-ghost" onclick={handleClose} disabled={loading}>
			Cancel
		</button>
		<button type="button" class="btn btn-error" onclick={handleConfirm} disabled={loading}>
			{#if loading}
				<Loader2 class="h-4 w-4 animate-spin" />
			{/if}
			{confirmLabel}
		</button>
	</div>
</ModalWrapper>
