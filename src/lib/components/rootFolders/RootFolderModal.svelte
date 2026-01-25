<script lang="ts">
	import { X, Loader2, CheckCircle2, XCircle, FolderOpen, Info } from 'lucide-svelte';
	import type {
		RootFolder,
		RootFolderFormData,
		PathValidationResult
	} from '$lib/types/downloadClient';
	import { FolderBrowser } from '$lib/components/library';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';

	interface Props {
		open: boolean;
		mode: 'add' | 'edit';
		folder?: RootFolder | null;
		saving: boolean;
		error?: string | null;
		onClose: () => void;
		onSave: (data: RootFolderFormData) => void;
		onDelete?: () => void;
		onValidatePath: (path: string, readOnly?: boolean) => Promise<PathValidationResult>;
	}

	let {
		open,
		mode,
		folder = null,
		saving,
		error = null,
		onClose,
		onSave,
		onDelete,
		onValidatePath
	}: Props = $props();

	// Form state (defaults only, effect syncs from props)
	let name = $state('');
	let path = $state('');
	let mediaType = $state<'movie' | 'tv'>('movie');
	let isDefault = $state(false);
	let readOnly = $state(false);
	let preserveSymlinks = $state(false);
	let defaultMonitored = $state(true);

	// UI state
	let validating = $state(false);
	let validationResult = $state<PathValidationResult | null>(null);
	let showFolderBrowser = $state(false);

	// Derived
	const modalTitle = $derived(mode === 'add' ? 'Add Root Folder' : 'Edit Root Folder');

	// Reset form when modal opens or folder changes
	$effect(() => {
		if (open) {
			name = folder?.name ?? '';
			path = folder?.path ?? '';
			mediaType = folder?.mediaType ?? 'movie';
			isDefault = folder?.isDefault ?? false;
			readOnly = folder?.readOnly ?? false;
			preserveSymlinks = folder?.preserveSymlinks ?? false;
			defaultMonitored = folder?.defaultMonitored ?? true;
			validationResult = null;
			showFolderBrowser = false;
		}
	});

	function getFormData(): RootFolderFormData {
		return {
			name,
			path,
			mediaType,
			isDefault,
			readOnly,
			preserveSymlinks,
			defaultMonitored
		};
	}

	async function handleValidatePath() {
		if (!path) return;

		validating = true;
		validationResult = null;
		try {
			validationResult = await onValidatePath(path, readOnly);
		} finally {
			validating = false;
		}
	}

	function handleSave() {
		onSave(getFormData());
	}

	function handleFolderSelect(selectedPath: string) {
		path = selectedPath;
		showFolderBrowser = false;
		// Auto-validate after selection
		handleValidatePath();
	}
</script>

<ModalWrapper {open} {onClose} maxWidth="2xl" labelledBy="root-folder-modal-title">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<h3 id="root-folder-modal-title" class="text-xl font-bold">{modalTitle}</h3>
		<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
			<X class="h-4 w-4" />
		</button>
	</div>

	<!-- Folder Browser -->
	{#if showFolderBrowser}
		<FolderBrowser
			value={path || '/'}
			onSelect={handleFolderSelect}
			onCancel={() => (showFolderBrowser = false)}
		/>
	{:else}
		<!-- Form -->
		<div class="space-y-4">
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
				<div class="form-control">
					<label class="label py-1" for="name">
						<span class="label-text">Name</span>
					</label>
					<input
						id="name"
						type="text"
						class="input-bordered input input-sm"
						bind:value={name}
						placeholder="Movies Library"
					/>
				</div>

				<div class="form-control">
					<label class="label py-1" for="mediaType">
						<span class="label-text">Media Type</span>
					</label>
					<select id="mediaType" class="select-bordered select select-sm" bind:value={mediaType}>
						<option value="movie">Movies</option>
						<option value="tv">TV Shows</option>
					</select>
				</div>
			</div>

			<div class="form-control">
				<label class="label py-1" for="path">
					<span class="label-text">Path</span>
				</label>
				<div class="flex gap-2">
					<div class="join flex-1">
						<input
							id="path"
							type="text"
							class="input-bordered input input-sm join-item flex-1"
							bind:value={path}
							placeholder="/mnt/media/movies"
						/>
						<button
							type="button"
							class="btn join-item border border-base-300 btn-ghost btn-sm"
							onclick={() => (showFolderBrowser = true)}
							title="Browse folders"
						>
							<FolderOpen class="h-4 w-4" />
						</button>
					</div>
					<button
						class="btn btn-ghost btn-sm"
						onclick={handleValidatePath}
						disabled={validating || !path}
					>
						{#if validating}
							<Loader2 class="h-4 w-4 animate-spin" />
						{/if}
						Validate
					</button>
				</div>
				<div class="label py-1">
					<span class="label-text-alt text-xs">
						The folder path where your media library is stored
					</span>
				</div>
			</div>

			<label class="flex cursor-pointer items-center gap-3 py-2">
				<input type="checkbox" class="checkbox shrink-0 checkbox-sm" bind:checked={isDefault} />
				<span class="text-sm"
					>Set as default for {mediaType === 'movie' ? 'movies' : 'TV shows'}</span
				>
			</label>

			<label class="flex cursor-pointer items-center gap-3 py-2">
				<input type="checkbox" class="checkbox shrink-0 checkbox-sm" bind:checked={readOnly} />
				<span class="text-sm">Read-only folder (catalog only, no imports)</span>
			</label>

			<label class="flex cursor-pointer items-center gap-3 py-2">
				<input
					type="checkbox"
					class="checkbox shrink-0 checkbox-sm"
					bind:checked={preserveSymlinks}
				/>
				<span class="text-sm">Preserve symlinks (for NZBDav/rclone mounts)</span>
			</label>

			<label class="flex cursor-pointer items-center gap-3 py-2">
				<input
					type="checkbox"
					class="checkbox shrink-0 checkbox-sm"
					bind:checked={defaultMonitored}
				/>
				<span class="min-w-0 text-sm">Monitor new content</span>
				<span
					class="tooltip tooltip-right shrink-0"
					data-tip="When off, content added by library scan or manual match will be unmonitored (no auto-download of missing episodes/seasons)."
					onclick={(e) => e.stopPropagation()}
					role="img"
					aria-label="More information"
				>
					<Info class="h-3.5 w-3.5 shrink-0 cursor-help text-base-content/50" />
				</span>
			</label>

			{#if preserveSymlinks}
				<div class="alert alert-info">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						class="h-6 w-6 shrink-0 stroke-current"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						></path>
					</svg>
					<div>
						<div class="font-medium">Symlink preservation enabled</div>
						<div class="text-sm opacity-80">
							Symlinks will be recreated at the destination instead of copying file contents. This
							is useful when the source folder contains symlinks to files on network mounts (NZBDav,
							rclone).
						</div>
					</div>
				</div>
			{/if}

			{#if readOnly}
				<div class="alert alert-info">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						class="h-6 w-6 shrink-0 stroke-current"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						></path>
					</svg>
					<div>
						<div class="font-medium">Read-only mode enabled</div>
						<div class="text-sm opacity-80">
							This folder will be used for cataloging existing content only. Imports and new media
							will not be written to this folder. Useful for virtual mounts like NZBDav.
						</div>
					</div>
				</div>
			{/if}

			<!-- Save Error -->
			{#if error}
				<div class="alert alert-error">
					<XCircle class="h-5 w-5" />
					<div>
						<div class="font-medium">Failed to save</div>
						<div class="text-sm opacity-80">{error}</div>
					</div>
				</div>
			{/if}

			<!-- Validation Result -->
			{#if validationResult}
				<div class="alert {validationResult.valid ? 'alert-success' : 'alert-error'}">
					{#if validationResult.valid}
						<CheckCircle2 class="h-5 w-5" />
						<div>
							<div class="font-medium">
								{readOnly ? 'Path is readable' : 'Path is valid'}
							</div>
							{#if validationResult.freeSpaceFormatted}
								<div class="text-sm opacity-80">
									Free space: {validationResult.freeSpaceFormatted}
								</div>
							{:else if readOnly}
								<div class="text-sm opacity-80">Free space: N/A (read-only)</div>
							{/if}
						</div>
					{:else}
						<XCircle class="h-5 w-5" />
						<div>
							<div class="font-medium">Path validation failed</div>
							<div class="text-sm opacity-80">{validationResult.error}</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Actions -->
		<div class="modal-action">
			{#if mode === 'edit' && onDelete}
				<button class="btn mr-auto btn-outline btn-error" onclick={onDelete}>Delete</button>
			{/if}

			<button class="btn btn-ghost" onclick={onClose}>Cancel</button>

			<button class="btn btn-primary" onclick={handleSave} disabled={saving || !path || !name}>
				{#if saving}
					<Loader2 class="h-4 w-4 animate-spin" />
				{/if}
				Save
			</button>
		</div>
	{/if}
</ModalWrapper>
