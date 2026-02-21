<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { LibraryMovie, LibrarySeries } from '$lib/types/library';
	import {
		CheckCircle2,
		XCircle,
		Eye,
		EyeOff,
		Trash2,
		Clapperboard,
		Tv,
		ArrowUpDown,
		ArrowUp,
		ArrowDown,
		MoreVertical,
		Zap,
		Search,
		Download
	} from 'lucide-svelte';
	import { resolvePath } from '$lib/utils/routing';
	import { formatBytes } from '$lib/utils/format';
	import type { MediaType } from '$lib/utils/media-type';
	import { goto } from '$app/navigation';

	interface QualityProfile {
		id: string;
		name: string;
	}

	interface Props {
		items: (LibraryMovie | LibrarySeries)[];
		mediaType: MediaType;
		selectedItems: SvelteSet<string>;
		selectable: boolean;
		qualityProfiles?: QualityProfile[];
		sortField?: string;
		sortDirection?: 'asc' | 'desc';
		onSort?: (field: string) => void;
		onSelectChange?: (id: string, selected: boolean) => void;
		onMonitorToggle?: (id: string, monitored: boolean) => void;
		onDelete?: (id: string) => void;
		onAutoGrab?: (id: string) => void;
		onManualGrab?: (id: string) => void;
		downloadingIds?: Set<string>;
	}

	let {
		items,
		mediaType,
		selectedItems,
		selectable,
		qualityProfiles = [],
		sortField = 'title',
		sortDirection = 'asc',
		onSort,
		onSelectChange,
		onMonitorToggle,
		onDelete,
		onAutoGrab,
		onManualGrab,
		downloadingIds = new Set()
	}: Props = $props();

	// Track loading states for actions
	let actionLoadingRows = new SvelteSet<string>();

	const isTv = $derived(mediaType === 'tv');

	// Build a profile-id -> name lookup map
	const profileNameMap = $derived(new Map(qualityProfiles.map((p) => [p.id, p.name])));

	function getProfileName(item: LibraryMovie | LibrarySeries): string | null {
		if (!isSeries(item)) return null;
		const id = item.scoringProfileId;
		if (!id) return profileNameMap.get('balanced') ?? 'Default';
		return profileNameMap.get(id) ?? id;
	}

	function getStatusColor(status: string | null): string {
		if (!status) return 'badge-ghost';
		const s = status.toLowerCase();
		if (s.includes('returning') || s.includes('production')) return 'badge-success';
		if (s.includes('ended')) return 'badge-error';
		if (s.includes('canceled')) return 'badge-warning';
		return 'badge-ghost';
	}

	function formatStatus(status: string | null): string {
		if (!status) return 'Unknown';
		const s = status.toLowerCase();
		if (s.includes('returning')) return 'Continuing';
		if (s.includes('production')) return 'In Production';
		if (s.includes('ended')) return 'Ended';
		if (s.includes('canceled')) return 'Cancelled';
		return status;
	}

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
		if (isSeries(item)) {
			return item.totalSize ?? 0;
		}
		return 0;
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

	function formatRelativeDate(dateStr: string): { display: string; full: string } {
		const date = new Date(dateStr);
		const now = new Date();
		const full = date.toLocaleDateString();

		// Strip time for day comparison
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return { display: 'Today', full };
		if (diffDays === 1) return { display: 'Yesterday', full };
		if (diffDays < 7) return { display: `${diffDays} days ago`, full };
		if (diffDays < 30) {
			const weeks = Math.floor(diffDays / 7);
			return { display: `${weeks}w ago`, full };
		}
		if (diffDays < 365) {
			const months = Math.floor(diffDays / 30);
			return { display: `${months}mo ago`, full };
		}
		return { display: full, full };
	}

	function isItemMissing(item: LibraryMovie | LibrarySeries): boolean {
		if (isMovie(item)) return !item.hasFile;
		if (isSeries(item)) return (item.percentComplete ?? 0) === 0;
		return false;
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
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="cursor-pointer rounded-xl bg-base-200 p-3 transition-colors active:bg-base-300"
				onclick={(e) => {
					// Don't navigate when clicking on interactive elements
					const target = e.target as HTMLElement;
					if (target.closest('button, input, [role=toolbar]')) return;
					goto(resolvePath(`/library/${mediaType}/${item.id}`));
				}}
			>
				<!-- Header: Checkbox + Status Badges -->
				<div class="flex items-start justify-between gap-2">
					{#if selectable}
						<input
							type="checkbox"
							class="checkbox checkbox-sm"
							checked={selectedItems.has(item.id)}
							onchange={(e) => handleSelectChange(item.id, e.currentTarget.checked)}
						/>
					{/if}
					<div class="flex flex-1 flex-wrap items-center gap-1.5">
						{#if item.monitored}
							<span class="badge gap-1.5 badge-sm badge-success">
								<Eye class="h-3.5 w-3.5" />
								Monitored
							</span>
						{:else}
							<span class="badge gap-1.5 badge-sm badge-neutral">
								<EyeOff class="h-3.5 w-3.5" />
								Not Monitored
							</span>
						{/if}
						{#if isItemMovie}
							{#if item.hasFile}
								<span class="badge gap-1.5 badge-sm badge-success">
									<CheckCircle2 class="h-3.5 w-3.5" />
									Downloaded
								</span>
							{:else if downloadingIds.has(item.id)}
								<span class="badge gap-1.5 badge-sm badge-info">
									<Download class="h-3.5 w-3.5 animate-pulse" />
									Downloading
								</span>
							{:else}
								<span class="badge gap-1.5 badge-sm badge-warning">
									<XCircle class="h-3.5 w-3.5" />
									Missing
								</span>
							{/if}
						{/if}
						{#if size > 0}
							<span class="badge gap-1.5 badge-sm badge-info">{formatBytes(size)}</span>
						{/if}
						{#if isSeries(item) && item.status}
							<span class="badge badge-sm {getStatusColor(item.status)}">
								{formatStatus(item.status)}
							</span>
						{/if}
					</div>
				</div>

				<!-- Title, Poster, and Metadata -->
				<div class="mt-2 flex items-start gap-3">
					{#if item.posterPath}
						<div class="shrink-0">
							<img
								src={getPosterUrl(item)}
								alt={item.title}
								class="h-20 w-14 rounded object-cover"
								loading="lazy"
							/>
						</div>
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
						<span class="line-clamp-2 text-sm font-medium">
							{item.title}
						</span>
						<div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
							{#if item.year}
								<span class="text-xs text-base-content/60">({item.year})</span>
							{/if}
						</div>
						<div class="mt-1.5">
							{#if qualityBadges.length > 0}
								{#each qualityBadges as badge (`${badge.type}-${badge.label}`)}
									<span class="badge badge-outline badge-xs">{badge.label}</span>
								{/each}
							{/if}
						</div>

						{#if isSeries(item)}
							<div class="mt-1.5">
								<div class="flex items-center gap-2 text-xs text-base-content/60">
									<span>
										{item.episodeFileCount ?? 0} / {item.episodeCount ?? 0} episodes
									</span>
									{#if item.percentComplete > 0}
										<span>({item.percentComplete}%)</span>
									{/if}
									{#if downloadingIds.has(item.id)}
										<Download class="h-3.5 w-3.5 animate-pulse text-info" />
									{/if}
								</div>
								{#if (item.episodeCount ?? 0) > 0}
									<div class="mt-1 h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-base-300">
										<div
											class="h-full transition-all duration-500 {item.percentComplete === 100
												? 'bg-success'
												: item.percentComplete > 0
													? 'bg-primary'
													: 'bg-base-300'}"
											style="width: {item.percentComplete}%"
										></div>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>

				<!-- Actions -->
				<div class="mt-2 flex justify-center gap-1 overflow-x-auto" role="toolbar">
					<button
						class="btn shrink-0 gap-1 btn-ghost btn-xs"
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
							class="btn shrink-0 gap-1 btn-ghost btn-xs"
							onclick={() => handleAutoGrab(item.id)}
							disabled={isLoading}
						>
							<Zap class="h-3.5 w-3.5" />
							Auto
						</button>
					{/if}
					{#if onManualGrab}
						<button
							class="btn shrink-0 gap-1 btn-ghost btn-xs"
							onclick={() => handleManualGrab(item.id)}
							disabled={isLoading}
						>
							<Search class="h-3.5 w-3.5" />
							Manual
						</button>
					{/if}
					<button
						class="btn shrink-0 gap-1 btn-ghost btn-xs btn-error"
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
	<div class="hidden overflow-visible lg:block">
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
				{#each items as item, idx (item.id)}
					{@const isItemMovie = isMovie(item)}
					{@const size = getItemSize(item)}
					{@const qualityBadges = getQualityBadges(item)}
					{@const isLoading = actionLoadingRows.has(item.id)}
					{@const isNearBottom = idx >= items.length - 3}
					{@const missing = isItemMissing(item)}
					{@const relDate = formatRelativeDate(item.added)}
					<tr
						class="cursor-pointer transition-colors hover:bg-base-200/60 {missing
							? 'bg-warning/5'
							: idx % 2 === 1
								? 'bg-base-200/30'
								: ''}"
						onclick={(e) => {
							const target = e.target as HTMLElement;
							if (target.closest('button, input, a, .dropdown')) return;
							goto(resolvePath(`/library/${mediaType}/${item.id}`));
						}}
					>
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
							<div class="flex items-center gap-1.5">
								{#if item.monitored}
									<span class="badge gap-1.5 badge-sm badge-success">
										<Eye class="h-3.5 w-3.5" />
									</span>
								{:else}
									<span class="badge gap-1.5 badge-ghost badge-sm">
										<EyeOff class="h-3.5 w-3.5" />
									</span>
								{/if}
								{#if isItemMovie}
									{#if item.hasFile}
										<span class="badge gap-1 badge-sm badge-success">
											<CheckCircle2 class="h-3 w-3" />
											Downloaded
										</span>
									{:else if downloadingIds.has(item.id)}
										<span class="badge gap-1 badge-sm badge-info">
											<Download class="h-3 w-3 animate-pulse" />
											Downloading
										</span>
									{:else}
										<span class="badge gap-1 badge-sm badge-warning">
											<XCircle class="h-3 w-3" />
											Missing
										</span>
									{/if}
								{/if}
								{#if isSeries(item) && item.status}
									<span class="badge badge-sm {getStatusColor(item.status)}">
										{formatStatus(item.status)}
									</span>
								{/if}
							</div>
						</td>

						<!-- Quality -->
						<td>
							{#if isTv && isSeries(item)}
								{@const profileName = getProfileName(item)}
								{#if profileName}
									<span class="badge badge-outline badge-sm">{profileName}</span>
								{:else}
									<span class="text-base text-base-content/40">-</span>
								{/if}
							{:else if qualityBadges.length > 0}
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
										{#if downloadingIds.has(item.id)}
											<Download class="h-4 w-4 animate-pulse text-info" />
										{/if}
									</div>
								{/if}
							</td>
						{/if}

						<!-- Added Date -->
						<td>
							<span class="text-base text-base-content/60" title={relDate.full}>
								{relDate.display}
							</span>
						</td>

						<!-- Actions -->
						<td>
							<div class="dropdown dropdown-end" class:dropdown-top={isNearBottom}>
								<button tabindex="0" class="btn btn-ghost btn-xs" disabled={isLoading}>
									<MoreVertical class="h-4 w-4" />
								</button>
								<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
								<ul
									tabindex="0"
									class="dropdown-content menu z-50 w-40 rounded-box border border-base-content/10 bg-base-200 p-2 shadow-lg"
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
												<Search class="mr-2 h-4 w-4" />
												Manual Grab
											</button>
										</li>
									{/if}
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
