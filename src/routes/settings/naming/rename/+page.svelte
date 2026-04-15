<script lang="ts">
	import { page } from '$app/state';
	import { SvelteSet } from 'svelte/reactivity';
	import * as m from '$lib/paraglide/messages.js';
	import {
		RefreshCw,
		CheckCircle,
		AlertTriangle,
		FileWarning,
		FileCheck,
		ChevronLeft,
		Film,
		Tv,
		ArrowRight,
		Check,
		X,
		Files,
		RotateCcw,
		FileEdit
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
	const hasUnsavedDraft = $derived(page.url.searchParams.get('unsaved') === '1');
	const returnTo = $derived(page.url.searchParams.get('returnTo') || '/settings/naming');

	// Load preview on mount
	let previousMediaTypeFilter = $state<'all' | 'movie' | 'tv' | null>(null);
	$effect(() => {
		if (previousMediaTypeFilter !== mediaTypeFilter) {
			previousMediaTypeFilter = mediaTypeFilter;
			loadPreview();
		}
	});

	async function loadPreview() {
		loading = true;
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
				success = m.settings_naming_rename_successCount({ count: executeResult.succeeded });
			}

			if (executeResult && executeResult.failed > 0) {
				// Get specific error messages from failed results
				const failedResults =
					executeResult.results?.filter((r: { success: boolean }) => !r.success) || [];
				const errorMessages = failedResults.map((r: { error?: string }) => r.error).filter(Boolean);

				if (errorMessages.length > 0) {
					error = m.settings_naming_rename_failCountWithErrors({
						count: executeResult.failed,
						errors: errorMessages.join(', ')
					});
				} else {
					error = m.settings_naming_rename_failCount({ count: executeResult.failed });
				}
			}

			const executeError = error;

			// Reload preview to reflect changes
			await loadPreview();
			error = executeError;
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

	function handleCardKeydown(event: KeyboardEvent, fileId: string) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			toggleSelect(fileId);
		}
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

	const totalFiles = $derived(preview?.totalFiles || 0);
</script>

<div class="w-full p-3 sm:p-4 lg:p-6">
	<!-- Header -->
	<div class="mb-6">
		<a href={returnTo} class="btn mb-4 gap-2 btn-ghost btn-sm">
			<ChevronLeft class="h-4 w-4" />
			{m.settings_naming_rename_backToNaming()}
		</a>

		<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
						<FileEdit class="h-5 w-5 text-primary" />
					</div>
					<div>
						<h1 class="text-2xl font-bold sm:text-3xl">{m.settings_naming_rename_heading()}</h1>
						<p class="text-base text-base-content/70">
							{m.settings_naming_rename_subtitle()}
						</p>
					</div>
				</div>
			</div>
			<div class="flex flex-col gap-2 sm:w-auto sm:flex-row">
				<button class="btn gap-2 btn-ghost btn-sm" onclick={loadPreview} disabled={loading}>
					<RefreshCw class="h-4 w-4 {loading ? 'animate-spin' : ''}" />
					{m.action_refresh()}
				</button>
				<button
					class="btn gap-2 btn-sm btn-primary"
					onclick={executeRenames}
					disabled={executing || selectedIds.size === 0}
				>
					{#if executing}
						<RefreshCw class="h-4 w-4 animate-spin" />
						{m.settings_naming_rename_renaming()}
					{:else}
						<CheckCircle class="h-4 w-4" />
						{m.settings_naming_rename_renameSelected({ count: selectedIds.size })}
					{/if}
				</button>
			</div>
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

	{#if hasUnsavedDraft}
		<div class="mb-4 alert alert-warning">
			<div class="flex items-start gap-3">
				<AlertTriangle class="mt-0.5 h-5 w-5 shrink-0" />
				<div>
					<p class="font-medium">{m.settings_naming_rename_usingSavedSettings()}</p>
					<p class="text-sm opacity-90">
						{m.settings_naming_rename_usingSavedSettingsDesc()}
					</p>
				</div>
			</div>
		</div>
	{/if}

	<div class="mb-6 rounded-2xl border border-base-300 bg-base-200 p-4 text-sm text-base-content/70">
		<p class="font-medium">{m.settings_naming_rename_whatShowing()}</p>
		<p class="mt-1">
			{m.settings_naming_rename_whatShowingDesc()}
		</p>
	</div>

	{#if loading}
		<!-- Loading State -->
		<div class="flex items-center justify-center py-20">
			<div class="text-center">
				<RefreshCw class="mx-auto mb-4 h-10 w-10 animate-spin text-primary" />
				<p class="text-base-content/60">{m.settings_naming_rename_loadingPreview()}</p>
			</div>
		</div>
	{:else if preview}
		<!-- Media Type Filter & Summary -->
		<div class="mb-6 space-y-4">
			<!-- Media Type Pills -->
			<div class="flex flex-wrap items-center gap-2">
				<span class="mr-1 text-sm text-base-content/60">{m.settings_naming_rename_filter()}:</span>
				<button
					class="btn gap-1 btn-sm"
					class:btn-primary={mediaTypeFilter === 'all'}
					class:btn-ghost={mediaTypeFilter !== 'all'}
					onclick={() => (mediaTypeFilter = 'all')}
				>
					<Files class="h-4 w-4" />
					{m.common_all()}
				</button>
				<button
					class="btn gap-1 btn-sm"
					class:btn-primary={mediaTypeFilter === 'movie'}
					class:btn-ghost={mediaTypeFilter !== 'movie'}
					onclick={() => (mediaTypeFilter = 'movie')}
				>
					<Film class="h-4 w-4" />
					{m.common_movies()}
				</button>
				<button
					class="btn gap-1 btn-sm"
					class:btn-primary={mediaTypeFilter === 'tv'}
					class:btn-ghost={mediaTypeFilter !== 'tv'}
					onclick={() => (mediaTypeFilter = 'tv')}
				>
					<Tv class="h-4 w-4" />
					{m.common_tvShows()}
				</button>
			</div>

			<!-- Summary Stats -->
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<div class="stat rounded-box bg-base-200 p-3">
					<div class="stat-title text-xs">{m.settings_naming_rename_totalFiles()}</div>
					<div class="stat-value text-xl sm:text-2xl">{totalFiles}</div>
				</div>
				<div class="stat rounded-box bg-base-200 p-3">
					<div class="stat-title text-xs">{m.settings_naming_rename_willChange()}</div>
					<div class="stat-value text-xl text-info sm:text-2xl">{counts.willChange}</div>
				</div>
				<div class="stat rounded-box bg-base-200 p-3">
					<div class="stat-title text-xs">{m.settings_naming_rename_alreadyCorrect()}</div>
					<div class="stat-value text-xl text-success sm:text-2xl">{counts.alreadyCorrect}</div>
				</div>
				<div class="stat rounded-box bg-base-200 p-3">
					<div class="stat-title text-xs">{m.settings_naming_rename_issues()}</div>
					<div
						class="stat-value text-xl {counts.collisions + counts.errors > 0
							? 'text-warning'
							: 'text-base-content'} sm:text-2xl"
					>
						{counts.collisions + counts.errors}
					</div>
				</div>
			</div>
		</div>

		<!-- Tabs -->
		<div class="tabs-boxed mb-4 tabs flex w-full flex-wrap gap-1">
			<button
				class="tab gap-2"
				class:tab-active={activeTab === 'willChange'}
				onclick={() => (activeTab = 'willChange')}
			>
				<FileEdit class="h-4 w-4" />
				{m.settings_naming_rename_willChange()}
				<span class="badge badge-sm badge-info">{counts.willChange}</span>
			</button>
			<button
				class="tab gap-2"
				class:tab-active={activeTab === 'alreadyCorrect'}
				onclick={() => (activeTab = 'alreadyCorrect')}
			>
				<FileCheck class="h-4 w-4" />
				{m.settings_naming_rename_correct()}
				<span class="badge badge-sm badge-success">{counts.alreadyCorrect}</span>
			</button>
			<button
				class="tab gap-2"
				class:tab-active={activeTab === 'collisions'}
				onclick={() => (activeTab = 'collisions')}
			>
				<AlertTriangle class="h-4 w-4" />
				{m.settings_naming_rename_collisions()}
				<span class="badge badge-sm {counts.collisions > 0 ? 'badge-warning' : 'badge-ghost'}"
					>{counts.collisions}</span
				>
			</button>
			<button
				class="tab gap-2"
				class:tab-active={activeTab === 'errors'}
				onclick={() => (activeTab = 'errors')}
			>
				<FileWarning class="h-4 w-4" />
				{m.settings_naming_rename_errors()}
				<span class="badge badge-sm {counts.errors > 0 ? 'badge-error' : 'badge-ghost'}"
					>{counts.errors}</span
				>
			</button>
		</div>

		<!-- Selection Controls (only for willChange tab) -->
		{#if activeTab === 'willChange' && counts.willChange > 0}
			<div class="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-base-200 p-3">
				<span class="mr-2 text-sm font-medium">{m.settings_naming_rename_selection()}:</span>
				<button class="btn btn-ghost btn-xs" onclick={selectAll}>{m.action_selectAll()}</button>
				<button class="btn btn-ghost btn-xs" onclick={selectNone}>{m.action_deselectAll()}</button>
				<span class="ml-auto text-sm text-base-content/60">
					{m.settings_naming_rename_selectedCount({
						selected: selectedIds.size,
						total: counts.willChange
					})}
				</span>
			</div>
		{/if}

		<!-- File List -->
		<div class="space-y-3">
			{#each currentItems() as item (item.fileId)}
				{#if activeTab === 'willChange'}
					<!-- Will Change Card -->
					<div
						class="card bg-base-200 transition-all duration-200 hover:bg-base-300"
						class:ring-2={selectedIds.has(item.fileId)}
						class:ring-primary={selectedIds.has(item.fileId)}
						class:shadow-md={selectedIds.has(item.fileId)}
						onclick={() => toggleSelect(item.fileId)}
						onkeydown={(e) => handleCardKeydown(e, item.fileId)}
						role="checkbox"
						aria-checked={selectedIds.has(item.fileId)}
						aria-label={`Select rename for ${item.mediaTitle}`}
						tabindex="0"
					>
						<div class="card-body p-4">
							<div class="flex items-start justify-between gap-3">
								<div class="flex min-w-0 items-start gap-3">
									<input
										type="checkbox"
										class="checkbox mt-0.5 checkbox-primary"
										checked={selectedIds.has(item.fileId)}
										onclick={(e) => e.stopPropagation()}
										onkeydown={(e) => e.stopPropagation()}
										onchange={() => toggleSelect(item.fileId)}
										aria-label={`Toggle rename for ${item.mediaTitle}`}
									/>
									<div class="shrink-0 pt-0.5">
										{#if item.mediaType === 'movie'}
											<Film class="h-5 w-5 text-primary" />
										{:else}
											<Tv class="h-5 w-5 text-secondary" />
										{/if}
									</div>
									<div class="min-w-0">
										<p class="truncate font-medium">{item.mediaTitle}</p>
										<p class="truncate text-sm text-base-content/60">{item.currentRelativePath}</p>
									</div>
								</div>
								<span class="badge shrink-0 badge-info"
									>{m.settings_naming_rename_willChange()}</span
								>
							</div>

							<!-- Path Comparison -->
							<div class="mt-3 space-y-2 rounded-lg bg-base-300/50 p-3">
								<div class="flex flex-col gap-1 text-sm">
									<div class="flex items-center gap-2">
										<X class="h-4 w-4 shrink-0 text-error" />
										<span class="shrink-0 text-base-content/50"
											>{m.settings_naming_rename_current()}:</span
										>
									</div>
									<code class="font-mono text-xs break-all text-error">
										{item.currentParentPath}/{item.currentRelativePath}
									</code>
								</div>
								<div class="flex items-center justify-center py-1">
									<ArrowRight class="h-4 w-4 text-base-content/30" />
								</div>
								<div class="flex flex-col gap-1 text-sm">
									<div class="flex items-center gap-2">
										<Check class="h-4 w-4 shrink-0 text-success" />
										<span class="shrink-0 text-base-content/50"
											>{m.settings_naming_rename_new()}:</span
										>
									</div>
									<code class="font-mono text-xs break-all text-success">
										{item.newParentPath}/{item.newRelativePath}
									</code>
								</div>
							</div>
						</div>
					</div>
				{:else}
					<!-- Read-only Cards -->
					<div class="card bg-base-200">
						<div class="card-body p-4">
							<div class="flex items-start justify-between gap-3">
								<div class="flex min-w-0 items-start gap-3">
									<div class="shrink-0 pt-0.5">
										{#if item.mediaType === 'movie'}
											<Film class="h-5 w-5 text-primary" />
										{:else}
											<Tv class="h-5 w-5 text-secondary" />
										{/if}
									</div>
									<div class="min-w-0">
										<p class="truncate font-medium">{item.mediaTitle}</p>
										<p class="truncate text-sm text-base-content/60">{item.currentRelativePath}</p>
									</div>
								</div>
								<div class="shrink-0">
									{#if item.status === 'already_correct'}
										<span class="badge badge-success">{m.settings_naming_rename_correct()}</span>
									{:else if item.status === 'collision'}
										<span class="badge badge-warning">{m.settings_naming_rename_collision()}</span>
									{:else if item.status === 'error'}
										<span class="badge badge-error">{m.settings_naming_rename_error()}</span>
									{/if}
								</div>
							</div>

							{#if activeTab === 'collisions'}
								<div class="mt-3 rounded-lg bg-warning/10 p-3">
									<div class="flex items-start gap-2 text-sm">
										<AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
										<div class="space-y-1">
											<div>
												<span class="text-base-content/50"
													>{m.settings_naming_rename_wouldRenameTo()}:</span
												>
												<code class="mt-0.5 block font-mono text-xs break-all"
													>{item.newRelativePath}</code
												>
											</div>
											{#if item.collisionsWith}
												<p class="text-sm text-warning">
													{m.settings_naming_rename_conflictsWith({
														count: item.collisionsWith.length
													})}
												</p>
											{/if}
										</div>
									</div>
								</div>
							{:else if activeTab === 'alreadyCorrect'}
								<div class="mt-3 rounded-lg bg-success/10 p-3">
									<div class="flex items-center gap-2 text-sm">
										<CheckCircle class="h-4 w-4 shrink-0 text-success" />
										<code class="font-mono text-xs break-all"
											>{item.currentParentPath}/{item.currentRelativePath}</code
										>
									</div>
								</div>
							{:else if activeTab === 'errors'}
								<div class="mt-3 rounded-lg bg-error/10 p-3">
									<div class="flex items-start gap-2 text-sm">
										<FileWarning class="mt-0.5 h-4 w-4 shrink-0 text-error" />
										<div class="space-y-1">
											<code class="font-mono text-xs break-all"
												>{item.currentParentPath}/{item.currentRelativePath}</code
											>
											{#if item.error}
												<p class="text-sm text-error">{item.error}</p>
											{/if}
										</div>
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			{:else}
				<!-- Empty State -->
				<div class="text-center py-16 text-base-content/60">
					{#if activeTab === 'willChange'}
						<div class="flex flex-col items-center gap-3">
							<CheckCircle class="h-12 w-12 text-success" />
							<p class="text-lg font-medium">{m.settings_naming_rename_allMatch()}</p>
							<p class="text-sm">{m.settings_naming_rename_noFilesNeedRenaming()}</p>
						</div>
					{:else if activeTab === 'alreadyCorrect'}
						<div class="flex flex-col items-center gap-3">
							<RotateCcw class="h-12 w-12 text-base-content/30" />
							<p class="text-lg font-medium">{m.settings_naming_rename_noCorrectFiles()}</p>
							<p class="text-sm">{m.settings_naming_rename_checkWillChange()}</p>
						</div>
					{:else if activeTab === 'collisions'}
						<div class="flex flex-col items-center gap-3">
							<CheckCircle class="h-12 w-12 text-success" />
							<p class="text-lg font-medium">{m.settings_naming_rename_noCollisions()}</p>
							<p class="text-sm">{m.settings_naming_rename_allCollisionFree()}</p>
						</div>
					{:else}
						<div class="flex flex-col items-center gap-3">
							<CheckCircle class="h-12 w-12 text-success" />
							<p class="text-lg font-medium">{m.settings_naming_rename_noErrors()}</p>
							<p class="text-sm">{m.settings_naming_rename_allProcessable()}</p>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<!-- No Preview State -->
		<div class="py-20 text-center text-base-content/60">
			<div class="flex flex-col items-center gap-3">
				<RefreshCw class="h-12 w-12" />
				<p class="text-lg font-medium">{m.settings_naming_rename_readyToPreview()}</p>
				<p class="text-sm">{m.settings_naming_rename_clickRefresh()}</p>
			</div>
		</div>
	{/if}
</div>
