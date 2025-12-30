<script lang="ts">
	import { X, Download, Archive, Check, AlertCircle, Loader2 } from 'lucide-svelte';

	interface Props {
		open: boolean;
		mountId: string;
		title: string;
		onClose: () => void;
		onComplete: () => void;
	}

	let { open, mountId, title, onClose, onComplete }: Props = $props();

	type Phase = 'idle' | 'downloading' | 'extracting' | 'complete' | 'error';

	let phase = $state<Phase>('idle');
	let downloadProgress = $state(0);
	let extractionProgress = $state(0);
	let errorMessage = $state<string | null>(null);
	let pollInterval = $state<ReturnType<typeof setInterval> | null>(null);

	// Start extraction when modal opens
	$effect(() => {
		if (open && mountId && phase === 'idle') {
			startExtraction();
		}

		// Cleanup on close
		return () => {
			if (pollInterval) {
				clearInterval(pollInterval);
				pollInterval = null;
			}
		};
	});

	async function startExtraction() {
		phase = 'downloading';
		downloadProgress = 0;
		extractionProgress = 0;
		errorMessage = null;

		try {
			// Start extraction
			const response = await fetch(`/api/streaming/usenet/${mountId}/extract`, {
				method: 'POST'
			});

			const result = await response.json();

			if (result.status === 'ready') {
				phase = 'complete';
				setTimeout(() => onComplete(), 1000);
				return;
			}

			if (result.status === 'started' || result.status === 'in_progress') {
				// Start polling for progress
				startPolling();
			} else {
				throw new Error(result.message || 'Failed to start extraction');
			}
		} catch (error) {
			phase = 'error';
			errorMessage = error instanceof Error ? error.message : 'Failed to start extraction';
		}
	}

	function startPolling() {
		pollInterval = setInterval(async () => {
			try {
				const response = await fetch(`/api/streaming/usenet/${mountId}/extract`);
				const result = await response.json();

				if (result.status === 'downloading') {
					phase = 'downloading';
				} else if (result.status === 'extracting') {
					phase = 'extracting';
				} else if (result.status === 'ready') {
					phase = 'complete';
					if (pollInterval) {
						clearInterval(pollInterval);
						pollInterval = null;
					}
					setTimeout(() => onComplete(), 1000);
				} else if (result.status === 'error') {
					phase = 'error';
					errorMessage = 'Extraction failed';
					if (pollInterval) {
						clearInterval(pollInterval);
						pollInterval = null;
					}
				}
			} catch {
				// Ignore polling errors, will retry
			}
		}, 2000);
	}

	async function handleCancel() {
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}

		try {
			await fetch(`/api/streaming/usenet/${mountId}/extract`, {
				method: 'DELETE'
			});
		} catch {
			// Ignore cancel errors
		}

		onClose();
	}

	function getPhaseLabel(): string {
		switch (phase) {
			case 'downloading':
				return 'Downloading from Usenet...';
			case 'extracting':
				return 'Extracting archive...';
			case 'complete':
				return 'Ready to stream';
			case 'error':
				return 'Extraction failed';
			default:
				return 'Preparing...';
		}
	}

	function getProgress(): number {
		if (phase === 'downloading') {
			return downloadProgress * 0.7; // Download is 70% of total
		} else if (phase === 'extracting') {
			return 70 + extractionProgress * 0.3; // Extraction is 30%
		} else if (phase === 'complete') {
			return 100;
		}
		return 0;
	}
</script>

{#if open}
	<div class="modal-open modal">
		<div class="modal-box max-w-md">
			<!-- Header -->
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-bold">Preparing Stream</h3>
				<button class="btn btn-circle btn-ghost btn-sm" onclick={handleCancel}>
					<X size={18} />
				</button>
			</div>

			<!-- Title -->
			<p class="mb-6 truncate text-sm text-base-content/70" {title}>
				{title}
			</p>

			<!-- Progress -->
			<div class="space-y-4">
				<!-- Phase indicator -->
				<div class="flex items-center gap-3">
					{#if phase === 'downloading'}
						<div class="rounded-full bg-primary/10 p-2">
							<Download size={20} class="animate-pulse text-primary" />
						</div>
					{:else if phase === 'extracting'}
						<div class="rounded-full bg-secondary/10 p-2">
							<Archive size={20} class="animate-pulse text-secondary" />
						</div>
					{:else if phase === 'complete'}
						<div class="rounded-full bg-success/10 p-2">
							<Check size={20} class="text-success" />
						</div>
					{:else if phase === 'error'}
						<div class="rounded-full bg-error/10 p-2">
							<AlertCircle size={20} class="text-error" />
						</div>
					{:else}
						<div class="rounded-full bg-base-200 p-2">
							<Loader2 size={20} class="animate-spin" />
						</div>
					{/if}
					<span class="font-medium">{getPhaseLabel()}</span>
				</div>

				<!-- Progress bar -->
				{#if phase !== 'error'}
					<div class="w-full">
						<progress
							class="progress {phase === 'complete'
								? 'progress-success'
								: 'progress-primary'} w-full"
							value={getProgress()}
							max="100"
						></progress>
						<div class="mt-1 flex justify-between text-xs text-base-content/50">
							<span>{Math.round(getProgress())}%</span>
							{#if phase === 'downloading'}
								<span>Downloading segments...</span>
							{:else if phase === 'extracting'}
								<span>Decompressing files...</span>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Error message -->
				{#if errorMessage}
					<div class="alert alert-error">
						<AlertCircle size={18} />
						<span>{errorMessage}</span>
					</div>
				{/if}

				<!-- Info box -->
				{#if phase === 'downloading' || phase === 'extracting'}
					<div class="alert text-sm alert-info">
						<span>
							This release uses compression. Content is being downloaded and extracted for
							streaming. This is a one-time process - future plays will start instantly.
						</span>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="modal-action">
				{#if phase === 'error'}
					<button class="btn btn-primary" onclick={startExtraction}> Retry </button>
				{/if}
				<button class="btn btn-ghost" onclick={handleCancel}>
					{phase === 'complete' ? 'Close' : 'Cancel'}
				</button>
			</div>
		</div>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal-backdrop bg-base-300/80" onclick={handleCancel}></div>
	</div>
{/if}
