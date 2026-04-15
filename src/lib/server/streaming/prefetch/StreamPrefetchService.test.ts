import { beforeEach, describe, expect, it, vi } from 'vitest';

const createOrReuseSessionMock = vi.fn();

vi.mock('..', async () => {
	const actual = await vi.importActual<typeof import('..')>('..');
	return {
		...actual,
		getPlaybackSessionService: () => ({
			createOrReuseSession: createOrReuseSessionMock
		})
	};
});

describe('StreamPrefetchService', () => {
	beforeEach(async () => {
		vi.clearAllMocks();

		const { getStreamCache } = await import('../cache');
		getStreamCache().clear();

		const { getPlaybackSessionStore } = await import('../sessions/session-store');
		getPlaybackSessionStore().clear();
	});

	it('warms the positive stream cache after a successful prefetch session', async () => {
		const { MultiLevelStreamCache, getStreamCache } = await import('../cache');
		const cacheKey = MultiLevelStreamCache.streamKey('550', 'movie');
		const extractionResult = {
			success: true,
			sources: [
				{
					quality: '1080p',
					title: 'Mapple stream',
					url: 'https://stream.example.com/master.m3u8',
					type: 'm3u8' as const,
					referer: 'https://player.example.com/',
					requiresSegmentProxy: true,
					provider: 'Mapple'
				}
			],
			provider: 'Mapple'
		};

		createOrReuseSessionMock.mockResolvedValue({
			session: {
				token: 'session-token',
				provider: 'Mapple'
			},
			extractionResult
		});

		const { StreamPrefetchService } = await import('./StreamPrefetchService');
		const service = new StreamPrefetchService();

		const result = await (
			service as unknown as {
				prefetchStream: (
					tmdbId: number,
					mediaType: 'movie' | 'tv',
					season?: number,
					episode?: number
				) => Promise<{ success: boolean; cached: boolean }>;
			}
		).prefetchStream(550, 'movie');

		expect(result.success).toBe(true);
		expect(result.cached).toBe(false);

		expect(getStreamCache().getStream(cacheKey)).toMatchObject({
			success: true,
			sources: extractionResult.sources,
			provider: 'Mapple'
		});
	});

	it('deduplicates concurrent prefetch requests for the same title', async () => {
		let resolveSession: ((value: { session: { token: string } }) => void) | undefined;
		createOrReuseSessionMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveSession = resolve;
				})
		);

		const { StreamPrefetchService } = await import('./StreamPrefetchService');
		const service = new StreamPrefetchService();

		const first = (
			service as unknown as {
				prefetchStream: (
					tmdbId: number,
					mediaType: 'movie' | 'tv',
					season?: number,
					episode?: number
				) => Promise<{ success: boolean }>;
			}
		).prefetchStream(550, 'movie');
		const second = (
			service as unknown as {
				prefetchStream: (
					tmdbId: number,
					mediaType: 'movie' | 'tv',
					season?: number,
					episode?: number
				) => Promise<{ success: boolean }>;
			}
		).prefetchStream(550, 'movie');

		expect(createOrReuseSessionMock).toHaveBeenCalledTimes(1);

		resolveSession?.({
			session: {
				token: 'session-token'
			}
		});

		const [firstResult, secondResult] = await Promise.all([first, second]);
		expect(firstResult.success).toBe(true);
		expect(secondResult.success).toBe(true);
	});
});
