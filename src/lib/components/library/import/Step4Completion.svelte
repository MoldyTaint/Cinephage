<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { Check, X } from 'lucide-svelte';

	interface ExecuteResult {
		success: boolean;
		mediaType: 'movie' | 'tv';
		tmdbId: number;
		libraryId: string;
		importedPath: string;
		importedCount?: number;
		importedPaths?: string[];
	}

	let {
		executeError = null,
		executeResult = null,
		bulkImportSummary = null,
		skippedGroupCount = 0,
		remainingGroupCount = 0,
		completionLink = null,
		originLibraryLink = null,
		onTryAgain = () => {},
		onReset = () => {},
		onContinueWithNext = () => {}
	}: {
		executeError: string | null;
		executeResult: ExecuteResult | null;
		bulkImportSummary: { importedGroups: number; failedGroups: number } | null;
		skippedGroupCount: number;
		remainingGroupCount: number;
		completionLink: string | null;
		originLibraryLink: string | null;
		onTryAgain: () => void;
		onReset: () => void;
		onContinueWithNext: () => void;
	} = $props();
</script>

{#if executeError}
	<div class="rounded-xl border border-error/40 bg-error/5 p-5">
		<div class="flex items-start gap-3">
			<div class="mt-0.5 rounded-full bg-error/20 p-2">
				<X class="h-5 w-5 text-error" />
			</div>
			<div class="min-w-0 flex-1">
				<h2 class="text-xl font-semibold">{m.library_import_importFailed()}</h2>
				<p class="mt-1 text-sm text-base-content/80">
					{executeError}
				</p>
				<div class="mt-4 flex flex-wrap gap-2">
					<button class="btn btn-sm btn-primary" onclick={onTryAgain}>
						{m.library_import_tryAgain()}
					</button>
					{#if originLibraryLink}
						<a class="btn btn-outline btn-sm" href={originLibraryLink}
							>{m.library_import_backToLibraryItem()}</a
						>
					{/if}
				</div>
			</div>
		</div>
	</div>
{:else if executeResult}
	<div class="rounded-xl border border-success/40 bg-success/5 p-5">
		<div class="flex items-start gap-3">
			<div class="mt-0.5 rounded-full bg-success/20 p-2">
				<Check class="h-5 w-5 text-success" />
			</div>
			<div class="min-w-0 flex-1">
				<h2 class="text-xl font-semibold">{m.library_import_importComplete()}</h2>
				{#if bulkImportSummary}
					<p class="mt-1 text-sm text-base-content/80">
						{#if bulkImportSummary.failedGroups > 0}
							{m.library_import_bulkImportedWithFailures({
								imported: bulkImportSummary.importedGroups,
								failed: bulkImportSummary.failedGroups
							})}
						{:else}
							{m.library_import_bulkImportedSuccess({
								imported: bulkImportSummary.importedGroups
							})}
						{/if}
					</p>
					{#if skippedGroupCount > 0}
						<p class="mt-1 text-sm text-base-content/70">
							{m.library_import_bulkSkippedItems({ count: skippedGroupCount })}
						</p>
					{/if}
				{:else}
					<p class="mt-1 text-sm text-base-content/80">
						{executeResult.importedCount && executeResult.importedCount > 1
							? m.library_import_filesImportedPlural({ count: executeResult.importedCount })
							: m.library_import_fileImportedSingular()}
					</p>
				{/if}
				<div class="mt-3 rounded-lg bg-base-100 p-3 text-sm break-all">
					<div>
						<span class="text-base-content/60">{m.library_import_importedPathLabel()}</span>
						{executeResult.importedPath}
					</div>
				</div>
				<div class="mt-4 flex flex-wrap gap-2">
					{#if completionLink}
						<a class="btn btn-sm btn-primary" href={completionLink}>
							{bulkImportSummary
								? m.library_import_viewLastImported()
								: m.library_import_viewInLibrary()}
						</a>
					{/if}
					{#if remainingGroupCount > 0}
						<button class="btn btn-outline btn-sm" onclick={onContinueWithNext}>
							{m.library_import_importNextDetected({ count: remainingGroupCount })}
						</button>
					{/if}
					<button class="btn btn-ghost btn-sm" onclick={onReset}
						>{m.library_import_importAnother()}</button
					>
				</div>
			</div>
		</div>
	</div>
{/if}
