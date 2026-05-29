<script lang="ts">
	import { Library, FolderOpen, Activity } from 'lucide-svelte';
	import SettingsTabNav from '$lib/components/settings/SettingsTabNav.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { children } = $props();

	const navItems = [
		{
			href: '/settings/general/libraries',
			label: m.settings_general_tabLibraries(),
			icon: Library
		},
		{
			href: '/settings/general/root-folders',
			label: m.settings_general_tabRootFolders(),
			icon: FolderOpen
		},
		{
			href: '/settings/general/status',
			label: m.settings_general_tabMaintenance(),
			icon: Activity
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
