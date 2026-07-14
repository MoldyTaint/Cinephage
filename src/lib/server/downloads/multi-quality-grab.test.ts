import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, destroyTestDb, type TestDatabase } from '../../../test/db-helper.js';
import { downloadClients, downloadQueue, movies } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

const testDb: TestDatabase = createTestDb();

vi.mock('$lib/server/db/index.js', () => ({
	get db() {
		return testDb.db;
	},
	get sqlite() {
		return testDb.sqlite;
	},
	initializeDatabase: vi.fn().mockResolvedValue(undefined)
}));

// Scoring is not under test here; return an always-acceptable result whose
// resolution is taken from the real ReleaseParser output ScoringStage passes in.
vi.mock('$lib/server/quality/QualityFilter.js', () => ({
	qualityFilter: {
		getProfile: vi.fn().mockResolvedValue(null),
		getDefaultScoringProfile: vi.fn().mockResolvedValue({
			id: 'balanced',
			name: 'Balanced',
			minScore: 0,
			upgradesAllowed: true,
			formatScores: {},
			allowedProtocols: ['torrent', 'usenet', 'streaming']
		}),
		calculateEnhancedScore: vi.fn((parsed: { resolution?: string }) => ({
			scoringResult: {
				releaseName: '',
				profile: 'Balanced',
				resolution: parsed.resolution,
				totalScore: 100,
				matchedFormats: [],
				breakdown: {},
				meetsMinimum: true,
				isBanned: false,
				bannedReasons: [],
				sizeRejected: false,
				sizeRejectionReason: undefined,
				protocolRejected: false,
				protocolRejectionReason: undefined
			}
		}))
	}
}));

// Stub the torrent handler so grab() persists a REAL download_queue row for each
// grab. This is what makes the second grab's occupancy check observe bucket A as
// occupied - the exact scenario the bucket-aware fix must not over-block.
vi.mock('./handlers/TorrentHandler.js', () => ({
	TorrentHandler: class {
		async handle(request: { release: { title: string } }, resolved: { movieId?: string }) {
			const { db } = await import('$lib/server/db/index.js');
			const { downloadQueue } = await import('$lib/server/db/schema.js');
			const { ReleaseParser } = await import('$lib/server/indexers/parser/ReleaseParser.js');
			const parser = new ReleaseParser();
			const parsed = parser.parse(request.release.title);
			const id = `queue-${resolved.movieId}-${parsed.resolution}`;
			await db.insert(downloadQueue).values({
				id,
				downloadClientId: 'client-1',
				downloadId: `hash-${id}`,
				title: request.release.title,
				movieId: resolved.movieId,
				status: 'queued',
				protocol: 'torrent',
				quality: { resolution: parsed.resolution }
			});
			return {
				success: true,
				queueId: id,
				hash: `hash-${id}`,
				clientId: 'client-1',
				clientName: 'qBittorrent',
				wasDuplicate: false
			};
		}
	}
}));

const { grabService } = await import('./GrabService.js');

function resetDb() {
	testDb.sqlite.exec(`
		DELETE FROM download_queue;
		DELETE FROM movies;
		DELETE FROM download_clients;
	`);
}

function seedMovieAndClient() {
	testDb.db
		.insert(downloadClients)
		.values({
			id: 'client-1',
			name: 'qBittorrent',
			implementation: 'qbittorrent',
			host: 'localhost',
			port: 8080
		})
		.run();
	testDb.db
		.insert(movies)
		.values({
			id: 'movie-1',
			tmdbId: 100,
			title: 'Test Movie',
			path: 'Test Movie (2026)',
			desiredQualities: ['2160p', '1080p']
		})
		.run();
}

describe('GrabService multi-quality two-bucket grab (integration)', () => {
	afterAll(() => {
		destroyTestDb(testDb);
	});

	beforeEach(() => {
		resetDb();
		seedMovieAndClient();
	});

	it('accepts a 1080p grab while a 2160p download is already queued', async () => {
		const options = {
			force: false,
			skipBlocklist: true,
			isAutomatic: true,
			allowSidegrade: false,
			skipDelay: true
		};

		// Bucket A: 2160p grab must succeed and create a real download_queue row.
		const first = await grabService.grab({
			release: {
				title: 'Test.Movie.2026.2160p.WEB-DL.DDP5.1.H.264-GROUP',
				protocol: 'torrent',
				size: 5_000_000_000
			},
			target: { type: 'movie', movieId: 'movie-1' },
			options
		});
		expect(first.success).toBe(true);

		// Sanity: the 2160p download really is queued, so the next grab has
		// something concrete that the old (pre-fix) logic would block on.
		const queued2160p = await testDb.db
			.select({ id: downloadQueue.id })
			.from(downloadQueue)
			.where(eq(downloadQueue.movieId, 'movie-1'));
		expect(queued2160p).toHaveLength(1);

		// Bucket B: 1080p grab must NOT be rejected by MediaOccupancyStage.
		const second = await grabService.grab({
			release: {
				title: 'Test.Movie.2026.1080p.WEB-DL.DDP5.1.H.264-GROUP',
				protocol: 'torrent',
				size: 4_000_000_000
			},
			target: { type: 'movie', movieId: 'movie-1' },
			options
		});
		expect(second.success).toBe(true);
		expect(second.decision.rejectionType).not.toBe('media_occupied');

		// Both buckets now have active downloads.
		const allQueued = await testDb.db
			.select({ id: downloadQueue.id })
			.from(downloadQueue)
			.where(eq(downloadQueue.movieId, 'movie-1'));
		expect(allQueued).toHaveLength(2);
	});
});
