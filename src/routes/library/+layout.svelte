<script lang="ts">
	import { browser } from '$app/environment';
	import { beforeNavigate, goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { resolvePath } from '$lib/utils/routing';
	import { getLibraryDetailWithReturnTo } from '$lib/utils/libraryReturnNavigation';

	let { children } = $props<{ children: import('svelte').Snippet }>();
	let rewritingNavigation = false;

	function stripBase(pathname: string): string {
		if (!base) return pathname;
		if (pathname === base) return '/';
		return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
	}

	beforeNavigate(({ from, to, cancel }) => {
		if (!browser || rewritingNavigation || !from || !to) return;

		const currentPath = stripBase(window.location.pathname);
		const currentSearch = window.location.search;
		const targetPath = `${stripBase(to.url.pathname)}${to.url.search}${to.url.hash}`;
		const rewritten = getLibraryDetailWithReturnTo(currentPath, currentSearch, targetPath);

		if (!rewritten || rewritten === targetPath) return;

		cancel();
		rewritingNavigation = true;
		void Promise.resolve().then(async () => {
			try {
				await goto(resolvePath(rewritten));
			} finally {
				rewritingNavigation = false;
			}
		});
	});
</script>

{@render children()}
