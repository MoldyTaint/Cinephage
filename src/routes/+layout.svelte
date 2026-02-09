<script lang="ts">
	import './layout.css';
	import { ThemeSelector } from '$lib/components/ui';
	import Toasts from '$lib/components/ui/Toasts.svelte';
	import { layoutState } from '$lib/layout.svelte';
	import { mobileSSEStatus } from '$lib/sse/mobileStatus.svelte';
	import { page } from '$app/stores';
	import { resolvePath } from '$lib/utils/routing';
	import { env } from '$env/dynamic/public';
	import {
		Menu,
		Home,
		Clapperboard,
		Tv,
		Settings,
		ChevronLeft,
		ChevronRight,
		Compass,
		Library,
		User,
		Filter,
		Shield,
		ListTodo,
		FileSignature,
		List,
		Radio,
		Calendar,
		Activity,
		Loader2,
		Wifi,
		WifiOff
	} from 'lucide-svelte';

	let { children } = $props();
	let isMobileDrawerOpen = $state(false);

	function closeMobileDrawer(): void {
		isMobileDrawerOpen = false;
	}

	const menuItems = [
		{ href: '/', label: 'Home', icon: Home },
		{ href: '/discover', label: 'Discover', icon: Compass },
		{
			label: 'Library',
			icon: Library,
			children: [
				{ href: '/library/movies', label: 'Movies', icon: Clapperboard },
				{ href: '/library/tv', label: 'TV Shows', icon: Tv }
			]
		},
		{ href: '/activity', label: 'Activity', icon: Activity },
		{
			label: 'Live TV',
			icon: Radio,
			children: [
				{ href: '/livetv/channels', label: 'Channels', icon: Tv },
				{ href: '/livetv/epg', label: 'EPG', icon: Calendar },
				{ href: '/livetv/accounts', label: 'Accounts', icon: User }
			]
		},
		{ href: '/smartlists', label: 'Smart Lists', icon: List },
		{
			label: 'Settings',
			icon: Settings,
			children: [
				{ href: '/settings/general', label: 'General', icon: Settings },
				{ href: '/settings/naming', label: 'Naming', icon: FileSignature },
				{ href: '/settings/quality', label: 'Quality Settings', icon: Shield },
				{ href: '/settings/integrations', label: 'Integrations', icon: Compass },
				{ href: '/settings/tasks', label: 'Tasks', icon: ListTodo },
				{ href: '/settings/filters', label: 'Global Filters', icon: Filter },
				{ href: '/profile', label: 'Profile', icon: User }
			]
		}
	];

	const appVersion = env.PUBLIC_APP_VERSION?.trim();
</script>

<svelte:head>
	<link rel="icon" type="image/png" href="/logo.png" />
</svelte:head>

<div class="drawer lg:drawer-open">
	<input id="main-drawer" type="checkbox" class="drawer-toggle" bind:checked={isMobileDrawerOpen} />
	<div class="drawer-content flex min-h-screen flex-col bg-base-100 text-base-content">
		<!-- Mobile Header -->
		<header class="navbar sticky top-0 z-50 bg-base-200 shadow-sm lg:hidden">
			<div class="flex-none">
				<label for="main-drawer" aria-label="open sidebar" class="btn btn-square btn-ghost">
					<Menu class="h-6 w-6" />
				</label>
			</div>
			<div class="mx-2 flex flex-1 items-center gap-2 px-2">
				<img src="/logo.png" alt="" class="h-7 w-7" />
				<span class="text-xl font-bold">Cinephage</span>
			</div>
			<div class="flex flex-none items-center gap-2">
				{#if mobileSSEStatus.visible}
					{#if mobileSSEStatus.status === 'connected'}
						<span class="badge gap-1 badge-sm badge-success">
							<Wifi class="h-3 w-3" />
							Live
						</span>
					{:else if mobileSSEStatus.status === 'error'}
						<span class="badge gap-1 badge-sm badge-error">
							<Loader2 class="h-3 w-3 animate-spin" />
							Reconnecting...
						</span>
					{:else if mobileSSEStatus.status === 'connecting'}
						<span class="badge gap-1 badge-sm badge-warning">
							<Loader2 class="h-3 w-3 animate-spin" />
							Connecting...
						</span>
					{:else}
						<span class="badge gap-1 badge-ghost badge-sm">
							<WifiOff class="h-3 w-3" />
							Offline
						</span>
					{/if}
				{/if}
				<ThemeSelector showLabel={false} />
			</div>
		</header>

		<!-- Page Content -->
		<main class="w-full flex-grow p-4">
			{@render children()}
		</main>
	</div>

	<!-- Sidebar -->
	<div class="drawer-side z-40">
		<label
			for="main-drawer"
			aria-label="close sidebar"
			class="drawer-overlay"
			onclick={closeMobileDrawer}
		></label>
		<aside
			class="flex min-h-full flex-col overflow-x-hidden bg-base-200 transition-[width] duration-300 ease-in-out
            {layoutState.isSidebarExpanded ? 'w-64' : 'w-20'}"
		>
			<!-- Sidebar Header -->
			<div
				class="flex h-16 items-center border-b border-base-300 px-4"
				class:justify-between={layoutState.isSidebarExpanded}
				class:justify-center={!layoutState.isSidebarExpanded}
			>
				{#if layoutState.isSidebarExpanded}
					<div class="flex items-center gap-2">
						<img src="/logo.png" alt="" class="h-7 w-7" />
						<span class="truncate text-xl font-bold">Cinephage</span>
					</div>
				{:else}
					<img src="/logo.png" alt="Cinephage" class="h-8 w-8" />
				{/if}
				<button
					class="btn hidden btn-square btn-ghost btn-sm lg:flex"
					onclick={() => layoutState.toggleSidebar()}
					aria-label="Toggle Sidebar"
				>
					{#if layoutState.isSidebarExpanded}
						<ChevronLeft class="h-5 w-5" />
					{:else}
						<ChevronRight class="h-5 w-5" />
					{/if}
				</button>
			</div>

			<!-- Navigation -->
			<ul class="menu flex-grow flex-nowrap gap-2 p-2">
				{#each menuItems as item (item.label)}
					<li>
						{#if item.children}
							{#if layoutState.isSidebarExpanded}
								<details>
									<summary class="flex items-center gap-4 px-4 py-3">
										<item.icon class="h-5 w-5 shrink-0" />
										<span class="truncate">{item.label}</span>
									</summary>
									<ul>
										{#each item.children as child (child.href)}
											<li>
												<a
													href={resolvePath(child.href)}
													class="flex items-center gap-4 px-4 py-2"
													class:active={$page.url.pathname === child.href}
													onclick={closeMobileDrawer}
												>
													{#if child.icon}<child.icon class="h-4 w-4 shrink-0" />{/if}
													<span class="truncate">{child.label}</span>
												</a>
											</li>
										{/each}
									</ul>
								</details>
							{:else}
								<button
									class="flex items-center gap-4 px-4 py-3"
									onclick={() => layoutState.toggleSidebar()}
									title={item.label}
								>
									<item.icon class="h-5 w-5 shrink-0" />
								</button>
							{/if}
						{:else}
							<a
								href={resolvePath(item.href)}
								class="flex items-center gap-4 px-4 py-3"
								class:active={$page.url.pathname === item.href}
								title={!layoutState.isSidebarExpanded ? item.label : ''}
								onclick={closeMobileDrawer}
							>
								<item.icon class="h-5 w-5 shrink-0" />
								{#if layoutState.isSidebarExpanded}
									<span class="truncate">{item.label}</span>
								{/if}
							</a>
						{/if}
					</li>
				{/each}
			</ul>

			<!-- Sidebar Footer -->
			<div class="flex flex-col items-center border-t border-base-300 p-2">
				{#if appVersion}
					<div class="mb-2 text-xs text-base-content/50">{appVersion}</div>
				{/if}
				<ThemeSelector
					class={layoutState.isSidebarExpanded ? 'dropdown-top' : 'dropdown-right'}
					showLabel={layoutState.isSidebarExpanded}
				/>
			</div>
		</aside>
	</div>
</div>

<!-- Global Toast Notifications -->
<Toasts />
