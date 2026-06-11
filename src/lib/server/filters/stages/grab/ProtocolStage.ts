import type { DecisionStage, StageResult } from '../../types.js';
import type { GrabDecisionContext } from './types.js';

export class ProtocolStage implements DecisionStage<GrabDecisionContext> {
	name = 'protocol';

	isEnabled(ctx: GrabDecisionContext): boolean {
		return !ctx.options.force;
	}

	async evaluate(ctx: GrabDecisionContext): Promise<StageResult> {
		if (ctx.computed.protocolRejected) {
			return {
				accepted: false,
				reason: ctx.computed.protocolRejectionReason ?? 'Protocol not allowed',
				details: { rejectionType: 'protocol_rejected' }
			};
		}

		return { accepted: true };
	}
}
