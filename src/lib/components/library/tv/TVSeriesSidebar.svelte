<script lang="ts">
	import type { LibrarySeries } from '$lib/types/library';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		series: LibrarySeries;
	}

	let { series }: Props = $props();

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
</script>

<div class="space-y-4 md:space-y-6">
	<!-- Overview -->
	{#if series.overview}
		<div class="rounded-xl bg-base-200 p-4 md:p-6">
			<h3 class="mb-2 font-semibold">{m.library_tvDetail_overviewHeading()}</h3>
			<p class="text-sm leading-relaxed text-base-content/80">
				{series.overview}
			</p>
		</div>
	{/if}

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
			{#if series.network}
				<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
					<dt class="text-base-content/60">{m.common_network()}</dt>
					<dd>{series.network}</dd>
				</div>
			{/if}
			{#if series.status}
				<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
					<dt class="text-base-content/60">{m.common_status()}</dt>
					<dd>{series.status}</dd>
				</div>
			{/if}
			{#if series.genres && series.genres.length > 0}
				<div class="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
					<dt class="text-base-content/60">{m.common_genres()}</dt>
					<dd class="sm:text-right">{series.genres.join(', ')}</dd>
				</div>
			{/if}
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
