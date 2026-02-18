<script lang="ts">
	import { resolvePath } from '$lib/utils/routing';
	import { page } from '$app/stores';
	import { Database, Download, Server, Subtitles, Languages, Monitor, Shield } from 'lucide-svelte';

	let { children } = $props();

	const navItems = [
		{
			href: '/settings/integrations',
			label: 'Overview',
			icon: Database,
			exact: true
		},
		{
			href: '/settings/integrations/indexers',
			label: 'Indexers',
			icon: Database
		},
		{
			href: '/settings/integrations/download-clients',
			label: 'Download Clients',
			icon: Download
		},
		{
			href: '/settings/integrations/nntp-servers',
			label: 'NNTP Servers',
			icon: Server
		},
		{
			href: '/settings/integrations/subtitle-providers',
			label: 'Subtitle Providers',
			icon: Subtitles
		},
		{
			href: '/settings/integrations/language-profiles',
			label: 'Language Profiles',
			icon: Languages
		},
		{
			href: '/settings/integrations/media-browsers',
			label: 'Media Servers',
			icon: Monitor
		},
		{
			href: '/settings/integrations/captcha',
			label: 'Captcha Solver',
			icon: Shield
		}
	];

	function isActive(href: string, exact: boolean = false): boolean {
		if (exact) {
			return $page.url.pathname === href;
		}
		return $page.url.pathname.startsWith(href);
	}
</script>

<div class="flex min-h-full flex-col">
	<!-- Sub-navigation tabs -->
	<div class="border-b border-base-300 bg-base-100">
		<div class="px-4">
			<nav class="-mb-px flex space-x-4" aria-label="Integration tabs">
				{#each navItems as item (item.href)}
					{@const Icon = item.icon}
					<a
						href={resolvePath(item.href)}
						class="flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors {isActive(
							item.href,
							item.exact
						)
							? 'border-primary text-primary'
							: 'border-transparent text-base-content/70 hover:border-base-300 hover:text-base-content'}"
					>
						<Icon class="h-4 w-4" />
						{item.label}
					</a>
				{/each}
			</nav>
		</div>
	</div>

	<!-- Page content -->
	<div class="flex-1">
		{@render children()}
	</div>
</div>
