<script lang="ts">
	import { Server, Film, Shield, Download } from 'lucide-svelte';
	import SettingsTabNav from '$lib/components/settings/SettingsTabNav.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { children } = $props();

	const navItems = [
		{
			href: '/settings/system/general',
			label: m.nav_general(),
			icon: Server
		},
		{
			href: '/settings/system/metadata-providers',
			label: m.nav_metadataProviders(),
			icon: Film
		},
		{
			href: '/settings/system/captcha',
			label: m.nav_captchaSolver(),
			icon: Shield
		},
		{
			href: '/settings/system/backup',
			label: m.nav_backupRestore(),
			icon: Download
		}
	];
</script>

<div class="flex min-h-full flex-col">
	<SettingsTabNav {navItems} />

	<!-- Page content -->
	<div class="flex-1">
		{@render children()}
	</div>
</div>
