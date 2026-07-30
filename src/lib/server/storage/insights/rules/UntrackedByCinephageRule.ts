import { count, and, eq, notInArray } from 'drizzle-orm';
import { storageItems } from '$lib/server/db/schema';
import type { StorageInsightRule, RuleContext, InsightFinding } from '../types.js';

/**
 * Items in storage_items with sourceSystem='server' — present on a media
 * server but Cinephage has no local file for them. Excludes series/season
 * item types because those are organizational containers in Jellyfin/Emby —
 * if Cinephage tracks the episodes, the series IS tracked, just at a
 * different granularity.
 */
export class UntrackedByCinephageRule implements StorageInsightRule {
	readonly type = 'untracked-by-cinephage' as const;

	async evaluate(ctx: RuleContext): Promise<InsightFinding[]> {
		const serverOnlyCount =
			ctx.db
				.select({ count: count() })
				.from(storageItems)
				.where(
					and(
						eq(storageItems.sourceSystem, 'server'),
						notInArray(storageItems.itemType, ['series', 'season'])
					)
				)
				.get()?.count ?? 0;

		if (serverOnlyCount === 0) return [];

		return [
			{
				type: this.type,
				severity: 'info',
				scope: 'global',
				title: `Items on media server not tracked by Cinephage`,
				summary: `${serverOnlyCount} item${serverOnlyCount === 1 ? ' is' : 's are'} on your media server${serverOnlyCount === 1 ? '' : 's'} but Cinephage has no local file for ${serverOnlyCount === 1 ? 'it' : 'them'}.`,
				itemCount: serverOnlyCount
			}
		];
	}
}
