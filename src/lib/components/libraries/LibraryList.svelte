<script lang="ts">
	import { Film, Tv, Settings, Trash2 } from 'lucide-svelte';
	import type { PageData } from '../../../routes/settings/general/$types';

	type LibraryRootFolder = {
		id: string;
		name: string;
		path?: string;
	};

	type LibraryEntity = PageData['libraries'][number] & {
		rootFolders?: LibraryRootFolder[];
	};

	type StorageBreakdownItem = {
		id: string;
		usedBytes: number;
		itemCount: number;
	};

	interface Props {
		libraries: LibraryEntity[];
		storageBreakdown: StorageBreakdownItem[];
		onEdit: (library: LibraryEntity) => void;
		onDelete: (library: LibraryEntity) => void;
		formatBytes: (value: number) => string;
	}

	let { libraries, storageBreakdown, onEdit, onDelete, formatBytes }: Props = $props();

	type LibrarySection = {
		id: 'movie' | 'tv';
		title: string;
		icon: typeof Film;
		sectionClasses: string;
		cardClasses: string;
		libraries: LibraryEntity[];
	};

	function getStorageEntry(libraryId: string): StorageBreakdownItem | undefined {
		return storageBreakdown.find((item) => item.id === libraryId);
	}

	function formatRootFolderSummary(rootFolders: LibraryRootFolder[] | undefined) {
		if (!rootFolders || rootFolders.length === 0) return 'No root folders assigned';
		const names = rootFolders.map((folder) => folder.name);
		if (names.length <= 2) return names.join(', ');
		return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
	}

	const sections = $derived(
		[
			{
				id: 'movie',
				title: 'Movie Libraries',
				icon: Film,
				sectionClasses: 'bg-primary/15 text-primary',
				cardClasses: 'bg-primary/20 text-primary',
				libraries: libraries.filter((library) => library.mediaType === 'movie')
			},
			{
				id: 'tv',
				title: 'TV Libraries',
				icon: Tv,
				sectionClasses: 'bg-secondary/15 text-secondary',
				cardClasses: 'bg-secondary/20 text-secondary',
				libraries: libraries.filter((library) => library.mediaType === 'tv')
			}
		].filter((section) => section.libraries.length > 0) as LibrarySection[]
	);
</script>

{#if libraries.length === 0}
	<div class="rounded-lg border border-dashed border-base-300 p-6 text-sm text-base-content/60">
		No libraries configured.
	</div>
{:else}
	<div class="space-y-6">
		{#each sections as section (section.id)}
			<section class="space-y-3">
				<div class="flex items-start gap-3">
					<div class="mt-0.5 rounded-lg p-2 {section.sectionClasses}">
						<section.icon class="h-4 w-4" />
					</div>
					<div class="min-w-0">
						<h3 class="font-semibold">{section.title}</h3>
					</div>
				</div>

				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					{#each section.libraries as library (library.id)}
						{@const usage = getStorageEntry(library.id)}
						<div class="card bg-base-200 shadow-sm">
							<div class="card-body p-4">
								<div class="flex items-start justify-between gap-3">
									<div class="flex min-w-0 items-center gap-3">
										<div class="rounded-lg p-2 {section.cardClasses}">
											<section.icon class="h-5 w-5" />
										</div>
										<div class="min-w-0">
											<h4 class="flex flex-wrap items-center gap-2">
												<span class="font-semibold">{library.name}</span>
												{#if library.isSystem}
													<span class="badge badge-outline badge-sm">System</span>
												{/if}
												{#if library.mediaSubType === 'anime'}
													<span class="badge badge-sm badge-accent">Anime</span>
												{/if}
											</h4>
											<p class="text-sm text-base-content/60">
												Root folders:
												{formatRootFolderSummary(library.rootFolders)}
											</p>
											<p class="text-xs text-base-content/50">
												{usage?.itemCount ?? 0} items • {formatBytes(usage?.usedBytes ?? 0)}
											</p>
										</div>
									</div>

									<div class="flex gap-1">
										<button
											class="btn btn-square btn-ghost btn-sm"
											onclick={() => onEdit(library)}
											title="Edit"
										>
											<Settings class="h-4 w-4" />
										</button>
										{#if !library.isSystem}
											<button
												class="btn btn-square text-error btn-ghost btn-sm"
												onclick={() => onDelete(library)}
												title="Delete"
											>
												<Trash2 class="h-4 w-4" />
											</button>
										{/if}
									</div>
								</div>

								<div class="mt-3 grid gap-2 border-t border-base-300 pt-3 text-sm sm:grid-cols-3">
									<div class="font-semibold">
										Monitored:
										<span class={library.defaultMonitored ? 'text-success' : 'text-error'}>
											{library.defaultMonitored ? ' Yes' : ' No'}
										</span>
									</div>
									<div class="font-semibold">
										Search on add:
										<span class={library.defaultSearchOnAdd ? 'text-success' : 'text-error'}>
											{library.defaultSearchOnAdd ? ' Yes' : ' No'}
										</span>
									</div>
									<div class="font-semibold">
										Subtitles:
										<span class={library.defaultWantsSubtitles ? 'text-success' : 'text-error'}>
											{library.defaultWantsSubtitles ? ' Yes' : ' No'}
										</span>
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/each}
	</div>
{/if}
