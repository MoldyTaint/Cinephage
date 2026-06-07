<script lang="ts">
	import './layout.css';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { ThemeSelector, LanguageSelector } from '$lib/components/ui';
	import Toasts from '$lib/components/ui/Toasts.svelte';
	import { layoutState } from '$lib/layout.svelte';
	import * as m from '$lib/paraglide/messages.js';

	import { page } from '$app/state';
	import { resolvePath } from '$lib/utils/routing';
	import { authClient } from '$lib/auth/client.js';
	import { getSystemStatus } from '$lib/api/settings.js';
	import { PLACEHOLDER_PACKAGE_VERSION } from '$lib/version.js';
	import {
		Menu,
		Home,
		Clapperboard,
		Tv,
		Settings,
		ChevronLeft,
		ChevronRight,
		ChevronDown,
		Compass,
		Library,
		User,
		Filter,
		ListTodo,
		FileSignature,
		List,
		Radio,
		Calendar,
		Activity,
		FileQuestion,
		ScrollText,
		LogOut,
		Server,
		Download,
		Wifi,
		WifiOff,
		Loader2,
		Puzzle,
		FolderCog,
		Shield,
		Ban,
		Globe,
		Palette
	} from 'lucide-svelte';

	type MenuChildItem = {
		href: string;
		label: () => string;
		icon?: typeof Home;
		match?: (url: URL) => boolean;
		isSubtype?: boolean;
	};

	type MenuItem = {
		href?: string;
		label: () => string;
		icon: typeof Home;
		children?: MenuChildItem[];
	};

	type LibraryNavItem = {
		id: string;
		slug: string;
		name: string;
		mediaSubType: string | null;
		isDefault: boolean;
	};

	let { children, data } = $props<{
		children: import('svelte').Snippet;
		data: {
			libraryNav?: {
				movieLibraries?: LibraryNavItem[];
				tvLibraries?: LibraryNavItem[];
			};
		};
	}>();
	let isMobileDrawerOpen = $state(false);
	let isLoggingOut = $state(false);
	let expandedMenuSection = $state<string | null>(null);
	const SIDEBAR_EXPANDED_STORAGE_KEY = 'cinephage.sidebar.expanded';

	function usesFocusedLayout(pathname: string): boolean {
		return (
			pathname === '/setup' ||
			pathname.startsWith('/setup/') ||
			pathname === '/login' ||
			pathname.startsWith('/login/')
		);
	}

	function closeMobileDrawer(): void {
		isMobileDrawerOpen = false;
	}

	function buildNavHref(href: string): string {
		if (href === '/library/import' && page.url.pathname === '/library/import') {
			return resolvePath(`/library/import?newSession=${Date.now()}`);
		}
		return resolvePath(href);
	}

	function handleNavClick(event: MouseEvent, href: string): void {
		closeMobileDrawer();
		if (href === '/library/import' && page.url.pathname === '/library/import') {
			event.preventDefault();
			void goto(buildNavHref(href));
		}
	}

	function isChildActive(child: MenuChildItem): boolean {
		if (child.match) return child.match(page.url);
		const [childPath, childQuery] = child.href.split('?');
		if (page.url.pathname !== childPath) return false;
		if (!childQuery) return true;
		const queryParams = new URLSearchParams(childQuery);
		for (const [key, value] of queryParams) {
			if (page.url.searchParams.get(key) !== value) return false;
		}
		return true;
	}

	function isItemActive(item: MenuItem): boolean {
		if (item.children) {
			return item.children.some((child) => isChildActive(child));
		}
		if (!item.href) return false;
		if (item.href === '/') return page.url.pathname === '/';
		return page.url.pathname === item.href || page.url.pathname.startsWith(`${item.href}/`);
	}

	function getMenuSectionKey(item: MenuItem): string {
		return item.label();
	}

	function handleCollapsedParentClick(item: MenuItem): void {
		expandedMenuSection = getMenuSectionKey(item);
		layoutState.isSidebarExpanded = true;
	}

	function handleSubmenuToggle(item: MenuItem): void {
		const key = getMenuSectionKey(item);
		expandedMenuSection = expandedMenuSection === key ? null : key;
	}

	function openFooterDropdownOnExpand(type: 'language' | 'theme'): void {
		layoutState.isSidebarExpanded = true;
		const triggerId = type === 'language' ? 'sidebar-language-trigger' : 'sidebar-theme-trigger';
		const tryOpen = (attempt = 0) => {
			const trigger = document.getElementById(triggerId) as HTMLElement | null;
			if (!trigger) {
				if (attempt < 5) {
					setTimeout(() => tryOpen(attempt + 1), 40);
				}
				return;
			}
			trigger.focus();
			trigger.click();
		};
		setTimeout(() => tryOpen(), 60);
	}

	async function handleLogout(): Promise<void> {
		if (isLoggingOut) return;
		isLoggingOut = true;
		try {
			await authClient.signOut();
			await goto('/login');
		} catch {
			// Error handled by auth client
		} finally {
			isLoggingOut = false;
		}
	}

	// Menu items using translation functions
	const menuItems = $derived.by<MenuItem[]>(() => {
		const movieLibraries = data.libraryNav?.movieLibraries ?? [];
		const tvLibraries = data.libraryNav?.tvLibraries ?? [];
		const defaultMovieLibrary =
			movieLibraries.find((library: LibraryNavItem) => library.isDefault) ?? null;
		const defaultTvLibrary =
			tvLibraries.find((library: LibraryNavItem) => library.isDefault) ?? null;
		const movieSubLibraries = movieLibraries.filter(
			(library: LibraryNavItem) => !library.isDefault
		);
		const tvSubLibraries = tvLibraries.filter((library: LibraryNavItem) => !library.isDefault);

		const libraryChildren: MenuChildItem[] = [
			{
				href: '/library/movies',
				label: m.nav_movies,
				icon: Clapperboard,
				match: (url: URL) => {
					if (url.pathname.startsWith('/library/movie/')) return true;
					if (url.pathname !== '/library/movies') return false;
					const currentLibrarySlug = url.searchParams.get('library')?.trim() ?? '';
					if (!currentLibrarySlug) return true;
					return currentLibrarySlug === (defaultMovieLibrary?.slug ?? '');
				}
			},
			...movieSubLibraries.map((library: LibraryNavItem) => ({
				href: `/library/movies?library=${encodeURIComponent(library.slug)}`,
				label: () => library.name,
				isSubtype: true,
				match: (url: URL) =>
					url.pathname === '/library/movies' &&
					(url.searchParams.get('library')?.trim() ?? '') === library.slug
			})),
			{
				href: '/library/tv',
				label: m.nav_tvShows,
				icon: Tv,
				match: (url: URL) => {
					if (url.pathname.startsWith('/library/tv/')) return true;
					if (url.pathname !== '/library/tv') return false;
					const currentLibrarySlug = url.searchParams.get('library')?.trim() ?? '';
					if (!currentLibrarySlug) return true;
					return currentLibrarySlug === (defaultTvLibrary?.slug ?? '');
				}
			},
			...tvSubLibraries.map((library: LibraryNavItem) => ({
				href: `/library/tv?library=${encodeURIComponent(library.slug)}`,
				label: () => library.name,
				isSubtype: true,
				match: (url: URL) =>
					url.pathname === '/library/tv' &&
					(url.searchParams.get('library')?.trim() ?? '') === library.slug
			})),
			{ href: '/library/import', label: m.nav_import, icon: Download },
			{ href: '/library/unmatched', label: m.nav_unmatchedFiles, icon: FileQuestion }
		];

		return [
			{ href: '/', label: m.nav_home, icon: Home },
			{ href: '/discover', label: m.nav_discover, icon: Compass },
			{
				label: m.nav_library,
				icon: Library,
				children: libraryChildren
			},
			{ href: '/activity', label: m.nav_activity, icon: Activity },
			{ href: '/calendar', label: m.nav_calendar, icon: Calendar },
			{
				label: m.nav_liveTv,
				icon: Radio,
				children: [
					{ href: '/livetv/channels', label: m.nav_channels, icon: Tv },
					{ href: '/livetv/epg', label: m.nav_epg, icon: Calendar },
					{ href: '/livetv/accounts', label: m.nav_accounts, icon: User }
				]
			},
			{ href: '/smartlists', label: m.nav_smartLists, icon: List },
			{
				label: m.nav_settings,
				icon: Settings,
				children: [
					{
						href: '/settings/general/libraries',
						label: m.nav_libraryStorage,
						icon: FolderCog,
						match: (url: URL) => url.pathname.startsWith('/settings/general')
					},
					{
						href: '/settings/system/general',
						label: m.nav_system,
						icon: Server,
						match: (url: URL) => url.pathname.startsWith('/settings/system')
					},
					{ href: '/settings/logs', label: m.nav_logs, icon: ScrollText },
					{ href: '/settings/naming', label: m.nav_naming, icon: FileSignature },
					{ href: '/settings/quality', label: m.nav_qualitySettings, icon: Shield },
					{
						href: '/settings/integrations/indexers',
						label: m.nav_integrations,
						icon: Puzzle,
						match: (url: URL) => url.pathname.startsWith('/settings/integrations')
					},
					{ href: '/settings/tasks', label: m.nav_tasks, icon: ListTodo },
					{
						href: '/settings/blocklist/releases',
						label: m.nav_blocklist,
						icon: Ban,
						match: (url) => url.pathname.startsWith('/settings/blocklist')
					},
					{ href: '/settings/filters', label: m.nav_globalFilters, icon: Filter },
					{ href: '/profile', label: m.nav_profile, icon: User }
				]
			}
		];
	});

	let appVersion = $state('');

	async function refreshAppVersion(): Promise<void> {
		if (!browser) return;
		try {
			const payload = (await getSystemStatus()) as { version?: string };
			const candidate = payload.version?.trim();
			if (!candidate || candidate === PLACEHOLDER_PACKAGE_VERSION) {
				appVersion = 'dev-local';
				return;
			}
			appVersion = candidate;
		} catch {
			// Keep current version badge if runtime check fails
		}
	}

	const useFocusedLayout = $derived(usesFocusedLayout(page.url.pathname));

	$effect(() => {
		if (useFocusedLayout) {
			closeMobileDrawer();
		}
	});

	$effect(() => {
		void page.url.pathname;
		layoutState.clearMobileSseStatus();
	});

	$effect(() => {
		if (!browser) return;

		void refreshAppVersion();

		const interval = window.setInterval(() => {
			void refreshAppVersion();
		}, 60_000);

		const handleFocus = () => {
			void refreshAppVersion();
		};
		const handleVisibility = () => {
			if (document.visibilityState === 'visible') {
				void refreshAppVersion();
			}
		};

		window.addEventListener('focus', handleFocus);
		document.addEventListener('visibilitychange', handleVisibility);

		return () => {
			window.clearInterval(interval);
			window.removeEventListener('focus', handleFocus);
			document.removeEventListener('visibilitychange', handleVisibility);
		};
	});

	$effect(() => {
		if (!browser) return;
		const stored = localStorage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY);
		if (stored === 'true' || stored === 'false') {
			layoutState.isSidebarExpanded = stored === 'true';
		}
	});

	$effect(() => {
		if (!browser) return;
		localStorage.setItem(SIDEBAR_EXPANDED_STORAGE_KEY, String(layoutState.isSidebarExpanded));
	});
</script>

<svelte:head>
	<link rel="icon" type="image/png" href="/logo.png" />
</svelte:head>

{#if useFocusedLayout}
	{@render children()}
{:else}
	<div class="drawer lg:drawer-open">
		<input
			id="main-drawer"
			type="checkbox"
			class="drawer-toggle"
			bind:checked={isMobileDrawerOpen}
		/>
		<div class="drawer-content flex min-h-screen flex-col bg-base-100 text-base-content">
			<!-- Mobile Header -->
			<header class="navbar sticky top-0 z-50 bg-base-200 shadow-sm lg:hidden">
				<div class="flex-none">
					<label
						for="main-drawer"
						aria-label={m.nav_openSidebar()}
						class="btn btn-square btn-ghost"
					>
						<Menu class="h-6 w-6" />
					</label>
				</div>
				<div class="mx-2 flex min-w-0 flex-1 items-center gap-2 px-2">
					<img src="/logo.png" alt="" class="h-7 w-7" />
					<div class="relative min-w-0">
						<span class="block truncate pr-10 text-xl leading-tight font-bold"
							>{m.common_appName()}</span
						>
						<span
							class="absolute -top-1 right-0 badge h-4 min-h-4 px-1 badge-xs font-semibold badge-warning"
						>
							{m.common_alpha()}
						</span>
					</div>
				</div>
				<div class="flex flex-none items-center gap-2 pr-2">
					{#if layoutState.mobileSseStatus === 'connected'}
						<span class="badge shrink-0 gap-1 badge-success">
							<Wifi class="h-3 w-3" />
							{m.common_live()}
						</span>
					{:else if layoutState.mobileSseStatus === 'error'}
						<span class="badge shrink-0 gap-1 badge-error">
							<WifiOff class="h-3 w-3" />
							{m.common_reconnecting()}
						</span>
					{:else if layoutState.mobileSseStatus === 'connecting'}
						<span class="badge shrink-0 gap-1 badge-warning">
							<Loader2 class="h-3 w-3 animate-spin" />
							{m.common_connecting()}
						</span>
					{/if}
				</div>
			</header>

			<!-- Page Content -->
			<main class="w-full grow p-4">
				{@render children()}
			</main>
		</div>

		<!-- Sidebar -->
		<div class="drawer-side z-40 overflow-visible">
			<label for="main-drawer" aria-label={m.nav_closeSidebar()} class="drawer-overlay"></label>
			<aside
				class:sidebar-collapsed={!layoutState.isSidebarExpanded}
				class="relative z-40 flex h-dvh flex-col overflow-x-visible bg-base-200 transition-[width] duration-300 ease-in-out
		            {layoutState.isSidebarExpanded ? 'w-64' : 'w-20'}"
			>
				<!-- Sidebar Header -->
				<div
					class="relative flex h-16 items-center border-b border-base-300"
					class:px-4={layoutState.isSidebarExpanded}
					class:px-2={!layoutState.isSidebarExpanded}
					class:justify-between={layoutState.isSidebarExpanded}
					class:justify-center={!layoutState.isSidebarExpanded}
				>
					{#if layoutState.isSidebarExpanded}
						<div class="flex min-w-0 items-center gap-2">
							<img src="/logo.png" alt="" class="h-7 w-7" />
							<div class="relative min-w-0">
								<span class="block truncate pr-10 text-xl leading-tight font-bold"
									>{m.common_appName()}</span
								>
								<span
									class="absolute -top-1 right-0 badge h-4 min-h-4 px-1 badge-xs font-semibold badge-warning"
								>
									{m.common_alpha()}
								</span>
							</div>
						</div>
					{:else}
						<div class="relative -mr-1 -ml-3">
							<div class="grid h-11 w-11 place-items-center rounded-lg bg-base-100/70">
								<img src="/logo.png" alt={m.common_appName()} class="h-9 w-9 object-contain" />
							</div>
							<span
								class="absolute bottom-[-0.35rem] left-1/2 badge h-4 min-h-4 -translate-x-1/2 px-1 badge-xs font-semibold badge-warning"
							>
								{m.common_alphaShort()}
							</span>
						</div>
					{/if}
					<button
						class="absolute top-1/2 right-0 z-50 hidden h-6.5 w-6.5 translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-visible rounded-full border border-black/35 bg-base-100/95 shadow-sm transition-colors hover:border-black/45 hover:bg-base-100 lg:flex"
						onclick={() => layoutState.toggleSidebar()}
						aria-label={m.action_toggleSidebar()}
						type="button"
					>
						{#if layoutState.isSidebarExpanded}
							<ChevronLeft class="h-4 w-4" style="stroke-width: 2.8;" />
						{:else}
							<ChevronRight class="h-4 w-4" style="stroke-width: 2.8;" />
						{/if}
					</button>
				</div>

				<!-- Navigation -->
				<div
					class="min-h-0 grow overflow-y-auto"
					class:px-2={layoutState.isSidebarExpanded}
					class:pl-2={!layoutState.isSidebarExpanded}
					class:pr-0={!layoutState.isSidebarExpanded}
					class:pt-2={layoutState.isSidebarExpanded}
					class:pt-1={!layoutState.isSidebarExpanded}
				>
					<ul
						class="menu flex-nowrap gap-1 {layoutState.isSidebarExpanded
							? ''
							: 'sidebar-collapsed-shell px-1 py-2'}"
					>
						{#each menuItems as item (item.label)}
							<li class={layoutState.isSidebarExpanded ? 'w-full' : 'mx-auto w-11'}>
								{#if item.children}
									{#if layoutState.isSidebarExpanded}
										<details
											open={isItemActive(item) || expandedMenuSection === getMenuSectionKey(item)}
											class="group/nav-section"
										>
											<summary
												class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5"
												class:active-nav={isItemActive(item)}
												onclick={(event) => {
													event.preventDefault();
													handleSubmenuToggle(item);
												}}
											>
												<item.icon class="h-4.5 w-4.5 shrink-0" />
												<span class="truncate">{item.label()}</span>
												<ChevronDown
													class="nav-chevron h-4 w-4 shrink-0 text-base-content/60 transition-transform duration-200 group-open/nav-section:rotate-180"
												/>
											</summary>
											<ul>
												{#each item.children as child (child.href)}
													<li>
														<a
															href={buildNavHref(child.href)}
															class="flex w-full items-center gap-3 rounded-lg px-3 py-2"
															class:pl-8={child.isSubtype}
															class:active={isChildActive(child)}
															onclick={(event) => handleNavClick(event, child.href)}
														>
															{#if child.icon}
																<child.icon class="h-4.25 w-4.25 shrink-0" />
															{/if}
															{#if child.isSubtype}
																<span class="font-mono text-xs text-base-content/40">|-</span>
															{/if}
															<span class="truncate">{child.label()}</span>
														</a>
													</li>
												{/each}
											</ul>
										</details>
									{:else}
										<button
											class="flex w-full items-center justify-center rounded-lg px-3 py-3"
											class:active-nav={isItemActive(item)}
											onclick={() => handleCollapsedParentClick(item)}
											title={item.label()}
										>
											<item.icon class="h-5 w-5 shrink-0" />
										</button>
									{/if}
								{:else}
									<a
										href={buildNavHref(item.href!)}
										class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5"
										class:justify-center={!layoutState.isSidebarExpanded}
										class:py-3={!layoutState.isSidebarExpanded}
										class:active={isItemActive(item)}
										title={!layoutState.isSidebarExpanded ? item.label() : ''}
										onclick={(event) => handleNavClick(event, item.href!)}
									>
										<item.icon
											class="{layoutState.isSidebarExpanded ? 'h-4.5 w-4.5' : 'h-5 w-5'} shrink-0"
										/>
										{#if layoutState.isSidebarExpanded}
											<span class="truncate">{item.label()}</span>
										{/if}
									</a>
								{/if}
							</li>
						{/each}
					</ul>
				</div>

				<!-- Sidebar Footer -->
				<div class="border-t border-base-300 p-2">
					{#if layoutState.isSidebarExpanded}
						<div class="rounded-xl border border-base-300/70 bg-base-100/70 p-2 shadow-sm">
							{#if appVersion}
								<div class="px-2 pb-2 text-xs tracking-wide text-base-content/50">{appVersion}</div>
							{/if}
							<div class="space-y-1 border-t border-base-300/70 pt-2">
								<LanguageSelector
									triggerId="sidebar-language-trigger"
									class="dropdown-top w-full"
									showLabel={true}
								/>
								<ThemeSelector
									triggerId="sidebar-theme-trigger"
									class="dropdown-top w-full"
									showLabel={true}
								/>
							</div>
							<div class="mt-2 border-t border-base-300/70 pt-2">
								<button
									class="btn w-full justify-start text-error btn-ghost btn-sm hover:bg-error/10"
									onclick={handleLogout}
									disabled={isLoggingOut}
									title={m.action_logout()}
								>
									{#if isLoggingOut}
										<span class="loading loading-xs loading-spinner"></span>
									{:else}
										<LogOut class="h-4 w-4" />
									{/if}
									<span class="ml-2">{m.action_logout()}</span>
								</button>
							</div>
						</div>
					{:else}
						<div
							class="-mx-0.8 w-full rounded-xl border border-base-300/70 bg-base-100/70 p-2 shadow-sm"
						>
							<div class="flex flex-col items-center gap-1">
								<button
									class="btn w-full justify-center btn-ghost btn-sm"
									title={m.ui_selectLanguage()}
									onclick={() => openFooterDropdownOnExpand('language')}
								>
									<Globe class="h-5 w-5" />
								</button>
								<button
									class="btn w-full justify-center btn-ghost btn-sm"
									title={m.ui_selectTheme()}
									onclick={() => openFooterDropdownOnExpand('theme')}
								>
									<Palette class="h-5 w-5" />
								</button>
								<button
									class="btn w-full justify-center text-error btn-ghost btn-sm hover:bg-error/10"
									onclick={handleLogout}
									disabled={isLoggingOut}
									title={m.action_logout()}
								>
									{#if isLoggingOut}
										<span class="loading loading-xs loading-spinner"></span>
									{:else}
										<LogOut class="h-4 w-4" />
									{/if}
								</button>
							</div>
						</div>
					{/if}
				</div>
			</aside>
		</div>
	</div>
{/if}

<!-- Global Toast Notifications -->
<Toasts />
