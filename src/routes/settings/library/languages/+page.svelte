<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { SettingsPage } from '$lib/components/ui/settings';
	import LanguageSettingsForm from '$lib/components/settings/languages/LanguageSettingsForm.svelte';
	import LanguageProfilesManager from '$lib/components/settings/languages/LanguageProfilesManager.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{m.settings_languages_pageTitle()}</title>
</svelte:head>

<SettingsPage title={m.nav_languages()} subtitle={m.settings_languages_subtitle()}>
	<LanguageSettingsForm
		settings={data.settings}
		profiles={data.profiles}
		countries={data.countries}
		languages={data.languages}
	/>

	<LanguageProfilesManager
		profiles={data.profiles}
		defaultProfileId={data.settings.defaultProfileId}
	/>
</SettingsPage>
