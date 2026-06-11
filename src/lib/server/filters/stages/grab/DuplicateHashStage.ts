import type { DecisionStage, StageResult } from '../../types.js';
import type { GrabDecisionContext } from './types.js';
import { db } from '$lib/server/db/index.js';
import { downloadQueue } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

export class DuplicateHashStage implements DecisionStage<GrabDecisionContext> {
	name = 'duplicateHash';

	isEnabled(ctx: GrabDecisionContext): boolean {
		return !ctx.options.force && !!ctx.release.infoHash;
	}

	async evaluate(ctx: GrabDecisionContext): Promise<StageResult> {
		const { infoHash } = ctx.release;
		if (!infoHash) return { accepted: true };

		const existing = await db
			.select({ id: downloadQueue.id })
			.from(downloadQueue)
			.where(eq(downloadQueue.infoHash, infoHash))
			.limit(1);

		if (existing.length > 0) {
			return {
				accepted: false,
				reason: `Duplicate hash already in download queue: ${infoHash}`,
				details: { rejectionType: 'duplicate_hash', infoHash }
			};
		}

		return { accepted: true };
	}
}
