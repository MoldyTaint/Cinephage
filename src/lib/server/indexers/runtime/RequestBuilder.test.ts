import { describe, expect, it } from 'vitest';
import { createFilterEngine } from '../engine/FilterEngine';
import { createTemplateEngine } from '../engine/TemplateEngine';
import { RequestBuilder } from './RequestBuilder';
import type { SearchCriteria } from '../types';
import type { CardigannDefinition } from '../schema/yamlDefinition';

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
	} as unknown as CardigannDefinition;

	return new RequestBuilder(definition, createTemplateEngine(), createFilterEngine());
}

function createRutrackerLikeTvBuilder(): RequestBuilder {
	const definition = {
		id: 'rutracker-like',
		name: 'RuTracker-like',
		type: 'semi-private',
		protocol: 'torrent',
		links: ['https://example.test'],
		caps: {
			categories: {
				'5000': 'TV'
			},
			categorymappings: [{ id: '5000', cat: 'TV', default: true }]
		},
		search: {
			paths: [
				{
					path: '/forum/tracker.php',
					method: 'get',
					inputs: {
						nm: '{{ .Keywords }}'
					}
				}
			],
			keywordsfilters: [
				{
					name: 're_replace',
					args: ['[^a-zA-Zа-яА-ЯёЁ0-9]+', '%']
				}
			],
			response: { type: 'html' },
			rows: { selector: 'table#tor-tbl tbody tr' },
			fields: {
				title: { selector: 'a.tLink' }
			}
		}
	} as unknown as CardigannDefinition;

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

	it('does not append S00 token for season 0 when no episode is specified', () => {
		const builder = createTestRequestBuilder();
		const criteria: SearchCriteria = {
			searchType: 'tv',
			query: 'One Piece',
			season: 0
		};

		const requests = builder.buildSearchRequests(criteria);

		expect(requests).toHaveLength(1);
		expect(getParam(requests[0].url, 'q')).toBe('One Piece');
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

	it('skips TV query variants when keyword filters collapse title to episode token only', () => {
		const builder = createRutrackerLikeTvBuilder();
		const criteria: SearchCriteria = {
			searchType: 'tv',
			query: '怪奇物语',
			season: 1,
			episode: 1,
			preferredEpisodeFormat: 'standard'
		};

		const requests = builder.buildSearchRequests(criteria);
		expect(requests).toHaveLength(0);
	});

	it('keeps TV query variants when title remains after keyword filtering', () => {
		const builder = createRutrackerLikeTvBuilder();
		const criteria: SearchCriteria = {
			searchType: 'tv',
			query: 'Stranger Things',
			season: 1,
			episode: 1,
			preferredEpisodeFormat: 'standard'
		};

		const requests = builder.buildSearchRequests(criteria);
		expect(requests).toHaveLength(1);
		expect(getParam(requests[0].url, 'nm')).toContain('Stranger');
		expect(getParam(requests[0].url, 'nm')).toContain('S01E01');
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
		} as unknown as CardigannDefinition;

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

describe('RequestBuilder newznab base path handling', () => {
	function createNewznabSearchBuilder(baseUrl: string): RequestBuilder {
		const definition = {
			id: 'newznab',
			name: 'Newznab',
			type: 'private',
			protocol: 'usenet',
			links: [baseUrl],
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
						inputs: {
							t: 'search',
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
		} as unknown as CardigannDefinition;

		return new RequestBuilder(definition, createTemplateEngine(), createFilterEngine());
	}

	it('preserves configured base subpath for search requests', () => {
		const builder = createNewznabSearchBuilder('http://10.0.0.149:8383/newznab');
		const criteria: SearchCriteria = {
			searchType: 'basic',
			query: 'test query'
		};

		const requests = builder.buildSearchRequests(criteria);
		expect(requests).toHaveLength(1);

		const requestUrl = new URL(requests[0].url);
		expect(requestUrl.origin).toBe('http://10.0.0.149:8383');
		expect(requestUrl.pathname).toBe('/newznab/api');
		expect(requestUrl.searchParams.get('t')).toBe('search');
		expect(requestUrl.searchParams.get('q')).toBe('test query');
	});

	it('does not duplicate /api when base URL already ends with /api', () => {
		const builder = createNewznabSearchBuilder('http://10.0.0.149:8383/newznab/api');
		const criteria: SearchCriteria = {
			searchType: 'basic',
			query: 'test query'
		};

		const requests = builder.buildSearchRequests(criteria);
		expect(requests).toHaveLength(1);

		const requestUrl = new URL(requests[0].url);
		expect(requestUrl.pathname).toBe('/newznab/api');
		expect(requestUrl.searchParams.get('t')).toBe('search');
		expect(requestUrl.searchParams.get('q')).toBe('test query');
	});
});
