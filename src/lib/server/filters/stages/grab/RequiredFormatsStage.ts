import type { DecisionStage, StageResult } from '../../types.js';
import type { GrabDecisionContext } from './types.js';
import { getFormat } from '$lib/server/scoring/formats/index.js';

export class RequiredFormatsStage implements DecisionStage<GrabDecisionContext> {
	name = 'requiredFormats';

	isEnabled(ctx: GrabDecisionContext): boolean {
		return !ctx.options.force && (ctx.profile.requiredFormats?.length ?? 0) > 0;
	}

	async evaluate(ctx: GrabDecisionContext): Promise<StageResult> {
		const required = ctx.profile.requiredFormats ?? [];
		if (required.length === 0) return { accepted: true };

		const matched = new Set(
			(ctx.computed.scoringResult?.matchedFormats ?? []).map((f) => f.format.id)
		);

		const missing = required.filter((id) => !matched.has(id));

		if (missing.length > 0) {
			const names = missing.map((id) => getFormat(id)?.name ?? id).join(', ');
			return {
				accepted: false,
				reason: `Missing required format${missing.length > 1 ? 's' : ''}: ${names}`,
				details: { rejectionType: 'missing_required_format', missingFormats: missing }
			};
		}

		return { accepted: true };
	}
}
