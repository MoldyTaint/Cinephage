<script lang="ts">
	import { X, Loader2, AlertTriangle, Trash2 } from 'lucide-svelte';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';

	interface Props {
		open: boolean;
		selectedCount: number;
		mediaType: 'movie' | 'series';
		loading: boolean;
		onConfirm: (deleteFiles: boolean, removeFromLibrary: boolean) => void;
		onCancel: () => void;
	}

	let { open, selectedCount, mediaType, loading, onConfirm, onCancel }: Props = $props();

	let deleteFiles = $state(false);
	let removeFromLibrary = $state(false);

	// Reset when modal closes
	$effect(() => {
		if (!open) {
			deleteFiles = false;
			removeFromLibrary = false;
		}
	});

	const itemLabel = $derived(
		mediaType === 'movie'
			? selectedCount === 1
				? 'movie'
				: 'movies'
			: selectedCount === 1
				? 'series'
				: 'series'
	);

	function handleConfirm() {
		onConfirm(deleteFiles, removeFromLibrary);
	}

	function handleClose() {
		deleteFiles = false;
		removeFromLibrary = false;
		onCancel();
	}
</script>

<ModalWrapper {open} onClose={handleClose} maxWidth="md" labelledBy="bulk-delete-modal-title">
	<div class="mb-4 flex items-center justify-between">
		<h3 id="bulk-delete-modal-title" class="text-lg font-bold">
			{removeFromLibrary ? 'Remove from Library' : 'Delete Files'}
		</h3>
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
		{#if removeFromLibrary}
			Remove <strong>{selectedCount} {itemLabel}</strong> from your library entirely?
		{:else}
			Delete files for <strong>{selectedCount} {itemLabel}</strong>? The items will remain in your
			library but show as missing.
		{/if}
	</p>

	<label class="mt-4 flex cursor-pointer items-center gap-3 py-2">
		<input type="checkbox" class="checkbox shrink-0 checkbox-error" bind:checked={deleteFiles} />
		<span class="text-sm">Delete files from disk</span>
	</label>

	<label class="flex cursor-pointer items-center gap-3 py-2">
		<input
			type="checkbox"
			class="checkbox shrink-0 checkbox-error"
			bind:checked={removeFromLibrary}
		/>
		<span class="text-sm">Remove from library entirely</span>
	</label>

	{#if removeFromLibrary}
		<div class="mt-3 alert alert-error">
			<Trash2 class="h-4 w-4" />
			<span class="text-sm"
				>This will permanently remove {selectedCount}
				{itemLabel} from your library. All metadata, history, and settings will be lost. This cannot be
				undone.</span
			>
		</div>
	{:else if deleteFiles}
		<div class="mt-3 alert alert-warning">
			<AlertTriangle class="h-4 w-4" />
			<span class="text-sm"
				>Files will be permanently deleted from disk. This cannot be undone.</span
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
			{removeFromLibrary ? 'Remove' : 'Delete'}
			{selectedCount}
			{itemLabel}
		</button>
	</div>
</ModalWrapper>
