<script lang="ts">
	import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages.js';

	type OperationStatus = 'pending' | 'running' | 'done' | 'error';

	interface Operation {
		id: string;
		label: string;
		status: OperationStatus;
		message?: string;
	}

	interface Props {
		operations: Operation[];
		title?: string;
		showCompleted?: boolean;
		compact?: boolean;
	}

	let { operations, title, showCompleted = true, compact = false }: Props = $props();

	const filteredOperations = $derived(
		showCompleted ? operations : operations.filter((op) => op.status !== 'done')
	);

	const stats = $derived({
		total: operations.length,
		pending: operations.filter((op) => op.status === 'pending').length,
		running: operations.filter((op) => op.status === 'running').length,
		done: operations.filter((op) => op.status === 'done').length,
		error: operations.filter((op) => op.status === 'error').length
	});

	const progress = $derived(
		stats.total > 0 ? Math.round(((stats.done + stats.error) / stats.total) * 100) : 0
	);

	const statusIcons = {
		pending: Clock,
		running: Loader2,
		done: CheckCircle,
		error: XCircle
	};

	const statusClasses = {
		pending: 'text-base-content/50',
		running: 'text-primary',
		done: 'text-success',
		error: 'text-error'
	};
</script>

{#if operations.length > 0}
	<div class="space-y-3">
		{#if title}
			<div class="flex items-center justify-between">
				<h4 class="text-sm font-medium">{title}</h4>
				<span class="text-xs text-base-content/60">
					{stats.done + stats.error}/{stats.total}
				</span>
			</div>
		{/if}

		<!-- Progress bar -->
		<div class="h-2 w-full overflow-hidden rounded-full bg-base-300">
			<div
				class="h-full transition-all duration-300 {stats.error > 0 ? 'bg-warning' : 'bg-primary'}"
				style="width: {progress}%"
			></div>
		</div>

		<!-- Operations list -->
		{#if !compact}
			<div class="max-h-48 space-y-1 overflow-y-auto">
				{#each filteredOperations as op (op.id)}
					{@const Icon = statusIcons[op.status]}
					<div class="flex items-center gap-2 rounded px-2 py-1 text-sm {statusClasses[op.status]}">
						<Icon class="h-4 w-4 flex-shrink-0 {op.status === 'running' ? 'animate-spin' : ''}" />
						<span class="truncate">{op.label}</span>
						{#if op.message}
							<span class="ml-auto truncate text-xs text-base-content/50">{op.message}</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<!-- Summary -->
		<div class="flex gap-4 text-xs text-base-content/60">
			{#if stats.running > 0}
				<span class="text-primary">{stats.running} {m.ui_operationProgress_running()}</span>
			{/if}
			{#if stats.pending > 0}
				<span>{stats.pending} {m.ui_operationProgress_pending()}</span>
			{/if}
			{#if stats.done > 0}
				<span class="text-success">{stats.done} {m.ui_operationProgress_done()}</span>
			{/if}
			{#if stats.error > 0}
				<span class="text-error">{stats.error} {m.ui_operationProgress_failed()}</span>
			{/if}
		</div>
	</div>
{/if}
