<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolvePath } from '$lib/utils/routing';
	import { toasts } from '$lib/stores/toast.svelte';
	import { getResponseErrorMessage, readResponsePayload } from '$lib/utils/http';
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
	import * as m from '$lib/paraglide/messages.js';

	let { data }: { data: PageData } = $props();

	// TMDB modal state
	let tmdbModalOpen = $state(false);
	let tmdbApiKey = $state('');
	let saving = $state(false);
	let tmdbError = $state<string | null>(null);

	function openTmdbModal() {
		tmdbApiKey = '';
		tmdbError = null;
		tmdbModalOpen = true;
	}

	function closeTmdbModal() {
		tmdbError = null;
		tmdbModalOpen = false;
	}

	async function handleTmdbSave() {
		saving = true;
		tmdbError = null;

		try {
			const response = await fetch('/api/settings/tmdb', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify({ apiKey: tmdbApiKey })
			});

			const payload = await readResponsePayload<Record<string, unknown>>(response);
			if (!response.ok) {
				tmdbError = getResponseErrorMessage(payload, 'Failed to save TMDB API key');
				return;
			}

			await invalidateAll();
			toasts.success(m.settings_integrations_tmdbKeySaved());
			closeTmdbModal();
		} catch (error) {
			tmdbError = error instanceof Error ? error.message : 'Failed to save TMDB API key';
		} finally {
			saving = false;
		}
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
			title: m.nav_indexers(),
			description: m.settings_integrations_indexersDesc(),
			href: '/settings/integrations/indexers',
			icon: Database,
			stats: [
				{ label: m.settings_integrations_statTotal(), value: data.indexers.total },
				{
					label: m.common_enabled(),
					value: data.indexers.enabled,
					status: data.indexers.enabled > 0 ? 'success' : 'warning'
				}
			]
		},
		{
			title: m.nav_downloadClients(),
			description: m.settings_integrations_downloadClientsDesc(),
			href: '/settings/integrations/download-clients',
			icon: Download,
			stats: [
				{ label: m.settings_integrations_statTotal(), value: data.downloadClients.total },
				{
					label: m.common_enabled(),
					value: data.downloadClients.enabled,
					status: data.downloadClients.enabled > 0 ? 'success' : 'warning'
				}
			]
		},
		{
			title: m.nav_nntpServers(),
			description: m.settings_integrations_nntpServersDesc(),
			href: '/settings/integrations/nntp-servers',
			icon: Server,
			stats: [
				{ label: m.settings_integrations_statTotal(), value: data.nntpServers.total },
				{
					label: m.common_enabled(),
					value: data.nntpServers.enabled,
					status: data.nntpServers.enabled > 0 ? 'success' : 'warning'
				}
			]
		},
		{
			title: m.nav_subtitleProviders(),
			description: m.settings_integrations_subtitleProvidersDesc(),
			href: '/settings/integrations/subtitle-providers',
			icon: Subtitles,
			stats: [
				{ label: m.settings_integrations_statTotal(), value: data.subtitleProviders.total },
				{
					label: m.common_enabled(),
					value: data.subtitleProviders.enabled,
					status: data.subtitleProviders.enabled > 0 ? 'success' : 'warning'
				},
				{
					label: m.status_healthy(),
					value: `${data.subtitleProviders.healthy}/${data.subtitleProviders.total}`,
					status:
						data.subtitleProviders.healthy === data.subtitleProviders.total ? 'success' : 'warning'
				}
			]
		},
		{
			title: m.nav_languageProfiles(),
			description: m.settings_integrations_languageProfilesDesc(),
			href: '/settings/integrations/language-profiles',
			icon: Languages,
			stats: [
				{ label: m.settings_integrations_statProfiles(), value: data.languageProfiles.total },
				{
					label: m.common_default(),
					value: data.languageProfiles.hasDefault
						? m.settings_integrations_statSet()
						: m.settings_integrations_statNotSet(),
					status: data.languageProfiles.hasDefault ? 'success' : 'warning'
				}
			]
		},
		{
			title: m.nav_mediaServers(),
			description: m.settings_integrations_mediaServersDesc(),
			href: '/settings/integrations/media-browsers',
			icon: Monitor,
			stats: [
				{ label: m.settings_integrations_statTotal(), value: data.mediaBrowsers.total },
				{
					label: m.common_enabled(),
					value: data.mediaBrowsers.enabled,
					status: data.mediaBrowsers.enabled > 0 ? 'success' : 'warning'
				}
			]
		}
	]);
</script>

<svelte:head>
	<title>{m.settings_integrations_pageTitle()}</title>
</svelte:head>

<div class="w-full p-3 sm:p-4">
	<div class="mb-5 sm:mb-6">
		<h1 class="text-2xl font-bold">{m.nav_integrations()}</h1>
		<p class="text-base-content/70">{m.settings_integrations_subtitle()}</p>
	</div>

	<!-- API Integrations -->
	<div class="mb-6 space-y-4">
		<h2 class="text-lg font-semibold">{m.settings_integrations_apiIntegrations()}</h2>

		<!-- TMDB -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body p-4 sm:p-6">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div class="flex min-w-0 items-start gap-3">
						<div class="shrink-0 rounded-lg bg-base-200 p-3">
							<Film class="h-6 w-6 text-primary" />
						</div>
						<div class="min-w-0">
							<h2 class="text-lg font-semibold">{m.settings_integrations_tmdbTitle()}</h2>
							<p class="text-sm text-base-content/70">
								{m.settings_integrations_tmdbDescription()}
							</p>
						</div>
					</div>
					<div class="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
						{#if data.tmdb.hasApiKey}
							<div class="badge shrink-0 gap-1 badge-success">
								<CheckCircle class="h-3 w-3" />
								{m.settings_integrations_configured()}
							</div>
						{:else}
							<div class="badge shrink-0 gap-1 badge-warning">
								<AlertCircle class="h-3 w-3" />
								{m.settings_integrations_notConfigured()}
							</div>
						{/if}
						<button onclick={openTmdbModal} class="btn gap-1 px-2 btn-ghost btn-sm">
							{m.action_configure()}
							<ChevronRight class="h-4 w-4" />
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Integration Cards Grid -->
	<div class="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
		{#each integrations as integration (integration.href)}
			{@const Icon = integration.icon}
			<a
				href={resolvePath(integration.href)}
				class="card bg-base-100 shadow-xl transition-all hover:-translate-y-0.5 hover:shadow-2xl active:scale-[0.99]"
			>
				<div class="card-body p-4 sm:p-5">
					<div class="flex items-start gap-3">
						<div class="shrink-0 rounded-lg bg-base-200 p-3">
							<Icon class="h-6 w-6 text-primary" />
						</div>
						<div class="min-w-0 flex-1">
							<h2 class="card-title text-base sm:text-lg">{integration.title}</h2>
							<p class="text-sm text-base-content/70">{integration.description}</p>
						</div>
						<ChevronRight class="hidden h-5 w-5 text-base-content/50 sm:block" />
					</div>

					<div class="divider my-1.5 sm:my-2"></div>

					<div
						class="grid auto-cols-fr grid-flow-col items-center gap-2 sm:flex sm:flex-wrap sm:gap-3"
					>
						{#each integration.stats as stat (stat.label)}
							<div
								class="flex min-w-0 items-center justify-center gap-1 whitespace-nowrap sm:justify-start sm:gap-2"
							>
								<span class="text-[11px] text-base-content/70 sm:text-sm">{stat.label}:</span>
								<span
									class="text-sm font-medium sm:text-base {stat.status === 'success'
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
			<div class="alert items-start gap-3 alert-info sm:items-center">
				<AlertCircle class="h-5 w-5 shrink-0" />
				<div>
					<h3 class="font-semibold">{m.settings_integrations_gettingStarted()}</h3>
					<p class="text-sm">
						{#if data.indexers.total === 0 && data.downloadClients.total === 0}
							{m.settings_integrations_gettingStartedBoth()}
						{:else if data.indexers.total === 0}
							{m.settings_integrations_gettingStartedIndexer()}
						{:else}
							{m.settings_integrations_gettingStartedDownloadClient()}
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
		<div class="modal-box w-full max-w-[min(28rem,calc(100vw-2rem))] p-4 wrap-break-word sm:p-6">
			<button
				onclick={closeTmdbModal}
				class="btn absolute top-2 right-2 btn-circle btn-ghost btn-sm"
			>
				<X class="h-4 w-4" />
			</button>
			<h3 class="text-lg font-bold">{m.settings_integrations_tmdbApiKeyTitle()}</h3>
			<p class="py-2 text-sm text-base-content/70">
				{m.settings_integrations_tmdbApiKeyDescription()}
				<a href="https://www.themoviedb.org/settings/api" target="_blank" class="link link-primary"
					>themoviedb.org</a
				>.
			</p>
			<form
				onsubmit={async (event) => {
					event.preventDefault();
					await handleTmdbSave();
				}}
			>
				<div class="form-control w-full">
					<label class="label" for="apiKey">
						<span class="label-text">{m.settings_integrations_apiKeyLabel()}</span>
					</label>
					<input
						type="text"
						id="apiKey"
						name="apiKey"
						bind:value={tmdbApiKey}
						placeholder={data.tmdb.hasApiKey
							? m.settings_integrations_apiKeyPlaceholderExisting()
							: m.settings_integrations_apiKeyPlaceholderNew()}
						class="input-bordered input w-full"
					/>
				</div>
				{#if tmdbError}
					<div class="mt-4 alert alert-error">
						<span>{tmdbError}</span>
					</div>
				{/if}
				<div class="modal-action flex-col-reverse sm:flex-row">
					<button type="button" onclick={closeTmdbModal} class="btn w-full btn-ghost sm:w-auto">
						{m.action_cancel()}
					</button>
					<button type="submit" class="btn w-full btn-primary sm:w-auto" disabled={saving}>
						{#if saving}
							<span class="loading loading-sm loading-spinner"></span>
						{/if}
						{m.action_save()}
					</button>
				</div>
			</form>
		</div>
		<button
			type="button"
			class="modal-backdrop"
			onclick={closeTmdbModal}
			aria-label={m.action_close()}
		></button>
	</div>
{/if}
