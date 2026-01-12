<script lang="ts">
	import type { LibrarySeries } from '$lib/types/library';

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

<div class="space-y-6">
	<!-- Overview -->
	{#if series.overview}
		<div class="rounded-xl bg-base-200 p-6">
			<h3 class="mb-2 font-semibold">Overview</h3>
			<p class="text-sm leading-relaxed text-base-content/80">
				{series.overview}
			</p>
		</div>
	{/if}

	<!-- Details -->
	<div class="rounded-xl bg-base-200 p-6">
		<h3 class="mb-3 font-semibold">Details</h3>
		<dl class="space-y-2 text-sm">
			{#if series.originalTitle && series.originalTitle !== series.title}
				<div class="flex justify-between">
					<dt class="text-base-content/60">Original Title</dt>
					<dd>{series.originalTitle}</dd>
				</div>
			{/if}
			{#if series.network}
				<div class="flex justify-between">
					<dt class="text-base-content/60">Network</dt>
					<dd>{series.network}</dd>
				</div>
			{/if}
			{#if series.status}
				<div class="flex justify-between">
					<dt class="text-base-content/60">Status</dt>
					<dd>{series.status}</dd>
				</div>
			{/if}
			{#if series.genres && series.genres.length > 0}
				<div class="flex justify-between">
					<dt class="text-base-content/60">Genres</dt>
					<dd class="text-right">{series.genres.join(', ')}</dd>
				</div>
			{/if}
			{#if series.imdbId}
				<div class="flex justify-between">
					<dt class="text-base-content/60">IMDb</dt>
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
			<div class="flex justify-between">
				<dt class="text-base-content/60">TMDB ID</dt>
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
				<div class="flex justify-between">
					<dt class="text-base-content/60">TVDB ID</dt>
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
	<div class="rounded-xl bg-base-200 p-6">
		<h3 class="mb-3 font-semibold">Storage</h3>
		<dl class="space-y-2 text-sm">
			<div>
				<dt class="text-base-content/60">Path</dt>
				<dd class="mt-1 font-mono text-xs break-all">
					{seriesStoragePath}
				</dd>
			</div>
			<div class="flex justify-between">
				<dt class="text-base-content/60">Season Folders</dt>
				<dd>{series.seasonFolder ? 'Yes' : 'No'}</dd>
			</div>
		</dl>
	</div>
</div>
