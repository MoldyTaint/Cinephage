<script lang="ts">
	import { Ban, EyeOff } from 'lucide-svelte';
	import SettingsTabNav from '$lib/components/settings/SettingsTabNav.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { children } = $props();

	const navItems = [
		{
			href: '/settings/blocklist/releases',
			label: m.blocklist_tab_releases(),
			icon: Ban
		},
		{
			href: '/settings/blocklist/blocked-media',
			label: m.blocklist_tab_blockedMedia(),
			icon: EyeOff
		}
	];
</script>

<div class="flex min-h-full flex-col">
	<SettingsTabNav {navItems} />

	<div class="flex-1">
		{@render children()}
	</div>
</div>
