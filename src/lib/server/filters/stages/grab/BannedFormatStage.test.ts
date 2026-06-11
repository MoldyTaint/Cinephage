import { describe, expect, it } from 'vitest';
import { BannedFormatStage } from './BannedFormatStage.js';
import type { GrabDecisionContext } from './types.js';

function makeCtx(overrides: Partial<GrabDecisionContext> = {}): GrabDecisionContext {
	return {
		release: { title: 'Movie.2024.1080p' },
		target: { type: 'movie', movieId: 'movie-1' },
		existingFiles: [],
		profile: { id: 'balanced', formatScores: {} } as any,
		options: { force: false, skipBlocklist: false, allowSidegrade: false, isAutomatic: true },
		computed: {},
		...overrides
	};
}

const stage = new BannedFormatStage();

describe('BannedFormatStage', () => {
	describe('isEnabled', () => {
		it('returns true by default', () => {
			expect(stage.isEnabled(makeCtx())).toBe(true);
		});

		it('returns false when force is true', () => {
			const ctx = makeCtx({ options: { force: true, skipBlocklist: false, allowSidegrade: false, isAutomatic: true } });
			expect(stage.isEnabled(ctx)).toBe(false);
		});
	});

	describe('evaluate', () => {
		it('accepts when not banned', async () => {
			const ctx = makeCtx({ computed: { isBanned: false, bannedReasons: [] } });
			const result = await stage.evaluate(ctx);
			expect(result.accepted).toBe(true);
		});

		it('accepts when isBanned is undefined', async () => {
			const ctx = makeCtx({ computed: {} });
			const result = await stage.evaluate(ctx);
			expect(result.accepted).toBe(true);
		});

		it('rejects when banned', async () => {
			const ctx = makeCtx({ computed: { isBanned: true, bannedReasons: ['YIFY', 'Fake HDR'] } });
			const result = await stage.evaluate(ctx);
			expect(result.accepted).toBe(false);
			expect(result.reason).toBe('Banned format: YIFY, Fake HDR');
		});

		it('shows unknown when no reasons', async () => {
			const ctx = makeCtx({ computed: { isBanned: true, bannedReasons: [] } });
			const result = await stage.evaluate(ctx);
			expect(result.accepted).toBe(false);
			expect(result.reason).toContain('Banned format');
		});
	});
});
