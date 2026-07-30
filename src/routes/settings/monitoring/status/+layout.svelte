<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { createSSE } from '$lib/sse';
	import { layoutState, deriveMobileSseStatus, type ScanProgressPayload } from '$lib/layout.svelte';

	type SyncStatusPayload = { inProgress?: boolean };
	type SyncTransitionPayload = { timestamp?: string };
	type InsightsUpdatedPayload = { triggeredBy?: string; timestamp?: string };

	let { children } = $props();

	// SSE connections that survive the user navigating away from the status
	// area. Progress indicators stay visible on return, and invalidateAll()
	// refreshes stale data when background events fire.
	const scanSse = createSSE<{
		status: { inProgress?: boolean; isScanning?: boolean } & SyncStatusPayload;
		progress: ScanProgressPayload;
		scanComplete: { results?: Array<{ unmatchedFiles?: number }> };
		scanError: { error?: { message?: string } };
	}>('/api/library/scan/status', {
		status: (payload) => {
			const inProgress = Boolean(payload.inProgress ?? payload.isScanning ?? false);
			layoutState.setScanState(inProgress, inProgress ? layoutState.scanProgress : null);
		},
		progress: (payload) => {
			layoutState.setScanState(true, payload);
		},
		scanComplete: () => {
			layoutState.setScanState(false, null);
			void invalidateAll();
		},
		scanError: () => {
			layoutState.setScanState(false, null);
		}
	});

	const syncSse = createSSE<{
		status: SyncStatusPayload;
		syncStart: SyncTransitionPayload;
		syncStop: SyncTransitionPayload;
	}>('/api/media-server-stats/sync/status', {
		status: (payload) => {
			layoutState.setMediaServerSyncing(Boolean(payload.inProgress ?? false));
		},
		syncStart: () => {
			layoutState.setMediaServerSyncing(true);
		},
		syncStop: () => {
			layoutState.setMediaServerSyncing(false);
			// Sync -> reconcile -> insights chain fires 'storage:insights-updated'
			// which triggers invalidateAll via insightSse. We also invalidate here
			// so the sync run table + serverStatuses refresh immediately even if
			// no insights happened to change.
			void invalidateAll();
		}
	});

	const insightSse = createSSE<{
		'storage:insight-dismissed': { insightId: string; dismissedAt: string };
		'storage:insight-undismissed': { insightId: string };
		'storage:insights-updated': InsightsUpdatedPayload;
	}>('/api/storage/insights/stream', {
		'storage:insight-dismissed': () => {
			// Local state already handles dismiss - no server reload needed.
		},
		'storage:insight-undismissed': () => {
			// Local state already handles undismiss - no server reload needed.
		},
		'storage:insights-updated': (payload) => {
			if (payload?.timestamp) {
				layoutState.markInsightsUpdated(payload.timestamp);
			}
			void invalidateAll();
		}
	});

	$effect(() => {
		layoutState.setMobileSseStatus(deriveMobileSseStatus(scanSse));
		return () => layoutState.clearMobileSseStatus();
	});

	// On mount: invalidate to catch mutations that happened while the user was
	// outside the /status/* area (and thus not listening to the SSE streams
	// above). Cheap relative to the cost of showing stale data.
	onMount(() => {
		void invalidateAll();
	});

	$effect(() => {
		// Touch SSE status to keep reactivity subscription alive.
		void scanSse.status;
		void syncSse.status;
		void insightSse.status;
	});
</script>

{#snippet scanProgressBar()}
	{#if layoutState.scanInProgress && layoutState.scanProgress}
		<div class="card mb-4 bg-base-200 p-4">
			<div class="mb-2 flex items-center justify-between text-sm">
				<span class="truncate">{layoutState.scanProgress.rootFolderPath ?? 'Scanning...'}</span>
				<span class="text-base-content/60"
					>{layoutState.scanProgress.filesProcessed} / {layoutState.scanProgress.filesFound}</span
				>
			</div>
			<progress
				class="progress progress-primary w-full"
				value={layoutState.scanProgress.filesProcessed}
				max={layoutState.scanProgress.filesFound || 1}
			></progress>
		</div>
	{:else if layoutState.scanInProgress}
		<div class="card mb-4 bg-base-200 p-4">
			<div class="flex items-center gap-2 text-sm text-base-content/70">
				<span class="loading loading-spinner loading-sm"></span>
				<span>Starting scan...</span>
			</div>
		</div>
	{/if}
{/snippet}

{#if layoutState.scanInProgress}
	<div class="px-1 pt-4">
		{@render scanProgressBar()}
	</div>
{/if}

{@render children()}
