<script lang="ts">
	import './layout.css';
	import ThemeSelector from '$lib/components/ThemeSelector.svelte';
	import Toasts from '$lib/components/ui/Toasts.svelte';
	import { layoutState } from '$lib/layout.svelte';
	import { page } from '$app/stores';
	import { resolvePath } from '$lib/utils/routing';
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
		Download,
		Shield,
		ListTodo,
		FileSignature,
		List
	} from 'lucide-svelte';

	let { children } = $props();

	const menuItems = [
		{ href: '/', label: 'Home', icon: Home },
		{ href: '/discover', label: 'Discover', icon: Compass },
		{
			label: 'Library',
			icon: Library,
			children: [
				{ href: '/movies', label: 'Movies', icon: Clapperboard },
				{ href: '/tv', label: 'TV Shows', icon: Tv }
			]
		},
		{ href: '/queue', label: 'Queue', icon: Download },
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
</script>

<svelte:head>
	<link rel="icon" type="image/png" href="/logo.png" />
</svelte:head>

<div class="drawer lg:drawer-open">
	<input id="main-drawer" type="checkbox" class="drawer-toggle" />
	<div class="drawer-content flex min-h-screen flex-col bg-base-100 text-base-content">
		<!-- Mobile Header -->
		<header class="navbar sticky top-0 z-30 bg-base-200 shadow-sm lg:hidden">
			<div class="flex-none">
				<label for="main-drawer" aria-label="open sidebar" class="btn btn-square btn-ghost">
					<Menu class="h-6 w-6" />
				</label>
			</div>
			<div class="mx-2 flex flex-1 items-center gap-2 px-2">
				<img src="/logo.png" alt="" class="h-7 w-7" />
				<span class="text-xl font-bold">Cinephage</span>
			</div>
			<div class="flex-none">
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
		<label for="main-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
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
			<div class="flex justify-center border-t border-base-300 p-2">
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
