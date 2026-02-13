<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, onDestroy } from 'svelte';
	import type { PageData } from './$types';
	import { mobileSSEStatus } from '$lib/sse/mobileStatus.svelte';
	import type { UnifiedTask } from '$lib/server/tasks/UnifiedTaskRegistry';
	import type { TaskHistoryEntry } from '$lib/types/task';
	import TasksTable from '$lib/components/tasks/TasksTable.svelte';
	import CreateTaskPlaceholder from '$lib/components/tasks/CreateTaskPlaceholder.svelte';
	import { Wifi } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let errorMessage = $state<string | null>(null);
	let successMessage = $state<string | null>(null);
	let showCreateModal = $state(false);
	let sseConnected = $state(false);
	let sseStatus = $state<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
	const MOBILE_SSE_SOURCE = 'settings-tasks';

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

	// --- SSE Connection (using onMount/onDestroy, not $effect) ---
	// NOTE: eventSource must be a regular variable, NOT $state
	// EventSource events don't fire properly when wrapped in Svelte 5's reactive proxy
	let eventSource: EventSource | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let reconnectAttempts = $state(0);
	const MAX_RECONNECT_DELAY = 30000;

	$effect(() => {
		mobileSSEStatus.publish(MOBILE_SSE_SOURCE, sseStatus);
	});

	onMount(() => {
		if (!browser) return;
		connectSSE();
	});

	onDestroy(() => {
		disconnectSSE();
		mobileSSEStatus.clear(MOBILE_SSE_SOURCE);
	});

	function connectSSE() {
		sseStatus = 'connecting';
		eventSource = new EventSource('/api/tasks/stream');

		eventSource.addEventListener('connected', () => {
			sseConnected = true;
			sseStatus = 'connected';
			reconnectAttempts = 0;
		});

		// Receive initial task state from SSE (bypasses server-side caching issues)
		eventSource.addEventListener('tasks:initial', (e: MessageEvent) => {
			const event = JSON.parse(e.data) as { tasks: UnifiedTask[] };
			const newState: Record<string, UnifiedTask> = {};

			for (const task of event.tasks) {
				newState[task.id] = { ...task };
			}

			taskState = newState;
			hasInitialized = true;
		});

		eventSource.addEventListener('heartbeat', () => {
			// Keep-alive, no action needed
		});

		eventSource.addEventListener('task:started', (e: MessageEvent) => {
			const event = JSON.parse(e.data) as { taskId: string; startedAt: string };
			updateTask(event.taskId, { isRunning: true });
		});

		eventSource.addEventListener('task:completed', (e: MessageEvent) => {
			const event = JSON.parse(e.data) as {
				taskId: string;
				completedAt: string;
				lastRunTime: string;
				nextRunTime: string | null;
				result?: { itemsProcessed: number; itemsGrabbed: number; errors: number };
				historyEntry?: TaskHistoryEntry;
			};
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
				successMessage = `${task.name} completed: ${itemsProcessed} processed, ${itemsGrabbed} grabbed`;
				autoDismissSuccess();
			}
		});

		eventSource.addEventListener('task:failed', (e: MessageEvent) => {
			const event = JSON.parse(e.data) as {
				taskId: string;
				completedAt: string;
				error: string;
				historyEntry?: TaskHistoryEntry;
			};
			updateTask(event.taskId, { isRunning: false });

			// Update history if entry provided
			if (event.historyEntry) {
				prependHistoryEntry(event.taskId, event.historyEntry);
			}

			const task = taskState[event.taskId];
			if (task) {
				errorMessage = `${task.name} failed: ${event.error}`;
			}
		});

		eventSource.addEventListener('task:cancelled', (e: MessageEvent) => {
			const event = JSON.parse(e.data) as { taskId: string; cancelledAt: string };
			updateTask(event.taskId, { isRunning: false });

			const task = taskState[event.taskId];
			if (task) {
				successMessage = `${task.name} cancelled`;
				autoDismissSuccess();
			}
		});

		eventSource.addEventListener('task:updated', (e: MessageEvent) => {
			const event = JSON.parse(e.data) as {
				taskId: string;
				enabled?: boolean;
				intervalHours?: number;
				nextRunTime?: string | null;
			};
			const updates: Partial<UnifiedTask> = {};
			if (event.enabled !== undefined) updates.enabled = event.enabled;
			if (event.intervalHours !== undefined) updates.intervalHours = event.intervalHours;
			if (event.nextRunTime !== undefined) updates.nextRunTime = event.nextRunTime;
			updateTask(event.taskId, updates);
		});

		eventSource.onerror = () => {
			sseConnected = false;
			sseStatus = 'error';
			if (eventSource) {
				eventSource.close();
				eventSource = null;
			}

			// Reconnect with exponential backoff
			const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
			reconnectAttempts++;
			reconnectTimer = setTimeout(connectSSE, delay);
		};
	}

	function disconnectSSE() {
		sseConnected = false;
		sseStatus = 'disconnected';
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	}

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

		if (sseConnected) {
			// Fire-and-forget: SSE will push state updates.
			// We only need to handle errors from the initial request (e.g. 409 already running).
			fetch(endpoint, { method: 'POST' })
				.then(async (response) => {
					if (!response.ok) {
						const result = await response.json().catch(() => ({}));
						updateTask(taskId, { isRunning: false });
						errorMessage = result.error || result.message || `Task failed (${response.status})`;
					}
					// On success: SSE events handle the rest (started/completed/failed)
				})
				.catch((err) => {
					updateTask(taskId, { isRunning: false });
					errorMessage = err instanceof Error ? err.message : 'Failed to start task';
				});
		} else {
			// SSE not connected: await the response and handle the result directly
			try {
				const response = await fetch(endpoint, { method: 'POST' });
				const result = await response.json();

				if (!response.ok || !result.success) {
					updateTask(taskId, { isRunning: false });
					throw new Error(result.error || result.message || 'Task failed');
				}

				updateTask(taskId, { isRunning: false });
				if (result.result) {
					const { itemsProcessed, itemsGrabbed } = result.result;
					successMessage = `${task.name} completed: ${itemsProcessed ?? 0} processed, ${itemsGrabbed ?? 0} grabbed`;
				} else if (result.updatedFiles !== undefined) {
					successMessage = `${task.name} completed: ${result.updatedFiles}/${result.totalFiles ?? 0} files updated`;
				} else {
					successMessage = `${task.name} completed successfully`;
				}
				autoDismissSuccess();
			} catch (error) {
				updateTask(taskId, { isRunning: false });
				errorMessage = error instanceof Error ? error.message : 'Task failed';
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
				throw new Error(result.error || 'Failed to cancel task');
			}

			// SSE will handle the state update (task:cancelled)
			if (!sseConnected) {
				updateTask(taskId, { isRunning: false });
				successMessage = 'Task cancelled successfully';
				autoDismissSuccess();
			}
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to cancel task';
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
				errorMessage = result.message || 'Failed to update task';
			}
			// SSE will confirm the update via task:updated event
		} catch (error) {
			updateTask(taskId, { enabled: !enabled });
			errorMessage = error instanceof Error ? error.message : 'Failed to toggle task';
		}
	}
</script>

<div class="w-full space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold">Tasks</h1>
			<p class="mt-1 text-base-content/60">
				Scheduled and maintenance tasks for your Cinephage instance
			</p>
		</div>
		<div class="flex items-center gap-2 sm:gap-3">
			<div class="hidden items-center gap-2 lg:flex">
				{#if sseConnected}
					<span class="badge gap-1 badge-success">
						<Wifi class="h-3 w-3" />
						Live
					</span>
				{:else if sseStatus === 'connecting' || sseStatus === 'error'}
					<span class="badge gap-1 {sseStatus === 'error' ? 'badge-error' : 'badge-warning'}">
						{sseStatus === 'error' ? 'Reconnecting...' : 'Connecting...'}
					</span>
				{/if}
			</div>
			<button
				class="btn w-full gap-2 btn-sm btn-primary sm:w-auto"
				onclick={() => (showCreateModal = true)}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<line x1="12" y1="5" x2="12" y2="19" />
					<line x1="5" y1="12" x2="19" y2="12" />
				</svg>
				Create Task
			</button>
		</div>
	</div>

	<!-- Alerts -->
	{#if errorMessage}
		<div class="alert-sm alert items-start alert-error sm:items-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="12" cy="12" r="10" />
				<line x1="15" y1="9" x2="9" y2="15" />
				<line x1="9" y1="9" x2="15" y2="15" />
			</svg>
			<span class="wrap-break-word">{errorMessage}</span>
			<button class="btn ml-auto btn-ghost btn-xs" onclick={() => (errorMessage = null)}
				>Dismiss</button
			>
		</div>
	{/if}

	{#if successMessage}
		<div class="alert-sm alert items-start alert-success sm:items-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
				<polyline points="22 4 12 14.01 9 11.01" />
			</svg>
			<span class="wrap-break-word">{successMessage}</span>
			<button class="btn ml-auto btn-ghost btn-xs" onclick={() => (successMessage = null)}
				>Dismiss</button
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
</div>
