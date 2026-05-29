<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { ChevronRight, CheckCircle, AlertCircle } from 'lucide-svelte';
	import type { LayoutData } from '../$types';
	import { toasts } from '$lib/stores/toast.svelte';
	import { invalidateAll, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ModalWrapper, ModalHeader, ModalFooter } from '$lib/components/ui/modal';
	import { SettingsPage, SettingsSection } from '$lib/components/ui/settings';
	import {
		updateMetadataProviderSettings,
		updateTmdbSettings,
		type MetadataProviderSettingsPayload
	} from '$lib/api/settings.js';

	let { data }: { data: LayoutData } = $props();

	// =====================
	// TMDB Config State
	// =====================
	let tmdbModalOpen = $state(false);
	let tmdbApiKey = $state('');
	let tmdbSaving = $state(false);
	let tmdbError = $state<string | null>(null);
	let providerModalOpen = $state<null | 'anilist' | 'mal'>(null);
	let providerSaving = $state(false);
	let providerError = $state<string | null>(null);
	let anilistEnabled = $state(false);
	let malClientId = $state('');

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

	function openProviderModal(provider: 'anilist' | 'mal') {
		providerError = null;
		providerModalOpen = provider;
		anilistEnabled = data.metadataProviders?.hasAniListEnabled ?? false;
		malClientId = '';
	}

	function closeProviderModal() {
		providerError = null;
		providerModalOpen = null;
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

	async function handleProviderSave(provider: 'anilist' | 'mal') {
		providerSaving = true;
		providerError = null;
		try {
			let payload: MetadataProviderSettingsPayload;
			if (provider === 'anilist') {
				payload = { anilistEnabled };
			} else {
				payload = { malClientId };
			}

			await updateMetadataProviderSettings(payload);
			await invalidateAll();
			toasts.success('Metadata provider settings saved');
			closeProviderModal();
		} catch (error) {
			providerError =
				error instanceof Error ? error.message : m.settings_integrations_tmdbFailedToSave();
		} finally {
			providerSaving = false;
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

	<SettingsSection
		title="AniList"
		description="Public AniList metadata for anime (no OAuth required for this integration)."
	>
		<div class="flex items-center gap-3">
			{#if data.metadataProviders?.hasAniListEnabled}
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
			<button onclick={() => openProviderModal('anilist')} class="btn gap-1 btn-sm btn-primary">
				{data.metadataProviders?.hasAniListEnabled ? m.action_update() : m.action_configure()}
				<ChevronRight class="h-4 w-4" />
			</button>
		</div>
		{#if !data.metadataProviders?.hasAniListEnabled}
			<div class="alert alert-info">
				<AlertCircle class="h-5 w-5" />
				<div>
					<p class="text-sm">
						AniList does not require OAuth for this integration. Enable the provider and save.
					</p>
				</div>
			</div>
		{/if}
	</SettingsSection>

	<SettingsSection
		title="MyAnimeList"
		description="MAL metadata via official API (client id only for metadata lookups)."
	>
		<div class="flex items-center gap-3">
			{#if data.metadataProviders?.hasMalClientId}
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
			<button onclick={() => openProviderModal('mal')} class="btn gap-1 btn-sm btn-primary">
				{data.metadataProviders?.hasMalClientId ? m.action_update() : m.action_configure()}
				<ChevronRight class="h-4 w-4" />
			</button>
		</div>
		{#if !data.metadataProviders?.hasMalClientId}
			<div class="alert alert-info">
				<AlertCircle class="h-5 w-5" />
				<div>
					<p class="text-sm">
						Create a MAL app to get a Client ID:
						<a href="https://myanimelist.net/apiconfig" target="_blank" class="link link-primary">
							myanimelist.net/apiconfig
						</a>.
					</p>
				</div>
			</div>
		{/if}
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

<ModalWrapper open={providerModalOpen === 'anilist'} onClose={closeProviderModal} maxWidth="md">
	<ModalHeader title="Configure AniList" onClose={closeProviderModal} />
	<form
		onsubmit={async (event) => {
			event.preventDefault();
			await handleProviderSave('anilist');
		}}
	>
		<div class="space-y-4 p-4">
			<p class="text-sm text-base-content/70">
				AniList does not require OAuth for this integration. Enable it to allow AniList metadata
				lookups.
				<a
					href="https://anilist.gitbook.io/anilist-apiv2-docs/"
					target="_blank"
					class="link link-primary"
				>
					AniList API docs
				</a>.
			</p>
			<label class="label cursor-pointer justify-start gap-3">
				<input type="checkbox" class="checkbox" bind:checked={anilistEnabled} />
				<span class="label-text">Enable AniList metadata provider</span>
			</label>
			{#if providerError}
				<div class="alert alert-error"><span>{providerError}</span></div>
			{/if}
		</div>
		<ModalFooter
			onCancel={closeProviderModal}
			onSave={() => handleProviderSave('anilist')}
			saving={providerSaving}
		/>
	</form>
</ModalWrapper>

<ModalWrapper open={providerModalOpen === 'mal'} onClose={closeProviderModal} maxWidth="md">
	<ModalHeader title="Configure MyAnimeList" onClose={closeProviderModal} />
	<form
		onsubmit={async (event) => {
			event.preventDefault();
			await handleProviderSave('mal');
		}}
	>
		<div class="space-y-4 p-4">
			<p class="text-sm text-base-content/70">
				Create a MAL app and paste the Client ID here.
				<a href="https://myanimelist.net/apiconfig" target="_blank" class="link link-primary">
					myanimelist.net/apiconfig
				</a>.
			</p>
			<div class="form-control w-full">
				<label class="label" for="malClientId"><span class="label-text">Client ID</span></label>
				<input id="malClientId" class="input-bordered input w-full" bind:value={malClientId} />
			</div>
			{#if providerError}
				<div class="alert alert-error"><span>{providerError}</span></div>
			{/if}
		</div>
		<ModalFooter
			onCancel={closeProviderModal}
			onSave={() => handleProviderSave('mal')}
			saving={providerSaving}
		/>
	</form>
</ModalWrapper>
