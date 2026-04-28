/**
 * Focus management utilities for modals and dialogs
 */

const FOCUSABLE_SELECTORS = [
	'button:not([disabled]):not([tabindex="-1"])',
	'input:not([disabled]):not([tabindex="-1"])',
	'select:not([disabled]):not([tabindex="-1"])',
	'textarea:not([disabled]):not([tabindex="-1"])',
	'[tabindex]:not([tabindex="-1"])',
	'a[href]:not([tabindex="-1"])',
	'[contenteditable="true"]:not([tabindex="-1"])'
].join(', ');

/**
 * Get all focusable elements within a container
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
		(el) => el.offsetParent !== null // Filter out hidden elements
	);
}

/**
 * Get the first focusable element in a container
 */
export function getFirstFocusable(container: HTMLElement): HTMLElement | null {
	const focusable = getFocusableElements(container);
	return focusable[0] ?? null;
}

/**
 * Create a focus trap within a container element.
 * Returns a cleanup function to remove the trap.
 */
export function createFocusTrap(container: HTMLElement): () => void {
	const previouslyFocused = document.activeElement as HTMLElement | null;

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;

		const focusable = getFocusableElements(container);
		if (focusable.length === 0) return;

		const first = focusable[0];
		const last = focusable[focusable.length - 1];

		if (event.shiftKey) {
			// Shift+Tab: if on first element, wrap to last
			if (document.activeElement === first) {
				event.preventDefault();
				last.focus();
			}
		} else {
			// Tab: if on last element, wrap to first
			if (document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}
	}

	container.addEventListener('keydown', handleKeydown);

	// Focus first focusable element
	const firstFocusable = getFirstFocusable(container);
	if (firstFocusable) {
		// Small delay to ensure DOM is ready
		requestAnimationFrame(() => {
			firstFocusable.focus();
		});
	}

	// Return cleanup function
	return () => {
		container.removeEventListener('keydown', handleKeydown);
		// Restore focus to previously focused element
		if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
			previouslyFocused.focus();
		}
	};
}

/**
 * Lock body scroll when modal is open
 */
export function lockBodyScroll(): () => void {
	const scrollY = window.scrollY;
	const body = document.body;
	const originalStyle = body.style.cssText;

	body.style.position = 'fixed';
	body.style.top = `-${scrollY}px`;
	body.style.left = '0';
	body.style.right = '0';
	body.style.overflow = 'hidden';

	return () => {
		body.style.cssText = originalStyle;
		window.scrollTo(0, scrollY);
	};
}
