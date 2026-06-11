import type {
	DecisionAudit,
	DecisionAuditEntry,
	DecisionStage,
	FilterStage,
	FilterStageRun,
	StageResult
} from './types.js';

export interface DecisionOptions {
	runAll?: boolean;
}

export async function composeDecisionStages<TContext>(
	stages: DecisionStage<TContext>[],
	ctx: TContext,
	options?: DecisionOptions
): Promise<DecisionAudit> {
	const entries: DecisionAuditEntry[] = [];
	const totalStart = performance.now();
	let finalResult: StageResult = { accepted: true };
	let rejected = false;

	for (const stage of stages) {
		if (!stage.isEnabled(ctx)) {
			entries.push({ name: stage.name, skipped: true, durationMs: 0 });
			continue;
		}

		if (rejected && !options?.runAll) {
			entries.push({ name: stage.name, skipped: true, durationMs: 0 });
			continue;
		}

		const start = performance.now();
		const result = await stage.evaluate(ctx);
		const durationMs = performance.now() - start;

		entries.push({ name: stage.name, skipped: false, result, durationMs });

		if (!result.accepted && !rejected) {
			rejected = true;
			finalResult = result;
		}
	}

	return {
		stages: entries,
		finalResult,
		totalDurationMs: performance.now() - totalStart
	};
}

export async function composeFilterStages<TItem, TContext>(
	stages: FilterStage<TItem, TContext>[],
	items: TItem[],
	ctx: TContext
): Promise<{ results: TItem[]; stages: FilterStageRun[] }> {
	const stageRuns: FilterStageRun[] = [];
	let current = items;

	for (const stage of stages) {
		if (!stage.isEnabled(ctx)) {
			stageRuns.push({
				stageName: stage.name,
				before: current.length,
				after: current.length,
				removed: 0,
				skipped: true
			});
			continue;
		}

		const before = current.length;
		current = await stage.apply(current, ctx);
		const after = current.length;

		stageRuns.push({
			stageName: stage.name,
			before,
			after,
			removed: before - after,
			skipped: false
		});
	}

	return { results: current, stages: stageRuns };
}
