<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { CheckCircle, Play, RefreshCw, XCircle } from 'lucide-svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	let isSaving = $state(false);
	let isRunningTask = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	let successMessage = $state<string | null>(null);

	// Settings form state - initialize with defaults
	let settings = $state({
		missingSearchIntervalHours: 24,
		upgradeSearchIntervalHours: 168,
		newEpisodeCheckIntervalHours: 1,
		cutoffUnmetSearchIntervalHours: 24
	});

	// Sync settings from props
	$effect(() => {
		if (data.status?.tasks) {
			settings = {
				missingSearchIntervalHours: data.status.tasks.missing.intervalHours ?? 24,
				upgradeSearchIntervalHours: data.status.tasks.upgrade.intervalHours ?? 168,
				newEpisodeCheckIntervalHours: data.status.tasks.newEpisode.intervalHours ?? 1,
				cutoffUnmetSearchIntervalHours: data.status.tasks.cutoffUnmet.intervalHours ?? 24
			};
		}
	});

	/**
	 * Format time ago
	 */
	function formatTimeAgo(date: Date | string | null): string {
		if (!date) return 'Never';
		const d = typeof date === 'string' ? new Date(date) : date;
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		return `${diffDays}d ago`;
	}

	/**
	 * Save monitoring settings
	 */
	async function saveSettings() {
		isSaving = true;
		errorMessage = null;
		successMessage = null;

		try {
			const response = await fetch('/api/monitoring/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(settings)
			});

			const result = await response.json();

			if (!result.success) {
				throw new Error(result.error || 'Failed to save settings');
			}

			successMessage = 'Settings saved successfully';
			await invalidate('app:monitoring');
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to save settings';
		} finally {
			isSaving = false;
		}
	}

	/**
	 * Manually trigger a monitoring task
	 */
	async function runTask(taskType: 'missing' | 'upgrade' | 'new-episodes' | 'cutoff-unmet') {
		isRunningTask = taskType;
		errorMessage = null;
		successMessage = null;

		try {
			const response = await fetch(`/api/monitoring/search/${taskType}`, {
				method: 'POST'
			});

			const result = await response.json();

			if (!result.success) {
				throw new Error(result.error || `Failed to run ${taskType} task`);
			}

			const { searched, grabbed, errors } = result;
			successMessage = `${taskType} task completed: ${grabbed}/${searched} grabbed${errors > 0 ? `, ${errors} errors` : ''}`;

			await invalidate('app:monitoring');
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : `Failed to run ${taskType} task`;
		} finally {
			isRunningTask = null;
		}
	}

	/**
	 * Get status badge variant
	 */
	function getStatusVariant(status: string): string {
		switch (status) {
			case 'grabbed':
				return 'badge-success';
			case 'found':
				return 'badge-info';
			case 'no_results':
				return 'badge-warning';
			case 'error':
				return 'badge-error';
			default:
				return 'badge-ghost';
		}
	}

	/**
	 * Get task type display name
	 */
	function getTaskTypeName(taskType: string): string {
		switch (taskType) {
			case 'missing':
				return 'Missing Content';
			case 'upgrade':
				return 'Upgrade';
			case 'new_episode':
				return 'New Episode';
			case 'cutoff_unmet':
				return 'Cutoff Unmet';
			default:
				return taskType;
		}
	}
</script>

<div class="w-full p-4">
	<div class="mb-6">
		<h1 class="text-3xl font-bold">Monitoring</h1>
		<p class="mt-2 text-base-content/60">
			Automated search and upgrade monitoring for your library
		</p>
	</div>

	{#if errorMessage}
		<div class="mb-4 alert alert-error">
			<XCircle class="h-5 w-5" />
			<span>{errorMessage}</span>
		</div>
	{/if}

	{#if successMessage}
		<div class="mb-4 alert alert-success">
			<CheckCircle class="h-5 w-5" />
			<span>{successMessage}</span>
		</div>
	{/if}

	<!-- Settings Card -->
	<div class="card mb-6 bg-base-200">
		<div class="card-body">
			<h2 class="card-title">Settings</h2>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div class="form-control">
					<label class="label" for="missing-search-interval">
						<span class="label-text font-medium">Missing Content Search Interval</span>
					</label>
					<input
						id="missing-search-interval"
						type="number"
						class="input-bordered input"
						bind:value={settings.missingSearchIntervalHours}
						min="0.25"
						step="1"
					/>
					<div class="label">
						<span class="label-text-alt text-base-content/60">Hours between searches</span>
					</div>
				</div>

				<div class="form-control">
					<label class="label" for="upgrade-search-interval">
						<span class="label-text font-medium">Upgrade Search Interval</span>
					</label>
					<input
						id="upgrade-search-interval"
						type="number"
						class="input-bordered input"
						bind:value={settings.upgradeSearchIntervalHours}
						min="0.25"
						step="1"
					/>
					<div class="label">
						<span class="label-text-alt text-base-content/60">Hours between searches</span>
					</div>
				</div>

				<div class="form-control">
					<label class="label" for="new-episode-interval">
						<span class="label-text font-medium">New Episode Check Interval</span>
					</label>
					<input
						id="new-episode-interval"
						type="number"
						class="input-bordered input"
						bind:value={settings.newEpisodeCheckIntervalHours}
						min="0.25"
						step="0.25"
					/>
					<div class="label">
						<span class="label-text-alt text-base-content/60">Hours between checks</span>
					</div>
				</div>

				<div class="form-control">
					<label class="label" for="cutoff-unmet-interval">
						<span class="label-text font-medium">Cutoff Unmet Search Interval</span>
					</label>
					<input
						id="cutoff-unmet-interval"
						type="number"
						class="input-bordered input"
						bind:value={settings.cutoffUnmetSearchIntervalHours}
						min="0.25"
						step="1"
					/>
					<div class="label">
						<span class="label-text-alt text-base-content/60">Hours between searches</span>
					</div>
				</div>
			</div>

			<div class="mt-4 card-actions justify-end">
				<button class="btn btn-primary" onclick={saveSettings} disabled={isSaving}>
					{#if isSaving}
						<span class="loading loading-sm loading-spinner"></span>
					{/if}
					Save Settings
				</button>
			</div>
		</div>
	</div>

	<!-- Task Status -->
	<div class="card mb-6 bg-base-200">
		<div class="card-body">
			<h2 class="card-title">Task Status</h2>

			{#if data.status}
				<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
					<!-- Missing Content Task -->
					<div class="card bg-base-100">
						<div class="card-body">
							<div class="flex items-center justify-between">
								<h3 class="font-bold">Missing Content Search</h3>
								{#if data.status.tasks.missing.isRunning}
									<span class="badge gap-1 badge-primary">
										<RefreshCw class="h-3 w-3 animate-spin" />
										Running
									</span>
								{/if}
							</div>

							<div class="space-y-1 text-sm text-base-content/80">
								<div class="flex justify-between">
									<span>Interval:</span>
									<span class="font-medium">{data.status.tasks.missing.intervalHours}h</span>
								</div>
								<div class="flex justify-between">
									<span>Last Run:</span>
									<span class="font-medium">
										{formatTimeAgo(data.status.tasks.missing.lastRunTime)}
									</span>
								</div>
								<div class="flex justify-between">
									<span>Next Run:</span>
									<span class="font-medium">
										{formatTimeAgo(data.status.tasks.missing.nextRunTime)}
									</span>
								</div>
							</div>

							<button
								class="btn mt-2 btn-outline btn-sm"
								onclick={() => runTask('missing')}
								disabled={isRunningTask !== null}
							>
								{#if isRunningTask === 'missing'}
									<span class="loading loading-sm loading-spinner"></span>
								{:else}
									<Play class="h-4 w-4" />
								{/if}
								Run Now
							</button>
						</div>
					</div>

					<!-- Upgrade Task -->
					<div class="card bg-base-100">
						<div class="card-body">
							<div class="flex items-center justify-between">
								<h3 class="font-bold">Upgrade Monitor</h3>
								{#if data.status.tasks.upgrade.isRunning}
									<span class="badge gap-1 badge-primary">
										<RefreshCw class="h-3 w-3 animate-spin" />
										Running
									</span>
								{/if}
							</div>

							<div class="space-y-1 text-sm text-base-content/80">
								<div class="flex justify-between">
									<span>Interval:</span>
									<span class="font-medium">{data.status.tasks.upgrade.intervalHours}h</span>
								</div>
								<div class="flex justify-between">
									<span>Last Run:</span>
									<span class="font-medium">
										{formatTimeAgo(data.status.tasks.upgrade.lastRunTime)}
									</span>
								</div>
								<div class="flex justify-between">
									<span>Next Run:</span>
									<span class="font-medium">
										{formatTimeAgo(data.status.tasks.upgrade.nextRunTime)}
									</span>
								</div>
							</div>

							<button
								class="btn mt-2 btn-outline btn-sm"
								onclick={() => runTask('upgrade')}
								disabled={isRunningTask !== null}
							>
								{#if isRunningTask === 'upgrade'}
									<span class="loading loading-sm loading-spinner"></span>
								{:else}
									<Play class="h-4 w-4" />
								{/if}
								Run Now
							</button>
						</div>
					</div>

					<!-- New Episode Task -->
					<div class="card bg-base-100">
						<div class="card-body">
							<div class="flex items-center justify-between">
								<h3 class="font-bold">New Episode Check</h3>
								{#if data.status.tasks.newEpisode.isRunning}
									<span class="badge gap-1 badge-primary">
										<RefreshCw class="h-3 w-3 animate-spin" />
										Running
									</span>
								{/if}
							</div>

							<div class="space-y-1 text-sm text-base-content/80">
								<div class="flex justify-between">
									<span>Interval:</span>
									<span class="font-medium">{data.status.tasks.newEpisode.intervalHours}h</span>
								</div>
								<div class="flex justify-between">
									<span>Last Run:</span>
									<span class="font-medium">
										{formatTimeAgo(data.status.tasks.newEpisode.lastRunTime)}
									</span>
								</div>
								<div class="flex justify-between">
									<span>Next Run:</span>
									<span class="font-medium">
										{formatTimeAgo(data.status.tasks.newEpisode.nextRunTime)}
									</span>
								</div>
							</div>

							<button
								class="btn mt-2 btn-outline btn-sm"
								onclick={() => runTask('new-episodes')}
								disabled={isRunningTask !== null}
							>
								{#if isRunningTask === 'new-episodes'}
									<span class="loading loading-sm loading-spinner"></span>
								{:else}
									<Play class="h-4 w-4" />
								{/if}
								Run Now
							</button>
						</div>
					</div>

					<!-- Cutoff Unmet Task -->
					<div class="card bg-base-100">
						<div class="card-body">
							<div class="flex items-center justify-between">
								<h3 class="font-bold">Cutoff Unmet Search</h3>
								{#if data.status.tasks.cutoffUnmet.isRunning}
									<span class="badge gap-1 badge-primary">
										<RefreshCw class="h-3 w-3 animate-spin" />
										Running
									</span>
								{/if}
							</div>

							<div class="space-y-1 text-sm text-base-content/80">
								<div class="flex justify-between">
									<span>Interval:</span>
									<span class="font-medium">{data.status.tasks.cutoffUnmet.intervalHours}h</span>
								</div>
								<div class="flex justify-between">
									<span>Last Run:</span>
									<span class="font-medium">
										{formatTimeAgo(data.status.tasks.cutoffUnmet.lastRunTime)}
									</span>
								</div>
								<div class="flex justify-between">
									<span>Next Run:</span>
									<span class="font-medium">
										{formatTimeAgo(data.status.tasks.cutoffUnmet.nextRunTime)}
									</span>
								</div>
							</div>

							<button
								class="btn mt-2 btn-outline btn-sm"
								onclick={() => runTask('cutoff-unmet')}
								disabled={isRunningTask !== null}
							>
								{#if isRunningTask === 'cutoff-unmet'}
									<span class="loading loading-sm loading-spinner"></span>
								{:else}
									<Play class="h-4 w-4" />
								{/if}
								Run Now
							</button>
						</div>
					</div>
				</div>
			{:else}
				<div class="py-8 text-center text-base-content/60">Unable to load monitoring status</div>
			{/if}
		</div>
	</div>

	<!-- Recent History -->
	<div class="card bg-base-200">
		<div class="card-body">
			<h2 class="card-title">Recent Activity</h2>

			{#if data.recentHistory && data.recentHistory.length > 0}
				<div class="overflow-x-auto">
					<table class="table table-sm">
						<thead>
							<tr>
								<th>Task</th>
								<th>Item</th>
								<th>Status</th>
								<th>Releases</th>
								<th>Grabbed</th>
								<th>Time</th>
							</tr>
						</thead>
						<tbody>
							{#each data.recentHistory as item (item.id)}
								<tr>
									<td>
										<span class="badge badge-sm">{getTaskTypeName(item.taskType)}</span>
									</td>
									<td class="text-sm">
										{#if item.movieId}
											<span>{item.movie?.title ?? 'Unknown Movie'}</span>
										{:else if item.episodeId}
											<span>
												{item.episode?.series?.title ?? 'Unknown'} S{String(
													item.episode?.seasonNumber ?? 0
												).padStart(2, '0')}E{String(item.episode?.episodeNumber ?? 0).padStart(
													2,
													'0'
												)}
											</span>
										{:else if item.seriesId}
											<span>{item.series?.title ?? 'Unknown Series'}</span>
										{/if}
									</td>
									<td>
										<span class="badge badge-sm {getStatusVariant(item.status)}">
											{item.status}
										</span>
									</td>
									<td>{item.releasesFound ?? 0}</td>
									<td>
										{#if item.releaseGrabbed}
											<span class="font-medium text-success">✓</span>
										{:else}
											<span class="text-base-content/40">-</span>
										{/if}
									</td>
									<td class="text-sm text-base-content/60">
										{formatTimeAgo(item.executedAt)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="py-8 text-center text-base-content/60">No recent activity</div>
			{/if}
		</div>
	</div>
</div>
