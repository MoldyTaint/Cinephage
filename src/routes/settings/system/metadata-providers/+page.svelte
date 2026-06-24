<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { ChevronRight, CheckCircle, AlertCircle, Lock } from 'lucide-svelte';
	import type { LayoutData } from '../$types';
	import { toasts } from '$lib/stores/toast.svelte';
	import { invalidateAll, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ModalWrapper, ModalHeader, ModalFooter } from '$lib/components/ui/modal';
	import { SettingsPage, SettingsSection } from '$lib/components/ui/settings';
	import {
		updateMetadataProviderSettings,
		updateTmdbSettings,
		updateCinephageBackend,
		getGithubRelease
	} from '$lib/api/settings.js';

	let { data }: { data: LayoutData } = $props();

	// =====================
	// Source + Cinephage Backend (derived from layout data, refreshed via invalidateAll)
	// =====================
	const source = $derived((data.metadataProviders?.source ?? 'cinephage') as 'cinephage' | 'tmdb');
	const cinephageConfigured = $derived(data.cinephageBackend?.configured ?? false);
	const cinephageVersion = $derived(data.cinephageBackend?.version ?? '');
	const cinephageCommit = $derived(data.cinephageBackend?.commit ?? '');
	let sourceSaving = $state(false);
	let sourceError = $state<string | null>(null);
	let autofillSaving = $state(false);
	let autofillError = $state<string | null>(null);

	// =====================
	// TMDB Config State
	// =====================
	let tmdbModalOpen = $state(false);
	let tmdbApiKey = $state('');
	let tmdbSaving = $state(false);
	let tmdbError = $state<string | null>(null);

	// =====================
	// Anime Enrichment State
	// =====================
	let enrichmentModalOpen = $state(false);
	let enrichmentSaving = $state(false);
	let enrichmentError = $state<string | null>(null);
	let animeEnrichmentEnabled = $state(false);

	async function handleSourceChange(newSource: 'cinephage' | 'tmdb') {
		sourceSaving = true;
		sourceError = null;
		try {
			await updateMetadataProviderSettings({ source: newSource });
			await invalidateAll();
			toasts.success('Metadata source updated');
		} catch (error) {
			sourceError = error instanceof Error ? error.message : 'Failed to update metadata source';
		} finally {
			sourceSaving = false;
		}
	}

	async function handleAutofill() {
		autofillSaving = true;
		autofillError = null;
		try {
			const release = await getGithubRelease();
			if (!release.success || !release.version || !release.commit) {
				throw new Error('Could not fetch latest release');
			}
			await updateCinephageBackend({ version: release.version, commit: release.commit });
			await invalidateAll();
			toasts.success('Build identity updated');
		} catch (error) {
			autofillError = error instanceof Error ? error.message : 'Failed to fetch release';
		} finally {
			autofillSaving = false;
		}
	}

	function openTmdbModal() {
		tmdbApiKey = '';
		tmdbError = null;
		tmdbModalOpen = true;
	}

	function closeTmdbModal() {
		tmdbError = null;
		tmdbModalOpen = false;

		const url = new URL(page.url);
		if (url.searchParams.get('open') === 'tmdb') {
			url.searchParams.delete('open');
			goto(url.toString(), { replaceState: true, noScroll: true });
		}
	}

	function openEnrichmentModal() {
		enrichmentError = null;
		animeEnrichmentEnabled = data.metadataProviders?.animeEnrichmentEnabled ?? true;
		enrichmentModalOpen = true;
	}

	function closeEnrichmentModal() {
		enrichmentError = null;
		enrichmentModalOpen = false;
	}

	async function handleTmdbSave() {
		tmdbSaving = true;
		tmdbError = null;

		try {
			await updateTmdbSettings(tmdbApiKey);

			await invalidateAll();
			toasts.success(m.settings_integrations_tmdbKeySaved());
			closeTmdbModal();
		} catch (error) {
			tmdbError =
				error instanceof Error ? error.message : m.settings_integrations_tmdbFailedToSave();
		} finally {
			tmdbSaving = false;
		}
	}

	async function handleEnrichmentSave() {
		enrichmentSaving = true;
		enrichmentError = null;
		try {
			await updateMetadataProviderSettings({ animeEnrichmentEnabled });
			await invalidateAll();
			toasts.success('Anime enrichment settings saved');
			closeEnrichmentModal();
		} catch (error) {
			enrichmentError =
				error instanceof Error ? error.message : m.settings_integrations_tmdbFailedToSave();
		} finally {
			enrichmentSaving = false;
		}
	}

	// Open modal if navigated with ?open=tmdb
	$effect(() => {
		const shouldOpenTmdbModal = page.url.searchParams.get('open') === 'tmdb';
		if (shouldOpenTmdbModal && !tmdbModalOpen) {
			openTmdbModal();
		}
	});
</script>

<svelte:head>
	<title>{m.settings_system_metadataProviders_pageTitle()}</title>
</svelte:head>

<SettingsPage
	title={m.nav_metadataProviders()}
	subtitle={m.settings_system_metadataProviders_subtitle()}
>
	<SettingsSection
		title="Metadata Source"
		description="Choose where movie and TV metadata comes from. Cinephage bundles TMDB and TVDB — no API keys needed. Or use your own TMDB key."
	>
		<div class="flex flex-wrap items-center gap-4">
			<label class="label justify-start gap-2 cursor-not-allowed opacity-60">
				<input
					type="radio"
					name="metadata-source"
					class="radio radio-sm"
					checked={source === 'cinephage'}
					disabled
				/>
				<Lock class="h-3.5 w-3.5 shrink-0 text-base-content/40" />
				<span class="label-text font-medium">Cinephage</span>
				<span class="badge badge-ghost badge-sm">Upcoming feature</span>
			</label>
			<label class="label cursor-pointer justify-start gap-2">
				<input
					type="radio"
					name="metadata-source"
					class="radio radio-sm"
					checked={source === 'tmdb'}
					onchange={() => handleSourceChange('tmdb')}
					disabled={sourceSaving}
				/>
				<span class="label-text font-medium">Use my own TMDB key</span>
			</label>
			{#if sourceSaving}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
		</div>
		{#if sourceError}
			<div class="alert alert-error mt-2"><span>{sourceError}</span></div>
		{/if}
	</SettingsSection>

	{#if source === 'cinephage'}
		<SettingsSection
			title="Cinephage Backend"
			description="Configure the build identity that authorizes this install with the Cinephage API. Click auto-fill to fetch the latest published build."
		>
			<div class="flex flex-wrap items-center gap-3">
				{#if cinephageConfigured}
					<div class="badge gap-1 badge-success">
						<CheckCircle class="h-3 w-3" />
						Configured
					</div>
					<span class="text-sm text-base-content/70">
						v{cinephageVersion}{#if cinephageCommit}
							({cinephageCommit}){/if}
					</span>
				{:else}
					<div class="badge gap-1 badge-warning">
						<AlertCircle class="h-3 w-3" />
						Not configured
					</div>
				{/if}
				<button
					onclick={handleAutofill}
					class="btn gap-1 btn-sm btn-primary"
					disabled={autofillSaving}
				>
					{#if autofillSaving}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					{autofillSaving ? 'Fetching...' : 'Auto-fill from latest release'}
				</button>
			</div>
			{#if autofillError}
				<div class="alert alert-error mt-2"><span>{autofillError}</span></div>
			{/if}
		</SettingsSection>
	{/if}

	{#if source === 'tmdb'}
		<SettingsSection
			title={m.settings_integrations_tmdbTitle()}
			description={m.settings_integrations_tmdbDescription()}
		>
			<div class="flex items-center gap-3">
				{#if data.tmdb.hasApiKey}
					<div class="badge gap-1 badge-success">
						<CheckCircle class="h-3 w-3" />
						{m.settings_integrations_configured()}
					</div>
				{:else}
					<div class="badge gap-1 badge-warning">
						<AlertCircle class="h-3 w-3" />
						{m.settings_integrations_notConfigured()}
					</div>
				{/if}
				<button onclick={openTmdbModal} class="btn gap-1 btn-sm btn-primary">
					{data.tmdb.hasApiKey ? m.action_update() : m.action_configure()}
					<ChevronRight class="h-4 w-4" />
				</button>
			</div>

			{#if !data.tmdb.hasApiKey}
				<div class="alert alert-info">
					<AlertCircle class="h-5 w-5" />
					<div>
						<p class="text-sm">
							{m.settings_integrations_tmdbApiKeyDescription()}
							<a
								href="https://www.themoviedb.org/settings/api"
								target="_blank"
								class="link link-primary"
							>
								themoviedb.org
							</a>.
						</p>
					</div>
				</div>
			{/if}
		</SettingsSection>
	{/if}

	<SettingsSection
		title="Anime Metadata Enrichment"
		description="When enabled, AniList and MyAnimeList (via Jikan) automatically enrich anime titles with alternate titles and adult classification. No account or API key required."
	>
		<div class="flex items-center gap-3">
			{#if data.metadataProviders?.animeEnrichmentEnabled}
				<div class="badge gap-1 badge-success">
					<CheckCircle class="h-3 w-3" />
					Enabled
				</div>
			{:else}
				<div class="badge gap-1 badge-warning">
					<AlertCircle class="h-3 w-3" />
					Disabled
				</div>
			{/if}
			<button onclick={openEnrichmentModal} class="btn gap-1 btn-sm btn-primary">
				Configure
				<ChevronRight class="h-4 w-4" />
			</button>
		</div>
		<p class="text-sm text-base-content/70">
			Enrichment data is supplementary only - TMDB remains the canonical source for title, overview,
			and display metadata.
		</p>
	</SettingsSection>
</SettingsPage>

<!-- TMDB API Key Modal -->
<ModalWrapper open={tmdbModalOpen} onClose={closeTmdbModal} maxWidth="md">
	<ModalHeader title={m.settings_integrations_tmdbApiKeyTitle()} onClose={closeTmdbModal} />
	<form
		onsubmit={async (event) => {
			event.preventDefault();
			await handleTmdbSave();
		}}
	>
		<div class="space-y-4 p-4">
			<p class="text-sm text-base-content/70">
				{m.settings_integrations_tmdbApiKeyDescription()}
				<a href="https://www.themoviedb.org/settings/api" target="_blank" class="link link-primary">
					themoviedb.org
				</a>.
			</p>
			<div class="form-control w-full">
				<label class="label" for="tmdbApiKey">
					<span class="label-text">{m.settings_integrations_apiKeyLabel()}</span>
				</label>
				<input
					type="text"
					id="tmdbApiKey"
					name="apiKey"
					bind:value={tmdbApiKey}
					placeholder={data.tmdb.hasApiKey
						? m.settings_integrations_apiKeyPlaceholderExisting()
						: m.settings_integrations_apiKeyPlaceholderNew()}
					class="input-bordered input w-full"
				/>
			</div>
			{#if tmdbError}
				<div class="alert alert-error">
					<span>{tmdbError}</span>
				</div>
			{/if}
		</div>
		<ModalFooter onCancel={closeTmdbModal} onSave={handleTmdbSave} saving={tmdbSaving} />
	</form>
</ModalWrapper>

<!-- Anime Enrichment Toggle Modal -->
<ModalWrapper open={enrichmentModalOpen} onClose={closeEnrichmentModal} maxWidth="md">
	<ModalHeader title="Anime Metadata Enrichment" onClose={closeEnrichmentModal} />
	<form
		onsubmit={async (event) => {
			event.preventDefault();
			await handleEnrichmentSave();
		}}
	>
		<div class="space-y-4 p-4">
			<p class="text-sm text-base-content/70">
				When enabled, Cinephage automatically queries AniList and MyAnimeList (via Jikan) for anime
				titles during metadata refresh. This supplies alternate and romaji titles for better indexer
				search coverage, and the adult classification used for XXX category searches.
			</p>
			<label class="label cursor-pointer justify-start gap-3">
				<input type="checkbox" class="checkbox" bind:checked={animeEnrichmentEnabled} />
				<span class="label-text">Enable anime metadata enrichment</span>
			</label>
			{#if enrichmentError}
				<div class="alert alert-error"><span>{enrichmentError}</span></div>
			{/if}
		</div>
		<ModalFooter
			onCancel={closeEnrichmentModal}
			onSave={handleEnrichmentSave}
			saving={enrichmentSaving}
		/>
	</form>
</ModalWrapper>
