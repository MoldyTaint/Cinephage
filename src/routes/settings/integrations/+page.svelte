<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolvePath } from '$lib/utils/routing';
	import {
		Database,
		Download,
		Subtitles,
		CheckCircle,
		AlertCircle,
		ChevronRight,
		Languages,
		Film,
		Server,
		Monitor,
		X
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// TMDB modal state
	let tmdbModalOpen = $state(false);
	let tmdbApiKey = $state('');
	let saving = $state(false);

	function openTmdbModal() {
		tmdbApiKey = data.tmdb.apiKey || '';
		tmdbModalOpen = true;
	}

	function closeTmdbModal() {
		tmdbModalOpen = false;
	}

	interface IntegrationCard {
		title: string;
		description: string;
		href: string;
		icon: typeof Database;
		stats: { label: string; value: string | number; status?: 'success' | 'warning' | 'error' }[];
	}

	// Use $derived.by for reactive computation from props
	const integrations = $derived.by<IntegrationCard[]>(() => [
		{
			title: 'Indexers',
			description: 'Configure torrent indexers for content search',
			href: '/settings/integrations/indexers',
			icon: Database,
			stats: [
				{ label: 'Total', value: data.indexers.total },
				{
					label: 'Enabled',
					value: data.indexers.enabled,
					status: data.indexers.enabled > 0 ? 'success' : 'warning'
				}
			]
		},
		{
			title: 'Download Clients',
			description: 'Configure torrent clients for downloading content',
			href: '/settings/integrations/download-clients',
			icon: Download,
			stats: [
				{ label: 'Total', value: data.downloadClients.total },
				{
					label: 'Enabled',
					value: data.downloadClients.enabled,
					status: data.downloadClients.enabled > 0 ? 'success' : 'warning'
				}
			]
		},
		{
			title: 'NNTP Servers',
			description: 'Configure Usenet providers for streaming and article checks',
			href: '/settings/integrations/nntp-servers',
			icon: Server,
			stats: [
				{ label: 'Total', value: data.nntpServers.total },
				{
					label: 'Enabled',
					value: data.nntpServers.enabled,
					status: data.nntpServers.enabled > 0 ? 'success' : 'warning'
				}
			]
		},
		{
			title: 'Subtitle Providers',
			description: 'Configure providers for automatic subtitle downloads',
			href: '/settings/integrations/subtitle-providers',
			icon: Subtitles,
			stats: [
				{ label: 'Total', value: data.subtitleProviders.total },
				{
					label: 'Enabled',
					value: data.subtitleProviders.enabled,
					status: data.subtitleProviders.enabled > 0 ? 'success' : 'warning'
				},
				{
					label: 'Healthy',
					value: `${data.subtitleProviders.healthy}/${data.subtitleProviders.total}`,
					status:
						data.subtitleProviders.healthy === data.subtitleProviders.total ? 'success' : 'warning'
				}
			]
		},
		{
			title: 'Language Profiles',
			description: 'Define subtitle language preferences for media',
			href: '/settings/integrations/language-profiles',
			icon: Languages,
			stats: [
				{ label: 'Profiles', value: data.languageProfiles.total },
				{
					label: 'Default',
					value: data.languageProfiles.hasDefault ? 'Set' : 'Not Set',
					status: data.languageProfiles.hasDefault ? 'success' : 'warning'
				}
			]
		},
		{
			title: 'Media Servers',
			description: 'Configure Jellyfin and Emby for library notifications',
			href: '/settings/integrations/media-browsers',
			icon: Monitor,
			stats: [
				{ label: 'Total', value: data.mediaBrowsers.total },
				{
					label: 'Enabled',
					value: data.mediaBrowsers.enabled,
					status: data.mediaBrowsers.enabled > 0 ? 'success' : 'warning'
				}
			]
		}
	]);
</script>

<svelte:head>
	<title>Integrations - Settings - Cinephage</title>
</svelte:head>

<div class="w-full p-4">
	<div class="mb-6">
		<h1 class="text-2xl font-bold">Integrations</h1>
		<p class="text-base-content/70">Manage external service connections and data sources.</p>
	</div>

	<!-- API Integrations -->
	<div class="mb-6 space-y-4">
		<h2 class="text-lg font-semibold">API Integrations</h2>

		<!-- TMDB -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body">
				<div class="flex items-center gap-4">
					<div class="rounded-lg bg-base-200 p-3">
						<Film class="h-6 w-6 text-primary" />
					</div>
					<div class="flex-1">
						<h2 class="text-lg font-semibold">TMDB Integration</h2>
						<p class="text-sm text-base-content/70">
							The Movie Database API for metadata and Smart Lists
						</p>
					</div>
					<div class="flex items-center gap-2">
						{#if data.tmdb.hasApiKey}
							<div class="badge gap-1 badge-success">
								<CheckCircle class="h-3 w-3" />
								Configured
							</div>
						{:else}
							<div class="badge gap-1 badge-warning">
								<AlertCircle class="h-3 w-3" />
								Not Configured
							</div>
						{/if}
						<button onclick={openTmdbModal} class="btn btn-ghost btn-sm">
							Configure
							<ChevronRight class="h-4 w-4" />
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Integration Cards Grid -->
	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
		{#each integrations as integration (integration.href)}
			{@const Icon = integration.icon}
			<a
				href={resolvePath(integration.href)}
				class="card bg-base-100 shadow-xl transition-all hover:-translate-y-0.5 hover:shadow-2xl"
			>
				<div class="card-body">
					<div class="flex items-start gap-3">
						<div class="rounded-lg bg-base-200 p-3">
							<Icon class="h-6 w-6 text-primary" />
						</div>
						<div class="flex-1">
							<h2 class="card-title text-lg">{integration.title}</h2>
							<p class="text-sm text-base-content/70">{integration.description}</p>
						</div>
						<ChevronRight class="h-5 w-5 text-base-content/50" />
					</div>

					<div class="divider my-2"></div>

					<div class="flex flex-wrap gap-3">
						{#each integration.stats as stat (stat.label)}
							<div class="flex items-center gap-2">
								<span class="text-sm text-base-content/70">{stat.label}:</span>
								<span
									class="font-medium {stat.status === 'success'
										? 'text-success'
										: stat.status === 'warning'
											? 'text-warning'
											: stat.status === 'error'
												? 'text-error'
												: ''}"
								>
									{stat.value}
								</span>
							</div>
						{/each}
					</div>
				</div>
			</a>
		{/each}
	</div>

	<!-- Quick Start Guide -->
	{#if data.indexers.total === 0 || data.downloadClients.total === 0}
		<div class="mt-6">
			<div class="alert alert-info">
				<AlertCircle class="h-5 w-5" />
				<div>
					<h3 class="font-semibold">Getting Started</h3>
					<p class="text-sm">
						{#if data.indexers.total === 0 && data.downloadClients.total === 0}
							Configure at least one indexer and one download client to start acquiring content.
						{:else if data.indexers.total === 0}
							Add an indexer to search for content.
						{:else}
							Add a download client to download content.
						{/if}
					</p>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- TMDB API Key Modal -->
{#if tmdbModalOpen}
	<div class="modal-open modal">
		<div class="modal-box w-full max-w-[min(28rem,calc(100vw-2rem))] wrap-break-word">
			<button
				onclick={closeTmdbModal}
				class="btn absolute top-2 right-2 btn-circle btn-ghost btn-sm"
			>
				<X class="h-4 w-4" />
			</button>
			<h3 class="text-lg font-bold">TMDB API Key</h3>
			<p class="py-2 text-sm text-base-content/70">
				Enter your TMDB API key to fetch movie and TV show metadata. Get a free key at <a
					href="https://www.themoviedb.org/settings/api"
					target="_blank"
					class="link link-primary">themoviedb.org</a
				>.
			</p>
			<form
				method="POST"
				action="?/saveTmdbApiKey"
				use:enhance={() => {
					saving = true;
					return async ({ update }) => {
						await update();
						saving = false;
						closeTmdbModal();
					};
				}}
			>
				<div class="form-control w-full">
					<label class="label" for="apiKey">
						<span class="label-text">API Key</span>
					</label>
					<input
						type="text"
						id="apiKey"
						name="apiKey"
						bind:value={tmdbApiKey}
						placeholder="Enter your TMDB API key"
						class="input-bordered input w-full"
					/>
				</div>
				<div class="modal-action">
					<button type="button" onclick={closeTmdbModal} class="btn btn-ghost">Cancel</button>
					<button type="submit" class="btn btn-primary" disabled={saving}>
						{#if saving}
							<span class="loading loading-sm loading-spinner"></span>
						{/if}
						Save
					</button>
				</div>
			</form>
		</div>
		<button type="button" class="modal-backdrop" onclick={closeTmdbModal} aria-label="Close modal"
		></button>
	</div>
{/if}
