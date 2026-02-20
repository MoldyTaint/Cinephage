<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { LibraryMovie, LibrarySeries } from '$lib/types/library';
	import {
		CheckCircle2,
		XCircle,
		Eye,
		EyeOff,
		Search,
		Trash2,
		Clapperboard,
		Tv,
		ArrowUpDown,
		ArrowUp,
		ArrowDown,
		MoreVertical,
		Zap,
		MousePointerClick
	} from 'lucide-svelte';
	import { resolvePath } from '$lib/utils/routing';
	import { formatBytes } from '$lib/utils/format';
	import type { MediaType } from '$lib/utils/media-type';

	interface Props {
		items: (LibraryMovie | LibrarySeries)[];
		mediaType: MediaType;
		selectedItems: SvelteSet<string>;
		selectable: boolean;
		sortField?: string;
		sortDirection?: 'asc' | 'desc';
		onSort?: (field: string) => void;
		onSelectChange?: (id: string, selected: boolean) => void;
		onSearch?: (id: string) => void;
		onMonitorToggle?: (id: string, monitored: boolean) => void;
		onDelete?: (id: string) => void;
		onAutoGrab?: (id: string) => void;
		onManualGrab?: (id: string) => void;
	}

	let {
		items,
		mediaType,
		selectedItems,
		selectable,
		sortField = 'title',
		sortDirection = 'asc',
		onSort,
		onSelectChange,
		onSearch,
		onMonitorToggle,
		onDelete,
		onAutoGrab,
		onManualGrab
	}: Props = $props();

	// Track loading states for actions
	let actionLoadingRows = new SvelteSet<string>();

	const isTv = $derived(mediaType === 'tv');

	function handleSort(field: string) {
		if (onSort) {
			onSort(field);
		}
	}

	function getSortIcon(field: string) {
		if (sortField !== field) return ArrowUpDown;
		return sortDirection === 'asc' ? ArrowUp : ArrowDown;
	}

	function handleSelectChange(id: string, checked: boolean) {
		if (onSelectChange) {
			onSelectChange(id, checked);
		}
	}

	async function handleSearch(id: string) {
		if (!onSearch || actionLoadingRows.has(id)) return;
		actionLoadingRows.add(id);
		try {
			await onSearch(id);
		} finally {
			actionLoadingRows.delete(id);
		}
	}

	async function handleMonitorToggle(id: string, currentMonitored: boolean) {
		if (!onMonitorToggle || actionLoadingRows.has(id)) return;
		actionLoadingRows.add(id);
		try {
			await onMonitorToggle(id, !currentMonitored);
		} finally {
			actionLoadingRows.delete(id);
		}
	}

	async function handleDelete(id: string) {
		if (!onDelete || actionLoadingRows.has(id)) return;
		actionLoadingRows.add(id);
		try {
			await onDelete(id);
		} finally {
			actionLoadingRows.delete(id);
		}
	}

	async function handleAutoGrab(id: string) {
		if (!onAutoGrab || actionLoadingRows.has(id)) return;
		actionLoadingRows.add(id);
		try {
			await onAutoGrab(id);
		} finally {
			actionLoadingRows.delete(id);
		}
	}

	async function handleManualGrab(id: string) {
		if (!onManualGrab || actionLoadingRows.has(id)) return;
		actionLoadingRows.add(id);
		try {
			await onManualGrab(id);
		} finally {
			actionLoadingRows.delete(id);
		}
	}

	function isMovie(item: LibraryMovie | LibrarySeries): item is LibraryMovie {
		return 'hasFile' in item;
	}

	function isSeries(item: LibraryMovie | LibrarySeries): item is LibrarySeries {
		return 'episodeCount' in item;
	}

	function getItemSize(item: LibraryMovie | LibrarySeries): number {
		if (isMovie(item)) {
			return item.files.reduce((sum, f) => sum + (f.size ?? 0), 0);
		}
		return 0; // Series size would need to be calculated from episodes
	}

	function getQualityBadges(
		item: LibraryMovie | LibrarySeries
	): Array<{ label: string; type: string }> {
		const badges: Array<{ label: string; type: string }> = [];

		if (isMovie(item) && item.files.length > 0) {
			const file = item.files[0];
			if (file.quality?.resolution) {
				badges.push({ label: file.quality.resolution, type: 'resolution' });
			}
			if (file.quality?.source) {
				badges.push({ label: file.quality.source, type: 'source' });
			}
			if (file.mediaInfo?.videoCodec) {
				badges.push({ label: file.mediaInfo.videoCodec, type: 'codec' });
			}
			if (file.mediaInfo?.hdrFormat) {
				badges.push({ label: file.mediaInfo.hdrFormat, type: 'hdr' });
			}
		}

		return badges;
	}

	function getPosterUrl(item: LibraryMovie | LibrarySeries): string {
		if (item.posterPath) {
			return `https://image.tmdb.org/t/p/w92${item.posterPath}`;
		}
		return '';
	}
</script>

{#if items.length === 0}
	<div class="py-12 text-center text-base-content/60">
		{#if mediaType === 'movie'}
			<Clapperboard class="mx-auto mb-4 h-12 w-12 opacity-40" />
		{:else}
			<Tv class="mx-auto mb-4 h-12 w-12 opacity-40" />
		{/if}
		<p class="text-lg font-medium">No items found</p>
	</div>
{:else}
	<!-- Mobile: Card View -->
	<div class="space-y-3 lg:hidden">
		{#each items as item (item.id)}
			{@const isItemMovie = isMovie(item)}
			{@const size = getItemSize(item)}
			{@const qualityBadges = getQualityBadges(item)}
			{@const isLoading = actionLoadingRows.has(item.id)}
			<div class="rounded-xl bg-base-200 p-4">
				<!-- Header: Checkbox + Status -->
				<div class="flex items-start justify-between gap-2">
					{#if selectable}
						<input
							type="checkbox"
							class="checkbox checkbox-sm"
							checked={selectedItems.has(item.id)}
							onchange={(e) => handleSelectChange(item.id, e.currentTarget.checked)}
						/>
					{/if}
					<div class="flex flex-1 flex-wrap items-center gap-2">
						{#if item.monitored}
							<span class="badge gap-1.5 badge-sm badge-info">
								<Eye class="h-3.5 w-3.5" />
								Monitored
							</span>
						{:else}
							<span class="badge gap-1.5 badge-ghost badge-sm">
								<EyeOff class="h-3.5 w-3.5" />
								Not Monitored
							</span>
						{/if}
						{#if isItemMovie}
							{#if item.hasFile}
								<span class="badge gap-1.5 badge-sm badge-success">
									<CheckCircle2 class="h-3.5 w-3.5" />
									Has File
								</span>
							{:else}
								<span class="badge gap-1.5 badge-sm badge-warning">
									<XCircle class="h-3.5 w-3.5" />
									Missing
								</span>
							{/if}
						{/if}
					</div>
				</div>

				<!-- Title and Poster -->
				<div class="mt-3 flex items-start gap-3">
					{#if item.posterPath}
						<a href={resolvePath(`/library/${mediaType}/${item.id}`)} class="shrink-0">
							<img
								src={getPosterUrl(item)}
								alt={item.title}
								class="h-20 w-14 rounded object-cover"
								loading="lazy"
							/>
						</a>
					{:else}
						<div class="flex h-20 w-14 shrink-0 items-center justify-center rounded bg-base-300">
							{#if isItemMovie}
								<Clapperboard class="h-6 w-6 opacity-40" />
							{:else}
								<Tv class="h-6 w-6 opacity-40" />
							{/if}
						</div>
					{/if}

					<div class="min-w-0 flex-1">
						<a
							href={resolvePath(`/library/${mediaType}/${item.id}`)}
							class="block truncate text-lg font-medium hover:text-primary"
						>
							{item.title}
						</a>
						{#if item.year}
							<span class="text-base text-base-content/60">({item.year})</span>
						{/if}

						{#if isSeries(item)}
							<div class="mt-1 text-sm text-base-content/60">
								{item.episodeFileCount ?? 0} / {item.episodeCount ?? 0} episodes
								{#if item.percentComplete > 0}
									<span class="ml-2">({item.percentComplete}%)</span>
								{/if}
							</div>
							{#if item.status}
								<div class="mt-1 text-sm text-base-content/50">{item.status}</div>
							{/if}
						{/if}
					</div>
				</div>

				<!-- Quality Badges -->
				{#if qualityBadges.length > 0}
					<div class="mt-3 flex flex-wrap gap-1.5">
						{#each qualityBadges as badge (`${badge.type}-${badge.label}`)}
							<span class="badge badge-outline badge-sm">{badge.label}</span>
						{/each}
					</div>
				{/if}

				<!-- Metadata -->
				<div class="mt-2 flex flex-wrap items-center gap-2 text-sm text-base-content/60">
					{#if size > 0}
						<span>{formatBytes(size)}</span>
					{/if}
					<span>{new Date(item.added).toLocaleDateString()}</span>
				</div>

				<!-- Actions -->
				<div class="mt-3 flex flex-wrap gap-2">
					<button
						class="btn gap-1 btn-ghost btn-xs"
						onclick={() => handleMonitorToggle(item.id, item.monitored ?? false)}
						disabled={isLoading}
					>
						{#if item.monitored}
							<EyeOff class="h-3.5 w-3.5" />
							Unmonitor
						{:else}
							<Eye class="h-3.5 w-3.5" />
							Monitor
						{/if}
					</button>
					{#if onAutoGrab}
						<button
							class="btn gap-1 btn-ghost btn-xs"
							onclick={() => handleAutoGrab(item.id)}
							disabled={isLoading}
						>
							<Zap class="h-3.5 w-3.5" />
							Auto
						</button>
					{/if}
					{#if onManualGrab}
						<button
							class="btn gap-1 btn-ghost btn-xs"
							onclick={() => handleManualGrab(item.id)}
							disabled={isLoading}
						>
							<MousePointerClick class="h-3.5 w-3.5" />
							Manual
						</button>
					{/if}
					<button
						class="btn gap-1 btn-ghost btn-xs"
						onclick={() => handleSearch(item.id)}
						disabled={isLoading}
					>
						<Search class="h-3.5 w-3.5" />
						Search
					</button>
					<button
						class="btn gap-1 btn-ghost btn-xs btn-error"
						onclick={() => handleDelete(item.id)}
						disabled={isLoading}
					>
						<Trash2 class="h-3.5 w-3.5" />
						Delete
					</button>
				</div>
			</div>
		{/each}
	</div>

	<!-- Desktop: Table View -->
	<div class="hidden overflow-x-auto lg:block">
		<table class="table table-sm">
			<thead>
				<tr>
					{#if selectable}
						<th class="w-10">
							<input
								type="checkbox"
								class="checkbox checkbox-sm"
								checked={items.length > 0 && items.every((i) => selectedItems.has(i.id))}
								indeterminate={items.some((i) => selectedItems.has(i.id)) &&
									!items.every((i) => selectedItems.has(i.id))}
								onchange={(e) => {
									const checked = e.currentTarget.checked;
									items.forEach((i) => handleSelectChange(i.id, checked));
								}}
							/>
						</th>
					{/if}
					<th class="w-14 text-base">Poster</th>
					<th
						class="cursor-pointer text-base select-none hover:bg-base-200"
						onclick={() => handleSort('title')}
					>
						<span class="flex items-center gap-1">
							Title
							{#if onSort}
								{@const Icon = getSortIcon('title')}
								<Icon class="h-4 w-4 opacity-50" />
							{/if}
						</span>
					</th>
					<th
						class="cursor-pointer text-base select-none hover:bg-base-200"
						onclick={() => handleSort('year')}
					>
						<span class="flex items-center gap-1">
							Year
							{#if onSort}
								{@const Icon = getSortIcon('year')}
								<Icon class="h-4 w-4 opacity-50" />
							{/if}
						</span>
					</th>
					<th class="text-base">Status</th>
					<th class="text-base">Quality</th>
					<th
						class="cursor-pointer text-base select-none hover:bg-base-200"
						onclick={() => handleSort('size')}
					>
						<span class="flex items-center gap-1">
							Size
							{#if onSort}
								{@const Icon = getSortIcon('size')}
								<Icon class="h-4 w-4 opacity-50" />
							{/if}
						</span>
					</th>
					{#if isTv}
						<th class="text-base">Progress</th>
					{/if}
					<th
						class="cursor-pointer text-base select-none hover:bg-base-200"
						onclick={() => handleSort('added')}
					>
						<span class="flex items-center gap-1">
							Added
							{#if onSort}
								{@const Icon = getSortIcon('added')}
								<Icon class="h-4 w-4 opacity-50" />
							{/if}
						</span>
					</th>
					<th class="w-10"></th>
				</tr>
			</thead>
			<tbody>
				{#each items as item (item.id)}
					{@const isItemMovie = isMovie(item)}
					{@const size = getItemSize(item)}
					{@const qualityBadges = getQualityBadges(item)}
					{@const isLoading = actionLoadingRows.has(item.id)}
					<tr class="hover">
						{#if selectable}
							<td>
								<input
									type="checkbox"
									class="checkbox checkbox-sm"
									checked={selectedItems.has(item.id)}
									onchange={(e) => handleSelectChange(item.id, e.currentTarget.checked)}
								/>
							</td>
						{/if}

						<!-- Poster -->
						<td>
							{#if item.posterPath}
								<a href={resolvePath(`/library/${mediaType}/${item.id}`)}>
									<img
										src={getPosterUrl(item)}
										alt={item.title}
										class="h-14 w-10 rounded object-cover"
										loading="lazy"
									/>
								</a>
							{:else}
								<div class="flex h-14 w-10 items-center justify-center rounded bg-base-300">
									{#if isItemMovie}
										<Clapperboard class="h-4 w-4 opacity-40" />
									{:else}
										<Tv class="h-4 w-4 opacity-40" />
									{/if}
								</div>
							{/if}
						</td>

						<!-- Title -->
						<td>
							<a
								href={resolvePath(`/library/${mediaType}/${item.id}`)}
								class="block max-w-xs truncate text-base font-medium hover:text-primary"
							>
								{item.title}
							</a>
						</td>

						<!-- Year -->
						<td>
							<span class="text-base">{item.year ?? '-'}</span>
						</td>

						<!-- Status -->
						<td>
							<div class="flex flex-wrap gap-1.5">
								{#if item.monitored}
									<span class="badge gap-1.5 badge-sm badge-info">
										<Eye class="h-3.5 w-3.5" />
									</span>
								{:else}
									<span class="badge gap-1.5 badge-ghost badge-sm">
										<EyeOff class="h-3.5 w-3.5" />
									</span>
								{/if}
								{#if isItemMovie}
									{#if item.hasFile}
										<span class="badge badge-sm badge-success">File</span>
									{:else}
										<span class="badge badge-sm badge-warning">Missing</span>
									{/if}
								{/if}
							</div>
						</td>

						<!-- Quality -->
						<td>
							{#if qualityBadges.length > 0}
								<div class="flex flex-wrap gap-1.5">
									{#each qualityBadges as badge (`${badge.type}-${badge.label}`)}
										<span class="badge badge-outline badge-sm">{badge.label}</span>
									{/each}
								</div>
							{:else}
								<span class="text-base text-base-content/40">-</span>
							{/if}
						</td>

						<!-- Size -->
						<td>
							<span class="text-base">{size > 0 ? formatBytes(size) : '-'}</span>
						</td>

						<!-- Progress (Series only) -->
						{#if isTv}
							<td>
								{#if isSeries(item)}
									<div class="flex items-center gap-2">
										<span class="text-base">
											{item.episodeFileCount ?? 0}/{item.episodeCount ?? 0}
										</span>
										{#if item.percentComplete > 0 && item.percentComplete < 100}
											<progress
												class="progress w-16 progress-primary"
												value={item.percentComplete}
												max="100"
											></progress>
										{/if}
									</div>
								{/if}
							</td>
						{/if}

						<!-- Added Date -->
						<td>
							<span class="text-base text-base-content/60">
								{new Date(item.added).toLocaleDateString()}
							</span>
						</td>

						<!-- Actions -->
						<td>
							<div class="dropdown dropdown-end">
								<button tabindex="0" class="btn btn-ghost btn-xs" disabled={isLoading}>
									<MoreVertical class="h-4 w-4" />
								</button>
								<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
								<ul
									tabindex="0"
									class="dropdown-content menu z-[2] w-40 rounded-box border border-base-content/10 bg-base-200 p-2 shadow-lg"
								>
									<li>
										<button onclick={() => handleMonitorToggle(item.id, item.monitored ?? false)}>
											{#if item.monitored}
												<EyeOff class="mr-2 h-4 w-4" />
												Unmonitor
											{:else}
												<Eye class="mr-2 h-4 w-4" />
												Monitor
											{/if}
										</button>
									</li>
									{#if onAutoGrab}
										<li>
											<button onclick={() => handleAutoGrab(item.id)}>
												<Zap class="mr-2 h-4 w-4" />
												Auto Grab
											</button>
										</li>
									{/if}
									{#if onManualGrab}
										<li>
											<button onclick={() => handleManualGrab(item.id)}>
												<MousePointerClick class="mr-2 h-4 w-4" />
												Manual Grab
											</button>
										</li>
									{/if}
									<li>
										<button onclick={() => handleSearch(item.id)}>
											<Search class="mr-2 h-4 w-4" />
											Search
										</button>
									</li>
									<li>
										<button class="text-error" onclick={() => handleDelete(item.id)}>
											<Trash2 class="mr-2 h-4 w-4" />
											Delete
										</button>
									</li>
								</ul>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
