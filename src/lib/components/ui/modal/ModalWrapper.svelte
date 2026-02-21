<script lang="ts">
	import type { Snippet } from 'svelte';
	import { createFocusTrap, lockBodyScroll } from '$lib/utils/focus';

	interface Props {
		open: boolean;
		onClose: () => void;
		maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
		labelledBy?: string;
		describedBy?: string;
		/** When true, modal-box uses flex column layout and children manage their own scrolling */
		flexContent?: boolean;
		children: Snippet;
	}

	let {
		open,
		onClose,
		maxWidth = 'lg',
		labelledBy,
		describedBy,
		flexContent = false,
		children
	}: Props = $props();

	let modalBoxRef = $state<HTMLElement | null>(null);
	let cleanupFocusTrap: (() => void) | null = null;
	let cleanupScrollLock: (() => void) | null = null;

	// Fluid max-width classes that scale down on small viewports
	// Uses min() to cap at either the size or viewport-32px (for 16px margin each side)
	const maxWidthClasses: Record<string, string> = {
		sm: 'w-full max-w-[min(24rem,calc(100vw-2rem))]',
		md: 'w-full max-w-[min(28rem,calc(100vw-2rem))]',
		lg: 'w-full max-w-[min(32rem,calc(100vw-2rem))]',
		xl: 'w-full max-w-[min(36rem,calc(100vw-2rem))]',
		'2xl': 'w-full max-w-[min(42rem,calc(100vw-2rem))]',
		'3xl': 'w-full max-w-[min(48rem,calc(100vw-2rem))]',
		'4xl': 'w-full max-w-[min(56rem,calc(100vw-2rem))]',
		'5xl': 'w-full max-w-[min(64rem,calc(100vw-2rem))]'
	};

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}

	// Set up focus trap and scroll lock when modal opens
	$effect(() => {
		if (open && modalBoxRef) {
			cleanupScrollLock = lockBodyScroll();
			cleanupFocusTrap = createFocusTrap(modalBoxRef);
		}

		return () => {
			if (cleanupFocusTrap) {
				cleanupFocusTrap();
				cleanupFocusTrap = null;
			}
			if (cleanupScrollLock) {
				cleanupScrollLock();
				cleanupScrollLock = null;
			}
		};
	});
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
	<div
		class="modal-open modal"
		role="dialog"
		aria-modal="true"
		aria-labelledby={labelledBy}
		aria-describedby={describedBy}
	>
		<div
			bind:this={modalBoxRef}
			class="modal-box max-h-[90vh] wrap-break-word {flexContent
				? 'flex flex-col overflow-hidden'
				: 'overflow-x-hidden overflow-y-auto'} {maxWidthClasses[maxWidth]}"
		>
			{@render children()}
		</div>
		<button
			type="button"
			class="modal-backdrop cursor-default border-none bg-black/50"
			onclick={onClose}
			aria-label="Close modal"
		></button>
	</div>
{/if}
