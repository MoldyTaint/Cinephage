// @vitest-environment jsdom
/**
 * LibrarySeriesHeader back-link tests (issue #515).
 *
 * Pins label consistency ("Back to TV Shows", previously rendered as just
 * "TV Shows") and backHref precedence over the slug fallback.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import LibrarySeriesHeader from './LibrarySeriesHeader.svelte';

const seriesStub = {
	tmdbId: 1,
	tvdbId: null,
	imdbId: null,
	title: 'Test Series',
	year: 2020,
	overview: null,
	status: 'continuing',
	network: null,
	genres: null,
	posterPath: null,
	backdropPath: null,
	monitored: true
} as any;

function renderHeader(props: Record<string, unknown> = {}) {
	return render(LibrarySeriesHeader, {
		props: {
			series: seriesStub,
			onMonitorToggle: vi.fn(),
			onSearch: vi.fn(),
			...props
		}
	});
}

function getBackLink(): HTMLAnchorElement {
	return screen.getByRole('link', { name: /Back to/ }) as HTMLAnchorElement;
}

describe('LibrarySeriesHeader back link', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders "Back to TV Shows" without a library name', () => {
		renderHeader();
		expect(getBackLink().textContent).toContain('Back to TV Shows');
	});

	it('renders "Back to <libraryName>" with a library name', () => {
		renderHeader({ libraryName: 'Anime' });
		expect(getBackLink().textContent).toContain('Back to Anime');
	});

	it('falls back to /library/tv when no backHref', () => {
		renderHeader();
		expect(getBackLink().getAttribute('href')).toContain('/library/tv');
	});

	it('prefers backHref over the fallback construction', () => {
		renderHeader({ backHref: '/library/tv?status=continuing&progress=missing' });
		const href = getBackLink().getAttribute('href') ?? '';
		expect(href).toContain('status=continuing');
		expect(href).toContain('progress=missing');
	});

	it('keeps slug fallback when backHref absent but librarySlug set', () => {
		renderHeader({ librarySlug: 'anime' });
		expect(getBackLink().getAttribute('href')).toContain('library=anime');
	});
});
