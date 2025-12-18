<script lang="ts">
	import { invalidate } from '$app/navigation';
	import {
		Play,
		RefreshCw,
		Clock,
		Timer,
		ChevronDown,
		ChevronUp,
		CheckCircle,
		XCircle,
		AlertCircle,
		Square
	} from 'lucide-svelte';
	import type { UnifiedTask } from '$lib/server/tasks/UnifiedTaskRegistry';
	import type { TaskHistoryEntry } from '$lib/types/task';
	import IntervalEditor from './IntervalEditor.svelte';
	import TaskHistoryList from './TaskHistoryList.svelte';

	interface Props {
		task: UnifiedTask;
		history?: TaskHistoryEntry[];
		onRunTask?: (taskId: string) => Promise<void>;
		onCancelTask?: (taskId: string) => Promise<void>;
	}

	let { task, history = [], onRunTask, onCancelTask }: Props = $props();

	let isRunning = $state(false);
	let isCancelling = $state(false);
	let isExpanded = $state(false);
	let loadingHistory = $state(false);
	let taskHistory = $state<TaskHistoryEntry[]>([]);

	// Sync state with props
	$effect(() => {
		isRunning = task.isRunning;
		taskHistory = history;
		// Reset cancelling state when task stops running
		if (!task.isRunning) {
			isCancelling = false;
		}
	});

	/**
	 * Format time ago
	 */
	function formatTimeAgo(dateStr: string | null): string {
		if (!dateStr) return 'Never';
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffMins < 0) return formatTimeUntil(dateStr);
		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		return `${diffDays}d ago`;
	}

	/**
	 * Format time until (for next run)
	 */
	function formatTimeUntil(dateStr: string | null): string {
		if (!dateStr) return '—';
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = date.getTime() - now.getTime();

		if (diffMs <= 0) return 'Overdue';

		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffMins < 60) return `in ${diffMins}m`;
		if (diffHours < 24) return `in ${diffHours}h`;
		return `in ${diffDays}d`;
	}

	/**
	 * Run the task
	 */
	async function runTask() {
		if (isRunning) return;

		isRunning = true;

		try {
			if (onRunTask) {
				await onRunTask(task.id);
			} else {
				// Default behavior: call the run endpoint
				const response = await fetch(task.runEndpoint, { method: 'POST' });
				const result = await response.json();
				if (!result.success) {
					throw new Error(result.error || 'Task failed');
				}
			}
			await invalidate('app:tasks');
		} catch (error) {
			console.error('Task failed:', error);
		} finally {
			isRunning = false;
		}
	}

	/**
	 * Cancel the running task
	 */
	async function cancelTask() {
		if (!isRunning || isCancelling) return;

		isCancelling = true;

		try {
			if (onCancelTask) {
				await onCancelTask(task.id);
			} else {
				// Default behavior: call the cancel endpoint
				const response = await fetch(`/api/tasks/${task.id}/cancel`, { method: 'POST' });
				const result = await response.json();
				if (!result.success) {
					throw new Error(result.error || 'Failed to cancel task');
				}
			}
			await invalidate('app:tasks');
		} catch (error) {
			console.error('Failed to cancel task:', error);
		}
		// Note: isCancelling is reset in the $effect when task.isRunning becomes false
	}

	/**
	 * Toggle history expansion and load if needed
	 */
	async function toggleHistory() {
		isExpanded = !isExpanded;

		if (isExpanded && taskHistory.length === 0) {
			await loadHistory();
		}
	}

	/**
	 * Load task history
	 */
	async function loadHistory() {
		loadingHistory = true;
		try {
			const response = await fetch(`/api/tasks/${task.id}/history?limit=5`);
			const result = await response.json();
			if (result.success) {
				taskHistory = result.history;
			}
		} catch (error) {
			console.error('Failed to load history:', error);
		} finally {
			loadingHistory = false;
		}
	}

	/**
	 * Handle interval change
	 */
	async function handleIntervalChange(newInterval: number) {
		try {
			const response = await fetch(`/api/tasks/${task.id}/interval`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ intervalHours: newInterval })
			});
			const result = await response.json();
			if (result.success) {
				await invalidate('app:tasks');
			}
		} catch (error) {
			console.error('Failed to update interval:', error);
		}
	}

	// Derived state for last run status
	const lastRunStatus = $derived(() => {
		if (taskHistory.length === 0) return null;
		return taskHistory[0]?.status ?? null;
	});
</script>

<div class="card bg-base-200">
	<div class="card-body gap-3 p-4">
		<!-- Header -->
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<h3 class="truncate text-base font-semibold">{task.name}</h3>
					{#if isRunning}
						<span class="badge gap-1 badge-sm badge-primary">
							<RefreshCw class="h-3 w-3 animate-spin" />
							Running
						</span>
					{:else if lastRunStatus() === 'completed'}
						<span class="badge gap-1 badge-sm badge-success">
							<CheckCircle class="h-3 w-3" />
							OK
						</span>
					{:else if lastRunStatus() === 'failed'}
						<span class="badge gap-1 badge-sm badge-error">
							<XCircle class="h-3 w-3" />
							Failed
						</span>
					{/if}
				</div>
				<p class="mt-1 text-sm text-base-content/60">{task.description}</p>
			</div>
		</div>

		<!-- Status Info -->
		<div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
			<!-- Last Run -->
			<div class="flex items-center gap-1.5">
				<Clock class="h-4 w-4 shrink-0 text-base-content/50" />
				<span class="text-base-content/60">Last:</span>
				<span class="font-medium">{formatTimeAgo(task.lastRunTime)}</span>
			</div>

			<!-- Next Run (scheduled only) -->
			{#if task.category === 'scheduled' && task.nextRunTime}
				<div class="flex items-center gap-1.5">
					<Timer class="h-4 w-4 shrink-0 text-base-content/50" />
					<span class="text-base-content/60">Next:</span>
					<span class="font-medium">{formatTimeUntil(task.nextRunTime)}</span>
				</div>
			{/if}

			<!-- Interval (scheduled with editable intervals) -->
			{#if task.category === 'scheduled' && task.intervalHours !== null}
				<div class="flex items-center gap-1.5">
					<RefreshCw class="h-4 w-4 shrink-0 text-base-content/50" />
					<span class="text-base-content/60">Every:</span>
					{#if task.intervalEditable}
						<IntervalEditor
							intervalHours={task.intervalHours}
							minHours={task.minIntervalHours ?? 0.25}
							onSave={handleIntervalChange}
						/>
					{:else}
						<span class="font-medium">{task.intervalHours}h</span>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Actions -->
		<div class="mt-1 flex items-center justify-between gap-2">
			<!-- History Toggle -->
			<button
				class="btn gap-1 text-base-content/60 btn-ghost btn-sm"
				onclick={toggleHistory}
				disabled={loadingHistory}
			>
				{#if loadingHistory}
					<span class="loading loading-xs loading-spinner"></span>
				{:else if isExpanded}
					<ChevronUp class="h-4 w-4" />
				{:else}
					<ChevronDown class="h-4 w-4" />
				{/if}
				History
			</button>

			<!-- Run/Cancel Buttons -->
			<div class="flex gap-2">
				{#if isRunning}
					<button
						class="btn gap-1 btn-sm btn-error"
						onclick={cancelTask}
						disabled={isCancelling}
					>
						{#if isCancelling}
							<span class="loading loading-xs loading-spinner"></span>
							Cancelling...
						{:else}
							<Square class="h-4 w-4" />
							Cancel
						{/if}
					</button>
				{:else}
					<button class="btn gap-1 btn-sm btn-primary" onclick={runTask}>
						<Play class="h-4 w-4" />
						Run Now
					</button>
				{/if}
			</div>
		</div>

		<!-- Expandable History -->
		{#if isExpanded}
			<div class="mt-2 border-t border-base-300 pt-3">
				<TaskHistoryList history={taskHistory} loading={loadingHistory} />
			</div>
		{/if}
	</div>
</div>
