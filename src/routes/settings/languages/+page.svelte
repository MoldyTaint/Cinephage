<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import LanguageSelector from '$lib/components/ui/LanguageSelector.svelte';
	import { SettingsPage, SettingsSection } from '$lib/components/ui/settings';
	import { toasts } from '$lib/stores/toast.svelte';
	import { getResponseErrorMessage } from '$lib/utils/http';
	import { resolve } from '$app/paths';
	import { updateLanguageSettings, ApiError } from '$lib/api';
	import { ArrowRight } from 'lucide-svelte';
	import type { LanguageSettingsUpdateInput } from '$lib/validation/schemas';
	import type { PageData } from './$types';

	interface LanguageOption {
		code: string;
		name: string;
	}

	let { data }: { data: PageData } = $props();

	let saving = $state(false);

	// Form state; nullable settings use '' as the "none" sentinel in their
	// selects. Synced from the loaded singleton in the effect below.
	let metadataLocale = $state('en-US');
	let region = $state('US');
	let discoverFilter = $state('');
	let preferOriginalTitle = $state(false);
	let defaultProfileId = $state('');
	let unknownPolicy = $state<'und' | 'assume-language'>('und');
	let assumedLanguage = $state('');
	let autoSyncSubtitles = $state(true);

	// Re-sync when the loader data changes (navigation/invalidation).
	$effect(() => {
		metadataLocale = data.settings.metadataLocale;
		region = data.settings.region;
		discoverFilter = data.settings.discoverOriginalFilter ?? '';
		preferOriginalTitle = data.settings.preferOriginalTitle;
		defaultProfileId = data.settings.defaultProfileId ?? '';
		unknownPolicy = data.settings.unknownSubtitlePolicy;
		assumedLanguage = data.settings.assumedLanguage ?? '';
		autoSyncSubtitles = data.settings.autoSyncSubtitles;
	});

	/** Make sure the current value stays selectable even when absent from the catalogue. */
	function withCurrent(options: LanguageOption[], current: string): LanguageOption[] {
		if (!current || options.some((option) => option.code === current)) return options;
		return [{ code: current, name: current }, ...options];
	}

	let metadataLocaleOptions = $derived(withCurrent(data.languages, data.settings.metadataLocale));
	let regionOptions = $derived(withCurrent(data.countries, data.settings.region));

	// Discover filter works on TMDB base language tags (e.g. 'pt', not 'pt-BR').
	let discoverFilterOptions = $derived.by(() => {
		const seen = new Set<string>();
		const options: LanguageOption[] = [];
		for (const lang of data.languages) {
			const base = lang.code.split('-')[0];
			if (seen.has(base)) continue;
			seen.add(base);
			options.push({ code: base, name: lang.name });
		}
		return withCurrent(options, data.settings.discoverOriginalFilter ?? '');
	});

	/**
	 * Build a partial patch carrying exactly the fields the user changed.
	 * The language-settings endpoint only persists keys that are sent.
	 */
	function buildPatch(): LanguageSettingsUpdateInput {
		const patch: LanguageSettingsUpdateInput = {};

		if (metadataLocale !== data.settings.metadataLocale) patch.metadataLocale = metadataLocale;
		if (region !== data.settings.region) patch.region = region;
		if ((discoverFilter || null) !== data.settings.discoverOriginalFilter) {
			patch.discoverOriginalFilter = discoverFilter || null;
		}
		if (preferOriginalTitle !== data.settings.preferOriginalTitle) {
			patch.preferOriginalTitle = preferOriginalTitle;
		}
		if ((defaultProfileId || null) !== data.settings.defaultProfileId) {
			patch.defaultProfileId = defaultProfileId || null;
		}
		if (unknownPolicy !== data.settings.unknownSubtitlePolicy) {
			patch.unknownSubtitlePolicy = unknownPolicy;
		}
		if ((assumedLanguage || null) !== (data.settings.assumedLanguage ?? null)) {
			patch.assumedLanguage = assumedLanguage || null;
		}
		// The assumed-language select is hidden for the 'und' policy; clear the
		// stored language so it cannot linger unused.
		if (
			unknownPolicy === 'und' &&
			patch.assumedLanguage === undefined &&
			data.settings.assumedLanguage
		) {
			patch.assumedLanguage = null;
		}
		if (autoSyncSubtitles !== data.settings.autoSyncSubtitles) {
			patch.autoSyncSubtitles = autoSyncSubtitles;
		}

		return patch;
	}

	async function handleSave() {
		saving = true;
		try {
			await updateLanguageSettings(buildPatch());
			toasts.success(m.settings_languages_saved());
		} catch (error) {
			toasts.error(
				error instanceof ApiError
					? getResponseErrorMessage(error.response, m.settings_languages_saveFailed())
					: error instanceof Error
						? error.message
						: m.settings_languages_saveFailed()
			);
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{m.settings_languages_pageTitle()}</title>
</svelte:head>

<SettingsPage
	title={m.nav_languagesLocalization()}
	subtitle={m.settings_languages_subtitle()}
>
	<!-- Interface language (per-user locale, separate from media languages) -->
	<SettingsSection
		title={m.settings_languages_interfaceSection()}
		description={m.settings_languages_interfaceHint()}
	>
		<div class="max-w-md">
			<LanguageSelector showLabel />
		</div>
	</SettingsSection>

	<!-- Metadata localization -->
	<SettingsSection
		title={m.settings_languages_metadataSection()}
		description={m.settings_languages_metadataHint()}
	>
		<div class="grid gap-6 md:grid-cols-2">
			<div class="form-control">
				<label class="label" for="metadataLocale">
					<span class="label-text">{m.settings_languages_metadataLocale()}</span>
				</label>
				<select
					id="metadataLocale"
					class="select-bordered select w-full"
					bind:value={metadataLocale}
				>
					{#each metadataLocaleOptions as option (option.code)}
						<option value={option.code}>{option.name}</option>
					{/each}
				</select>
				<p class="label">
					<span class="label-text-alt whitespace-normal wrap-break-word">
						{m.settings_languages_metadataLocaleHint()}
					</span>
				</p>
			</div>
			<div class="form-control">
				<label class="label" for="region">
					<span class="label-text">{m.settings_languages_region()}</span>
				</label>
				<select id="region" class="select-bordered select w-full" bind:value={region}>
					{#each regionOptions as option (option.code)}
						<option value={option.code}>{option.name}</option>
					{/each}
				</select>
				<p class="label">
					<span class="label-text-alt whitespace-normal wrap-break-word">
						{m.settings_languages_regionHint()}
					</span>
				</p>
			</div>
			<div class="form-control">
				<label class="label" for="discoverOriginalFilter">
					<span class="label-text">{m.settings_languages_discoverOriginalFilter()}</span>
				</label>
				<select
					id="discoverOriginalFilter"
					class="select-bordered select w-full"
					bind:value={discoverFilter}
				>
					<option value="">{m.settings_languages_noOriginalFilter()}</option>
					{#each discoverFilterOptions as option (option.code)}
						<option value={option.code}>{option.name}</option>
					{/each}
				</select>
				<p class="label">
					<span class="label-text-alt whitespace-normal wrap-break-word">
						{m.settings_languages_discoverOriginalFilterHint()}
					</span>
				</p>
			</div>
			<div class="form-control">
				<label class="label cursor-pointer justify-start gap-4">
					<input
						type="checkbox"
						id="preferOriginalTitle"
						class="checkbox checkbox-primary"
						bind:checked={preferOriginalTitle}
					/>
					<span class="label-text">{m.settings_languages_preferOriginalTitle()}</span>
				</label>
				<p class="pl-10 text-xs text-base-content/60">
					{m.settings_languages_preferOriginalTitleHint()}
				</p>
			</div>
		</div>
	</SettingsSection>

	<!-- Audio & subtitles -->
	<SettingsSection
		title={m.settings_languages_audioSubtitlesSection()}
		description={m.settings_languages_audioSubtitlesHint()}
	>
		<div class="grid gap-6 md:grid-cols-2">
			<div class="form-control">
				<label class="label" for="defaultProfile">
					<span class="label-text">{m.settings_languages_defaultProfile()}</span>
				</label>
				<select
					id="defaultProfile"
					class="select-bordered select w-full"
					bind:value={defaultProfileId}
				>
					<option value="">{m.common_none()}</option>
					{#each data.profiles as profile (profile.id)}
						<option value={profile.id}>{profile.name}</option>
					{/each}
				</select>
				<p class="label">
					<span class="label-text-alt whitespace-normal wrap-break-word">
						{m.settings_languages_defaultProfileHint()}
					</span>
				</p>
			</div>
			<div class="form-control">
				<label class="label" for="unknownPolicy">
					<span class="label-text">{m.settings_languages_unknownPolicy()}</span>
				</label>
				<select
					id="unknownPolicy"
					class="select-bordered select w-full"
					bind:value={unknownPolicy}
				>
					<option value="und">{m.settings_languages_unknownPolicyUnd()}</option>
					<option value="assume-language">{m.settings_languages_unknownPolicyAssume()}</option>
				</select>
				<p class="label">
					<span class="label-text-alt whitespace-normal wrap-break-word">
						{m.settings_languages_unknownPolicyHint()}
					</span>
				</p>
			</div>
			{#if unknownPolicy === 'assume-language'}
				<div class="form-control">
					<label class="label" for="assumedLanguage">
						<span class="label-text">{m.settings_languages_assumedLanguage()}</span>
					</label>
					<select
						id="assumedLanguage"
						class="select-bordered select w-full"
						bind:value={assumedLanguage}
					>
						<option value="">{m.common_none()}</option>
						{#each data.languages as lang (lang.code)}
							<option value={lang.code}>{lang.name}</option>
						{/each}
					</select>
					<p class="label">
						<span class="label-text-alt whitespace-normal wrap-break-word">
							{m.settings_languages_assumedLanguageHint()}
						</span>
					</p>
				</div>
			{/if}
			<div class="form-control">
				<label class="label cursor-pointer justify-start gap-4">
					<input
						type="checkbox"
						id="autoSyncSubtitles"
						class="checkbox checkbox-primary"
						bind:checked={autoSyncSubtitles}
					/>
					<span class="label-text">{m.settings_languages_autoSync()}</span>
				</label>
				<p class="pl-10 text-xs text-base-content/60">
					{m.settings_languages_autoSyncHint()}
				</p>
			</div>
		</div>
	</SettingsSection>

	<!-- Cross-links -->
	<SettingsSection title={m.settings_languages_relatedSection()}>
		<div class="grid gap-3 sm:grid-cols-3">
			<a
				class="flex items-center justify-between gap-2 rounded-lg border border-base-300 px-4 py-3 text-sm font-medium transition-colors hover:border-primary"
				href={resolve('/settings/integrations/language-profiles')}
			>
				{m.settings_languages_linkLanguageProfiles()}
				<ArrowRight class="h-4 w-4 shrink-0 opacity-60" />
			</a>
			<a
				class="flex items-center justify-between gap-2 rounded-lg border border-base-300 px-4 py-3 text-sm font-medium transition-colors hover:border-primary"
				href={resolve('/settings/integrations/subtitle-providers')}
			>
				{m.settings_languages_linkSubtitleProviders()}
				<ArrowRight class="h-4 w-4 shrink-0 opacity-60" />
			</a>
			<a
				class="flex items-center justify-between gap-2 rounded-lg border border-base-300 px-4 py-3 text-sm font-medium transition-colors hover:border-primary"
				href={resolve('/settings/library/naming')}
			>
				{m.settings_languages_linkNaming()}
				<ArrowRight class="h-4 w-4 shrink-0 opacity-60" />
			</a>
		</div>
	</SettingsSection>

	<div class="flex justify-end">
		<button class="btn btn-primary" onclick={handleSave} disabled={saving}>
			{saving ? m.common_saving() : m.settings_languages_saveButton()}
		</button>
	</div>
</SettingsPage>
