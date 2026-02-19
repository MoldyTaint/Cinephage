<script lang="ts">
	import { X, Loader2, AlertTriangle } from 'lucide-svelte';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';

	interface Props {
		open: boolean;
		loading: boolean;
		selectedCount: number;
		channelName?: string | null;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let { open, loading, selectedCount, channelName = null, onConfirm, onCancel }: Props = $props();

	const channelLabel = $derived(selectedCount === 1 ? 'channel' : 'channels');

	function handleClose() {
		if (loading) return;
		onCancel();
	}
</script>

<ModalWrapper {open} onClose={handleClose} maxWidth="md" labelledBy="channel-remove-modal-title">
	<div class="mb-4 flex items-center justify-between">
		<h3 id="channel-remove-modal-title" class="text-lg font-bold">Remove from Lineup</h3>
		<button
			type="button"
			class="btn btn-circle btn-ghost btn-sm"
			onclick={handleClose}
			aria-label="Close"
			disabled={loading}
		>
			<X class="h-4 w-4" />
		</button>
	</div>

	<p class="py-2">
		{#if selectedCount === 1 && channelName}
			Remove <strong>"{channelName}"</strong> from your lineup?
		{:else}
			Remove <strong>{selectedCount} {channelLabel}</strong> from your lineup?
		{/if}
	</p>

	<div class="mt-3 alert alert-info">
		<AlertTriangle class="h-4 w-4" />
		<span class="text-sm">
			This removes channels from your lineup only. Source account channels remain available.
		</span>
	</div>

	<div class="modal-action">
		<button type="button" class="btn btn-ghost" onclick={handleClose} disabled={loading}>
			Cancel
		</button>
		<button type="button" class="btn btn-error" onclick={onConfirm} disabled={loading}>
			{#if loading}
				<Loader2 class="h-4 w-4 animate-spin" />
			{/if}
			Remove
			{selectedCount}
			{channelLabel}
		</button>
	</div>
</ModalWrapper>
