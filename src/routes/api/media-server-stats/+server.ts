import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	mediaServerSyncedItems,
	mediaServerSyncedRuns,
	mediaBrowserServers
} from '$lib/server/db/schema';
import { sql, desc, eq, and, or, isNull } from 'drizzle-orm';
import type {
	StatsSummary,
	AggregatedMediaItem,
	ServerSyncStatus
} from '$lib/server/mediaServerStats/types.js';

/**
 * Matches the (tmdbId, tvdbId, title) identifying key aggregateItems() groups by.
 * Used to re-fetch full row detail for a small, already-ranked set of items
 * instead of loading the whole table.
 */
function matchesIdentifyingKey(key: {
	tmdbId: number | null;
	tvdbId: number | null;
	title: string;
}) {
	return and(
		key.tmdbId != null
			? eq(mediaServerSyncedItems.tmdbId, key.tmdbId)
			: isNull(mediaServerSyncedItems.tmdbId),
		key.tvdbId != null
			? eq(mediaServerSyncedItems.tvdbId, key.tvdbId)
			: isNull(mediaServerSyncedItems.tvdbId),
		eq(mediaServerSyncedItems.title, key.title)
	);
}

function aggregateItems(
	rows: (typeof mediaServerSyncedItems.$inferSelect)[]
): AggregatedMediaItem[] {
	const map = new Map<string, AggregatedMediaItem>();

	for (const row of rows) {
		const key = `${row.tmdbId ?? 'null'}-${row.tvdbId ?? 'null'}-${row.title}`;
		const existing = map.get(key);
		if (existing) {
			existing.totalPlayCount += row.playCount ?? 0;
			if (
				row.lastPlayedDate &&
				(!existing.lastPlayedDate || row.lastPlayedDate > existing.lastPlayedDate)
			) {
				existing.lastPlayedDate = row.lastPlayedDate;
			}
			if (row.serverId) {
				existing.serverBreakdown.push({
					serverId: row.serverId,
					serverName: '',
					serverType: 'jellyfin',
					playCount: row.playCount ?? 0,
					lastPlayedDate: row.lastPlayedDate ?? null,
					videoCodec: row.videoCodec ?? null,
					width: row.width ?? null,
					height: row.height ?? null,
					isHDR: (row.isHDR ?? 0) === 1,
					containerFormat: row.containerFormat ?? null
				});
			}
		} else {
			map.set(key, {
				tmdbId: row.tmdbId ?? null,
				tvdbId: row.tvdbId ?? null,
				imdbId: row.imdbId ?? null,
				title: row.title,
				year: row.year ?? null,
				itemType: row.itemType,
				totalPlayCount: row.playCount ?? 0,
				lastPlayedDate: row.lastPlayedDate ?? null,
				serverBreakdown: row.serverId
					? [
							{
								serverId: row.serverId,
								serverName: '',
								serverType: 'jellyfin',
								playCount: row.playCount ?? 0,
								lastPlayedDate: row.lastPlayedDate ?? null,
								videoCodec: row.videoCodec ?? null,
								width: row.width ?? null,
								height: row.height ?? null,
								isHDR: (row.isHDR ?? 0) === 1,
								containerFormat: row.containerFormat ?? null
							}
						]
					: []
			});
		}
	}

	return Array.from(map.values());
}

export const GET: RequestHandler = async () => {
	const resolutionBucket = sql`CASE
		WHEN ${mediaServerSyncedItems.height} >= 2160 THEN '4K'
		WHEN ${mediaServerSyncedItems.height} >= 1080 THEN '1080p'
		WHEN ${mediaServerSyncedItems.height} >= 720 THEN '720p'
		WHEN ${mediaServerSyncedItems.height} >= 480 THEN '480p'
		WHEN ${mediaServerSyncedItems.height} IS NULL THEN 'Unknown'
		ELSE 'SD'
	END`;

	const [
		totalPlaysRow,
		uniqueItemsRow,
		serversSyncedRow,
		totalFileSizeRow,
		resolutionRows,
		codecRows,
		hdrRows,
		audioCodecRows,
		containerRows,
		servers,
		itemCountsByServerRows,
		topPlayedKeys,
		largestRawRows
	] = await Promise.all([
		db
			.select({ total: sql<number>`coalesce(sum(${mediaServerSyncedItems.playCount}), 0)` })
			.from(mediaServerSyncedItems),
		db
			.select({
				count: sql<number>`count(distinct coalesce(${mediaServerSyncedItems.tmdbId}, ${mediaServerSyncedItems.serverItemId}))`
			})
			.from(mediaServerSyncedItems),
		db
			.select({
				count: sql<number>`count(distinct ${mediaServerSyncedItems.serverId})`
			})
			.from(mediaServerSyncedItems),
		db
			.select({ total: sql<number>`coalesce(sum(${mediaServerSyncedItems.fileSize}), 0)` })
			.from(mediaServerSyncedItems),
		db
			.select({ label: resolutionBucket.as('label'), count: sql<number>`count(*)` })
			.from(mediaServerSyncedItems)
			.groupBy(resolutionBucket),
		db
			.select({
				videoCodec: mediaServerSyncedItems.videoCodec,
				count: sql<number>`count(*)`
			})
			.from(mediaServerSyncedItems)
			.where(sql`${mediaServerSyncedItems.videoCodec} IS NOT NULL`)
			.groupBy(mediaServerSyncedItems.videoCodec)
			.orderBy(sql`count(*) desc`),
		db
			.select({
				isHDR: mediaServerSyncedItems.isHDR,
				hdrFormat: mediaServerSyncedItems.hdrFormat,
				count: sql<number>`count(*)`
			})
			.from(mediaServerSyncedItems)
			.groupBy(mediaServerSyncedItems.isHDR, mediaServerSyncedItems.hdrFormat)
			.orderBy(sql`count(*) desc`),
		db
			.select({
				audioCodec: mediaServerSyncedItems.audioCodec,
				count: sql<number>`count(*)`
			})
			.from(mediaServerSyncedItems)
			.where(sql`${mediaServerSyncedItems.audioCodec} IS NOT NULL`)
			.groupBy(mediaServerSyncedItems.audioCodec)
			.orderBy(sql`count(*) desc`),
		db
			.select({
				containerFormat: mediaServerSyncedItems.containerFormat,
				count: sql<number>`count(*)`
			})
			.from(mediaServerSyncedItems)
			.where(sql`${mediaServerSyncedItems.containerFormat} IS NOT NULL`)
			.groupBy(mediaServerSyncedItems.containerFormat)
			.orderBy(sql`count(*) desc`),
		db.select().from(mediaBrowserServers),
		db
			.select({ serverId: mediaServerSyncedItems.serverId, count: sql<number>`count(*)` })
			.from(mediaServerSyncedItems)
			.where(sql`${mediaServerSyncedItems.serverId} IS NOT NULL`)
			.groupBy(mediaServerSyncedItems.serverId),
		db
			.select({
				tmdbId: mediaServerSyncedItems.tmdbId,
				tvdbId: mediaServerSyncedItems.tvdbId,
				title: mediaServerSyncedItems.title
			})
			.from(mediaServerSyncedItems)
			.groupBy(
				mediaServerSyncedItems.tmdbId,
				mediaServerSyncedItems.tvdbId,
				mediaServerSyncedItems.title
			)
			.orderBy(sql`sum(${mediaServerSyncedItems.playCount}) desc`)
			.limit(25),
		db
			.select()
			.from(mediaServerSyncedItems)
			.where(sql`${mediaServerSyncedItems.fileSize} IS NOT NULL`)
			.orderBy(desc(mediaServerSyncedItems.fileSize))
			.limit(10)
	]);

	// Latest sync run per server - one small limited query per (bounded, small) server
	// list instead of loading the whole run-history table.
	const syncRuns = (
		await Promise.all(
			servers.map((server) =>
				db
					.select()
					.from(mediaServerSyncedRuns)
					.where(eq(mediaServerSyncedRuns.serverId, server.id))
					.orderBy(desc(mediaServerSyncedRuns.startedAt))
					.limit(1)
			)
		)
	).flat();

	// Fetch full row detail only for the items that actually made the top-25/top-10
	// lists above, so serverBreakdown can still be built without loading every row.
	const topPlayedRows =
		topPlayedKeys.length > 0
			? await db
					.select()
					.from(mediaServerSyncedItems)
					.where(or(...topPlayedKeys.map(matchesIdentifyingKey)))
			: [];

	const largestKeys = largestRawRows.map((item) => ({
		tmdbId: item.tmdbId,
		tvdbId: item.tvdbId,
		title: item.title
	}));
	const largestDetailRows =
		largestKeys.length > 0
			? await db
					.select()
					.from(mediaServerSyncedItems)
					.where(or(...largestKeys.map(matchesIdentifyingKey)))
			: [];

	const resolutionBreakdown = resolutionRows
		.map((r) => ({ label: r.label as string, count: r.count }))
		.sort((a, b) => b.count - a.count);

	const codecBreakdown = codecRows.map((r) => ({
		label: r.videoCodec ?? 'Unknown',
		count: r.count
	}));

	const hdrBreakdown = hdrRows.map((r) => {
		const isHdr = (r.isHDR ?? 0) === 1;
		return {
			label: isHdr ? (r.hdrFormat ?? 'HDR') : 'SDR',
			count: r.count
		};
	});

	const audioCodecBreakdown = audioCodecRows.map((r) => ({
		label: r.audioCodec ?? 'Unknown',
		count: r.count
	}));

	const containerBreakdown = containerRows.map((r) => ({
		label: r.containerFormat ?? 'Unknown',
		count: r.count
	}));

	const topPlayedItems = aggregateItems(topPlayedRows)
		.sort((a, b) => b.totalPlayCount - a.totalPlayCount)
		.slice(0, 25);

	const largestAggregated = aggregateItems(largestDetailRows);
	const largestItems = largestRawRows.map((item) => {
		const agg = largestAggregated.find(
			(a) => a.tmdbId === item.tmdbId && a.tvdbId === item.tvdbId && a.title === item.title
		);
		return (
			agg ?? {
				tmdbId: item.tmdbId ?? null,
				tvdbId: item.tvdbId ?? null,
				imdbId: item.imdbId ?? null,
				title: item.title,
				year: item.year ?? null,
				itemType: item.itemType,
				totalPlayCount: item.playCount ?? 0,
				lastPlayedDate: item.lastPlayedDate ?? null,
				serverBreakdown: []
			}
		);
	});

	const latestRunsMap = new Map<string, (typeof syncRuns)[0]>();
	for (const run of syncRuns) {
		latestRunsMap.set(run.serverId, run);
	}

	const itemCountsMap = new Map<string, number>(
		itemCountsByServerRows.map((r) => [r.serverId as string, r.count])
	);

	const serverStatuses: ServerSyncStatus[] = servers.map((server) => {
		const latestRun = latestRunsMap.get(server.id);
		return {
			serverId: server.id,
			serverName: server.name,
			serverType: server.serverType,
			itemCount: itemCountsMap.get(server.id) ?? 0,
			lastSyncAt: latestRun?.completedAt ?? latestRun?.startedAt ?? null,
			lastSyncStatus: latestRun?.status ?? null,
			enabled: server.enabled ?? true
		};
	});

	const summary: StatsSummary & { serverStatuses: ServerSyncStatus[] } = {
		totalPlays: totalPlaysRow[0]?.total ?? 0,
		uniqueItems: uniqueItemsRow[0]?.count ?? 0,
		serversSynced: serversSyncedRow[0]?.count ?? 0,
		totalFileSize: totalFileSizeRow[0]?.total ?? 0,
		resolutionBreakdown,
		codecBreakdown,
		hdrBreakdown,
		audioCodecBreakdown,
		containerBreakdown,
		topPlayedItems,
		largestItems,
		serverStatuses
	};

	return json(summary);
};
