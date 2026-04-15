<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import type { PageData } from './$types';
	import type { UnifiedTask } from '$lib/server/tasks/UnifiedTaskRegistry';
	import type { TaskHistoryEntry } from '$lib/types/task';
	import TasksTable from '$lib/components/tasks/TasksTable.svelte';
	import CreateTaskPlaceholder from '$lib/components/tasks/CreateTaskPlaceholder.svelte';
	import { SettingsPage } from '$lib/components/ui/settings';
	import { Wifi, Plus, XCircle, CheckCircle2 } from 'lucide-svelte';
	import { createSSE } from '$lib/sse';
	import { layoutState, deriveMobileSseStatus } from '$lib/layout.svelte';

	let { data }: { data: PageData } = $props();

	let errorMessage = $state<string | null>(null);
	let successMessage = $state<string | null>(null);
	let showCreateModal = $state(false);

	// --- Reactive local task state (seeded from server, updated by SSE) ---

	// Use a reactive object for better Svelte 5 performance
	let taskState = $state<Record<string, UnifiedTask>>({});
	let taskHistory = $state<Record<string, TaskHistoryEntry[]>>({});

	// Track if we've initialized to avoid overwriting SSE updates on initial load
	let hasInitialized = $state(false);

	// Sync server data on initial load only (preserves running state from SSE)
	$effect(() => {
		if (hasInitialized) return;

		const serverTasks = data.tasks;
		const newState: Record<string, UnifiedTask> = {};

		for (const task of serverTasks) {
			newState[task.id] = { ...task };
		}

		taskState = newState;
		taskHistory = { ...data.taskHistory };
		hasInitialized = true;
	});

	// Derived sorted tasks list (preserving definition order from data.tasks)
	const tasks = $derived(data.tasks.map((def) => taskState[def.id] ?? def));

	// --- SSE Connection using createSSE ---
	const sse = createSSE<{
		connected: void;
		'task:started': { taskId: string; startedAt: string };
		'task:completed': {
			taskId: string;
			completedAt: string;
			lastRunTime: string;
			nextRunTime: string | null;
			result?: { itemsProcessed: number; itemsGrabbed: number; errors: number };
			historyEntry?: TaskHistoryEntry;
		};
		'task:failed': {
			taskId: string;
			completedAt: string;
			error: string;
			historyEntry?: TaskHistoryEntry;
		};
		'task:cancelled': { taskId: string; cancelledAt: string };
		'task:updated': {
			taskId: string;
			enabled?: boolean;
			intervalHours?: number;
			nextRunTime?: string | null;
		};
	}>('/api/tasks/stream', {
		connected: () => {
			// Connection established
		},
		'task:started': (event) => {
			updateTask(event.taskId, { isRunning: true });
		},
		'task:completed': (event) => {
			updateTask(event.taskId, {
				isRunning: false,
				lastRunTime: event.lastRunTime,
				nextRunTime: event.nextRunTime
			});

			// Update history if entry provided
			if (event.historyEntry) {
				prependHistoryEntry(event.taskId, event.historyEntry);
			}

			// Show success notification
			const task = taskState[event.taskId];
			if (task && event.result) {
				const { itemsProcessed, itemsGrabbed } = event.result;
				successMessage = m.settings_tasks_taskCompleted({
					name: task.name,
					processed: String(itemsProcessed),
					grabbed: String(itemsGrabbed)
				});
				autoDismissSuccess();
			}
		},
		'task:failed': (event) => {
			updateTask(event.taskId, { isRunning: false });

			// Update history if entry provided
			if (event.historyEntry) {
				prependHistoryEntry(event.taskId, event.historyEntry);
			}

			const task = taskState[event.taskId];
			if (task) {
				errorMessage = m.settings_tasks_taskFailed({ name: task.name, error: event.error });
			}
		},
		'task:cancelled': (event) => {
			updateTask(event.taskId, { isRunning: false });

			const task = taskState[event.taskId];
			if (task) {
				successMessage = m.settings_tasks_taskCancelled({ name: task.name });
				autoDismissSuccess();
			}
		},
		'task:updated': (event) => {
			const updates: Partial<UnifiedTask> = {};
			if (event.enabled !== undefined) updates.enabled = event.enabled;
			if (event.intervalHours !== undefined) updates.intervalHours = event.intervalHours;
			if (event.nextRunTime !== undefined) updates.nextRunTime = event.nextRunTime;
			updateTask(event.taskId, updates);
		}
	});

	$effect(() => {
		layoutState.setMobileSseStatus(deriveMobileSseStatus(sse));
		return () => {
			layoutState.clearMobileSseStatus();
		};
	});

	/**
	 * Update a single task using fine-grained reactivity
	 */
	function updateTask(taskId: string, updates: Partial<UnifiedTask>) {
		const existing = taskState[taskId];
		if (!existing) return;

		// Svelte 5 tracks object property assignments
		taskState[taskId] = { ...existing, ...updates };
	}

	/**
	 * Prepend a history entry for a task (most recent first, keep max 5)
	 */
	function prependHistoryEntry(taskId: string, entry: TaskHistoryEntry) {
		const existing = taskHistory[taskId] ?? [];
		// Avoid duplicates by id
		const filtered = existing.filter((e) => e.id !== entry.id);
		taskHistory = {
			...taskHistory,
			[taskId]: [entry, ...filtered].slice(0, 5)
		};
	}

	/**
	 * Auto-dismiss success messages after 8 seconds
	 */
	function autoDismissSuccess() {
		setTimeout(() => {
			successMessage = null;
		}, 8000);
	}

	// --- Event Handlers ---

	/**
	 * Handle task execution.
	 *
	 * For scheduled tasks: call runEndpoint directly (MonitoringScheduler emits SSE events).
	 * For maintenance tasks: call /api/tasks/:id/run (which emits SSE events itself).
	 *
	 * When SSE is connected, fire-and-forget: the optimistic update shows the running
	 * state immediately and SSE events will confirm completion/failure.
	 * When SSE is disconnected, await the response and handle the result directly.
	 */
	async function handleRunTask(taskId: string): Promise<void> {
		const task = taskState[taskId];
		if (!task) return;

		errorMessage = null;
		successMessage = null;

		// Optimistically mark as running
		updateTask(taskId, { isRunning: true });

		// Determine the endpoint: maintenance tasks go through the generic runner
		// (which emits SSE events), scheduled tasks call their endpoint directly
		// (MonitoringScheduler emits SSE events).
		const endpoint =
			task.category === 'maintenance' ? `/api/tasks/${taskId}/run` : task.runEndpoint;

		if (sse.isConnected) {
			// Fire-and-forget: SSE will push state updates.
			// We only need to handle errors from the initial request (e.g. 409 already running).
			fetch(endpoint, { method: 'POST' })
				.then(async (response) => {
					if (!response.ok) {
						const result = await response.json().catch(() => ({}));
						updateTask(taskId, { isRunning: false });
						errorMessage =
							result.error ||
							result.message ||
							m.settings_tasks_taskFailedStatus({ status: String(response.status) });
					}
					// On success: SSE events handle the rest (started/completed/failed)
				})
				.catch((err) => {
					updateTask(taskId, { isRunning: false });
					errorMessage = err instanceof Error ? err.message : m.settings_tasks_failedToStartTask();
				});
		} else {
			// SSE not connected: await the response and handle the result directly
			try {
				const response = await fetch(endpoint, { method: 'POST' });
				const result = await response.json();

				if (!response.ok || !result.success) {
					updateTask(taskId, { isRunning: false });
					throw new Error(result.error || result.message || m.settings_tasks_taskFailedGeneric());
				}

				updateTask(taskId, { isRunning: false });
				if (result.result) {
					const { itemsProcessed, itemsGrabbed } = result.result;
					successMessage = m.settings_tasks_taskCompleted({
						name: task.name,
						processed: String(itemsProcessed ?? 0),
						grabbed: String(itemsGrabbed ?? 0)
					});
				} else if (result.updatedFiles !== undefined) {
					successMessage = m.settings_tasks_taskCompletedFiles({
						name: task.name,
						updated: String(result.updatedFiles),
						total: String(result.totalFiles ?? 0)
					});
				} else {
					successMessage = m.settings_tasks_taskCompletedSuccess({ name: task.name });
				}
				autoDismissSuccess();
			} catch (error) {
				updateTask(taskId, { isRunning: false });
				errorMessage =
					error instanceof Error ? error.message : m.settings_tasks_taskFailedGeneric();
			}
		}
	}

	/**
	 * Handle task cancellation
	 */
	async function handleCancelTask(taskId: string): Promise<void> {
		try {
			const response = await fetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || m.settings_tasks_failedToCancelTask());
			}

			// SSE will handle the state update (task:cancelled)
			if (!sse.isConnected) {
				updateTask(taskId, { isRunning: false });
				successMessage = m.settings_tasks_taskCancelledSuccess();
				autoDismissSuccess();
			}
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : m.settings_tasks_failedToCancelTask();
		}
	}

	/**
	 * Handle toggling task enabled/disabled
	 */
	async function handleToggleEnabled(taskId: string, enabled: boolean): Promise<void> {
		// Optimistically update
		updateTask(taskId, { enabled });

		try {
			const response = await fetch(`/api/tasks/${taskId}/enabled`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled })
			});

			if (!response.ok) {
				// Revert on failure
				updateTask(taskId, { enabled: !enabled });
				const result = await response.json();
				errorMessage = result.message || m.settings_tasks_failedToUpdateTask();
			}
			// SSE will confirm the update via task:updated event
		} catch (error) {
			updateTask(taskId, { enabled: !enabled });
			errorMessage = error instanceof Error ? error.message : m.settings_tasks_failedToToggleTask();
		}
	}
</script>

<svelte:head>
	<title>{m.settings_tasks_pageTitle()}</title>
</svelte:head>

<SettingsPage title={m.settings_tasks_heading()} subtitle={m.settings_tasks_subtitle()}>
	{#snippet actions()}
		<div class="hidden items-center gap-2 lg:flex">
			{#if sse.isConnected}
				<span class="badge gap-1 badge-success">
					<Wifi class="h-3 w-3" />
					{m.common_live()}
				</span>
			{:else if sse.status === 'connecting' || sse.status === 'error'}
				<span class="badge gap-1 {sse.status === 'error' ? 'badge-error' : 'badge-warning'}">
					{sse.status === 'error' ? m.common_reconnecting() : m.common_connecting()}
				</span>
			{/if}
		</div>
		<button
			class="btn w-full gap-2 btn-sm btn-primary sm:w-auto"
			onclick={() => (showCreateModal = true)}
		>
			<Plus class="h-4 w-4" />
			{m.settings_tasks_createTask()}
		</button>
	{/snippet}

	<!-- Alerts -->
	{#if errorMessage}
		<div class="alert-sm alert items-start alert-error sm:items-center">
			<XCircle class="h-5 w-5 shrink-0" />
			<span class="wrap-break-word">{errorMessage}</span>
			<button class="btn ml-auto btn-ghost btn-xs" onclick={() => (errorMessage = null)}
				>{m.settings_tasks_dismiss()}</button
			>
		</div>
	{/if}

	{#if successMessage}
		<div class="alert-sm alert items-start alert-success sm:items-center">
			<CheckCircle2 class="h-5 w-5 shrink-0" />
			<span class="wrap-break-word">{successMessage}</span>
			<button class="btn ml-auto btn-ghost btn-xs" onclick={() => (successMessage = null)}
				>{m.settings_tasks_dismiss()}</button
			>
		</div>
	{/if}

	<!-- Tasks Table -->
	<TasksTable
		{tasks}
		{taskHistory}
		onRunTask={handleRunTask}
		onCancelTask={handleCancelTask}
		onToggleEnabled={handleToggleEnabled}
	/>

	<!-- Create Task Modal -->
	<CreateTaskPlaceholder isOpen={showCreateModal} onClose={() => (showCreateModal = false)} />
</SettingsPage>
