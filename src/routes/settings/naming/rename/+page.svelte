<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import {
		RefreshCw,
		CheckCircle,
		AlertTriangle,
		FileWarning,
		File,
		ChevronLeft,
		Film,
		Tv
	} from 'lucide-svelte';
	import type {
		RenamePreviewResult,
		RenameExecuteResult
	} from '$lib/server/library/naming/RenamePreviewService';

	// State
	let loading = $state(true);
	let executing = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let preview = $state<RenamePreviewResult | null>(null);
	let executeResult = $state<RenameExecuteResult | null>(null);

	// Selected items
	const selectedIds = new SvelteSet<string>();

	// Filter state
	let activeTab = $state<'willChange' | 'alreadyCorrect' | 'collisions' | 'errors'>('willChange');
	let mediaTypeFilter = $state<'all' | 'movie' | 'tv'>('all');

	// Load preview on mount
	$effect(() => {
		loadPreview();
	});

	async function loadPreview() {
		loading = true;
		error = null;
		executeResult = null;

		try {
			const response = await fetch(`/api/rename/preview?mediaType=${mediaTypeFilter}`);

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to load preview');
			}

			preview = await response.json();

			// Auto-select all "will change" items
			selectedIds.clear();
			for (const item of preview?.willChange || []) {
				selectedIds.add(item.fileId);
			}
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
					mediaType:
						mediaTypeFilter === 'all' ? 'mixed' : mediaTypeFilter === 'movie' ? 'movie' : 'episode'
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to execute renames');
			}

			executeResult = await response.json();

			if (executeResult && executeResult.succeeded > 0) {
				success = `Successfully renamed ${executeResult.succeeded} file${executeResult.succeeded !== 1 ? 's' : ''}`;
			}

			if (executeResult && executeResult.failed > 0) {
				// Get specific error messages from failed results
				const failedResults =
					executeResult.results?.filter((r: { success: boolean }) => !r.success) || [];
				const errorMessages = failedResults.map((r: { error?: string }) => r.error).filter(Boolean);

				if (errorMessages.length > 0) {
					error = `Failed to rename ${executeResult.failed} file(s): ${errorMessages.join(', ')}`;
				} else {
					error = `Failed to rename ${executeResult.failed} file${executeResult.failed !== 1 ? 's' : ''}`;
				}
			}

			// Reload preview to reflect changes
			await loadPreview();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to execute renames';
		} finally {
			executing = false;
		}
	}

	function toggleSelect(fileId: string) {
		if (selectedIds.has(fileId)) {
			selectedIds.delete(fileId);
		} else {
			selectedIds.add(fileId);
		}
	}

	function selectAll() {
		selectedIds.clear();
		for (const item of preview?.willChange || []) {
			selectedIds.add(item.fileId);
		}
	}

	function selectNone() {
		selectedIds.clear();
	}

	// Get current tab items
	const currentItems = $derived(() => {
		if (!preview) return [];
		switch (activeTab) {
			case 'willChange':
				return preview.willChange;
			case 'alreadyCorrect':
				return preview.alreadyCorrect;
			case 'collisions':
				return preview.collisions;
			case 'errors':
				return preview.errors;
			default:
				return [];
		}
	});

	// Count for each tab
	const counts = $derived({
		willChange: preview?.totalWillChange || 0,
		alreadyCorrect: preview?.totalAlreadyCorrect || 0,
		collisions: preview?.totalCollisions || 0,
		errors: preview?.totalErrors || 0
	});
</script>

<div class="w-full p-4">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<div class="flex items-center gap-4">
			<a href="/settings/naming" class="btn gap-2 btn-ghost btn-sm">
				<ChevronLeft class="h-4 w-4" />
				Back
			</a>
			<div>
				<h1 class="text-3xl font-bold">Rename Files</h1>
				<p class="text-base-content/70">
					Preview and apply naming convention changes to existing library files.
				</p>
			</div>
		</div>
		<div class="flex gap-2">
			<button class="btn gap-2 btn-ghost" onclick={loadPreview} disabled={loading}>
				<RefreshCw class="h-4 w-4 {loading ? 'animate-spin' : ''}" />
				Refresh Preview
			</button>
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
					Rename Selected ({selectedIds.size})
				{/if}
			</button>
		</div>
	</div>

	<!-- Alerts -->
	{#if error}
		<div class="mb-4 alert alert-error">
			<AlertTriangle class="h-5 w-5" />
			<span>{error}</span>
		</div>
	{/if}

	{#if success}
		<div class="mb-4 alert alert-success">
			<CheckCircle class="h-5 w-5" />
			<span>{success}</span>
		</div>
	{/if}

	<!-- Media Type Filter -->
	<div class="mb-4 flex gap-2">
		<button
			class="btn btn-sm"
			class:btn-primary={mediaTypeFilter === 'all'}
			class:btn-ghost={mediaTypeFilter !== 'all'}
			onclick={() => {
				mediaTypeFilter = 'all';
				loadPreview();
			}}
		>
			All
		</button>
		<button
			class="btn gap-1 btn-sm"
			class:btn-primary={mediaTypeFilter === 'movie'}
			class:btn-ghost={mediaTypeFilter !== 'movie'}
			onclick={() => {
				mediaTypeFilter = 'movie';
				loadPreview();
			}}
		>
			<Film class="h-4 w-4" />
			Movies
		</button>
		<button
			class="btn gap-1 btn-sm"
			class:btn-primary={mediaTypeFilter === 'tv'}
			class:btn-ghost={mediaTypeFilter !== 'tv'}
			onclick={() => {
				mediaTypeFilter = 'tv';
				loadPreview();
			}}
		>
			<Tv class="h-4 w-4" />
			TV
		</button>
	</div>

	<!-- Loading State -->
	{#if loading}
		<div class="flex items-center justify-center py-20">
			<RefreshCw class="h-8 w-8 animate-spin text-primary" />
		</div>
	{:else if preview}
		<!-- Summary Stats -->
		<div class="mb-6 grid grid-cols-4 gap-4">
			<div class="stat rounded-box bg-base-200">
				<div class="stat-title">Total Files</div>
				<div class="stat-value text-2xl">{preview.totalFiles}</div>
			</div>
			<div class="stat rounded-box bg-base-200">
				<div class="stat-title">Will Change</div>
				<div class="stat-value text-2xl text-info">{preview.totalWillChange}</div>
			</div>
			<div class="stat rounded-box bg-base-200">
				<div class="stat-title">Already Correct</div>
				<div class="stat-value text-2xl text-success">{preview.totalAlreadyCorrect}</div>
			</div>
			<div class="stat rounded-box bg-base-200">
				<div class="stat-title">Collisions</div>
				<div class="stat-value text-2xl text-warning">{preview.totalCollisions}</div>
			</div>
		</div>

		<!-- Tabs -->
		<div class="tabs-boxed mb-4 tabs w-fit">
			<button
				class="tab gap-2"
				class:tab-active={activeTab === 'willChange'}
				onclick={() => (activeTab = 'willChange')}
			>
				<File class="h-4 w-4" />
				Will Change ({counts.willChange})
			</button>
			<button
				class="tab gap-2"
				class:tab-active={activeTab === 'alreadyCorrect'}
				onclick={() => (activeTab = 'alreadyCorrect')}
			>
				<CheckCircle class="h-4 w-4" />
				Already Correct ({counts.alreadyCorrect})
			</button>
			<button
				class="tab gap-2"
				class:tab-active={activeTab === 'collisions'}
				onclick={() => (activeTab = 'collisions')}
			>
				<AlertTriangle class="h-4 w-4" />
				Collisions ({counts.collisions})
			</button>
			<button
				class="tab gap-2"
				class:tab-active={activeTab === 'errors'}
				onclick={() => (activeTab = 'errors')}
			>
				<FileWarning class="h-4 w-4" />
				Errors ({counts.errors})
			</button>
		</div>

		<!-- Selection Controls (only for willChange tab) -->
		{#if activeTab === 'willChange' && counts.willChange > 0}
			<div class="mb-4 flex gap-2">
				<button class="btn btn-ghost btn-sm" onclick={selectAll}>Select All</button>
				<button class="btn btn-ghost btn-sm" onclick={selectNone}>Select None</button>
				<span class="ml-2 self-center text-sm text-base-content/60">
					{selectedIds.size} of {counts.willChange} selected
				</span>
			</div>
		{/if}

		<!-- File List -->
		<div class="space-y-2">
			{#each currentItems() as item (item.fileId)}
				{#if activeTab === 'willChange'}
					<div
						class="card cursor-pointer bg-base-200 transition-colors hover:bg-base-300"
						class:ring-2={selectedIds.has(item.fileId)}
						class:ring-primary={selectedIds.has(item.fileId)}
						onclick={() => toggleSelect(item.fileId)}
						onkeydown={(e) => e.key === 'Enter' && toggleSelect(item.fileId)}
						role="checkbox"
						aria-checked={selectedIds.has(item.fileId)}
						tabindex="0"
					>
						<div class="card-body p-4">
							<div class="flex items-start gap-4">
								<div class="flex-shrink-0 pt-1">
									<input
										type="checkbox"
										class="checkbox checkbox-primary"
										checked={selectedIds.has(item.fileId)}
										onclick={(e) => e.stopPropagation()}
										onchange={() => toggleSelect(item.fileId)}
									/>
								</div>
								<div class="flex-shrink-0 pt-1">
									{#if item.mediaType === 'movie'}
										<Film class="h-5 w-5 text-primary" />
									{:else}
										<Tv class="h-5 w-5 text-secondary" />
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<div class="font-medium">{item.mediaTitle}</div>
									<div class="mt-2 space-y-1">
										<div class="flex items-center gap-2 text-sm">
											<span class="w-12 text-base-content/60">From:</span>
											<code class="rounded bg-base-300 px-2 py-0.5 break-all text-error"
												>{item.currentParentPath}/{item.currentRelativePath}</code
											>
										</div>
										<div class="flex items-center gap-2 text-sm">
											<span class="w-12 text-base-content/60">To:</span>
											<code class="rounded bg-base-300 px-2 py-0.5 break-all text-success"
												>{item.newParentPath}/{item.newRelativePath}</code
											>
										</div>
									</div>
								</div>
								<div class="flex-shrink-0">
									<span class="badge badge-info">Will Change</span>
								</div>
							</div>
						</div>
					</div>
				{:else}
					<div class="card bg-base-200">
						<div class="card-body p-4">
							<div class="flex items-start gap-4">
								<div class="flex-shrink-0 pt-1">
									{#if item.mediaType === 'movie'}
										<Film class="h-5 w-5 text-primary" />
									{:else}
										<Tv class="h-5 w-5 text-secondary" />
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<div class="font-medium">{item.mediaTitle}</div>
									{#if activeTab === 'collisions'}
										<div class="mt-2 space-y-1">
											<div class="flex items-center gap-2 text-sm">
												<span class="w-12 text-base-content/60">From:</span>
												<code class="rounded bg-base-300 px-2 py-0.5 break-all text-error"
													>{item.currentRelativePath}</code
												>
											</div>
											<div class="flex items-center gap-2 text-sm">
												<span class="w-12 text-base-content/60">To:</span>
												<code class="rounded bg-base-300 px-2 py-0.5 break-all text-success"
													>{item.newRelativePath}</code
												>
											</div>
										</div>
									{:else if activeTab === 'alreadyCorrect'}
										<div class="mt-2 text-sm">
											<code class="rounded bg-base-300 px-2 py-0.5 break-all"
												>{item.currentParentPath}/{item.currentRelativePath}</code
											>
										</div>
									{:else if activeTab === 'errors'}
										<div class="mt-2 space-y-1">
											<div class="text-sm">
												<code class="rounded bg-base-300 px-2 py-0.5 break-all"
													>{item.currentParentPath}/{item.currentRelativePath}</code
												>
											</div>
											{#if item.error}
												<div class="text-sm text-error">{item.error}</div>
											{/if}
										</div>
									{/if}
									{#if item.status === 'collision' && item.collisionsWith}
										<div class="mt-2 text-sm text-warning">
											Conflicts with {item.collisionsWith.length} other file{item.collisionsWith
												.length !== 1
												? 's'
												: ''}
										</div>
									{/if}
								</div>
								<div class="flex-shrink-0">
									{#if item.status === 'already_correct'}
										<span class="badge badge-success">Correct</span>
									{:else if item.status === 'collision'}
										<span class="badge badge-warning">Collision</span>
									{:else if item.status === 'error'}
										<span class="badge badge-error">Error</span>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/if}
			{:else}
				<div class="text-center py-10 text-base-content/60">
					{#if activeTab === 'willChange'}
						No files need renaming. All files match your naming settings.
					{:else if activeTab === 'alreadyCorrect'}
						No files are correctly named yet.
					{:else if activeTab === 'collisions'}
						No collision issues detected.
					{:else}
						No errors detected.
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<div class="py-20 text-center text-base-content/60">
			No preview data available. Click "Refresh Preview" to load.
		</div>
	{/if}
</div>
