<script lang="ts">
	import { Folder, ChevronUp, Loader2, Home, Check } from 'lucide-svelte';

	interface DirectoryEntry {
		name: string;
		path: string;
		isDirectory: boolean;
	}

	interface Props {
		value: string;
		onSelect: (path: string) => void;
		onCancel: () => void;
	}

	let { value, onSelect, onCancel }: Props = $props();

	// Initialize with defaults, effect syncs from props
	let currentPath = $state('/');
	let entries = $state<DirectoryEntry[]>([]);
	let parentPath = $state<string | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function browse(path: string) {
		loading = true;
		error = null;

		try {
			const response = await fetch(`/api/filesystem/browse?path=${encodeURIComponent(path)}`);
			const data = await response.json();

			if (data.error) {
				error = data.error;
			}

			currentPath = data.currentPath;
			parentPath = data.parentPath;
			entries = data.entries || [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to browse directory';
		} finally {
			loading = false;
		}
	}

	function handleSelect() {
		onSelect(currentPath);
	}

	function navigateTo(path: string) {
		browse(path);
	}

	function goUp() {
		if (parentPath) {
			browse(parentPath);
		}
	}

	function goHome() {
		browse('/');
	}

	// Initial load
	$effect(() => {
		browse(value || '/');
	});
</script>

<div class="flex h-96 flex-col rounded-lg border border-base-300 bg-base-100">
	<!-- Header with current path -->
	<div class="flex items-center gap-2 border-b border-base-300 bg-base-200 p-3">
		<button
			type="button"
			class="btn btn-square btn-ghost btn-sm"
			onclick={goHome}
			title="Go to root"
		>
			<Home class="h-4 w-4" />
		</button>
		<button
			type="button"
			class="btn btn-square btn-ghost btn-sm"
			onclick={goUp}
			disabled={!parentPath}
			title="Go up"
		>
			<ChevronUp class="h-4 w-4" />
		</button>
		<div class="flex-1 truncate rounded bg-base-100 px-2 py-1 font-mono text-sm">
			{currentPath}
		</div>
	</div>

	<!-- Directory listing -->
	<div class="flex-1 overflow-y-auto p-2">
		{#if loading}
			<div class="flex h-full items-center justify-center">
				<Loader2 class="h-6 w-6 animate-spin text-base-content/50" />
			</div>
		{:else if error}
			<div class="alert text-sm alert-error">
				<span>{error}</span>
			</div>
		{:else if entries.length === 0}
			<div class="flex h-full items-center justify-center text-base-content/50">
				<span>No subdirectories</span>
			</div>
		{:else}
			<div class="space-y-1">
				{#each entries as entry (entry.path)}
					<button
						type="button"
						class="flex w-full items-center gap-2 rounded px-3 py-2 text-left transition-colors hover:bg-base-200"
						ondblclick={() => navigateTo(entry.path)}
						onclick={() => navigateTo(entry.path)}
					>
						<Folder class="h-4 w-4 shrink-0 text-warning" />
						<span class="truncate">{entry.name}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Footer with actions -->
	<div
		class="flex flex-col gap-2 border-t border-base-300 bg-base-200 p-3 sm:flex-row sm:items-center sm:justify-between"
	>
		<div class="text-sm text-base-content/60">
			Double-click to enter, select current folder below
		</div>
		<div class="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
			<button type="button" class="btn btn-ghost btn-sm" onclick={onCancel}> Cancel </button>
			<button type="button" class="btn gap-1 btn-sm btn-primary" onclick={handleSelect}>
				<Check class="h-4 w-4" />
				Select This Folder
			</button>
		</div>
	</div>
</div>
