<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { HardDrive, Trash2, RefreshCw, Archive, Clock } from 'lucide-svelte';
	import { getResponseErrorMessage, readResponsePayload } from '$lib/utils/http';
	import { toasts } from '$lib/stores/toast.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let cleaning = $state(false);
	let cleanupResult = $state<{ cleaned: number; freedMB: number } | null>(null);

	async function handleCleanup() {
		cleaning = true;
		try {
			const response = await fetch('/api/settings/streaming/cache/cleanup', {
				method: 'POST',
				headers: { Accept: 'application/json' }
			});
			const result = await readResponsePayload<{
				success?: boolean;
				cleaned?: number;
				freedMB?: number;
			}>(response);

			if (!response.ok || !result || typeof result === 'string') {
				throw new Error(getResponseErrorMessage(result, 'Failed to clean expired files'));
			}

			cleanupResult = {
				cleaned: result.cleaned ?? 0,
				freedMB: result.freedMB ?? 0
			};
			toasts.success(m.settings_streaming_expiredCleaned());
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : m.settings_streaming_failedToClean());
		} finally {
			cleaning = false;
		}
	}
</script>

<svelte:head>
	<title>{m.settings_streaming_pageTitle()}</title>
</svelte:head>

<div class="container mx-auto max-w-4xl p-6">
	<div class="mb-6 flex items-center gap-3">
		<Archive size={28} class="text-primary" />
		<h1 class="text-2xl font-bold">{m.settings_streaming_heading()}</h1>
	</div>

	<!-- Extraction Cache Section -->
	<div class="card mb-6 bg-base-200">
		<div class="card-body">
			<h2 class="card-title">
				<HardDrive size={20} />
				{m.settings_streaming_extractionCache()}
			</h2>
			<p class="mb-4 text-sm text-base-content/70">
				{m.settings_streaming_extractionCacheDescription()}
			</p>

			<!-- Cache Stats -->
			<div class="stats stats-vertical bg-base-100 shadow lg:stats-horizontal">
				<div class="stat">
					<div class="stat-figure text-primary">
						<Archive size={24} />
					</div>
					<div class="stat-title">{m.settings_streaming_cachedFiles()}</div>
					<div class="stat-value text-primary">{data.cacheStats.fileCount}</div>
				</div>

				<div class="stat">
					<div class="stat-figure text-secondary">
						<HardDrive size={24} />
					</div>
					<div class="stat-title">{m.settings_streaming_cacheSize()}</div>
					<div class="stat-value text-secondary">
						{data.cacheStats.totalSizeMB >= 1024
							? `${(data.cacheStats.totalSizeMB / 1024).toFixed(1)} GB`
							: `${data.cacheStats.totalSizeMB} MB`}
					</div>
				</div>

				<div class="stat">
					<div class="stat-figure text-warning">
						<Clock size={24} />
					</div>
					<div class="stat-title">{m.settings_streaming_expired()}</div>
					<div class="stat-value text-warning">{data.cacheStats.expiredCount}</div>
					<div class="stat-desc">{m.settings_streaming_pendingCleanup()}</div>
				</div>
			</div>

			<!-- Cleanup Action -->
			<div class="mt-4">
				{#if cleanupResult}
					<div class="mb-4 alert alert-success">
						<span>
							{m.settings_streaming_cleanedUpResult({
								count: String(cleanupResult.cleaned),
								size:
									cleanupResult.freedMB >= 1024
										? `${(cleanupResult.freedMB / 1024).toFixed(1)} GB`
										: `${cleanupResult.freedMB} MB`
							})}
						</span>
					</div>
				{/if}

				<button
					class="btn gap-2 btn-outline btn-warning"
					onclick={handleCleanup}
					disabled={cleaning}
				>
					{#if cleaning}
						<RefreshCw size={16} class="animate-spin" />
						{m.settings_streaming_cleaning()}
					{:else}
						<Trash2 size={16} />
						{m.settings_streaming_cleanExpiredFiles()}
					{/if}
				</button>
			</div>
		</div>
	</div>

	<!-- Cache Settings -->
	<div class="card bg-base-200">
		<div class="card-body">
			<h2 class="card-title">
				<Clock size={20} />
				{m.settings_streaming_cacheSettings()}
			</h2>

			<div class="form-control w-full max-w-xs">
				<label class="label" for="retention">
					<span class="label-text">{m.settings_streaming_retentionPeriod()}</span>
				</label>
				<select id="retention" class="select-bordered select" disabled>
					<option value="24">{m.settings_streaming_hours24()}</option>
					<option value="48" selected>{m.settings_streaming_hours48Default()}</option>
					<option value="72">{m.settings_streaming_hours72()}</option>
					<option value="168">{m.settings_streaming_week1()}</option>
				</select>
				<div class="label">
					<span class="label-text-alt text-base-content/50">
						{m.settings_streaming_retentionHint()}
					</span>
				</div>
			</div>

			<div class="mt-4 alert alert-info">
				<span>
					{m.settings_streaming_cacheDefaultsNotice()}
				</span>
			</div>
		</div>
	</div>

	<!-- How It Works -->
	<div class="card mt-6 bg-base-200">
		<div class="card-body">
			<h2 class="card-title">{m.settings_streaming_howItWorks()}</h2>
			<div class="prose-sm prose max-w-none">
				<ol class="space-y-2">
					<li>
						<strong>{m.settings_streaming_stepDetection()}:</strong>
						{m.settings_streaming_stepDetectionDesc()}
					</li>
					<li>
						<strong>{m.settings_streaming_stepDownload()}:</strong>
						{m.settings_streaming_stepDownloadDesc()}
					</li>
					<li>
						<strong>{m.settings_streaming_stepExtraction()}:</strong>
						{m.settings_streaming_stepExtractionDesc()}
					</li>
					<li>
						<strong>{m.settings_streaming_stepStreaming()}:</strong>
						{m.settings_streaming_stepStreamingDesc()}
					</li>
					<li>
						<strong>{m.settings_streaming_stepCleanup()}:</strong>
						{m.settings_streaming_stepCleanupDesc()}
					</li>
				</ol>
			</div>
		</div>
	</div>
</div>
