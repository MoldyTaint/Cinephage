import type { DecisionStage, StageResult } from '../../types.js';
import type { GrabDecisionContext } from './types.js';

export class MinimumScoreStage implements DecisionStage<GrabDecisionContext> {
	name = 'minimumScore';

	isEnabled(ctx: GrabDecisionContext): boolean {
		return !ctx.options.force;
	}

	async evaluate(ctx: GrabDecisionContext): Promise<StageResult> {
		if (ctx.computed.meetsMinimum === false) {
			const score = ctx.computed.candidateScore ?? 0;
			const minScore = ctx.profile.minScore ?? 0;
			return {
				accepted: false,
				reason: `Score ${score} below minimum ${minScore}`,
				details: { rejectionType: 'below_minimum', score, minScore }
			};
		}

		return { accepted: true };
	}
}
