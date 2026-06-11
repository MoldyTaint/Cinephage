import type { DecisionStage, StageResult } from '../../types.js';
import type { GrabDecisionContext } from './types.js';

export class BlockedExtensionStage implements DecisionStage<GrabDecisionContext> {
	name = 'blockedExtension';

	isEnabled(ctx: GrabDecisionContext): boolean {
		return !ctx.options.force && ctx.release.protocol === 'torrent';
	}

	async evaluate(_ctx: GrabDecisionContext): Promise<StageResult> {
		return { accepted: true };
	}
}
