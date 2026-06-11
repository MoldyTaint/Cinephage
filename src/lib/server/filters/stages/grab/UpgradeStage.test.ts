import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpgradeStage } from './UpgradeStage.js';
import type { GrabDecisionContext, ExistingFile } from './types.js';

const mockIsUpgrade = vi.hoisted(() => vi.fn());
const mockBuildExistingAttrs = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/scoring/scorer.js', () => ({
	isUpgrade: mockIsUpgrade
}));

vi.mock('$lib/server/monitoring/specifications/utils.js', () => ({
	buildExistingAttrs: mockBuildExistingAttrs
}));

function makeProfile(overrides = {}) {
	return {
		id: 'balanced',
		upgradesAllowed: true,
		minScoreIncrement: 10,
		formatScores: {},
		...overrides
	} as any;
}

function makeCtx(overrides: Partial<GrabDecisionContext> = {}): GrabDecisionContext {
	return {
		release: { title: 'Movie.2024.2160p.WEB-DL', size: 8000000000, protocol: 'torrent' },
		target: { type: 'movie', movieId: 'movie-1' },
		existingFiles: [],
		profile: makeProfile(),
		options: { force: false, skipBlocklist: false, allowSidegrade: false, isAutomatic: true },
		computed: { candidateScore: 200 },
		...overrides
	};
}

const stage = new UpgradeStage();

describe('UpgradeStage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockBuildExistingAttrs.mockReturnValue(undefined);
	});

	describe('isEnabled', () => {
		it('always returns true', () => {
			expect(stage.isEnabled(makeCtx())).toBe(true);
			expect(stage.isEnabled(makeCtx({ existingFiles: [] }))).toBe(true);
		});
	});

	describe('evaluate - new content', () => {
		it('accepts with upgradeStatus new when no existing files', async () => {
			const ctx = makeCtx({ existingFiles: [] });
			const result = await stage.evaluate(ctx);
			expect(result.accepted).toBe(true);
			expect(ctx.computed.upgradeStatus).toBe('new');
		});
	});

	describe('evaluate - force mode', () => {
		it('accepts with upgradeStatus upgrade when force is true', async () => {
			const existing: ExistingFile = { id: 'f1', relativePath: '/movies/movie.mkv' };
			const ctx = makeCtx({
				existingFiles: [existing],
				options: { force: true, skipBlocklist: false, allowSidegrade: false, isAutomatic: false }
			});
			const result = await stage.evaluate(ctx);
			expect(result.accepted).toBe(true);
			expect(ctx.computed.upgradeStatus).toBe('upgrade');
		});
	});

	describe('evaluate - upgrades disabled', () => {
		it('rejects when profile disallows upgrades', async () => {
			const existing: ExistingFile = { id: 'f1', relativePath: '/movies/movie.mkv' };
			const ctx = makeCtx({
				existingFiles: [existing],
				profile: makeProfile({ upgradesAllowed: false })
			});
			const result = await stage.evaluate(ctx);
			expect(result.accepted).toBe(false);
			expect(result.reason).toContain('Upgrades are disabled');
			expect(ctx.computed.upgradeStatus).toBe('blocked');
		});
	});

	describe('evaluate - single file upgrade', () => {
		it('accepts when isUpgrade returns true', async () => {
			const existing: ExistingFile = {
				id: 'f1',
				relativePath: '/movies/movie.1080p.mkv',
				sceneName: 'Movie.2024.1080p.WEB-DL'
			};
			mockIsUpgrade.mockReturnValue({
				isUpgrade: true,
				improvement: 50,
				existing: { totalScore: 100 },
				candidate: { totalScore: 150 }
			});

			const ctx = makeCtx({ existingFiles: [existing] });
			const result = await stage.evaluate(ctx);
			expect(result.accepted).toBe(true);
			expect(ctx.computed.upgradeStatus).toBe('upgrade');
			expect(ctx.computed.existingScore).toBe(100);
		});

		it('rejects when isUpgrade returns false', async () => {
			const existing: ExistingFile = {
				id: 'f1',
				relativePath: '/movies/movie.2160p.mkv',
				sceneName: 'Movie.2024.2160p.Remux'
			};
			mockIsUpgrade.mockReturnValue({
				isUpgrade: false,
				improvement: -50,
				existing: { totalScore: 300 },
				candidate: { totalScore: 250 }
			});

			const ctx = makeCtx({ existingFiles: [existing] });
			const result = await stage.evaluate(ctx);
			expect(result.accepted).toBe(false);
			expect(ctx.computed.upgradeStatus).toBe('downgrade');
		});

		it('sets sidegrade when improvement is 0', async () => {
			const existing: ExistingFile = { id: 'f1', relativePath: '/movies/movie.mkv' };
			mockIsUpgrade.mockReturnValue({
				isUpgrade: true,
				improvement: 0,
				existing: { totalScore: 100 },
				candidate: { totalScore: 100 }
			});

			const ctx = makeCtx({ existingFiles: [existing] });
			const result = await stage.evaluate(ctx);
			expect(result.accepted).toBe(true);
			expect(ctx.computed.upgradeStatus).toBe('sidegrade');
		});
	});

	describe('evaluate - streaming rules', () => {
		it('rejects streaming-to-streaming upgrade', async () => {
			const existing: ExistingFile = { id: 'f1', relativePath: '/movies/movie.strm' };
			const ctx = makeCtx({
				release: { title: 'Movie.2024.1080p', protocol: 'streaming' },
				existingFiles: [existing]
			});
			const result = await stage.evaluate(ctx);
			expect(result.accepted).toBe(false);
			expect(result.reason).toContain('Cannot upgrade streaming with streaming');
		});

		it('accepts streamer profile replacing local with streaming', async () => {
			const existing: ExistingFile = { id: 'f1', relativePath: '/movies/movie.mkv' };
			const ctx = makeCtx({
				release: { title: 'Movie.2024.1080p', protocol: 'streaming' },
				existingFiles: [existing],
				profile: makeProfile({ id: 'streamer' })
			});
			const result = await stage.evaluate(ctx);
			expect(result.accepted).toBe(true);
			expect(ctx.computed.upgradeStatus).toBe('upgrade');
		});
	});

	describe('evaluate - multi-file (season/series)', () => {
		it('accepts when majority benefits', async () => {
			const files: ExistingFile[] = [
				{ id: 'f1', relativePath: '/show/s01e01.mkv' },
				{ id: 'f2', relativePath: '/show/s01e02.mkv' },
				{ id: 'f3', relativePath: '/show/s01e03.mkv' }
			];
			mockIsUpgrade
				.mockReturnValueOnce({
					isUpgrade: true,
					improvement: 50,
					existing: { totalScore: 100 },
					candidate: { totalScore: 150 }
				})
				.mockReturnValueOnce({
					isUpgrade: true,
					improvement: 30,
					existing: { totalScore: 100 },
					candidate: { totalScore: 130 }
				})
				.mockReturnValueOnce({
					isUpgrade: false,
					improvement: -10,
					existing: { totalScore: 100 },
					candidate: { totalScore: 90 }
				});

			const ctx = makeCtx({
				target: { type: 'season', seriesId: 's1', seasonNumber: 1, episodeIds: ['e1', 'e2', 'e3'] },
				existingFiles: files
			});
			const result = await stage.evaluate(ctx);
			expect(result.accepted).toBe(true);
			expect(ctx.computed.upgradeStatus).toBe('upgrade');
		});

		it('rejects when majority does not benefit', async () => {
			const files: ExistingFile[] = [
				{ id: 'f1', relativePath: '/show/s01e01.mkv' },
				{ id: 'f2', relativePath: '/show/s01e02.mkv' },
				{ id: 'f3', relativePath: '/show/s01e03.mkv' }
			];
			mockIsUpgrade
				.mockReturnValueOnce({
					isUpgrade: false,
					improvement: 0,
					existing: { totalScore: 100 },
					candidate: { totalScore: 100 }
				})
				.mockReturnValueOnce({
					isUpgrade: false,
					improvement: -10,
					existing: { totalScore: 100 },
					candidate: { totalScore: 90 }
				})
				.mockReturnValueOnce({
					isUpgrade: true,
					improvement: 5,
					existing: { totalScore: 100 },
					candidate: { totalScore: 105 }
				});

			const ctx = makeCtx({
				target: { type: 'season', seriesId: 's1', seasonNumber: 1, episodeIds: ['e1', 'e2', 'e3'] },
				existingFiles: files
			});
			const result = await stage.evaluate(ctx);
			expect(result.accepted).toBe(false);
			expect(ctx.computed.upgradeStatus).toBe('rejected');
		});
	});
});
