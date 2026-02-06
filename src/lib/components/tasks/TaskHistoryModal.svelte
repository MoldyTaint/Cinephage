<script lang="ts">
	import type { UnifiedTask } from '$lib/server/tasks/UnifiedTaskRegistry';
	import type { TaskHistoryEntry } from '$lib/types/task';

	interface Props {
		task: UnifiedTask;
		history: TaskHistoryEntry[];
		onClose: () => void;
	}

	let { task, history, onClose }: Props = $props();

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleString();
	}

	function formatDuration(startedAt: string, completedAt: string | null): string {
		if (!completedAt) return '—';
		const start = new Date(startedAt);
		const end = new Date(completedAt);
		const diffMs = end.getTime() - start.getTime();
		const diffSecs = Math.floor(diffMs / 1000);
		const diffMins = Math.floor(diffSecs / 60);
		const diffHours = Math.floor(diffMins / 60);

		if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
		if (diffMins > 0) return `${diffMins}m ${diffSecs % 60}s`;
		return `${diffSecs}s`;
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'completed':
				return 'badge-success';
			case 'failed':
				return 'badge-error';
			case 'cancelled':
				return 'badge-warning';
			case 'running':
				return 'badge-primary';
			default:
				return 'badge-ghost';
		}
	}
</script>

<div class="modal-open modal">
	<div class="modal-box max-w-4xl">
		<div class="mb-4 flex items-center justify-between">
			<div>
				<h3 class="text-lg font-bold">{task.name} - History</h3>
				<p class="text-sm text-base-content/60">{task.description}</p>
			</div>
			<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>✕</button>
		</div>

		{#if history.length === 0}
			<div class="py-8 text-center text-base-content/60">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="48"
					height="48"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="mx-auto mb-3 opacity-30"
				>
					<polyline points="9 11 12 14 22 4" />
					<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
				</svg>
				<p>No history available for this task.</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="table-compact table w-full table-zebra">
					<thead>
						<tr>
							<th>Status</th>
							<th>Started</th>
							<th>Duration</th>
							<th>Details</th>
						</tr>
					</thead>
					<tbody>
						{#each history as entry (entry.id)}
							<tr>
								<td>
									<span class="badge badge-sm {getStatusColor(entry.status)}">
										{entry.status}
									</span>
								</td>
								<td class="text-sm whitespace-nowrap">{formatDate(entry.startedAt)}</td>
								<td class="text-sm">
									{formatDuration(entry.startedAt, entry.completedAt)}
								</td>
								<td class="text-sm">
									{#if entry.results}
										<div class="space-y-0.5 text-xs">
											{#if 'itemsProcessed' in entry.results}
												<div>Processed: {entry.results.itemsProcessed}</div>
											{/if}
											{#if 'itemsGrabbed' in entry.results}
												<div>Grabbed: {entry.results.itemsGrabbed}</div>
											{/if}
											{#if 'errors' in entry.results && (entry.results as { errors?: number }).errors}
												<div class="text-error">
													Errors: {(entry.results as { errors?: number }).errors}
												</div>
											{/if}
											{#if 'updatedFiles' in entry.results}
												<div>Updated: {entry.results.updatedFiles}</div>
											{/if}
										</div>
									{:else}
										<span class="text-base-content/40">—</span>
									{/if}
								</td>
							</tr>
							{#if entry.errors && Array.isArray(entry.errors) && entry.errors.length > 0}
								<tr class="bg-error/5">
									<td colspan="4" class="text-sm">
										<div class="mb-1 font-medium text-error">Errors:</div>
										<ul class="list-inside list-disc space-y-0.5 text-xs">
											{#each entry.errors as error (error)}
												<li>{error}</li>
											{/each}
										</ul>
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<div class="modal-action">
			<button class="btn btn-primary" onclick={onClose}>Close</button>
		</div>
	</div>
	<div class="modal-backdrop" onclick={onClose}></div>
</div>
