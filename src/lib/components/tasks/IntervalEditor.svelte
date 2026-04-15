<script lang="ts">
	import { Pencil, Check, X } from 'lucide-svelte';
	import { toasts } from '$lib/stores/toast.svelte';

	interface Props {
		intervalHours: number;
		minHours?: number;
		onSave: (hours: number) => Promise<void>;
	}

	let { intervalHours, minHours = 0.25, onSave }: Props = $props();

	let isEditing = $state(false);
	let editValue = $state(0);
	let isSaving = $state(false);
	let error = $state<string | null>(null);

	// Sync editValue when intervalHours changes (and on initial mount)
	$effect(() => {
		if (!isEditing) {
			editValue = intervalHours;
		}
	});

	/**
	 * Format hours for display
	 */
	function formatInterval(hours: number): string {
		if (hours < 1) {
			return `${Math.round(hours * 60)}m`;
		}
		if (hours === 1) {
			return '1h';
		}
		if (hours < 24) {
			return `${hours}h`;
		}
		if (hours % 24 === 0) {
			const days = hours / 24;
			return days === 1 ? '1d' : `${days}d`;
		}
		return `${hours}h`;
	}

	/**
	 * Start editing
	 */
	function startEdit() {
		editValue = intervalHours;
		error = null;
		isEditing = true;
	}

	/**
	 * Cancel editing
	 */
	function cancelEdit() {
		editValue = intervalHours;
		error = null;
		isEditing = false;
	}

	/**
	 * Save the new interval
	 */
	async function save() {
		// Validate
		if (editValue < minHours) {
			error = `Min: ${formatInterval(minHours)}`;
			return;
		}

		if (editValue === intervalHours) {
			isEditing = false;
			return;
		}

		isSaving = true;
		error = null;

		try {
			await onSave(editValue);
			isEditing = false;
		} catch (e) {
			error = 'Failed';
			toasts.error(e instanceof Error ? e.message : 'Failed to save interval');
		} finally {
			isSaving = false;
		}
	}

	/**
	 * Handle keyboard events
	 */
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			save();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelEdit();
		}
	}
</script>

{#if isEditing}
	<div class="flex items-center gap-1">
		<input
			type="number"
			class="input-bordered input input-xs w-16"
			bind:value={editValue}
			onkeydown={handleKeydown}
			min={minHours}
			step="0.25"
			disabled={isSaving}
		/>
		<span class="text-xs text-base-content/60">h</span>
		<button class="btn btn-square btn-ghost btn-xs" onclick={save} disabled={isSaving} title="Save">
			{#if isSaving}
				<span class="loading loading-xs loading-spinner"></span>
			{:else}
				<Check class="h-3 w-3 text-success" />
			{/if}
		</button>
		<button class="btn btn-square btn-ghost btn-xs" onclick={cancelEdit} title="Cancel">
			<X class="h-3 w-3 text-error" />
		</button>
	</div>
	{#if error}
		<span class="text-xs text-error">{error}</span>
	{/if}
{:else}
	<button
		class="group flex items-center gap-1 font-medium hover:text-primary"
		onclick={startEdit}
		title="Click to edit"
	>
		{formatInterval(intervalHours)}
		<Pencil class="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
	</button>
{/if}
