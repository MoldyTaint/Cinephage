<script lang="ts">
	import type { LibrarySeries } from '$lib/types/library';
	import * as m from '$lib/paraglide/messages.js';
	import { formatDisplayDateShort } from '$lib/utils/format.js';

	interface Props {
		series: LibrarySeries;
		qualityProfileName?: string | null;
		configuredProviders?: { anilist: boolean; mal: boolean };
		onResolveProviderRef?: (provider: 'anilist' | 'mal') => void;
	}

	let {
		series,
		qualityProfileName = null,
		configuredProviders = { anilist: false, mal: false },
		onResolveProviderRef
	}: Props = $props();

	const seriesStoragePath = $derived.by(() => {
		const rootPath = series.rootFolderPath ?? '';
		const relativePath = series.path ?? '';

		if (!rootPath) {
			return relativePath;
		}

		if (!relativePath) {
			return rootPath;
		}

		const normalizedRoot = rootPath.endsWith('/') ? rootPath.slice(0, -1) : rootPath;
		const normalizedRelative = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;

		return `${normalizedRoot}/${normalizedRelative}`;
	});

	const airDays = $derived.by(() => {
		if (!series.airsDay) return null;
		const days = series.airsDay;
		const names = Object.entries(days)
			.filter(([, v]) => v)
			.map(([k]) => k.charAt(0).toUpperCase() + k.slice(1));
		if (names.length === 0) return null;
		return names.join(', ');
	});

	const airSchedule = $derived.by(() => {
		if (!airDays) return null;
		if (series.airsTime) return `${airDays} at ${series.airsTime}`;
		return airDays;
	});

	const providerLinkRows = $derived.by(() => {
		const isAnimeItem =
			(series.rootFolderPath ?? '').toLowerCase().includes('/anime/') ||
			Boolean(series.providerRefs?.anilist) ||
			Boolean(series.providerRefs?.mal);
		if (!isAnimeItem) return [];

		const refs = series.providerRefs ?? {};
		const rows: Array<
			{ label: string; value: string } & (
				| { resolved: true; href: string; provider: 'anilist' | 'mal' }
				| { resolved: false; provider: 'anilist' | 'mal' }
			)
		> = [];
		if (configuredProviders.anilist && refs.anilist) {
			rows.push({
				label: 'AniList ID',
				href: `https://anilist.co/anime/${refs.anilist}`,
				value: refs.anilist,
				resolved: true,
				provider: 'anilist'
			});
		} else if (configuredProviders.anilist) {
			rows.push({
				label: 'AniList ID',
				value: 'N/A',
				resolved: false,
				provider: 'anilist'
			});
		}
		if (configuredProviders.mal && refs.mal) {
			rows.push({
				label: 'MAL ID',
				href: `https://myanimelist.net/anime/${refs.mal}`,
				value: refs.mal,
				resolved: true,
				provider: 'mal'
			});
		} else if (configuredProviders.mal) {
			rows.push({
				label: 'MAL ID',
				value: 'N/A',
				resolved: false,
				provider: 'mal'
			});
		}
		return rows;
	});
</script>

<div class="space-y-4 md:space-y-6">
	<!-- Details -->
	<div class="rounded-xl bg-base-200 p-4 md:p-6">
		<h3 class="mb-3 font-semibold">{m.common_details()}</h3>
		<dl class="space-y-2 text-sm">
			{#if series.originalTitle && series.originalTitle !== series.title}
				<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
					<dt class="text-base-content/60">{m.library_movieDetail_originalTitle()}</dt>
					<dd class="sm:text-right">{series.originalTitle}</dd>
				</div>
			{/if}
			{#if series.genres && series.genres.length > 0}
				<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
					<dt class="text-base-content/60">{m.common_genres()}</dt>
					<dd class="sm:text-right">{series.genres.join(', ')}</dd>
				</div>
			{/if}
			{#if airSchedule}
				<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
					<dt class="text-base-content/60">{m.common_airs()}</dt>
					<dd class="sm:text-right">{airSchedule}</dd>
				</div>
			{/if}
			{#if series.network}
				<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
					<dt class="text-base-content/60">{m.common_network()}</dt>
					<dd class="sm:text-right">{series.network}</dd>
				</div>
			{/if}
			{#if series.status}
				<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
					<dt class="text-base-content/60">{m.common_status()}</dt>
					<dd class="sm:text-right">{series.status}</dd>
				</div>
			{/if}
			<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
				<dt class="text-base-content/60">{m.library_seriesHeader_qualityProfileLabel()}</dt>
				<dd>{qualityProfileName || m.common_default()}</dd>
			</div>
			<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
				<dt class="text-base-content/60">{m.common_added()}</dt>
				<dd>
					{formatDisplayDateShort(series.added)}
				</dd>
			</div>
			{#if series.imdbId}
				<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
					<dt class="text-base-content/60">{m.library_movieDetail_imdb()}</dt>
					<dd>
						<a
							href="https://www.imdb.com/title/{series.imdbId}"
							target="_blank"
							rel="noopener noreferrer"
							class="link link-primary"
						>
							{series.imdbId}
						</a>
					</dd>
				</div>
			{/if}
			<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
				<dt class="text-base-content/60">{m.library_movieDetail_tmdbId()}</dt>
				<dd>
					<a
						href="https://www.themoviedb.org/tv/{series.tmdbId}"
						target="_blank"
						rel="noopener noreferrer"
						class="link link-primary"
					>
						{series.tmdbId}
					</a>
				</dd>
			</div>
			{#if series.tvdbId}
				<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
					<dt class="text-base-content/60">{m.library_tvDetail_tvdbId()}</dt>
					<dd>
						<a
							href="https://thetvdb.com/series/{series.tvdbId}"
							target="_blank"
							rel="noopener noreferrer"
							class="link link-primary"
						>
							{series.tvdbId}
						</a>
					</dd>
				</div>
			{/if}
			{#each providerLinkRows as row (row.label)}
				<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
					<dt class="text-base-content/60">{row.label}</dt>
					<dd>
						{#if row.resolved}
							<a
								href={row.href}
								target="_blank"
								rel="noopener noreferrer"
								class="link link-primary"
							>
								{row.value}
							</a>
						{:else}
							<button
								type="button"
								class="link link-warning"
								onclick={() => onResolveProviderRef?.(row.provider)}
							>
								{row.value}
							</button>
						{/if}
					</dd>
				</div>
			{/each}
		</dl>
	</div>

	<!-- Path Info -->
	<div class="rounded-xl bg-base-200 p-4 md:p-6">
		<h3 class="mb-3 font-semibold">{m.library_movieDetail_storageHeading()}</h3>
		<dl class="space-y-2 text-sm">
			<div>
				<dt class="text-base-content/60">{m.common_path()}</dt>
				<dd class="mt-1 font-mono text-xs break-all">
					{seriesStoragePath}
				</dd>
			</div>
			<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
				<dt class="text-base-content/60">{m.library_tvDetail_seasonFolders()}</dt>
				<dd>{series.seasonFolder ? m.common_yes() : m.common_no()}</dd>
			</div>
		</dl>
	</div>
</div>
