<script lang="ts">
	import { Globe, Check } from 'lucide-svelte';
	import { setLocale, getLocale, locales, type Locale } from '$lib/paraglide/runtime.js';
	import * as m from '$lib/paraglide/messages.js';
	import { toasts } from '$lib/stores/toast.svelte';

	interface Props {
		class?: string;
		showLabel?: boolean;
	}

	let { class: className = '', showLabel = false }: Props = $props();

	let isOpen = $state(false);
	let currentLocale = $state<Locale>(getLocale());
	let isLoading = $state(false);

	const languageNames: Record<string, string> = {
		en: 'English',
		de: 'Deutsch',
		es: 'Español'
	};

	async function handleLanguageChange(locale: Locale) {
		if (locale === currentLocale || isLoading) return;

		isLoading = true;
		isOpen = false;

		try {
			// Step 1: Persist to user account via API (before reload can interrupt)
			const response = await fetch('/api/user/language', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ language: locale })
			});

			if (!response.ok) {
				// Non-fatal - language is still set in cookie
				// Silently ignore persistence failures
			}

			// Step 2: Set the locale cookie WITHOUT triggering reload
			setLocale(locale, { reload: false });
			currentLocale = locale;

			// Step 3: Reload the page to apply translations
			window.location.reload();
		} catch (error) {
			// Only show error if it's not a page reload/navigation interruption
			if (error instanceof Error && error.name !== 'AbortError') {
				toasts.error(m.ui_failedToChangeLanguage());
			}
			isLoading = false;
		}
	}

	function toggleDropdown() {
		isOpen = !isOpen;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			isOpen = false;
		}
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.language-selector')) {
			isOpen = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleClickOutside} />

<div class="language-selector dropdown {className}" class:dropdown-open={isOpen}>
	<button
		class="btn w-full btn-ghost btn-sm"
		class:justify-center={!showLabel}
		onclick={toggleDropdown}
		disabled={isLoading}
		title={m.ui_selectLanguage()}
		aria-haspopup="true"
		aria-expanded={isOpen}
	>
		{#if isLoading}
			<span class="loading loading-xs loading-spinner"></span>
		{:else}
			<Globe class="h-4 w-4" />
		{/if}
		{#if showLabel}
			<span class="ml-2">{languageNames[currentLocale] ?? currentLocale}</span>
		{/if}
	</button>

	<ul
		class="dropdown-content menu z-[1] w-40 rounded-box bg-base-200 p-2 shadow"
		class:hidden={!isOpen}
		role="menu"
	>
		{#each locales as locale (locale)}
			<li role="menuitem">
				<button
					class="flex items-center justify-between"
					class:active={locale === currentLocale}
					onclick={() => handleLanguageChange(locale)}
					disabled={isLoading}
				>
					<span>{languageNames[locale] ?? locale}</span>
					{#if locale === currentLocale}
						<Check class="h-4 w-4 text-success" />
					{/if}
				</button>
			</li>
		{/each}
	</ul>
</div>
