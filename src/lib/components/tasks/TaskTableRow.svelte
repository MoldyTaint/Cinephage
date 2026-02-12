<script lang="ts">
	import { History } from 'lucide-svelte';
	import type { UnifiedTask } from '$lib/server/tasks/UnifiedTaskRegistry';
	import type { TaskHistoryEntry } from '$lib/types/task';
	import TaskIntervalCell from './TaskIntervalCell.svelte';

	interface Props {
		task: UnifiedTask;
		history: TaskHistoryEntry[];
		onRunTask: (taskId: string) => Promise<void>;
		onCancelTask?: (taskId: string) => Promise<void>;
		onToggleEnabled?: (taskId: string, enabled: boolean) => Promise<void>;
		onShowHistory: () => void;
	}

	let { task, history, onRunTask, onCancelTask, onToggleEnabled, onShowHistory }: Props = $props();

	let isCancelling = $state(false);

	// Live countdown state - updated every second
	let now = $state(Date.now());

	// Tick the clock every second for live countdowns
	$effect(() => {
		const interval = setInterval(() => {
			now = Date.now();
		}, 1000);
		return () => clearInterval(interval);
	});

	// Reset cancelling state when task stops running
	$effect(() => {
		if (!task.isRunning) {
			isCancelling = false;
		}
	});

	// Derive isRunning from the task prop (single source of truth from parent's taskMap)
	const isRunning = $derived(task.isRunning);

	// Derived state for last run status (value, not function)
	const lastRunStatus = $derived(history.length > 0 ? (history[0]?.status ?? null) : null);

	/**
	 * Format a duration in milliseconds to a human-readable string.
	 * Shows live seconds for < 1 minute, minutes/hours only for >= 1 minute.
	 * Uses tabular-nums friendly format to prevent layout shift.
	 */
	function formatDuration(diffMs: number): string {
		const totalSeconds = Math.floor(diffMs / 1000);
		const totalMinutes = Math.floor(totalSeconds / 60);
		const totalHours = Math.floor(totalMinutes / 60);
		const totalDays = Math.floor(totalHours / 24);

		const minutes = totalMinutes % 60;
		const hours = totalHours % 24;

		if (totalDays > 0) {
			return hours > 0 ? `${totalDays}d ${hours}h` : `${totalDays}d`;
		}
		if (totalHours > 0) {
			return minutes > 0 ? `${totalHours}h ${minutes}m` : `${totalHours}h`;
		}
		if (totalMinutes > 0) {
			return `${totalMinutes}m`;
		}
		// Under 1 minute - show live seconds
		return `${totalSeconds}s`;
	}

	// Live-computed "time ago" string that updates every second
	const liveTimeAgo = $derived.by(() => {
		if (!task.lastRunTime) return 'Never';
		const date = new Date(task.lastRunTime).getTime();
		const diffMs = now - date;
		if (diffMs < 0) return 'Just now';
		if (diffMs < 60000) return 'Just now';
		return `${formatDuration(diffMs)} ago`;
	});

	// Live-computed "time until" string that updates every second
	const liveTimeUntil = $derived.by(() => {
		if (!task.nextRunTime) return '—';
		const date = new Date(task.nextRunTime).getTime();
		const diffMs = date - now;
		if (diffMs <= 0) return 'Overdue';
		return `in ${formatDuration(diffMs)}`;
	});

	// Whether the next run is overdue
	const isOverdue = $derived(
		task.nextRunTime ? new Date(task.nextRunTime).getTime() <= now : false
	);

	// Whether the next run is imminent (< 1 minute)
	const isImminent = $derived.by(() => {
		if (!task.nextRunTime) return false;
		const diffMs = new Date(task.nextRunTime).getTime() - now;
		return diffMs > 0 && diffMs < 60000;
	});

	async function runTask() {
		if (isRunning) return;
		try {
			await onRunTask(task.id);
		} catch (error) {
			console.error('Task failed:', error);
		}
	}

	async function cancelTask() {
		if (!isRunning || isCancelling || !onCancelTask) return;
		isCancelling = true;
		try {
			await onCancelTask(task.id);
		} catch (error) {
			console.error('Failed to cancel task:', error);
		}
	}

	async function toggleEnabled() {
		if (onToggleEnabled) {
			await onToggleEnabled(task.id, !task.enabled);
		}
	}
</script>

<tr class="group hover:bg-base-200/50 {task.isRunning ? 'bg-primary/5' : ''}">
	<!-- Task Name -->
	<td>
		<div class="flex items-center gap-3">
			<div class="min-w-0 flex-1">
				<div class="truncate font-medium">{task.name}</div>
				<div class="truncate text-sm text-base-content/60">{task.description}</div>
			</div>
			{#if task.isRunning}
				<span class="badge gap-1 badge-sm badge-primary">
					<span class="loading loading-xs loading-spinner"></span>
					Running
				</span>
			{:else if lastRunStatus === 'completed'}
				<span class="badge badge-sm badge-success">OK</span>
			{:else if lastRunStatus === 'failed'}
				<span class="badge badge-sm badge-error">Failed</span>
			{/if}
		</div>
	</td>

	{#if task.category === 'scheduled'}
		<!-- Interval -->
		<td>
			<TaskIntervalCell {task} />
		</td>

		<!-- Last Run -->
		<td
			class="text-sm whitespace-nowrap tabular-nums"
			title={task.lastRunTime ? new Date(task.lastRunTime).toLocaleString() : ''}
		>
			{liveTimeAgo}
		</td>

		<!-- Next Run -->
		<td class="text-sm whitespace-nowrap tabular-nums">
			{#if task.isRunning}
				<span class="text-primary">Running...</span>
			{:else if task.nextRunTime}
				<span
					class="{isOverdue ? 'font-medium text-warning' : ''} {isImminent
						? 'animate-pulse text-success'
						: ''}"
					title={new Date(task.nextRunTime).toLocaleString()}
				>
					{liveTimeUntil}
				</span>
			{:else}
				<span class="text-base-content/40">—</span>
			{/if}
		</td>
	{:else}
		<!-- Type -->
		<td class="text-sm text-base-content/60">Manual</td>

		<!-- Last Run -->
		<td
			class="text-sm whitespace-nowrap tabular-nums"
			title={task.lastRunTime ? new Date(task.lastRunTime).toLocaleString() : ''}
		>
			{liveTimeAgo}
		</td>
	{/if}

	<!-- Status (Enabled/Disabled) -->
	<td>
		<label class="swap swap-rotate">
			<input
				type="checkbox"
				class="toggle toggle-sm"
				checked={task.enabled}
				onchange={toggleEnabled}
				disabled={task.isRunning}
			/>
		</label>
	</td>

	<!-- Actions -->
	<td>
		<div class="flex items-center gap-1">
			{#if isRunning}
				<button
					class="btn btn-square text-error btn-ghost btn-xs"
					onclick={cancelTask}
					disabled={isCancelling}
					title="Cancel"
				>
					{#if isCancelling}
						<span class="loading loading-xs loading-spinner"></span>
					{:else}
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
							<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
						</svg>
					{/if}
				</button>
			{:else}
				<button
					class="btn btn-square btn-ghost btn-xs"
					onclick={runTask}
					disabled={!task.enabled}
					title="Run Now"
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
						<polygon points="5 3 19 12 5 21 5 3" />
					</svg>
				</button>
			{/if}

			<button class="btn btn-square btn-ghost btn-xs" onclick={onShowHistory} title="View History">
				<History class="h-4 w-4" />
			</button>
		</div>
	</td>
</tr>
