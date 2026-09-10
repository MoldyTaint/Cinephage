// @vitest-environment jsdom
/**
 * LibraryMovieHeader back-link tests (issue #515).
 *
 * Pins that the header:
 * 1. Renders a consistent "Back to <name>" label using the ICU message.
 * 2. Prefers the caller-supplied `backHref` (persisted filtered list URL) over
 *    the library-slug fallback construction.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import LibraryMovieHeader from './LibraryMovieHeader.svelte';

const movieStub = {
	id: 1,
	title: 'Test Movie',
	monitored: true,
	hasFile: false,
	files: []
} as any;

function renderHeader(props: Record<string, unknown> = {}) {
	return render(LibraryMovieHeader, {
		props: {
			movie: movieStub,
			onMonitorToggle: vi.fn(),
			onSearch: vi.fn(),
			...props
		}
	});
}

function getBackLink(): HTMLAnchorElement {
	return screen.getByRole('link', { name: /Back to/ }) as HTMLAnchorElement;
}

describe('LibraryMovieHeader back link', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders "Back to Movies" without a library name', () => {
		renderHeader();
		expect(getBackLink().textContent).toContain('Back to Movies');
	});

	it('renders "Back to <libraryName>" with a library name', () => {
		renderHeader({ libraryName: '4K Movies' });
		expect(getBackLink().textContent).toContain('Back to 4K Movies');
	});

	it('falls back to /library/movies when no backHref', () => {
		renderHeader();
		expect(getBackLink().getAttribute('href')).toContain('/library/movies');
	});

	it('prefers backHref over the fallback construction', () => {
		renderHeader({
			backHref: '/library/movies?monitored=true&sort=added-desc&qualityProfile=2'
		});
		const href = getBackLink().getAttribute('href') ?? '';
		expect(href).toContain('monitored=true');
		expect(href).toContain('sort=added-desc');
		expect(href).not.toContain('library=');
	});

	it('keeps slug fallback when backHref absent but librarySlug set', () => {
		renderHeader({ librarySlug: 'kids' });
		expect(getBackLink().getAttribute('href')).toContain('library=kids');
	});
});
