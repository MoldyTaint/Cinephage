<script lang="ts">
	import { Archive, ExternalLink, Loader2 } from 'lucide-svelte';
	import { ModalFooter, ModalHeader, ModalWrapper } from '$lib/components/ui/modal';
	import {
		getArchivers,
		archiveMovieFiles,
		archiveSeriesFiles,
		getArchiveJob
	} from '$lib/api/archivers.js';
	import type { ArchiverPublic } from '$lib/server/archivers/types.js';
	import type { MediaArchiveStatus } from '$lib/server/archivers/ArchiveStatusService.js';
	import { formatBytes } from '$lib/utils/format.js';

	export interface ArchiveItem {
		id: string;
		label: string;
		path: string;
		size: number | null;
	}

	interface Props {
		open: boolean;
		mediaType: 'movie' | 'series';
		mediaId: string;
		items: ArchiveItem[];
		archiveStatus?: MediaArchiveStatus | null;
		archiveStatusLoading?: boolean;
		onClose: () => void;
		onArchived: (fileIds: string[], sourcesDeleted: boolean) => void;
	}

	let {
		open,
		mediaType,
		mediaId,
		items,
		archiveStatus = null,
		archiveStatusLoading = false,
		onClose,
		onArchived
	}: Props = $props();
	let archivers = $state<ArchiverPublic[]>([]);
	let archiverId = $state('');
	let selectedIds = $state<string[]>([]);
	let deleteSource = $state(false);
	let createFolder = $state(false);
	let loading = $state(false);
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let progress = $state(0);
	let transferredBytes = $state(0);
	let totalBytes = $state(0);
	let speed = $state(0);
	let eta = $state<number | null>(null);
	let currentFile = $state<string | null>(null);
	let archivePhase = $state<'queued' | 'sending' | 'uploading' | 'completed' | 'failed'>('queued');
	let activeJobId = $state<string | null>(null);
	let trackingWarning = $state<string | null>(null);
	let initializedForOpen = $state(false);
	const allSelected = $derived(items.length > 0 && selectedIds.length === items.length);
	const partiallySelected = $derived(selectedIds.length > 0 && !allSelected);
	const archivedIds = $derived(
		archiveStatus?.archivers.find((archiver) => archiver.archiverId === archiverId)
			?.archivedFileIds ?? []
	);

	$effect(() => {
		if (open && !initializedForOpen) {
			initializedForOpen = true;
			selectedIds = items.map((item) => item.id);
			deleteSource = false;
			createFolder = false;
			progress = 0;
			transferredBytes = 0;
			totalBytes = 0;
			speed = 0;
			eta = null;
			currentFile = null;
			archivePhase = 'queued';
			activeJobId = null;
			trackingWarning = null;
			error = null;
			void loadArchivers();
		} else if (!open) initializedForOpen = false;
	});

	async function loadArchivers() {
		loading = true;
		try {
			const response = await getArchivers(true);
			archivers = response.archivers;
			archiverId = archivers[0]?.id ?? '';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Failed to load archivers';
		} finally {
			loading = false;
		}
	}

	function toggle(id: string, checked: boolean) {
		selectedIds = checked ? [...selectedIds, id] : selectedIds.filter((value) => value !== id);
	}

	function toggleAll(checked: boolean) {
		selectedIds = checked ? items.map((item) => item.id) : [];
	}

	async function submit() {
		if (!archiverId || selectedIds.length === 0) return;
		submitting = true;
		error = null;
		try {
			const input = {
				archiverId,
				fileIds: selectedIds,
				deleteSource,
				createFolder
			};
			const response =
				mediaType === 'movie'
					? await archiveMovieFiles(mediaId, input)
					: await archiveSeriesFiles(mediaId, input);
			activeJobId = response.jobId;
			await waitForJob(response.jobId);
			onArchived(selectedIds, deleteSource);
			onClose();
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : 'Archive failed';
			error = activeJobId ? `${message} (job ${activeJobId})` : message;
		} finally {
			submitting = false;
		}
	}

	async function waitForJob(jobId: string): Promise<void> {
		let consecutiveFetchFailures = 0;
		while (true) {
			let response: Awaited<ReturnType<typeof getArchiveJob>>;
			try {
				response = await getArchiveJob(jobId);
				consecutiveFetchFailures = 0;
				trackingWarning = null;
			} catch (cause) {
				consecutiveFetchFailures += 1;
				const detail = cause instanceof Error ? cause.message : 'Unknown tracking error';
				if (consecutiveFetchFailures >= 5) {
					throw new Error(`Lost connection while tracking the archive: ${detail}`, { cause });
				}
				trackingWarning = `Archive is still running; reconnecting (${consecutiveFetchFailures}/5)…`;
				await new Promise((resolve) => setTimeout(resolve, 2000));
				continue;
			}
			const job = response.job;
			progress = job.progress;
			transferredBytes = job.transferredBytes;
			totalBytes = job.totalBytes;
			speed = job.rcloneStats?.speed ?? 0;
			eta = job.rcloneStats?.eta ?? null;
			currentFile = job.currentFile;
			archivePhase = job.phase;
			if (job.state === 'completed') return;
			if (job.state === 'failed') throw new Error(job.error || 'Archive failed');
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}
</script>

<ModalWrapper {open} maxWidth="lg" {onClose}>
	<ModalHeader title="Archive files" {onClose} />
	<div class="space-y-5 p-6">
		{#if error}<div class="alert text-sm alert-error">{error}</div>{/if}
		{#if trackingWarning}<div class="alert text-sm alert-warning">{trackingWarning}</div>{/if}
		{#if loading}<div class="flex justify-center p-8">
				<Loader2 class="animate-spin" />
			</div>
		{:else if archivers.length === 0}
			<div class="rounded-lg border border-dashed p-6 text-center">
				<Archive class="mx-auto mb-2 opacity-40" />
				<p class="font-medium">No enabled archiver is configured.</p>
				<a class="btn mt-4 gap-2 btn-primary btn-sm" href="/settings/integrations/archivers"
					>Open Archiver settings <ExternalLink size={14} /></a
				>
			</div>
		{:else}
			{#if submitting}
				<div class="rounded-lg border border-primary/20 bg-primary/5 p-4">
					<div class="mb-2 flex items-center justify-between text-sm">
						<span class="min-w-0 truncate">{currentFile ?? 'Preparing archive…'}</span><span
							class="font-medium">{progress}%</span
						>
					</div>
					<div class="mb-2 text-xs text-base-content/60">
						{archivePhase === 'uploading'
							? 'Uploading to archive storage…'
							: archivePhase === 'sending'
								? 'Sending file to rclone…'
								: 'Preparing archive…'}
					</div>
					<progress class="progress w-full progress-primary" value={progress} max="100"></progress>
					<div class="mt-2 flex justify-between text-xs text-base-content/60">
						<span>{formatBytes(transferredBytes)} / {formatBytes(totalBytes)}</span><span
							>{#if speed > 0}{formatBytes(speed)}/s{/if}{#if eta != null}
								· ETA {Math.max(0, Math.round(eta))}s{/if}</span
						>
					</div>
					{#if activeJobId}<div class="mt-1 text-[10px] text-base-content/40">
							Job: {activeJobId}
						</div>{/if}
				</div>
			{/if}
			<label class="form-control"
				><span class="label-text mb-1">Archive with</span><select
					class="select-bordered select"
					bind:value={archiverId}
					>{#each archivers as archiver (archiver.id)}<option value={archiver.id}
							>{archiver.name} — {archiver.remote}:{archiver.basePath}</option
						>{/each}</select
				></label
			>
			<div>
				<div class="mb-2 flex items-center justify-between">
					<label class="flex cursor-pointer items-center gap-2">
						<input
							class="checkbox checkbox-sm"
							type="checkbox"
							checked={allSelected}
							indeterminate={partiallySelected}
							onchange={(event) => toggleAll(event.currentTarget.checked)}
						/>
						<span class="font-medium">Files</span>
					</label>
					<span class="text-xs text-base-content/60">
						{#if archiveStatusLoading}<Loader2 class="inline size-3 animate-spin" />{/if}
						{selectedIds.length} selected
					</span>
				</div>
				<div
					class="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-base-content/10 p-2"
				>
					{#each items as item (item.id)}
						<label class="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-base-200"
							><input
								class="checkbox mt-0.5 checkbox-sm"
								type="checkbox"
								checked={selectedIds.includes(item.id)}
								onchange={(event) => toggle(item.id, event.currentTarget.checked)}
							/><span class="min-w-0 flex-1"
								><span class="flex items-center gap-2 text-sm font-medium"
									><span>{item.label}</span>{#if archivedIds.includes(item.id)}<span
											class="badge badge-sm badge-success">Archived</span
										>{/if}</span
								><span class="block truncate text-xs text-base-content/50">{item.path}</span></span
							>{#if item.size != null}<span class="text-xs text-base-content/60"
									>{formatBytes(item.size)}</span
								>{/if}</label
						>
					{/each}
				</div>
			</div>
			<label class="label cursor-pointer justify-start gap-3"
				><input class="checkbox checkbox-sm" type="checkbox" bind:checked={createFolder} /><span
					><span class="block text-sm font-medium"
						>{mediaType === 'movie'
							? 'Create a directory from the movie title'
							: 'Create series and season directories'}</span
					><span class="text-xs text-base-content/50"
						>{mediaType === 'movie'
							? 'All selected quality versions are placed in the same movie directory.'
							: 'Files are placed under Series title / Season XX.'}</span
					></span
				></label
			>
			<label class="label cursor-pointer justify-start gap-3"
				><input
					class="checkbox checkbox-sm checkbox-error"
					type="checkbox"
					bind:checked={deleteSource}
				/><span
					><span class="block text-sm font-medium">Delete source files after upload</span><span
						class="text-xs text-warning"
						>Sources are deleted only after every selected upload succeeds.</span
					></span
				></label
			>
		{/if}
	</div>
	<ModalFooter
		onCancel={onClose}
		onSave={submit}
		saving={submitting}
		saveDisabled={loading || !archiverId || selectedIds.length === 0}
		saveLabel="Archive"
	/>
</ModalWrapper>
