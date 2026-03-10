import { describe, expect, it } from 'vitest';

import { StrmService } from './StrmService';

describe('StrmService', () => {
	const service = StrmService.getInstance();

	describe('parseStrmFileUrl', () => {
		it('parses movie URLs with api_key query params', () => {
			expect(
				service.parseStrmFileUrl(
					'https://media.example.com/api/streaming/resolve/movie/603?api_key=old-key'
				)
			).toEqual({
				mediaType: 'movie',
				tmdbId: '603'
			});
		});

		it('parses tv URLs with query params', () => {
			expect(
				service.parseStrmFileUrl(
					'https://media.example.com/api/streaming/resolve/tv/1399/1/1?api_key=old-key&prefetch=1'
				)
			).toEqual({
				mediaType: 'tv',
				tmdbId: '1399',
				season: 1,
				episode: 1
			});
		});

		it('parses path-only URLs without query params', () => {
			expect(service.parseStrmFileUrl('/api/streaming/resolve/movie/550')).toEqual({
				mediaType: 'movie',
				tmdbId: '550'
			});
		});
	});

	describe('generateStrmContent', () => {
		it('regenerates movie URLs with the currently active API key', async () => {
			const parsed = service.parseStrmFileUrl(
				'https://old.example.com/api/streaming/resolve/movie/603?api_key=stale-key'
			);

			expect(parsed).toEqual({
				mediaType: 'movie',
				tmdbId: '603'
			});

			const updatedContent = await service.generateStrmContent({
				mediaType: parsed!.mediaType,
				tmdbId: parsed!.tmdbId,
				baseUrl: 'https://new.example.com',
				apiKey: 'active-key'
			});

			expect(updatedContent).toBe(
				'https://new.example.com/api/streaming/resolve/movie/603?api_key=active-key'
			);
			expect(updatedContent).not.toContain('stale-key');
		});

		it('regenerates tv URLs with the currently active API key', async () => {
			const parsed = service.parseStrmFileUrl(
				'https://old.example.com/api/streaming/resolve/tv/1399/1/2?api_key=stale-key'
			);

			expect(parsed).toEqual({
				mediaType: 'tv',
				tmdbId: '1399',
				season: 1,
				episode: 2
			});

			const updatedContent = await service.generateStrmContent({
				mediaType: parsed!.mediaType,
				tmdbId: parsed!.tmdbId,
				season: parsed!.season,
				episode: parsed!.episode,
				baseUrl: 'https://new.example.com',
				apiKey: 'active-key'
			});

			expect(updatedContent).toBe(
				'https://new.example.com/api/streaming/resolve/tv/1399/1/2?api_key=active-key'
			);
			expect(updatedContent).not.toContain('stale-key');
		});
	});
});
