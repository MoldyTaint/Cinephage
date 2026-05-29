<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import {
		ArrowUp,
		Check,
		ChevronRight,
		FileVideo,
		Folder,
		Home,
		Loader2,
		Sparkles
	} from 'lucide-svelte';

	type MediaType = 'movie' | 'tv';

	interface BrowseEntry {
		name: string;
		path: string;
		isDirectory: boolean;
		size?: number;
	}

	let {
		preferredMediaType = $bindable('auto'),
		sourcePath = $bindable('/'),
		browserPath = '/',
		browserParentPath = null,
		browserEntries = [],
		browserLoading = false,
		browserError = null,
		detecting = false,
		isMediaTypeLockedByContext = false,
		isFileOnlyContext = false,
		onBrowse = (_path?: string) => {},
		onDetect = () => {}
	}: {
		preferredMediaType: 'auto' | MediaType;
		sourcePath: string;
		browserPath: string;
		browserParentPath: string | null;
		browserEntries: BrowseEntry[];
		browserLoading: boolean;
		browserError: string | null;
		detecting: boolean;
		isMediaTypeLockedByContext: boolean;
		isFileOnlyContext: boolean;
		onBrowse: (path?: string) => void;
		onDetect: () => void;
	} = $props();

	function formatSize(bytes?: number) {
		if (!bytes) return '';
		const gb = bytes / (1024 * 1024 * 1024);
		if (gb >= 1) {
			return `${gb.toFixed(2)} GB`;
		}
		const mb = bytes / (1024 * 1024);
		return `${mb.toFixed(1)} MB`;
	}
</script>

<div class="rounded-xl border border-base-300 bg-base-100 p-4 sm:p-5">
	<div class="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-start">
		<label class="form-control">
			<span class="label-text text-sm font-medium">{m.library_import_mediaTypeLabel()}</span>
			<select
				class="select-bordered select w-full"
				bind:value={preferredMediaType}
				disabled={isMediaTypeLockedByContext}
			>
				<option value="auto">{m.library_import_autoDetect()}</option>
				<option value="movie">{m.common_movie()}</option>
				<option value="tv">{m.ui_mediaType_tv()}</option>
			</select>
		</label>

		<label class="form-control">
			<span class="label-text text-sm font-medium">{m.library_import_sourcePathLabel()}</span>
			<span class="text-xs text-base-content/60 md:col-span-2 md:col-start-2">
				{#if isFileOnlyContext}
					{m.library_import_sourcePathHintFile()}
				{:else}
					{m.library_import_sourcePathHintGeneral()}
				{/if}</span
			>
			<input
				class="input-bordered input w-full"
				placeholder={m.library_import_sourcePathPlaceholder()}
				bind:value={sourcePath}
			/>
		</label>

		<div class="md:self-end">
			<span class="label-text invisible hidden text-sm font-medium md:block"
				>{m.library_import_detectMedia()}</span
			>
			<button
				type="button"
				class="btn w-full btn-primary md:w-auto"
				onclick={onDetect}
				disabled={detecting}
			>
				{#if detecting}
					<Loader2 class="h-4 w-4 animate-spin" />
					{m.library_import_detecting()}
				{:else}
					<Sparkles class="h-4 w-4" />
					{m.library_import_detectMedia()}
				{/if}
			</button>
		</div>
	</div>

	<div class="mt-4 overflow-hidden rounded-lg border border-base-300">
		<div class="flex items-center gap-2 border-b border-base-300 bg-base-200 p-3">
			<button
				type="button"
				class="btn btn-square btn-ghost btn-sm"
				onclick={() => onBrowse('/')}
				title={m.library_import_goToRoot()}
			>
				<Home class="h-4 w-4" />
			</button>
			<button
				class="btn btn-square btn-ghost btn-sm"
				disabled={!browserParentPath}
				onclick={() => browserParentPath && onBrowse(browserParentPath)}
			>
				<ArrowUp class="h-4 w-4" />
			</button>
			<div class="min-w-0 flex-1 truncate rounded bg-base-100 px-2 py-1 font-mono text-sm">
				{browserPath}
			</div>
			{#if !isFileOnlyContext}
				<button class="btn btn-outline btn-xs" onclick={() => (sourcePath = browserPath)}>
					{m.library_import_useFolder()}
				</button>
			{/if}
		</div>

		<div class="max-h-80 overflow-y-auto p-2">
			{#if browserLoading}
				<div class="flex items-center justify-center py-8">
					<Loader2 class="h-5 w-5 animate-spin text-base-content/60" />
				</div>
			{:else if browserError}
				<div class="alert text-sm alert-error">
					<span>{browserError}</span>
				</div>
			{:else if browserEntries.length === 0}
				<div class="py-6 text-center text-sm text-base-content/60">
					{m.library_import_noFoldersOrFiles()}
				</div>
			{:else}
				<div class="space-y-1">
					{#each browserEntries as entry (entry.path)}
						<button
							type="button"
							class="flex w-full items-center gap-2 rounded px-2 py-2 text-left transition-colors hover:bg-base-200"
							onclick={() => (entry.isDirectory ? onBrowse(entry.path) : (sourcePath = entry.path))}
						>
							{#if entry.isDirectory}
								<Folder class="h-4 w-4 shrink-0 text-warning" />
							{:else}
								<FileVideo class="h-4 w-4 shrink-0 text-info" />
							{/if}
							<div class="min-w-0 flex-1">
								<div class="truncate text-sm font-medium">{entry.name}</div>
								{#if !entry.isDirectory}
									<div class="text-xs text-base-content/60">{formatSize(entry.size)}</div>
								{/if}
							</div>
							{#if sourcePath === entry.path}
								<Check class="h-4 w-4 text-success" />
							{/if}
							{#if entry.isDirectory}
								<ChevronRight class="h-4 w-4 text-base-content/40" />
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
