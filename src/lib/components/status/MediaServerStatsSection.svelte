<script lang="ts">
	import {
		BarChart3,
		Play,
		Database,
		ExternalLink,
		ChevronUp,
		ChevronDown,
		ChevronsUpDown
	} from 'lucide-svelte';
	import { SettingsSection } from '$lib/components/ui/settings';
	import { formatDisplayDateShort } from '$lib/utils/format.js';

	type BreakdownItem = { label: string; count: number };

	type SyncedItem = {
		id: string;
		title: string;
		seriesName: string | null;
		itemType: string;
		playCount: number | null;
		height: number | null;
		videoCodec: string | null;
		containerFormat: string | null;
		fileSize: number | null;
		lastPlayedDate: string | null;
	};

	interface Props {
		stats: {
			totalPlays: number;
			uniqueItems: number;
			resolutionBreakdown: BreakdownItem[];
			codecBreakdown: BreakdownItem[];
			hdrBreakdown: BreakdownItem[];
			audioCodecBreakdown: BreakdownItem[];
			containerBreakdown: BreakdownItem[];
		};
		topItems: SyncedItem[];
		largestItems: SyncedItem[];
		servers: Array<{ id: string; name: string; serverType: string; enabled: boolean }>;
		totalPlays?: number | null;
		uniqueItems?: number | null;
	}

	let { stats, topItems, largestItems, servers, totalPlays, uniqueItems }: Props = $props();

	const DEFAULT_LIMIT = 10;
	type SortDir = 'asc' | 'desc';
	type TypeFilter = 'all' | 'movie' | 'episode';

	let topFilter = $state<TypeFilter>('all');
	let topSortCol = $state('plays');
	let topSortDir = $state<SortDir>('desc');
	let topLimit = $state(DEFAULT_LIMIT);

	let largestFilter = $state<TypeFilter>('all');
	let largestSortCol = $state('size');
	let largestSortDir = $state<SortDir>('desc');
	let largestLimit = $state(DEFAULT_LIMIT);

	function sortItems(items: SyncedItem[], col: string, dir: SortDir): SyncedItem[] {
		return [...items].sort((a, b) => {
			let av: number | string;
			let bv: number | string;
			switch (col) {
				case 'title':
					av = a.title;
					bv = b.title;
					break;
				case 'type':
					av = a.itemType;
					bv = b.itemType;
					break;
				case 'plays':
					av = a.playCount ?? -1;
					bv = b.playCount ?? -1;
					break;
				case 'resolution':
					av = a.height ?? -1;
					bv = b.height ?? -1;
					break;
				case 'codec':
					av = a.videoCodec ?? '';
					bv = b.videoCodec ?? '';
					break;
				case 'lastPlayed':
					av = a.lastPlayedDate ?? '';
					bv = b.lastPlayedDate ?? '';
					break;
				case 'size':
					av = a.fileSize ?? -1;
					bv = b.fileSize ?? -1;
					break;
				case 'container':
					av = a.containerFormat ?? '';
					bv = b.containerFormat ?? '';
					break;
				default:
					return 0;
			}
			if (typeof av === 'number' && typeof bv === 'number')
				return dir === 'asc' ? av - bv : bv - av;
			return dir === 'asc'
				? String(av).localeCompare(String(bv))
				: String(bv).localeCompare(String(av));
		});
	}

	function applySort(currentCol: string, currentDir: SortDir, col: string): [string, SortDir] {
		return currentCol === col ? [col, currentDir === 'asc' ? 'desc' : 'asc'] : [col, 'desc'];
	}

	const processedTopItems = $derived.by(() => {
		const filtered =
			topFilter === 'all' ? topItems : topItems.filter((i) => i.itemType === topFilter);
		const sorted = sortItems(filtered, topSortCol, topSortDir);
		return { visible: sorted.slice(0, topLimit), total: sorted.length };
	});

	const processedLargestItems = $derived.by(() => {
		const filtered =
			largestFilter === 'all'
				? largestItems
				: largestItems.filter((i) => i.itemType === largestFilter);
		const sorted = sortItems(filtered, largestSortCol, largestSortDir);
		return { visible: sorted.slice(0, largestLimit), total: sorted.length };
	});

	function formatBytes(value: number): string {
		if (!value) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		let size = value;
		let unitIndex = 0;
		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex += 1;
		}
		return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
	}

	function barWidth(count: number, max: number): string {
		if (max <= 0) return '0%';
		return `${Math.max(4, Math.round((count / max) * 100))}%`;
	}

	function maxOf(breakdown: BreakdownItem[]): number {
		if (breakdown.length === 0) return 0;
		return Math.max(...breakdown.map((b) => b.count));
	}

	function formatResolution(height: number | null): string {
		if (!height) return '—';
		if (height >= 2160) return '4K';
		if (height >= 1080) return '1080p';
		if (height >= 720) return '720p';
		if (height >= 480) return '480p';
		return 'SD';
	}
</script>

{#if servers.length === 0}
	<SettingsSection title="No Media Servers Configured" variant="card">
		<div class="flex flex-col items-center gap-3 py-8 text-center">
			<BarChart3 class="h-12 w-12 text-base-content/30" />
			<p class="text-base-content/70">
				No media servers configured yet. Add a Jellyfin, Emby, or Plex server from the
				<a href="/settings/integrations" class="link link-primary">Integrations</a>
				page to start tracking stats.
			</p>
		</div>
	</SettingsSection>
{:else if stats.uniqueItems === 0}
	<SettingsSection title="No Playback Data Yet" variant="card">
		<div class="flex flex-col items-center gap-3 py-8 text-center">
			<BarChart3 class="h-12 w-12 text-base-content/30" />
			<p class="text-base-content/70">
				Your servers are configured but no stats have been synced. Click "Sync Servers" to pull
				playback and media information from your servers.
			</p>
		</div>
	</SettingsSection>
{:else}
	{#if totalPlays !== null && totalPlays !== undefined && uniqueItems !== null && uniqueItems !== undefined}
		<div class="mt-4 grid gap-4 sm:grid-cols-2">
			<div class="card bg-base-200">
				<div class="card-body flex-row items-center gap-4 p-4">
					<div class="rounded-lg bg-secondary/10 p-3">
						<Play class="h-5 w-5 text-secondary" />
					</div>
					<div>
						<div class="text-2xl font-bold">{totalPlays.toLocaleString()}</div>
						<div class="text-xs text-base-content/70">Total Plays</div>
					</div>
				</div>
			</div>
			<div class="card bg-base-200">
				<div class="card-body flex-row items-center gap-4 p-4">
					<div class="rounded-lg bg-accent/10 p-3">
						<Database class="h-5 w-5 text-accent" />
					</div>
					<div>
						<div class="text-2xl font-bold">{uniqueItems.toLocaleString()}</div>
						<div class="text-xs text-base-content/70">Items Tracked</div>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<div class="mt-4 flex justify-end">
		<a href="/settings/general/status/media" class="btn gap-2 btn-ghost btn-sm">
			Explore all media
			<ExternalLink class="h-3.5 w-3.5" />
		</a>
	</div>

	<div class="mt-4 grid gap-4 md:grid-cols-3">
		<SettingsSection title="Resolution" variant="card">
			{#if stats.resolutionBreakdown.length > 0}
				{@const max = maxOf(stats.resolutionBreakdown)}
				<div class="space-y-2">
					{#each stats.resolutionBreakdown as item (item.label)}
						<div class="flex items-center gap-2">
							<span class="w-14 shrink-0 text-right text-xs font-medium text-base-content/70"
								>{item.label}</span
							>
							<div class="flex-1">
								<div class="relative h-2 overflow-hidden rounded-full bg-base-300">
									<div
										class="absolute inset-y-0 left-0 rounded-full bg-primary transition-all"
										style="width: {barWidth(item.count, max)}"
									></div>
								</div>
							</div>
							<span class="w-12 text-right text-xs text-base-content/70">{item.count}</span>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-base-content/50">No resolution data available</p>
			{/if}
		</SettingsSection>

		<SettingsSection title="Video Codec" variant="card">
			{#if stats.codecBreakdown.length > 0}
				{@const max = maxOf(stats.codecBreakdown)}
				<div class="space-y-2">
					{#each stats.codecBreakdown as item (item.label)}
						<div class="flex items-center gap-2">
							<span
								class="w-14 shrink-0 truncate text-right text-xs font-medium text-base-content/70"
								>{item.label}</span
							>
							<div class="flex-1">
								<div class="relative h-2 overflow-hidden rounded-full bg-base-300">
									<div
										class="absolute inset-y-0 left-0 rounded-full bg-secondary transition-all"
										style="width: {barWidth(item.count, max)}"
									></div>
								</div>
							</div>
							<span class="w-12 text-right text-xs text-base-content/70">{item.count}</span>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-base-content/50">No codec data available</p>
			{/if}
		</SettingsSection>

		<SettingsSection title="HDR / SDR" variant="card">
			{#if stats.hdrBreakdown.length > 0}
				{@const max = maxOf(stats.hdrBreakdown)}
				<div class="space-y-2">
					{#each stats.hdrBreakdown as item (item.label)}
						<div class="flex items-center gap-2">
							<span class="w-14 shrink-0 text-right text-xs font-medium text-base-content/70"
								>{item.label}</span
							>
							<div class="flex-1">
								<div class="relative h-2 overflow-hidden rounded-full bg-base-300">
									<div
										class="absolute inset-y-0 left-0 rounded-full bg-accent transition-all"
										style="width: {barWidth(item.count, max)}"
									></div>
								</div>
							</div>
							<span class="w-12 text-right text-xs text-base-content/70">{item.count}</span>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-base-content/50">No HDR data available</p>
			{/if}
		</SettingsSection>
	</div>

	<div class="mt-4 grid gap-4 md:grid-cols-2">
		<SettingsSection title="Audio Codec" variant="card">
			{#if stats.audioCodecBreakdown.length > 0}
				{@const max = maxOf(stats.audioCodecBreakdown)}
				<div class="space-y-2">
					{#each stats.audioCodecBreakdown as item (item.label)}
						<div class="flex items-center gap-2">
							<span
								class="w-14 shrink-0 truncate text-right text-xs font-medium text-base-content/70"
								>{item.label}</span
							>
							<div class="flex-1">
								<div class="relative h-2 overflow-hidden rounded-full bg-base-300">
									<div
										class="absolute inset-y-0 left-0 rounded-full bg-info transition-all"
										style="width: {barWidth(item.count, max)}"
									></div>
								</div>
							</div>
							<span class="w-12 text-right text-xs text-base-content/70">{item.count}</span>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-base-content/50">No audio codec data available</p>
			{/if}
		</SettingsSection>

		<SettingsSection title="Container Format" variant="card">
			{#if stats.containerBreakdown.length > 0}
				{@const max = maxOf(stats.containerBreakdown)}
				<div class="space-y-2">
					{#each stats.containerBreakdown as item (item.label)}
						<div class="flex items-center gap-2">
							<span
								class="w-14 shrink-0 truncate text-right text-xs font-medium text-base-content/70"
								>{item.label}</span
							>
							<div class="flex-1">
								<div class="relative h-2 overflow-hidden rounded-full bg-base-300">
									<div
										class="absolute inset-y-0 left-0 rounded-full bg-warning transition-all"
										style="width: {barWidth(item.count, max)}"
									></div>
								</div>
							</div>
							<span class="w-12 text-right text-xs text-base-content/70">{item.count}</span>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-base-content/50">No container data available</p>
			{/if}
		</SettingsSection>
	</div>

	{#snippet sortIcon(col: string, currentCol: string, currentDir: SortDir)}
		{#if currentCol === col}
			{#if currentDir === 'desc'}
				<ChevronDown class="h-3 w-3 shrink-0" />
			{:else}
				<ChevronUp class="h-3 w-3 shrink-0" />
			{/if}
		{:else}
			<ChevronsUpDown class="h-3 w-3 shrink-0 opacity-30" />
		{/if}
	{/snippet}

	{#if topItems.length > 0}
		<div class="mt-4">
			<SettingsSection title="Top Played Items" variant="card">
				<div class="mb-3 flex items-center gap-1">
					{#each ['all', 'movie', 'episode'] as TypeFilter[] as t (t)}
						<button
							class="btn btn-xs {topFilter === t ? 'btn-primary' : 'btn-ghost'}"
							onclick={() => {
								topFilter = t;
								topLimit = DEFAULT_LIMIT;
							}}
						>
							{t === 'all' ? 'All' : t === 'movie' ? 'Movies' : 'Episodes'}
						</button>
					{/each}
					<span class="ml-auto text-xs text-base-content/40">
						{processedTopItems.total} item{processedTopItems.total !== 1 ? 's' : ''}
					</span>
				</div>
				<div class="overflow-x-auto">
					<table class="table table-sm">
						<thead>
							<tr>
								<th
									class="cursor-pointer select-none hover:bg-base-200/50"
									onclick={() =>
										([topSortCol, topSortDir] = applySort(topSortCol, topSortDir, 'title'))}
								>
									<div class="flex items-center gap-1">
										Title {@render sortIcon('title', topSortCol, topSortDir)}
									</div>
								</th>
								<th
									class="cursor-pointer select-none hover:bg-base-200/50"
									onclick={() =>
										([topSortCol, topSortDir] = applySort(topSortCol, topSortDir, 'type'))}
								>
									<div class="flex items-center gap-1">
										Type {@render sortIcon('type', topSortCol, topSortDir)}
									</div>
								</th>
								<th
									class="cursor-pointer select-none hover:bg-base-200/50"
									onclick={() =>
										([topSortCol, topSortDir] = applySort(topSortCol, topSortDir, 'plays'))}
								>
									<div class="flex items-center gap-1">
										Plays {@render sortIcon('plays', topSortCol, topSortDir)}
									</div>
								</th>
								<th
									class="cursor-pointer select-none hover:bg-base-200/50"
									onclick={() =>
										([topSortCol, topSortDir] = applySort(topSortCol, topSortDir, 'resolution'))}
								>
									<div class="flex items-center gap-1">
										Resolution {@render sortIcon('resolution', topSortCol, topSortDir)}
									</div>
								</th>
								<th
									class="cursor-pointer select-none hover:bg-base-200/50"
									onclick={() =>
										([topSortCol, topSortDir] = applySort(topSortCol, topSortDir, 'codec'))}
								>
									<div class="flex items-center gap-1">
										Codec {@render sortIcon('codec', topSortCol, topSortDir)}
									</div>
								</th>
								<th
									class="cursor-pointer select-none hover:bg-base-200/50"
									onclick={() =>
										([topSortCol, topSortDir] = applySort(topSortCol, topSortDir, 'lastPlayed'))}
								>
									<div class="flex items-center gap-1">
										Last Played {@render sortIcon('lastPlayed', topSortCol, topSortDir)}
									</div>
								</th>
							</tr>
						</thead>
						<tbody>
							{#each processedTopItems.visible as item (item.id)}
								<tr class="hover:bg-base-200/40 transition-colors">
									<td>
										<div class="max-w-50 truncate font-medium">{item.title}</div>
										{#if item.seriesName}
											<div class="text-xs text-base-content/50">{item.seriesName}</div>
										{/if}
									</td>
									<td><span class="badge badge-ghost badge-sm">{item.itemType}</span></td>
									<td>{item.playCount ?? 0}</td>
									<td
										><span class="text-xs {item.height ? '' : 'text-base-content/40'}"
											>{formatResolution(item.height)}</span
										></td
									>
									<td
										><span class="text-xs {item.videoCodec ? '' : 'text-base-content/40'}"
											>{item.videoCodec ?? '—'}</span
										></td
									>
									<td>
										{#if item.lastPlayedDate}
											<span class="text-xs">{formatDisplayDateShort(item.lastPlayedDate)}</span>
										{:else}
											<span class="text-xs text-base-content/40">—</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if processedTopItems.total > topLimit}
					<div class="mt-2 flex justify-center">
						<button class="btn btn-ghost btn-sm" onclick={() => (topLimit += DEFAULT_LIMIT)}>
							Show {Math.min(DEFAULT_LIMIT, processedTopItems.total - topLimit)} more
						</button>
					</div>
				{/if}
			</SettingsSection>
		</div>
	{/if}

	{#if largestItems.length > 0}
		<div class="mt-4">
			<SettingsSection title="Largest Items" variant="card">
				<div class="mb-3 flex items-center gap-1">
					{#each ['all', 'movie', 'episode'] as TypeFilter[] as t (t)}
						<button
							class="btn btn-xs {largestFilter === t ? 'btn-primary' : 'btn-ghost'}"
							onclick={() => {
								largestFilter = t;
								largestLimit = DEFAULT_LIMIT;
							}}
						>
							{t === 'all' ? 'All' : t === 'movie' ? 'Movies' : 'Episodes'}
						</button>
					{/each}
					<span class="ml-auto text-xs text-base-content/40">
						{processedLargestItems.total} item{processedLargestItems.total !== 1 ? 's' : ''}
					</span>
				</div>
				<div class="overflow-x-auto">
					<table class="table table-sm">
						<thead>
							<tr>
								<th
									class="cursor-pointer select-none hover:bg-base-200/50"
									onclick={() =>
										([largestSortCol, largestSortDir] = applySort(
											largestSortCol,
											largestSortDir,
											'title'
										))}
								>
									<div class="flex items-center gap-1">
										Title {@render sortIcon('title', largestSortCol, largestSortDir)}
									</div>
								</th>
								<th
									class="cursor-pointer select-none hover:bg-base-200/50"
									onclick={() =>
										([largestSortCol, largestSortDir] = applySort(
											largestSortCol,
											largestSortDir,
											'type'
										))}
								>
									<div class="flex items-center gap-1">
										Type {@render sortIcon('type', largestSortCol, largestSortDir)}
									</div>
								</th>
								<th
									class="cursor-pointer select-none hover:bg-base-200/50"
									onclick={() =>
										([largestSortCol, largestSortDir] = applySort(
											largestSortCol,
											largestSortDir,
											'size'
										))}
								>
									<div class="flex items-center gap-1">
										Size {@render sortIcon('size', largestSortCol, largestSortDir)}
									</div>
								</th>
								<th
									class="cursor-pointer select-none hover:bg-base-200/50"
									onclick={() =>
										([largestSortCol, largestSortDir] = applySort(
											largestSortCol,
											largestSortDir,
											'resolution'
										))}
								>
									<div class="flex items-center gap-1">
										Resolution {@render sortIcon('resolution', largestSortCol, largestSortDir)}
									</div>
								</th>
								<th
									class="cursor-pointer select-none hover:bg-base-200/50"
									onclick={() =>
										([largestSortCol, largestSortDir] = applySort(
											largestSortCol,
											largestSortDir,
											'container'
										))}
								>
									<div class="flex items-center gap-1">
										Container {@render sortIcon('container', largestSortCol, largestSortDir)}
									</div>
								</th>
							</tr>
						</thead>
						<tbody>
							{#each processedLargestItems.visible as item (item.id)}
								<tr class="hover:bg-base-200/40 transition-colors">
									<td>
										<div class="max-w-50 truncate font-medium">{item.title}</div>
										{#if item.seriesName}
											<div class="text-xs text-base-content/50">{item.seriesName}</div>
										{/if}
									</td>
									<td><span class="badge badge-ghost badge-sm">{item.itemType}</span></td>
									<td>{formatBytes(item.fileSize ?? 0)}</td>
									<td
										><span class="text-xs {item.height ? '' : 'text-base-content/40'}"
											>{formatResolution(item.height)}</span
										></td
									>
									<td
										><span class="text-xs {item.containerFormat ? '' : 'text-base-content/40'}"
											>{item.containerFormat ?? '—'}</span
										></td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if processedLargestItems.total > largestLimit}
					<div class="mt-2 flex justify-center">
						<button class="btn btn-ghost btn-sm" onclick={() => (largestLimit += DEFAULT_LIMIT)}>
							Show {Math.min(DEFAULT_LIMIT, processedLargestItems.total - largestLimit)} more
						</button>
					</div>
				{/if}
			</SettingsSection>
		</div>
	{/if}
{/if}
