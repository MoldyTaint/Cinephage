<script lang="ts">
	import type { UnifiedTask } from '$lib/server/tasks/UnifiedTaskRegistry';

	interface Props {
		task: UnifiedTask;
	}

	let { task }: Props = $props();

	let isEditing = $state(false);
	let editValue = $state(task.intervalHours ?? task.defaultIntervalHours ?? 1);
	let isSaving = $state(false);

	function formatInterval(hours: number | null): string {
		if (hours === null) return 'Manual';
		if (hours < 1) return `${Math.round(hours * 60)}m`;
		if (hours < 24) return `${hours}h`;
		return `${Math.round(hours / 24)}d`;
	}

	async function saveInterval() {
		if (!task.intervalEditable) return;
		isSaving = true;
		try {
			const response = await fetch(`/api/tasks/${task.id}/interval`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ intervalHours: editValue })
			});
			if (response.ok) {
				// SSE will push the updated interval and nextRunTime
				isEditing = false;
			} else {
				const data = await response.json();
				console.error('Failed to save interval:', data);
			}
		} catch (error) {
			console.error('Failed to save interval:', error);
		} finally {
			isSaving = false;
		}
	}

	function startEditing() {
		if (!task.intervalEditable) return;
		editValue = task.intervalHours ?? task.defaultIntervalHours ?? 1;
		isEditing = true;
	}

	function cancelEditing() {
		isEditing = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			saveInterval();
		} else if (e.key === 'Escape') {
			cancelEditing();
		}
	}
</script>

{#if isEditing}
	<div class="flex items-center gap-1">
		<input
			type="number"
			step="0.25"
			min={task.minIntervalHours ?? 0.25}
			bind:value={editValue}
			onkeydown={handleKeydown}
			class="input-bordered input input-xs w-20"
			autofocus
		/>
		<span class="text-xs">h</span>
		<button
			class="btn btn-square btn-ghost btn-xs"
			onclick={saveInterval}
			disabled={isSaving}
			title="Save"
		>
			{#if isSaving}
				<span class="loading loading-xs loading-spinner"></span>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="20 6 9 17 4 12" />
				</svg>
			{/if}
		</button>
		<button
			class="btn btn-square btn-ghost btn-xs"
			onclick={cancelEditing}
			disabled={isSaving}
			title="Cancel"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<line x1="18" y1="6" x2="6" y2="18" />
				<line x1="6" y1="6" x2="18" y2="18" />
			</svg>
		</button>
	</div>
{:else}
	<button
		class="btn px-2 btn-ghost btn-xs {task.intervalEditable ? 'hover:bg-base-300' : ''}"
		onclick={startEditing}
		disabled={!task.intervalEditable}
		title={task.intervalEditable ? 'Click to edit' : 'System task - not editable'}
	>
		<span class="font-medium">{formatInterval(task.intervalHours)}</span>
		{#if task.intervalEditable}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="ml-1 opacity-50"
			>
				<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
			</svg>
		{/if}
	</button>
{/if}
