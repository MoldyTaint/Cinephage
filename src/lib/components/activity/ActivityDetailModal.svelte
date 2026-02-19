<script lang="ts">
	import type { UnifiedActivity, ActivityDetails } from '$lib/types/activity';
	import { formatBytes } from '$lib/utils/format';
	import {
		X,
		CheckCircle2,
		XCircle,
		Loader2,
		PauseCircle,
		AlertCircle,
		Minus,
		Clapperboard,
		Tv,
		Pause,
		Play,
		RotateCcw,
		Trash2,
		Info,
		BarChart3,
		History,
		Folder
	} from 'lucide-svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import { createFocusTrap, lockBodyScroll } from '$lib/utils/focus';

	interface Props {
		activity: UnifiedActivity | null;
		details: ActivityDetails | null;
		loading: boolean;
		onClose: () => void;
		onPause?: (id: string) => Promise<void>;
		onResume?: (id: string) => Promise<void>;
		onRemove?: (
			id: string,
			options?: { deleteFiles?: boolean; blocklist?: boolean }
		) => Promise<void>;
		onRetry?: (id: string) => Promise<void>;
	}

	let { activity, details, loading, onClose, onPause, onResume, onRemove, onRetry }: Props =
		$props();

	let activeTab = $state<'overview' | 'scoring' | 'replacement' | 'audit'>('overview');
	let actionLoading = $state(false);
	let modalRef = $state<HTMLElement | null>(null);
	let contentRef = $state<HTMLElement | null>(null);
	let cleanupFocusTrap: (() => void) | null = null;
	let cleanupScrollLock: (() => void) | null = null;

	// Status config
	const statusConfig = {
		imported: { label: 'Imported', variant: 'badge-success', icon: CheckCircle2 },
		streaming: { label: 'Streaming', variant: 'badge-info', icon: CheckCircle2 },
		downloading: { label: 'Downloading', variant: 'badge-info', icon: Loader2 },
		paused: { label: 'Paused', variant: 'badge-warning', icon: PauseCircle },
		failed: { label: 'Failed', variant: 'badge-error', icon: XCircle },
		rejected: { label: 'Rejected', variant: 'badge-warning', icon: AlertCircle },
		removed: { label: 'Removed', variant: 'badge-ghost', icon: XCircle },
		no_results: { label: 'No Results', variant: 'badge-ghost', icon: Minus },
		searching: { label: 'Searching', variant: 'badge-info', icon: Loader2 }
	};

	function formatRelativeTime(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;
		return date.toLocaleDateString();
	}

	async function handlePause() {
		if (!activity?.queueItemId || !onPause) return;
		actionLoading = true;
		try {
			await onPause(activity.queueItemId);
			toasts.success('Download paused');
		} catch (error) {
			console.error('Failed to pause download:', error);
			const message = error instanceof Error ? error.message : 'Failed to pause download';
			toasts.error(message);
		} finally {
			actionLoading = false;
		}
	}

	async function handleResume() {
		if (!activity?.queueItemId || !onResume) return;
		actionLoading = true;
		try {
			await onResume(activity.queueItemId);
			toasts.success('Download resumed');
		} catch (error) {
			console.error('Failed to resume download:', error);
			const message = error instanceof Error ? error.message : 'Failed to resume download';
			toasts.error(message);
		} finally {
			actionLoading = false;
		}
	}

	async function handleRemove() {
		if (!activity?.queueItemId || !onRemove) return;
		actionLoading = true;
		try {
			await onRemove(activity.queueItemId);
			toasts.success('Download removed');
			onClose();
		} catch (error) {
			console.error('Failed to remove download:', error);
			const message = error instanceof Error ? error.message : 'Failed to remove download';
			toasts.error(message);
		} finally {
			actionLoading = false;
		}
	}

	async function handleRetry() {
		if (!activity?.queueItemId || !onRetry) return;
		actionLoading = true;
		try {
			await onRetry(activity.queueItemId);
			toasts.success('Download retry initiated');
		} catch (error) {
			console.error('Failed to retry download:', error);
			const message = error instanceof Error ? error.message : 'Failed to retry download';
			toasts.error(message);
		} finally {
			actionLoading = false;
		}
	}

	function getScoreChange(oldScore: number, newScore: number): { text: string; color: string } {
		const diff = newScore - oldScore;
		if (diff > 0) return { text: `+${diff}`, color: 'text-success' };
		if (diff < 0) return { text: `${diff}`, color: 'text-error' };
		return { text: '0', color: 'text-base-content/60' };
	}

	function getResolutionBadge(activity: UnifiedActivity): string | null {
		const rawResolution = activity.quality?.resolution?.trim();
		if (rawResolution && rawResolution.toLowerCase() !== 'unknown') {
			return rawResolution;
		}

		const isCinephageLibraryStream =
			activity.protocol === 'streaming' &&
			(activity.indexerName?.toLowerCase().includes('cinephage library') ?? false);
		if (isCinephageLibraryStream) {
			return 'Auto';
		}

		return null;
	}

	function isTypingTarget(target: EventTarget | null): boolean {
		const element = target instanceof HTMLElement ? target : null;
		if (!element) return false;
		const tagName = element.tagName;
		return (
			tagName === 'INPUT' ||
			tagName === 'TEXTAREA' ||
			tagName === 'SELECT' ||
			element.isContentEditable ||
			element.closest('[contenteditable="true"]') !== null
		);
	}

	function handleModalKeydown(e: KeyboardEvent) {
		if (!activity) return;

		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
			return;
		}

		if (!contentRef || isTypingTarget(e.target)) return;

		const pageStep = Math.max(Math.floor(contentRef.clientHeight * 0.9), 120);

		if (e.key === ' ') {
			e.preventDefault();
			contentRef.scrollBy({ top: e.shiftKey ? -pageStep : pageStep, behavior: 'smooth' });
			return;
		}

		if (e.key === 'PageDown') {
			e.preventDefault();
			contentRef.scrollBy({ top: pageStep, behavior: 'smooth' });
			return;
		}

		if (e.key === 'PageUp') {
			e.preventDefault();
			contentRef.scrollBy({ top: -pageStep, behavior: 'smooth' });
			return;
		}

		if (e.key === 'Home') {
			e.preventDefault();
			contentRef.scrollTo({ top: 0, behavior: 'smooth' });
			return;
		}

		if (e.key === 'End') {
			e.preventDefault();
			contentRef.scrollTo({ top: contentRef.scrollHeight, behavior: 'smooth' });
		}
	}

	$effect(() => {
		if (activity && modalRef) {
			cleanupScrollLock = lockBodyScroll();
			cleanupFocusTrap = createFocusTrap(modalRef);
		}

		return () => {
			if (cleanupFocusTrap) {
				cleanupFocusTrap();
				cleanupFocusTrap = null;
			}
			if (cleanupScrollLock) {
				cleanupScrollLock();
				cleanupScrollLock = null;
			}
		};
	});
</script>

{#if activity}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		onclick={onClose}
		role="presentation"
	>
		<div
			bind:this={modalRef}
			class="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-base-100 shadow-2xl"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="0"
			onkeydown={handleModalKeydown}
		>
			<!-- Header -->
			<div class="border-b border-base-200 bg-base-100 p-6">
				<div class="flex items-start justify-between gap-4">
					<div class="flex items-start gap-4">
						<div class="rounded-xl bg-base-200 p-3">
							{#if activity.mediaType === 'movie'}
								<Clapperboard class="h-6 w-6" />
							{:else}
								<Tv class="h-6 w-6" />
							{/if}
						</div>
						<div>
							<h2 class="text-xl font-bold">{activity.mediaTitle}</h2>
							{#if activity.mediaYear}
								<span class="text-base-content/60">({activity.mediaYear})</span>
							{/if}
							{#if activity.releaseTitle}
								<p class="mt-1 text-sm text-base-content/60">{activity.releaseTitle}</p>
							{/if}
						</div>
					</div>
					<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
						<X class="h-5 w-5" />
					</button>
				</div>

				<!-- Status Badge -->
				{#if statusConfig[activity.status]}
					{@const config = statusConfig[activity.status]}
					<div class="mt-4 flex items-center gap-3">
						<span class="badge gap-2 {config.variant} badge-lg">
							<config.icon class="h-4 w-4" />
							{config.label}
							{#if activity.status === 'downloading' && activity.downloadProgress !== undefined}
								({activity.downloadProgress}%)
							{/if}
						</span>
						{#if activity.isUpgrade}
							<span class="badge badge-sm badge-warning">Upgrade</span>
						{/if}
						<span class="text-sm text-base-content/60">
							{formatRelativeTime(activity.startedAt)}
						</span>
					</div>
				{/if}

				<!-- Queue Actions -->
				{#if activity.queueItemId}
					<div class="mt-4 flex flex-wrap gap-2">
						{#if activity.status === 'downloading'}
							<button class="btn btn-ghost btn-sm" onclick={handlePause} disabled={actionLoading}>
								<Pause class="h-4 w-4" />
								Pause
							</button>
						{:else if activity.status === 'paused'}
							<button class="btn btn-ghost btn-sm" onclick={handleResume} disabled={actionLoading}>
								<Play class="h-4 w-4" />
								Resume
							</button>
						{/if}
						{#if activity.status === 'failed'}
							<button class="btn btn-ghost btn-sm" onclick={handleRetry} disabled={actionLoading}>
								<RotateCcw class="h-4 w-4" />
								Retry
							</button>
						{/if}
						<button
							class="btn btn-ghost btn-sm btn-error"
							onclick={handleRemove}
							disabled={actionLoading}
						>
							<Trash2 class="h-4 w-4" />
							Remove
						</button>
					</div>
				{/if}
			</div>

			<!-- Tabs -->
			<div class="tabs-bordered tabs border-b border-base-200 px-6">
				<button
					class="tab gap-2 {activeTab === 'overview' ? 'tab-active' : ''}"
					onclick={() => (activeTab = 'overview')}
				>
					<Info class="h-4 w-4" />
					Overview
				</button>
				{#if details?.scoreBreakdown}
					<button
						class="tab gap-2 {activeTab === 'scoring' ? 'tab-active' : ''}"
						onclick={() => (activeTab = 'scoring')}
					>
						<BarChart3 class="h-4 w-4" />
						Scoring
					</button>
				{/if}
				{#if details?.replacedFileInfo || activity.isUpgrade}
					<button
						class="tab gap-2 {activeTab === 'replacement' ? 'tab-active' : ''}"
						onclick={() => (activeTab = 'replacement')}
					>
						<History class="h-4 w-4" />
						Replacement
					</button>
				{/if}
				{#if details?.searchResults}
					<button
						class="tab gap-2 {activeTab === 'audit' ? 'tab-active' : ''}"
						onclick={() => (activeTab = 'audit')}
					>
						<History class="h-4 w-4" />
						Audit Trail
					</button>
				{/if}
			</div>

			<!-- Content -->
			<div bind:this={contentRef} class="max-h-[50vh] overflow-y-auto p-6">
				{#if loading}
					<div class="flex items-center justify-center py-12">
						<Loader2 class="h-8 w-8 animate-spin" />
					</div>
				{:else}
					<!-- Overview Tab -->
					{#if activeTab === 'overview'}
						<div class="space-y-6">
							<!-- Basic Info -->
							<div class="grid gap-4 sm:grid-cols-2">
								<div class="space-y-1">
									<span class="text-sm text-base-content/60">Media Type</span>
									<p class="font-medium capitalize">{activity.mediaType}</p>
								</div>
								<div class="space-y-1">
									<span class="text-sm text-base-content/60">Status</span>
									<p class="font-medium">
										{statusConfig[activity.status]?.label ?? activity.status}
									</p>
								</div>
								<div class="space-y-1">
									<span class="text-sm text-base-content/60">Size</span>
									<p class="font-medium">{formatBytes(activity.size)}</p>
								</div>
								<div class="space-y-1">
									<span class="text-sm text-base-content/60">Protocol</span>
									<p class="font-medium uppercase">{activity.protocol || '-'}</p>
								</div>
								<div class="space-y-1">
									<span class="text-sm text-base-content/60">Indexer</span>
									<p class="font-medium">{activity.indexerName || '-'}</p>
								</div>
								<div class="space-y-1">
									<span class="text-sm text-base-content/60">Release Group</span>
									<p class="font-medium">{activity.releaseGroup || '-'}</p>
								</div>
							</div>

							<!-- Quality -->
							{#if activity.quality}
								<div>
									<span class="text-sm text-base-content/60">Quality</span>
									<div class="mt-1 flex flex-wrap gap-2">
										{#if getResolutionBadge(activity)}
											<span class="badge badge-outline">{getResolutionBadge(activity)}</span>
										{/if}
										{#if activity.quality.source}
											<span class="badge badge-outline">{activity.quality.source}</span>
										{/if}
										{#if activity.quality.codec}
											<span class="badge badge-outline">{activity.quality.codec}</span>
										{/if}
										{#if activity.quality.hdr}
											<span class="badge badge-outline">{activity.quality.hdr}</span>
										{/if}
									</div>
								</div>
							{/if}

							<!-- Import Path -->
							{#if activity.importedPath}
								<div>
									<span class="text-sm text-base-content/60">Imported To</span>
									<div class="mt-1 flex items-center gap-2">
										<Folder class="h-4 w-4 text-base-content/40" />
										<code class="text-sm">{activity.importedPath}</code>
									</div>
								</div>
							{/if}

							<!-- Status Reason -->
							{#if activity.statusReason}
								<div>
									<span class="text-sm text-base-content/60">Status Reason</span>
									<p class="mt-1 text-sm">{activity.statusReason}</p>
								</div>
							{/if}

							<!-- Timeline -->
							{#if activity.timeline.length > 0}
								<div>
									<span class="text-sm text-base-content/60">Timeline</span>
									<div class="mt-2 space-y-2">
										{#each activity.timeline as event, i (event.timestamp + '-' + i)}
											<div class="flex items-center gap-3">
												<div
													class="flex h-6 w-6 items-center justify-center rounded-full bg-base-200 text-xs"
												>
													{i + 1}
												</div>
												<div class="flex-1">
													<span class="font-medium capitalize">{event.type}</span>
													<span class="text-sm text-base-content/60">
														{formatRelativeTime(event.timestamp)}
													</span>
												</div>
												{#if event.details && (!activity.statusReason || event.details
															.trim()
															.toLowerCase() !== activity.statusReason.trim().toLowerCase())}
													<span class="text-sm text-base-content/60">{event.details}</span>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Scoring Tab -->
					{#if activeTab === 'scoring' && details?.scoreBreakdown}
						<div class="space-y-6">
							<h3 class="text-lg font-semibold">Score Breakdown</h3>

							{#if activity.oldScore !== undefined && activity.newScore !== undefined}
								{@const change = getScoreChange(activity.oldScore, activity.newScore)}
								<div class="flex items-center gap-4 rounded-xl bg-base-200 p-4">
									<div class="text-center">
										<div class="text-2xl font-bold">{activity.oldScore}</div>
										<div class="text-sm text-base-content/60">Old Score</div>
									</div>
									<div class="flex-1 text-center">
										<div class="text-3xl font-bold {change.color}">{change.text}</div>
									</div>
									<div class="text-center">
										<div class="text-2xl font-bold">{activity.newScore}</div>
										<div class="text-sm text-base-content/60">New Score</div>
									</div>
								</div>
							{/if}

							<div class="space-y-3">
								{#if details.scoreBreakdown.resolution}
									<div class="flex items-center justify-between rounded-lg bg-base-200 p-3">
										<span>Resolution</span>
										<div class="flex items-center gap-2">
											<span class="text-base-content/60"
												>{details.scoreBreakdown.resolution.old}</span
											>
											<span>→</span>
											<span class="font-medium">{details.scoreBreakdown.resolution.new}</span>
										</div>
									</div>
								{/if}
								{#if details.scoreBreakdown.source}
									<div class="flex items-center justify-between rounded-lg bg-base-200 p-3">
										<span>Source</span>
										<div class="flex items-center gap-2">
											<span class="text-base-content/60">{details.scoreBreakdown.source.old}</span>
											<span>→</span>
											<span class="font-medium">{details.scoreBreakdown.source.new}</span>
										</div>
									</div>
								{/if}
								{#if details.scoreBreakdown.codec}
									<div class="flex items-center justify-between rounded-lg bg-base-200 p-3">
										<span>Codec</span>
										<div class="flex items-center gap-2">
											<span class="text-base-content/60">{details.scoreBreakdown.codec.old}</span>
											<span>→</span>
											<span class="font-medium">{details.scoreBreakdown.codec.new}</span>
										</div>
									</div>
								{/if}
								{#if details.scoreBreakdown.hdr}
									<div class="flex items-center justify-between rounded-lg bg-base-200 p-3">
										<span>HDR</span>
										<div class="flex items-center gap-2">
											<span class="text-base-content/60">{details.scoreBreakdown.hdr.old}</span>
											<span>→</span>
											<span class="font-medium">{details.scoreBreakdown.hdr.new}</span>
										</div>
									</div>
								{/if}
								{#if details.scoreBreakdown.audio}
									<div class="flex items-center justify-between rounded-lg bg-base-200 p-3">
										<span>Audio</span>
										<div class="flex items-center gap-2">
											<span class="text-base-content/60">{details.scoreBreakdown.audio.old}</span>
											<span>→</span>
											<span class="font-medium">{details.scoreBreakdown.audio.new}</span>
										</div>
									</div>
								{/if}
								{#if details.scoreBreakdown.releaseGroup}
									<div class="flex items-center justify-between rounded-lg bg-base-200 p-3">
										<span>Release Group</span>
										<div class="flex items-center gap-2">
											<span class="text-base-content/60"
												>{details.scoreBreakdown.releaseGroup.old}</span
											>
											<span>→</span>
											<span class="font-medium">{details.scoreBreakdown.releaseGroup.new}</span>
										</div>
									</div>
								{/if}
							</div>

							{#if details.scoreBreakdown.customFormats && details.scoreBreakdown.customFormats.length > 0}
								<div>
									<h4 class="mb-3 font-medium">Custom Formats</h4>
									<div class="space-y-2">
										{#each details.scoreBreakdown.customFormats as format (format.name)}
											<div class="flex items-center justify-between rounded-lg bg-base-200 p-3">
												<span>{format.name}</span>
												<div class="flex items-center gap-2">
													<span class="text-base-content/60">{format.old}</span>
													<span>→</span>
													<span class="font-medium">{format.new}</span>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Replacement Tab -->
					{#if activeTab === 'replacement'}
						<div class="space-y-6">
							<h3 class="text-lg font-semibold">File Replacement</h3>

							{#if details?.replacedFileInfo}
								<div class="rounded-xl border border-base-300 p-4">
									<h4 class="mb-3 font-medium text-error">Replaced File</h4>
									<div class="space-y-2 text-sm">
										<div class="flex justify-between">
											<span class="text-base-content/60">Path:</span>
											<code class="max-w-md truncate">{details.replacedFileInfo.path}</code>
										</div>
										<div class="flex justify-between">
											<span class="text-base-content/60">Size:</span>
											<span>{formatBytes(details.replacedFileInfo.size)}</span>
										</div>
										{#if details.replacedFileInfo.quality}
											<div class="flex justify-between">
												<span class="text-base-content/60">Quality:</span>
												<span>{details.replacedFileInfo.quality.resolution || '-'}</span>
											</div>
										{/if}
										{#if details.replacedFileInfo.releaseGroup}
											<div class="flex justify-between">
												<span class="text-base-content/60">Release Group:</span>
												<span>{details.replacedFileInfo.releaseGroup}</span>
											</div>
										{/if}
									</div>
								</div>
							{/if}

							{#if details?.replacedFileScore !== undefined && activity.newScore !== undefined}
								<div class="rounded-xl border border-base-300 p-4">
									<h4 class="mb-3 font-medium">Score Comparison</h4>
									<div class="flex items-center justify-center gap-8">
										<div class="text-center">
											<div class="text-3xl font-bold text-error">{details.replacedFileScore}</div>
											<div class="text-sm text-base-content/60">Old File Score</div>
										</div>
										<div class="text-2xl text-base-content/40">→</div>
										<div class="text-center">
											<div class="text-3xl font-bold text-success">{activity.newScore}</div>
											<div class="text-sm text-base-content/60">New File Score</div>
										</div>
									</div>
								</div>
							{/if}

							{#if details?.filesImported && details.filesImported.length > 0}
								<div>
									<h4 class="mb-3 font-medium">Files Imported</h4>
									<div class="space-y-2">
										{#each details.filesImported as file (file.path)}
											<div class="flex items-center justify-between rounded-lg bg-base-200 p-3">
												<code class="text-sm">{file.path}</code>
												<span class="text-sm text-base-content/60">{formatBytes(file.size)}</span>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Audit Trail Tab -->
					{#if activeTab === 'audit' && details?.searchResults}
						<div class="space-y-6">
							<h3 class="text-lg font-semibold">Search Results & Selection</h3>

							{#if details.selectionReason}
								<div class="rounded-xl bg-base-200 p-4">
									<span class="text-sm text-base-content/60">Selection Reason:</span>
									<p class="mt-1">{details.selectionReason}</p>
								</div>
							{/if}

							<div class="space-y-2">
								{#each details.searchResults as result (result.title)}
									<div
										class="rounded-lg border border-base-300 p-3 {result.rejected
											? 'opacity-60'
											: 'border-success'}"
									>
										<div class="flex items-start justify-between gap-2">
											<div class="flex-1">
												<div class="font-medium">{result.title}</div>
												<div
													class="mt-1 flex flex-wrap items-center gap-2 text-sm text-base-content/60"
												>
													<span>{result.indexer}</span>
													<span>•</span>
													<span>{formatBytes(result.size)}</span>
													<span>•</span>
													<span class="uppercase">{result.protocol}</span>
												</div>
											</div>
											<div class="text-right">
												<div class="text-lg font-bold">{result.score}</div>
												{#if result.rejected}
													<span class="badge badge-sm badge-error">Rejected</span>
												{:else}
													<span class="badge badge-sm badge-success">Selected</span>
												{/if}
											</div>
										</div>
										{#if result.rejected && result.rejectionReason}
											<div class="mt-2 text-sm text-error">{result.rejectionReason}</div>
										{/if}
									</div>
								{/each}
							</div>

							{#if details.importLog && details.importLog.length > 0}
								<div class="mt-6">
									<h4 class="mb-3 font-medium">Import Log</h4>
									<div class="space-y-2">
										{#each details.importLog as log (log.timestamp + '-' + log.step)}
											<div class="flex items-start gap-3 rounded-lg bg-base-200 p-3">
												{#if log.success}
													<CheckCircle2 class="h-4 w-4 text-success" />
												{:else}
													<XCircle class="h-4 w-4 text-error" />
												{/if}
												<div class="flex-1">
													<div class="font-medium">{log.step}</div>
													<div class="text-sm text-base-content/60">{log.message}</div>
													<div class="text-xs text-base-content/40">
														{formatRelativeTime(log.timestamp)}
													</div>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}
