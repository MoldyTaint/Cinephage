<script lang="ts">
	import { Database, Download, Server, Captions, Languages, Monitor, Archive } from 'lucide-svelte';
	import SettingsTabNav from '$lib/components/settings/SettingsTabNav.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { children } = $props();

	const navItems = [
		{
			href: '/settings/integrations/indexers',
			label: m.nav_indexers(),
			icon: Database
		},
		{
			href: '/settings/integrations/download-clients',
			label: m.nav_downloadClients(),
			icon: Download
		},
		{
			href: '/settings/integrations/nntp-servers',
			label: m.nav_nntpServers(),
			icon: Server
		},
		{
			href: '/settings/integrations/subtitle-providers',
			label: m.nav_subtitleProviders(),
			icon: Captions
		},
		{
			href: '/settings/integrations/language-profiles',
			label: m.nav_languageProfiles(),
			icon: Languages
		},
		{
			href: '/settings/integrations/media-browsers',
			label: m.nav_mediaServers(),
			icon: Monitor
		},
		{
			href: '/settings/integrations/streaming',
			label: m.settings_streaming_heading(),
			icon: Archive
		}
	];
</script>

<div class="flex min-h-full flex-col">
	<SettingsTabNav {navItems} ariaLabel={m.settings_integrations_tabsAriaLabel()} />

	<!-- Page content -->
	<div class="flex-1">
		{@render children()}
	</div>
</div>
