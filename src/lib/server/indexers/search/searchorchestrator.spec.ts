import { describe, it, expect } from 'vitest';
import { SearchOrchestrator } from './SearchOrchestrator';
import type { IndexerCapabilities } from '../types';

// Shared mock capabilities for test indexers
const mockCapabilities: IndexerCapabilities = {
	search: { available: true, supportedParams: ['q'] },
	tvSearch: { available: true, supportedParams: ['q', 'season', 'ep'] },
	movieSearch: { available: true, supportedParams: ['q', 'year'] },
	categories: new Map(),
	supportsPagination: true,
	supportsInfoHash: false,
	limitMax: 100,
	limitDefault: 50,
	searchFormats: {
		episode: ['standard', 'european', 'compact']
	}
};

describe('SearchOrchestrator.executeMultiTitleTextSearch', () => {
	it('embeds episode format into query for TV searches', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: mockCapabilities,
			search: async (criteria: any) => {
				captured.push(criteria);
				return [];
			}
		} as any;

		const criteria = {
			searchType: 'tv',
			query: 'My Show',
			season: 1,
			episode: 5
		} as any;

		await (orchestrator as any).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured.length).toBeGreaterThan(0);

		// With the new architecture, queries are CLEAN (no embedded tokens)
		// and preferredEpisodeFormat tells TemplateEngine which format to use
		const queries = captured.map((c) => c.query);
		const formats = captured.map((c) => c.preferredEpisodeFormat);

		// All queries should be clean (just the title)
		expect(queries.every((q: string) => q === 'My Show')).toBe(true);

		// Should have all three format variants
		expect(formats).toContain('standard');
		expect(formats).toContain('european');
		expect(formats).toContain('compact');
	});

	it('embeds season-only format into query when no episode specified', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: mockCapabilities,
			search: async (criteria: any) => {
				captured.push(criteria);
				return [];
			}
		} as any;

		const criteria = {
			searchType: 'tv',
			query: 'My Show',
			season: 2
		} as any;

		await (orchestrator as any).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured.length).toBeGreaterThan(0);

		// Season-only search should use standard format (S02)
		// Query is clean, preferredEpisodeFormat tells TemplateEngine to add S02
		const queries = captured.map((c) => c.query);
		const formats = captured.map((c) => c.preferredEpisodeFormat);

		expect(queries.every((q: string) => q === 'My Show')).toBe(true);
		expect(formats).toContain('standard'); // S02 is standard format
	});

	it('uses title for movie searches without episode format', async () => {
		const orchestrator = new SearchOrchestrator();
		const captured: any[] = [];

		const fakeIndexer = {
			name: 'FakeIndexer',
			capabilities: mockCapabilities,
			search: async (criteria: any) => {
				captured.push(criteria);
				return [];
			}
		} as any;

		const criteria = {
			searchType: 'movie',
			query: 'The Matrix',
			year: 1999
		} as any;

		await (orchestrator as any).executeMultiTitleTextSearch(fakeIndexer, criteria);

		expect(captured.length).toBeGreaterThan(0);

		const queries = captured.map((c) => c.query);
		expect(queries.some((q: string) => q.includes('The Matrix'))).toBe(true);
	});
});
