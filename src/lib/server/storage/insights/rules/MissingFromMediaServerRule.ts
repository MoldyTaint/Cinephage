import { count, eq } from 'drizzle-orm';
import { mediaBrowserServers, storageItems } from '$lib/server/db/schema';
import type { StorageInsightRule, RuleContext, InsightFinding } from '../types.js';

/**
 * Items in storage_items with sourceSystem='local' — present in Cinephage's
 * library but not tracked by any media server. Suppressed when zero media
 * servers are configured (can't be "missing" from a server the user doesn't have).
 */
export class MissingFromMediaServerRule implements StorageInsightRule {
	readonly type = 'missing-from-media-server' as const;

	async evaluate(ctx: RuleContext): Promise<InsightFinding[]> {
		const serverCount =
			ctx.db
				.select({ count: count() })
				.from(mediaBrowserServers)
				.where(eq(mediaBrowserServers.enabled, true))
				.get()?.count ?? 0;

		if (serverCount === 0) return [];

		const localOnlyCount =
			ctx.db
				.select({ count: count() })
				.from(storageItems)
				.where(eq(storageItems.sourceSystem, 'local'))
				.get()?.count ?? 0;

		if (localOnlyCount === 0) return [];

		return [
			{
				type: this.type,
				severity: 'info',
				scope: 'global',
				title: `Items missing from your media server`,
				summary: `${localOnlyCount} item${localOnlyCount === 1 ? ' is' : 's are'} in your Cinephage library but not tracked by any media server. Sync your media server library to fix.`,
				itemCount: localOnlyCount
			}
		];
	}
}
