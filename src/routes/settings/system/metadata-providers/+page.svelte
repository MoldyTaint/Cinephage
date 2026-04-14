<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { ChevronRight, CheckCircle, AlertCircle } from 'lucide-svelte';
	import type { LayoutData } from '../$types';
	import { toasts } from '$lib/stores/toast.svelte';
	import { invalidateAll, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { ModalWrapper, ModalHeader, ModalFooter } from '$lib/components/ui/modal';
	import { SettingsPage, SettingsSection } from '$lib/components/ui/settings';
	import { getResponseErrorMessage, readResponsePayload } from '$lib/utils/http';

	let { data }: { data: LayoutData } = $props();

	// =====================
	// TMDB Config State
	// =====================
	let tmdbModalOpen = $state(false);
	let tmdbApiKey = $state('');
	let tmdbSaving = $state(false);
	let tmdbError = $state<string | null>(null);

	function openTmdbModal() {
		tmdbApiKey = '';
		tmdbError = null;
		tmdbModalOpen = true;
	}

	function closeTmdbModal() {
		tmdbError = null;
		tmdbModalOpen = false;

		const url = new URL($page.url);
		if (url.searchParams.get('open') === 'tmdb') {
			url.searchParams.delete('open');
			goto(url.toString(), { replaceState: true, noScroll: true });
		}
	}

	async function handleTmdbSave() {
		tmdbSaving = true;
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
				tmdbError = getResponseErrorMessage(payload, m.settings_integrations_tmdbFailedToSave());
				return;
			}

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

	// Open modal if navigated with ?open=tmdb
	$effect(() => {
		const shouldOpenTmdbModal = $page.url.searchParams.get('open') === 'tmdb';
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
				{m.action_configure()}
				<ChevronRight class="h-4 w-4" />
			</button>
		</div>

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
