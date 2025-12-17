<script lang="ts">
	import { X, RefreshCw, CheckCircle, AlertTriangle, ArrowRight, Film, Tv } from 'lucide-svelte';
	import type {
		RenamePreviewResult,
		RenamePreviewItem
	} from '$lib/server/library/naming/RenamePreviewService';

	interface Props {
		open: boolean;
		mediaType: 'movie' | 'series';
		mediaId: string;
		mediaTitle: string;
		onClose: () => void;
		onRenamed: () => void;
	}

	let { open, mediaType, mediaId, mediaTitle, onClose, onRenamed }: Props = $props();

	// State
	let loading = $state(false);
	let executing = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let preview = $state<RenamePreviewResult | null>(null);
	let selectedIds = $state<Set<string>>(new Set());

	// Load preview when modal opens
	$effect(() => {
		if (open) {
			loadPreview();
		} else {
			// Reset state when closed
			preview = null;
			selectedIds = new Set();
			error = null;
			success = null;
		}
	});

	async function loadPreview() {
		loading = true;
		error = null;

		try {
			const endpoint =
				mediaType === 'movie'
					? `/api/rename/preview/movie/${mediaId}`
					: `/api/rename/preview/series/${mediaId}`;

			const response = await fetch(endpoint);

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to load preview');
			}

			preview = await response.json();

			// Auto-select all "will change" items
			selectedIds = new Set(preview?.willChange.map((item) => item.fileId) || []);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load preview';
		} finally {
			loading = false;
		}
	}

	async function executeRenames() {
		if (selectedIds.size === 0) return;

		executing = true;
		error = null;
		success = null;

		try {
			const response = await fetch('/api/rename/execute', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					fileIds: Array.from(selectedIds),
					mediaType: mediaType === 'movie' ? 'movie' : 'episode'
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to execute renames');
			}

			const result = await response.json();

			if (result.succeeded > 0) {
				success = `Successfully renamed ${result.succeeded} file${result.succeeded !== 1 ? 's' : ''}`;
				onRenamed();

				// Auto-close after success
				setTimeout(() => {
					onClose();
				}, 1500);
			}

			if (result.failed > 0) {
				// Get specific error messages from failed results
				const failedResults = result.results?.filter((r: { success: boolean }) => !r.success) || [];
				const errorMessages = failedResults.map((r: { error?: string }) => r.error).filter(Boolean);

				if (errorMessages.length > 0) {
					error = `Failed to rename ${result.failed} file(s): ${errorMessages.join(', ')}`;
				} else {
					error = `Failed to rename ${result.failed} file${result.failed !== 1 ? 's' : ''}`;
				}
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to execute renames';
		} finally {
			executing = false;
		}
	}

	function toggleSelect(fileId: string) {
		const newSet = new Set(selectedIds);
		if (newSet.has(fileId)) {
			newSet.delete(fileId);
		} else {
			newSet.add(fileId);
		}
		selectedIds = newSet;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}

	// Computed
	const hasChanges = $derived((preview?.totalWillChange || 0) > 0);
	const allItems = $derived([
		...(preview?.willChange || []),
		...(preview?.alreadyCorrect || []),
		...(preview?.collisions || []),
		...(preview?.errors || [])
	]);
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 bg-black/50"
		onclick={onClose}
		onkeydown={(e) => e.key === 'Enter' && onClose()}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
	></div>

	<!-- Modal -->
	<div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
		<div
			class="pointer-events-auto flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-base-100 shadow-2xl"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-base-300 p-4">
				<div class="flex items-center gap-3">
					{#if mediaType === 'movie'}
						<Film class="h-5 w-5 text-primary" />
					{:else}
						<Tv class="h-5 w-5 text-secondary" />
					{/if}
					<div>
						<h2 id="modal-title" class="text-lg font-semibold">Rename Files</h2>
						<p class="text-sm text-base-content/60">{mediaTitle}</p>
					</div>
				</div>
				<button class="btn btn-square btn-ghost btn-sm" onclick={onClose} aria-label="Close">
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- Content -->
			<div class="flex-1 overflow-y-auto p-4">
				{#if loading}
					<div class="flex items-center justify-center py-10">
						<RefreshCw class="h-6 w-6 animate-spin text-primary" />
					</div>
				{:else if error}
					<div class="mb-4 alert alert-error">
						<AlertTriangle class="h-5 w-5" />
						<span>{error}</span>
					</div>
				{:else if success}
					<div class="alert alert-success">
						<CheckCircle class="h-5 w-5" />
						<span>{success}</span>
					</div>
				{:else if preview}
					<!-- Summary -->
					<div class="mb-4 flex gap-4 text-sm">
						<span class="badge badge-info">{preview.totalWillChange} will change</span>
						<span class="badge badge-success">{preview.totalAlreadyCorrect} correct</span>
						{#if preview.totalCollisions > 0}
							<span class="badge badge-warning">{preview.totalCollisions} collisions</span>
						{/if}
						{#if preview.totalErrors > 0}
							<span class="badge badge-error">{preview.totalErrors} errors</span>
						{/if}
					</div>

					{#if preview.totalFiles === 0}
						<div class="py-10 text-center text-base-content/60">
							No files found for this {mediaType}.
						</div>
					{:else if !hasChanges}
						<div class="py-10 text-center text-base-content/60">
							<CheckCircle class="mx-auto mb-2 h-8 w-8 text-success" />
							All files are already correctly named.
						</div>
					{:else}
						<!-- File List -->
						<div class="space-y-2">
							{#each allItems as item (item.fileId)}
								<div
									class="card bg-base-200"
									class:opacity-50={item.status === 'already_correct'}
									class:cursor-pointer={item.status === 'will_change'}
									class:ring-2={item.status === 'will_change' && selectedIds.has(item.fileId)}
									class:ring-primary={item.status === 'will_change' && selectedIds.has(item.fileId)}
									onclick={() => item.status === 'will_change' && toggleSelect(item.fileId)}
									onkeydown={(e) =>
										e.key === 'Enter' && item.status === 'will_change' && toggleSelect(item.fileId)}
									role={item.status === 'will_change' ? 'checkbox' : 'listitem'}
									aria-checked={item.status === 'will_change'
										? selectedIds.has(item.fileId)
										: undefined}
									tabindex={item.status === 'will_change' ? 0 : -1}
								>
									<div class="card-body p-3">
										<div class="flex items-start gap-3">
											{#if item.status === 'will_change'}
												<input
													type="checkbox"
													class="checkbox mt-1 checkbox-sm checkbox-primary"
													checked={selectedIds.has(item.fileId)}
													onclick={(e) => e.stopPropagation()}
													onchange={() => toggleSelect(item.fileId)}
												/>
											{/if}

											<div class="min-w-0 flex-1">
												{#if item.status === 'will_change' || item.status === 'collision'}
													<div class="space-y-1 text-sm">
														<div class="flex items-center gap-2">
															<code
																class="rounded bg-base-300 px-1.5 py-0.5 text-xs break-all text-error"
																>{item.currentRelativePath}</code
															>
														</div>
														<div class="flex items-center gap-2">
															<ArrowRight class="h-3 w-3 flex-shrink-0 text-base-content/40" />
															<code
																class="rounded bg-base-300 px-1.5 py-0.5 text-xs break-all text-success"
																>{item.newRelativePath}</code
															>
														</div>
													</div>
												{:else}
													<code class="rounded bg-base-300 px-1.5 py-0.5 text-xs break-all"
														>{item.currentRelativePath}</code
													>
												{/if}

												{#if item.error}
													<div class="mt-1 text-xs text-error">{item.error}</div>
												{/if}
											</div>

											<div class="flex-shrink-0">
												{#if item.status === 'will_change'}
													<span class="badge badge-sm badge-info">Change</span>
												{:else if item.status === 'already_correct'}
													<span class="badge badge-sm badge-success">Correct</span>
												{:else if item.status === 'collision'}
													<span class="badge badge-sm badge-warning">Collision</span>
												{:else if item.status === 'error'}
													<span class="badge badge-sm badge-error">Error</span>
												{/if}
											</div>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{/if}
			</div>

			<!-- Footer -->
			<div class="flex items-center justify-between border-t border-base-300 p-4">
				<button class="btn btn-ghost" onclick={onClose}>Cancel</button>
				<button
					class="btn gap-2 btn-primary"
					onclick={executeRenames}
					disabled={executing || selectedIds.size === 0}
				>
					{#if executing}
						<RefreshCw class="h-4 w-4 animate-spin" />
						Renaming...
					{:else}
						<CheckCircle class="h-4 w-4" />
						Rename ({selectedIds.size})
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
