import type { DecisionStage, StageResult } from '../../types.js';
import type { GrabDecisionContext } from './types.js';

export class BannedFormatStage implements DecisionStage<GrabDecisionContext> {
	name = 'bannedFormat';

	isEnabled(ctx: GrabDecisionContext): boolean {
		return !ctx.options.force;
	}

	async evaluate(ctx: GrabDecisionContext): Promise<StageResult> {
		if (ctx.computed.isBanned) {
			const reasons = ctx.computed.bannedReasons?.join(', ') ?? 'unknown';
			return {
				accepted: false,
				reason: `Banned format: ${reasons}`,
				details: { rejectionType: 'banned', bannedReasons: ctx.computed.bannedReasons }
			};
		}

		return { accepted: true };
	}
}
