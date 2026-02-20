import { describe, expect, it } from 'vitest';
import { createFilterEngine } from '../engine/FilterEngine';
import { createTemplateEngine } from '../engine/TemplateEngine';
import { RequestBuilder } from './RequestBuilder';
import type { SearchCriteria } from '../types';

function createTestRequestBuilder(): RequestBuilder {
	const definition = {
		id: 'test-indexer',
		name: 'Test Indexer',
		type: 'private',
		protocol: 'usenet',
		links: ['https://example.test'],
		caps: {
			categories: {
				'2000': 'Movies',
				'5000': 'TV'
			},
			categorymappings: [
				{ id: '2000', cat: 'Movies' },
				{ id: '5000', cat: 'TV', default: true }
			]
		},
		search: {
			paths: [
				{
					path: '/api',
					method: 'get',
					categories: ['Movies'],
					inputs: {
						t: 'movie',
						cat: '{{ join .Categories "," }}',
						q: '{{ .Keywords }}'
					}
				},
				{
					path: '/api',
					method: 'get',
					categories: ['TV'],
					inputs: {
						t: 'tvsearch',
						cat: '{{ join .Categories "," }}',
						q: '{{ .Keywords }}'
					}
				},
				{
					path: '/api',
					method: 'get',
					inputs: {
						t: 'search',
						cat: '{{ join .Categories "," }}',
						q: '{{ .Keywords }}'
					}
				}
			],
			response: { type: 'xml' },
			rows: { selector: 'rss channel item' },
			fields: {
				title: { selector: 'title' }
			}
		}
	} as any;

	return new RequestBuilder(definition, createTemplateEngine(), createFilterEngine());
}

function getParam(url: string, key: string): string | null {
	return new URL(url).searchParams.get(key);
}

describe('RequestBuilder category defaults', () => {
	it('uses movie categories for movie search when categories are omitted', () => {
		const builder = createTestRequestBuilder();
		const criteria: SearchCriteria = {
			searchType: 'movie',
			query: 'The Wrecking Crew',
			year: 2026
		};

		const requests = builder.buildSearchRequests(criteria);

		expect(requests).toHaveLength(1);
		expect(getParam(requests[0].url, 't')).toBe('movie');
		expect(getParam(requests[0].url, 'cat')).toBe('2000');
	});

	it('uses TV categories for tv search when categories are omitted', () => {
		const builder = createTestRequestBuilder();
		const criteria: SearchCriteria = {
			searchType: 'tv',
			query: 'The Wrecking Crew',
			season: 1,
			episode: 1
		};

		const requests = builder.buildSearchRequests(criteria);

		expect(requests).toHaveLength(1);
		expect(getParam(requests[0].url, 't')).toBe('tvsearch');
		expect(getParam(requests[0].url, 'cat')).toBe('5000');
	});

	it('includes preferred episode token in TV keyword query', () => {
		const builder = createTestRequestBuilder();
		const criteria: SearchCriteria = {
			searchType: 'tv',
			query: 'Smallville',
			season: 1,
			episode: 1,
			preferredEpisodeFormat: 'standard'
		};

		const requests = builder.buildSearchRequests(criteria);

		expect(requests).toHaveLength(1);
		expect(getParam(requests[0].url, 'q')).toBe('Smallville S01E01');
	});

	it('keeps generic path for basic search', () => {
		const builder = createTestRequestBuilder();
		const criteria: SearchCriteria = {
			searchType: 'basic',
			query: 'Trap House 2025'
		};

		const requests = builder.buildSearchRequests(criteria);
		const modes = requests
			.map((request) => getParam(request.url, 't'))
			.filter((mode): mode is string => Boolean(mode));

		expect(requests).toHaveLength(1);
		expect(modes).toContain('search');
	});
});

describe('RequestBuilder supported param filtering', () => {
	function createMovieIdBuilder(): RequestBuilder {
		const definition = {
			id: 'test-newznab',
			name: 'Test Newznab',
			type: 'private',
			protocol: 'usenet',
			links: ['https://example.test'],
			caps: {
				categories: {
					'2000': 'Movies'
				},
				categorymappings: [{ id: '2000', cat: 'Movies', default: true }]
			},
			search: {
				paths: [
					{
						path: '/api',
						method: 'get',
						categories: ['Movies'],
						inputs: {
							t: 'movie',
							cat: '{{ join .Categories "," }}',
							imdbid: '{{ .Query.IMDBIDShort }}',
							q: '{{ .Keywords }}'
						}
					}
				],
				response: { type: 'xml' },
				rows: { selector: 'rss channel item' },
				fields: {
					title: { selector: 'title' }
				}
			}
		} as any;

		return new RequestBuilder(definition, createTemplateEngine(), createFilterEngine());
	}

	it('omits q when mode capabilities do not advertise q', () => {
		const builder = createMovieIdBuilder();
		builder.setSupportedParams('movie', ['imdbid']);

		const criteria: SearchCriteria = {
			searchType: 'movie',
			query: 'Example Movie',
			imdbId: 'tt1234567'
		};

		const requests = builder.buildSearchRequests(criteria);
		expect(requests).toHaveLength(1);
		expect(getParam(requests[0].url, 'imdbid')).toBe('1234567');
		expect(getParam(requests[0].url, 'q')).toBeNull();
	});

	it('keeps q when mode capabilities advertise q', () => {
		const builder = createMovieIdBuilder();
		builder.setSupportedParams('movie', ['q', 'imdbid']);

		const criteria: SearchCriteria = {
			searchType: 'movie',
			query: 'Example Movie',
			imdbId: 'tt1234567'
		};

		const requests = builder.buildSearchRequests(criteria);
		expect(requests).toHaveLength(1);
		expect(getParam(requests[0].url, 'imdbid')).toBe('1234567');
		expect(getParam(requests[0].url, 'q')).toBe('Example Movie');
	});
});
