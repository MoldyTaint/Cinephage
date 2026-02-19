<script lang="ts">
	import { Folder, Settings, Trash2, Film, Tv, AlertCircle, Star, Eye } from 'lucide-svelte';
	import type { RootFolder } from '$lib/types/downloadClient';

	interface Props {
		folders: RootFolder[];
		onEdit: (folder: RootFolder) => void;
		onDelete: (folder: RootFolder) => void;
	}

	let { folders, onEdit, onDelete }: Props = $props();
</script>

{#if folders.length === 0}
	<div class="py-12 text-center text-base-content/60">
		<Folder class="mx-auto mb-4 h-12 w-12 opacity-40" />
		<p class="text-lg font-medium">No root folders configured</p>
		<p class="mt-1 text-sm">Add root folders to define where your media libraries are stored</p>
	</div>
{:else}
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		{#each folders as folder (folder.id)}
			<div class="card bg-base-200 shadow-sm">
				<div class="card-body p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="flex min-w-0 items-center gap-3">
							<div
								class="rounded-lg p-2 {folder.mediaType === 'movie'
									? 'bg-primary/20 text-primary'
									: 'bg-secondary/20 text-secondary'}"
							>
								{#if folder.mediaType === 'movie'}
									<Film class="h-5 w-5" />
								{:else}
									<Tv class="h-5 w-5" />
								{/if}
							</div>
							<div class="min-w-0">
								<h3 class="flex items-center gap-2 font-semibold">
									{folder.name}
									{#if folder.isDefault}
										<Star class="h-4 w-4 fill-warning text-warning" />
									{/if}
									{#if folder.readOnly}
										<span
											class="badge gap-1 badge-outline badge-sm"
											title="Read-only folder (catalog only)"
										>
											<Eye class="h-3 w-3" />
											Read-only
										</span>
									{/if}
								</h3>
								<p class="max-w-full font-mono text-sm break-all text-base-content/60">
									{folder.path}
								</p>
							</div>
						</div>

						<div class="flex gap-1">
							<button
								class="btn btn-square btn-ghost btn-sm"
								onclick={() => onEdit(folder)}
								title="Edit"
							>
								<Settings class="h-4 w-4" />
							</button>
							<button
								class="btn btn-square text-error btn-ghost btn-sm"
								onclick={() => onDelete(folder)}
								title="Delete"
							>
								<Trash2 class="h-4 w-4" />
							</button>
						</div>
					</div>

					<div class="mt-3 border-t border-base-300 pt-3">
						{#if !folder.accessible}
							<div class="flex items-center gap-2 text-sm text-error">
								<AlertCircle class="h-4 w-4" />
								<span>Path not accessible</span>
							</div>
						{:else}
							<div class="flex items-center justify-between text-sm">
								<span class="text-base-content/60">Free Space</span>
								{#if folder.readOnly}
									<span class="text-base-content/60">N/A</span>
								{:else if folder.freeSpaceFormatted}
									<span class="font-medium">{folder.freeSpaceFormatted}</span>
								{:else}
									<span class="text-base-content/60">Unknown</span>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}
