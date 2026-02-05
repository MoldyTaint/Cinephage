<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { CheckCircle, XCircle, Calendar, Wrench } from 'lucide-svelte';
	import type { PageData } from './$types';
	import TaskCard from '$lib/components/tasks/TaskCard.svelte';

	let { data }: { data: PageData } = $props();

	let errorMessage = $state<string | null>(null);
	let successMessage = $state<string | null>(null);

	// Separate tasks by category
	const scheduledTasks = $derived(data.tasks.filter((t) => t.category === 'scheduled'));
	const maintenanceTasks = $derived(data.tasks.filter((t) => t.category === 'maintenance'));

	// Check if any task is running for polling
	const hasRunningTask = $derived(data.tasks.some((t) => t.isRunning));

	// Poll for updates when tasks are running
	$effect(() => {
		if (hasRunningTask) {
			const interval = setInterval(() => {
				invalidate('app:tasks');
			}, 5000);
			return () => clearInterval(interval);
		}
	});

	/**
	 * Handle task execution
	 */
	async function handleRunTask(taskId: string): Promise<void> {
		const task = data.tasks.find((t) => t.id === taskId);
		if (!task) return;

		errorMessage = null;
		successMessage = null;

		try {
			const response = await fetch(`/api/tasks/${taskId}/run`, { method: 'POST' });
			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || result.message || 'Task failed');
			}

			// Format success message based on result
			if (result.result) {
				const { itemsProcessed, itemsGrabbed } = result.result;
				successMessage = `${task.name} completed: ${itemsProcessed ?? 0} processed, ${itemsGrabbed ?? 0} grabbed`;
			} else if (result.updatedFiles !== undefined) {
				successMessage = `${task.name} completed: ${result.updatedFiles}/${result.totalFiles ?? 0} files updated`;
			} else {
				successMessage = `${task.name} completed successfully`;
			}

			await invalidate('app:tasks');
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Task failed';
		}
	}
</script>

<div class="w-full space-y-6">
	<!-- Header -->
	<div>
		<h1 class="text-2xl font-bold">Tasks</h1>
		<p class="mt-1 text-base-content/60">
			Scheduled and maintenance tasks for your Cinephage instance
		</p>
	</div>

	<!-- Alerts -->
	{#if errorMessage}
		<div class="alert alert-error">
			<XCircle class="h-5 w-5" />
			<span>{errorMessage}</span>
			<button class="btn btn-ghost btn-sm" onclick={() => (errorMessage = null)}>Dismiss</button>
		</div>
	{/if}

	{#if successMessage}
		<div class="alert alert-success">
			<CheckCircle class="h-5 w-5" />
			<span>{successMessage}</span>
			<button class="btn btn-ghost btn-sm" onclick={() => (successMessage = null)}>Dismiss</button>
		</div>
	{/if}

	<!-- Scheduled Tasks Section -->
	{#if scheduledTasks.length > 0}
		<section>
			<div class="mb-3 flex items-center gap-2">
				<Calendar class="h-5 w-5 text-base-content/60" />
				<h2 class="text-lg font-semibold">Scheduled Tasks</h2>
				<span class="badge badge-ghost badge-sm">{scheduledTasks.length}</span>
			</div>
			<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
				{#each scheduledTasks as task (task.id)}
					<TaskCard {task} history={data.taskHistory[task.id] ?? []} onRunTask={handleRunTask} />
				{/each}
			</div>
		</section>
	{/if}

	<!-- Maintenance Tasks Section -->
	{#if maintenanceTasks.length > 0}
		<section>
			<div class="mb-3 flex items-center gap-2">
				<Wrench class="h-5 w-5 text-base-content/60" />
				<h2 class="text-lg font-semibold">Maintenance Tasks</h2>
				<span class="badge badge-ghost badge-sm">{maintenanceTasks.length}</span>
			</div>
			<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
				{#each maintenanceTasks as task (task.id)}
					<TaskCard {task} history={data.taskHistory[task.id] ?? []} onRunTask={handleRunTask} />
				{/each}
			</div>
		</section>
	{/if}

	<!-- Empty State -->
	{#if data.tasks.length === 0}
		<div class="card bg-base-200">
			<div class="card-body items-center text-center">
				<Calendar class="h-12 w-12 text-base-content/40" />
				<h3 class="card-title">No Tasks Available</h3>
				<p class="text-base-content/60">No tasks are currently configured.</p>
			</div>
		</div>
	{/if}
</div>
