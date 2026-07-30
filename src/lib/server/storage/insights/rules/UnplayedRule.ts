import { and, count, eq, sql } from 'drizzle-orm';
import {
	mediaBrowserServers,
	mediaServerSyncedItems,
	storageItemServerLinks,
	storageItems
} from '$lib/server/db/schema';
import type { StorageInsightRule, RuleContext, InsightFinding } from '../types.js';

const UNPLAYED_THRESHOLD_DAYS = 30;

/**
 * Items that have never been played across all linked media servers AND have
 * been in the library for >30 days. Suppressed when no media servers configured.
 *
 * An item is "unplayed" when EVERY linked media_server_synced_items row has
 * playCount=0 AND isPlayed=0. If any server has played it, it's not unplayed.
 */
export class UnplayedRule implements StorageInsightRule {
	readonly type = 'unplayed' as const;

	async evaluate(ctx: RuleContext): Promise<InsightFinding[]> {
		const serverCount =
			ctx.db
				.select({ count: count() })
				.from(mediaBrowserServers)
				.where(eq(mediaBrowserServers.enabled, true))
				.get()?.count ?? 0;
		if (serverCount === 0) return [];

		const thresholdDate = new Date(ctx.now);
		thresholdDate.setDate(thresholdDate.getDate() - UNPLAYED_THRESHOLD_DAYS);
		const thresholdIso = thresholdDate.toISOString();

		const unplayedItems = ctx.db
			.select({
				id: storageItems.id,
				title: storageItems.title,
				tmdbId: storageItems.tmdbId
			})
			.from(storageItems)
			.innerJoin(
				storageItemServerLinks,
				sql`${storageItemServerLinks.storageItemId} = ${storageItems.id}`
			)
			.innerJoin(
				mediaServerSyncedItems,
				sql`${storageItemServerLinks.syncedItemId} = ${mediaServerSyncedItems.id}`
			)
			.where(sql`${storageItems.firstSeenAt} < ${thresholdIso}`)
			.groupBy(storageItems.id)
			.having(
				and(
					sql`SUM(${mediaServerSyncedItems.playCount}) = 0`,
					sql`MAX(${mediaServerSyncedItems.isPlayed}) = 0`
				)
			)
			.all();

		if (unplayedItems.length === 0) return [];

		return [
			{
				type: this.type,
				severity: 'warning',
				scope: 'global',
				title: `Unplayed items`,
				summary: `${unplayedItems.length} item${unplayedItems.length === 1 ? ' has' : 's have'} been in your library for over ${UNPLAYED_THRESHOLD_DAYS} days without being played on any media server.`,
				details: {
					itemIds: unplayedItems.map((i) => i.id),
					thresholdDays: UNPLAYED_THRESHOLD_DAYS
				},
				itemCount: unplayedItems.length
			}
		];
	}
}
