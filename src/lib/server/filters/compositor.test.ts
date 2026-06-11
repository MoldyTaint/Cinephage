import { describe, expect, it } from 'vitest';
import { composeDecisionStages, composeFilterStages } from './compositor.js';
import type { DecisionStage, FilterStage, StageResult } from './types.js';

interface TestContext {
	enabled: boolean;
}

function makeDecisionStage(
	name: string,
	result: StageResult,
	enabled = true,
	delay = 0
): DecisionStage<TestContext> {
	return {
		name,
		isEnabled: (ctx) => ctx.enabled && enabled,
		evaluate: async () => {
			if (delay > 0) await new Promise((r) => setTimeout(r, delay));
			return result;
		}
	};
}

function makeFilterStage(
	name: string,
	filter: (items: number[]) => number[],
	enabled = true
): FilterStage<number, TestContext> {
	return {
		name,
		isEnabled: (ctx) => ctx.enabled && enabled,
		apply: async (items) => filter(items)
	};
}

describe('composeDecisionStages', () => {
	it('returns accepted when all stages pass', async () => {
		const stages = [
			makeDecisionStage('a', { accepted: true }),
			makeDecisionStage('b', { accepted: true }),
			makeDecisionStage('c', { accepted: true })
		];

		const audit = await composeDecisionStages(stages, { enabled: true });

		expect(audit.finalResult.accepted).toBe(true);
		expect(audit.stages).toHaveLength(3);
		expect(audit.stages.every((s) => !s.skipped)).toBe(true);
	});

	it('short-circuits on first rejection', async () => {
		const stages = [
			makeDecisionStage('a', { accepted: true }),
			makeDecisionStage('b', { accepted: false, reason: 'blocked' }),
			makeDecisionStage('c', { accepted: true })
		];

		const audit = await composeDecisionStages(stages, { enabled: true });

		expect(audit.finalResult.accepted).toBe(false);
		expect(audit.finalResult.reason).toBe('blocked');
		expect(audit.stages[0].skipped).toBe(false);
		expect(audit.stages[1].skipped).toBe(false);
		expect(audit.stages[2].skipped).toBe(true);
	});

	it('runs all stages when runAll is true', async () => {
		const stages = [
			makeDecisionStage('a', { accepted: false, reason: 'first rejection' }),
			makeDecisionStage('b', { accepted: true }),
			makeDecisionStage('c', { accepted: false, reason: 'second rejection' })
		];

		const audit = await composeDecisionStages(stages, { enabled: true }, { runAll: true });

		expect(audit.finalResult.accepted).toBe(false);
		expect(audit.finalResult.reason).toBe('first rejection');
		expect(audit.stages.every((s) => !s.skipped)).toBe(true);
		expect(audit.stages[0].result?.accepted).toBe(false);
		expect(audit.stages[1].result?.accepted).toBe(true);
		expect(audit.stages[2].result?.accepted).toBe(false);
	});

	it('skips disabled stages', async () => {
		const stages = [
			makeDecisionStage('a', { accepted: true }),
			makeDecisionStage('disabled', { accepted: false, reason: 'should not run' }, false),
			makeDecisionStage('c', { accepted: true })
		];

		const audit = await composeDecisionStages(stages, { enabled: true });

		expect(audit.finalResult.accepted).toBe(true);
		expect(audit.stages[1].skipped).toBe(true);
		expect(audit.stages[1].result).toBeUndefined();
	});

	it('tracks timing per stage', async () => {
		const stages = [makeDecisionStage('slow', { accepted: true }, true, 10)];

		const audit = await composeDecisionStages(stages, { enabled: true });

		expect(audit.stages[0].durationMs).toBeGreaterThanOrEqual(5);
		expect(audit.totalDurationMs).toBeGreaterThanOrEqual(5);
	});

	it('returns accepted for empty stages array', async () => {
		const audit = await composeDecisionStages([], { enabled: true });

		expect(audit.finalResult.accepted).toBe(true);
		expect(audit.stages).toHaveLength(0);
	});
});

describe('composeFilterStages', () => {
	it('applies stages sequentially', async () => {
		const stages = [
			makeFilterStage('evens', (items) => items.filter((n) => n % 2 === 0)),
			makeFilterStage('gt2', (items) => items.filter((n) => n > 2))
		];

		const result = await composeFilterStages(stages, [1, 2, 3, 4, 5, 6], { enabled: true });

		expect(result.results).toEqual([4, 6]);
		expect(result.stages).toHaveLength(2);
		expect(result.stages[0]).toEqual({
			stageName: 'evens',
			before: 6,
			after: 3,
			removed: 3,
			skipped: false
		});
		expect(result.stages[1]).toEqual({
			stageName: 'gt2',
			before: 3,
			after: 2,
			removed: 1,
			skipped: false
		});
	});

	it('skips disabled filter stages', async () => {
		const stages = [
			makeFilterStage('remove-all', () => [], false),
			makeFilterStage('identity', (items) => items)
		];

		const result = await composeFilterStages(stages, [1, 2, 3], { enabled: true });

		expect(result.results).toEqual([1, 2, 3]);
		expect(result.stages[0].skipped).toBe(true);
		expect(result.stages[0].removed).toBe(0);
		expect(result.stages[1].skipped).toBe(false);
	});

	it('returns empty results for empty input', async () => {
		const stages = [makeFilterStage('noop', (items) => items)];

		const result = await composeFilterStages(stages, [], { enabled: true });

		expect(result.results).toEqual([]);
		expect(result.stages[0].before).toBe(0);
		expect(result.stages[0].after).toBe(0);
	});

	it('handles no stages', async () => {
		const result = await composeFilterStages([], [1, 2, 3], { enabled: true });

		expect(result.results).toEqual([1, 2, 3]);
		expect(result.stages).toHaveLength(0);
	});
});
