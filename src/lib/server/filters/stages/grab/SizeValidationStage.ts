import type { DecisionStage, StageResult } from '../../types.js';
import type { GrabDecisionContext } from './types.js';

export class SizeValidationStage implements DecisionStage<GrabDecisionContext> {
	name = 'sizeValidation';

	isEnabled(_ctx: GrabDecisionContext): boolean {
		return true;
	}

	async evaluate(ctx: GrabDecisionContext): Promise<StageResult> {
		if (ctx.computed.sizeRejected) {
			return {
				accepted: false,
				reason: ctx.computed.sizeRejectionReason ?? 'Size validation failed',
				details: { rejectionType: 'size_rejected' }
			};
		}

		return { accepted: true };
	}
}
