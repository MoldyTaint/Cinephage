<script lang="ts">
	import { browser } from '$app/environment';
	import { beforeNavigate } from '$app/navigation';
	import { base } from '$app/paths';
	import { storeLibraryReturnTo } from '$lib/utils/libraryReturnNavigation';

	let { children } = $props<{ children: import('svelte').Snippet }>();

	function stripBase(pathname: string): string {
		if (!base) return pathname;
		if (pathname === base) return '/';
		return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
	}

	beforeNavigate(({ from, to }) => {
		if (!browser || !from || !to) return;

		const currentPath = stripBase(window.location.pathname);
		const currentSearch = window.location.search;
		const targetPath = `${stripBase(to.url.pathname)}${to.url.search}${to.url.hash}`;
		storeLibraryReturnTo(currentPath, currentSearch, targetPath);
	});
</script>

{@render children()}
