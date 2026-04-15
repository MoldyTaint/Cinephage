import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { StrmService } from './StrmService';

describe('StrmService', () => {
	const service = StrmService.getInstance();

	describe('parseStrmFileUrl', () => {
		it('parses movie URLs with api_key query params', () => {
			expect(
				service.parseStrmFileUrl(
					'https://media.example.com/api/streaming/session/movie/603/master.m3u8?api_key=old-key'
				)
			).toEqual({
				mediaType: 'movie',
				tmdbId: '603'
			});
		});

		it('parses tv URLs with query params', () => {
			expect(
				service.parseStrmFileUrl(
					'https://media.example.com/api/streaming/session/tv/1399/1/1/master.m3u8?api_key=old-key&prefetch=1'
				)
			).toEqual({
				mediaType: 'tv',
				tmdbId: '1399',
				season: 1,
				episode: 1
			});
		});

		it('parses path-only URLs without query params', () => {
			expect(service.parseStrmFileUrl('/api/streaming/session/movie/550/master.m3u8')).toEqual({
				mediaType: 'movie',
				tmdbId: '550'
			});
		});
	});

	describe('generateStrmContent', () => {
		it('regenerates movie URLs with the currently active API key', async () => {
			const parsed = service.parseStrmFileUrl(
				'https://old.example.com/api/streaming/session/movie/603/master.m3u8?api_key=stale-key'
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
				'https://new.example.com/api/streaming/session/movie/603/master.m3u8?api_key=active-key'
			);
			expect(updatedContent).not.toContain('stale-key');
		});

		it('regenerates tv URLs with the currently active API key', async () => {
			const parsed = service.parseStrmFileUrl(
				'https://old.example.com/api/streaming/session/tv/1399/1/2/master.m3u8?api_key=stale-key'
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
				'https://new.example.com/api/streaming/session/tv/1399/1/2/master.m3u8?api_key=active-key'
			);
			expect(updatedContent).not.toContain('stale-key');
		});
	});

	describe('naming-based path generation', () => {
		it('uses the current naming service for movie strm paths', () => {
			(
				service as unknown as {
					getNamingService: () => {
						generateMovieFolderName: () => string;
						generateMovieFileName: () => string;
					};
				}
			).getNamingService = () => ({
				generateMovieFolderName: () => 'Movie Folder',
				generateMovieFileName: () => 'Movie File.strm'
			});

			expect(
				(
					service as unknown as {
						buildMovieStrmPath: (
							rootFolderPath: string,
							movie: {
								title: string;
								year: number | null;
								tmdbId: number;
								imdbId?: string | null;
								path: string | null;
							}
						) => string;
					}
				).buildMovieStrmPath('/library/movies', {
					title: 'Movie',
					year: 2024,
					tmdbId: 1,
					path: null
				})
			).toBe(join('/library/movies', 'Movie Folder', 'Movie File.strm'));
		});

		it('uses the current naming service for episode strm paths', () => {
			(
				service as unknown as {
					getNamingService: () => {
						generateSeriesFolderName: () => string;
						generateSeasonFolderName: () => string;
						generateEpisodeFileName: () => string;
					};
				}
			).getNamingService = () => ({
				generateSeriesFolderName: () => 'Series Folder',
				generateSeasonFolderName: () => 'Collection 03',
				generateEpisodeFileName: () => 'Episode 08.strm'
			});

			expect(
				(
					service as unknown as {
						buildEpisodeStrmPath: (
							rootFolderPath: string,
							show: {
								title: string;
								year: number | null;
								tmdbId: number;
								tvdbId?: number | null;
								path: string | null;
								seasonFolder?: boolean | null;
							},
							seasonNumber: number,
							episodeNumber: number,
							episodeTitle?: string | null
						) => string;
					}
				).buildEpisodeStrmPath(
					'/library/tv',
					{
						title: 'Show',
						year: 2024,
						tmdbId: 2,
						path: null,
						seasonFolder: true
					},
					3,
					8,
					'Test Episode'
				)
			).toBe(join('/library/tv', 'Series Folder', 'Collection 03', 'Episode 08.strm'));
		});
	});
});
