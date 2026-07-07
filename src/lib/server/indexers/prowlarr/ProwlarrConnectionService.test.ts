import { describe, it, expect } from 'vitest';
import { isIndexerFromConnection, getProwlarrId } from './ProwlarrConnectionService';

describe('ProwlarrConnectionService helpers', () => {
	const prowlarrBase = 'http://localhost:9696';

	describe('isIndexerFromConnection', () => {
		it('should match a new prowlarr definition indexer object', () => {
			const indexer = {
				definitionId: 'prowlarr',
				baseUrl: 'http://localhost:9696'
			};
			expect(isIndexerFromConnection(indexer, prowlarrBase)).toBe(true);
		});

		it('should match a new prowlarr definition indexer object with trailing slashes', () => {
			const indexer = {
				definitionId: 'prowlarr',
				baseUrl: 'http://localhost:9696/'
			};
			expect(isIndexerFromConnection(indexer, prowlarrBase)).toBe(true);
		});

		it('should not match a different baseUrl for a prowlarr definition indexer', () => {
			const indexer = {
				definitionId: 'prowlarr',
				baseUrl: 'http://other-prowlarr:9696'
			};
			expect(isIndexerFromConnection(indexer, prowlarrBase)).toBe(false);
		});

		it('should match legacy URL-based indexer object', () => {
			const indexer = {
				definitionId: 'torznab',
				baseUrl: 'http://localhost:9696/3'
			};
			expect(isIndexerFromConnection(indexer, prowlarrBase)).toBe(true);
		});

		it('should match legacy string URL input', () => {
			expect(isIndexerFromConnection('http://localhost:9696/3', prowlarrBase)).toBe(true);
		});

		it('should match base URL string input for new format', () => {
			expect(isIndexerFromConnection('http://localhost:9696', prowlarrBase)).toBe(true);
		});
	});

	describe('getProwlarrId', () => {
		it('should extract ID from settings for a prowlarr definition indexer', () => {
			const indexer = {
				definitionId: 'prowlarr',
				baseUrl: 'http://localhost:9696',
				settings: {
					indexerId: '42'
				}
			};
			expect(getProwlarrId(indexer, prowlarrBase)).toBe(42);
		});

		it('should extract ID from URL for a legacy indexer', () => {
			const indexer = {
				definitionId: 'torznab',
				baseUrl: 'http://localhost:9696/7'
			};
			expect(getProwlarrId(indexer, prowlarrBase)).toBe(7);
		});
	});
});
