import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	mediaServerSyncedItems,
	mediaServerSyncedRuns,
	mediaBrowserServers,
	storageInsights
} from '$lib/server/db/schema';
import { desc, sql } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ parent }) => {
	await parent();

	const servers = await db.select().from(mediaBrowserServers);

	const playsResult = await db
		.select({ total: sql<number>`coalesce(sum(${mediaServerSyncedItems.playCount}), 0)` })
		.from(mediaServerSyncedItems);
	const totalPlays = playsResult[0]?.total ?? 0;

	const uniqueResult = await db
		.select({
			count: sql<number>`count(distinct coalesce(${mediaServerSyncedItems.tmdbId}, ${mediaServerSyncedItems.serverItemId}))`
		})
		.from(mediaServerSyncedItems);
	const uniqueItems = uniqueResult[0]?.count ?? 0;

	const syncedServersResult = await db
		.select({ serverId: mediaServerSyncedItems.serverId })
		.from(mediaServerSyncedItems)
		.groupBy(mediaServerSyncedItems.serverId);
	const serversSynced = syncedServersResult.length;

	const sizeResult = await db
		.select({ total: sql<number>`coalesce(sum(${mediaServerSyncedItems.fileSize}), 0)` })
		.from(mediaServerSyncedItems);
	const totalFileSize = sizeResult[0]?.total ?? 0;

	const codecRows = await db
		.select({
			codec: mediaServerSyncedItems.videoCodec,
			count: sql<number>`count(*)`
		})
		.from(mediaServerSyncedItems)
		.where(sql`${mediaServerSyncedItems.videoCodec} IS NOT NULL`)
		.groupBy(mediaServerSyncedItems.videoCodec)
		.orderBy(sql`count(*) desc`);

	const allItems = await db
		.select({
			height: mediaServerSyncedItems.height
		})
		.from(mediaServerSyncedItems)
		.where(sql`${mediaServerSyncedItems.height} IS NOT NULL`);

	const resolutionMap = new Map<string, number>();
	for (const item of allItems) {
		const h = item.height ?? 0;
		let label = 'SD';
		if (h >= 2160) label = '4K';
		else if (h >= 1080) label = '1080p';
		else if (h >= 720) label = '720p';
		else if (h >= 480) label = '480p';
		resolutionMap.set(label, (resolutionMap.get(label) ?? 0) + 1);
	}
	const resolutionBreakdown = Array.from(resolutionMap.entries())
		.map(([label, count]) => ({ label, count }))
		.sort((a, b) => b.count - a.count);

	const hdrRows = await db
		.select({
			isHDR: mediaServerSyncedItems.isHDR,
			hdrFormat: mediaServerSyncedItems.hdrFormat,
			count: sql<number>`count(*)`
		})
		.from(mediaServerSyncedItems)
		.groupBy(mediaServerSyncedItems.isHDR, mediaServerSyncedItems.hdrFormat);

	const hdrBreakdown: Array<{ label: string; count: number }> = [];
	let sdrCount = 0;
	for (const row of hdrRows) {
		if (!row.isHDR) {
			sdrCount += row.count;
		} else {
			hdrBreakdown.push({ label: row.hdrFormat ?? 'HDR', count: row.count });
		}
	}
	if (sdrCount > 0) hdrBreakdown.unshift({ label: 'SDR', count: sdrCount });
	hdrBreakdown.sort((a, b) => b.count - a.count);

	const audioCodecRows = await db
		.select({
			codec: mediaServerSyncedItems.audioCodec,
			count: sql<number>`count(*)`
		})
		.from(mediaServerSyncedItems)
		.where(sql`${mediaServerSyncedItems.audioCodec} IS NOT NULL`)
		.groupBy(mediaServerSyncedItems.audioCodec)
		.orderBy(sql`count(*) desc`);

	const containerRows = await db
		.select({
			container: mediaServerSyncedItems.containerFormat,
			count: sql<number>`count(*)`
		})
		.from(mediaServerSyncedItems)
		.where(sql`${mediaServerSyncedItems.containerFormat} IS NOT NULL`)
		.groupBy(mediaServerSyncedItems.containerFormat)
		.orderBy(sql`count(*) desc`);

	const serverStatuses = await Promise.all(
		servers.map(async (server) => {
			const itemCount = await db
				.select({ count: sql<number>`count(*)` })
				.from(mediaServerSyncedItems)
				.where(sql`${mediaServerSyncedItems.serverId} = ${server.id}`);
			const lastRun = await db
				.select()
				.from(mediaServerSyncedRuns)
				.where(sql`${mediaServerSyncedRuns.serverId} = ${server.id}`)
				.orderBy(desc(mediaServerSyncedRuns.startedAt))
				.limit(1);
			return {
				serverId: server.id,
				serverName: server.name,
				serverType: server.serverType,
				itemCount: itemCount[0]?.count ?? 0,
				lastSyncAt: lastRun[0]?.completedAt ?? null,
				lastSyncStatus: lastRun[0]?.status ?? null,
				enabled: server.enabled ?? false
			};
		})
	);

	const insights = db
		.select()
		.from(storageInsights)
		.where(sql`${storageInsights.dismissedAt} IS NULL`)
		.orderBy(
			sql`CASE ${storageInsights.severity}
				WHEN 'critical' THEN 0
				WHEN 'warning' THEN 1
				WHEN 'info' THEN 2
				ELSE 3
			END`,
			storageInsights.insightType
		)
		.all();

	const allInsights = db
		.select()
		.from(storageInsights)
		.orderBy(
			sql`CASE ${storageInsights.dismissedAt} IS NULL WHEN 0 THEN 0 ELSE 1 END`,
			sql`CASE ${storageInsights.severity}
				WHEN 'critical' THEN 0
				WHEN 'warning' THEN 1
				WHEN 'info' THEN 2
				ELSE 3
			END`,
			storageInsights.insightType
		)
		.all();

	const topItems = db
		.select({
			title: mediaServerSyncedItems.title,
			seriesName: mediaServerSyncedItems.seriesName,
			playCount: mediaServerSyncedItems.playCount,
			height: mediaServerSyncedItems.height,
			fileSize: mediaServerSyncedItems.fileSize,
			itemType: mediaServerSyncedItems.itemType
		})
		.from(mediaServerSyncedItems)
		.where(sql`${mediaServerSyncedItems.playCount} > 0`)
		.orderBy(desc(mediaServerSyncedItems.playCount))
		.limit(5)
		.all();

	const largestItems = db
		.select({
			title: mediaServerSyncedItems.title,
			seriesName: mediaServerSyncedItems.seriesName,
			fileSize: mediaServerSyncedItems.fileSize,
			height: mediaServerSyncedItems.height,
			videoCodec: mediaServerSyncedItems.videoCodec,
			itemType: mediaServerSyncedItems.itemType
		})
		.from(mediaServerSyncedItems)
		.where(sql`${mediaServerSyncedItems.fileSize} IS NOT NULL`)
		.orderBy(desc(mediaServerSyncedItems.fileSize))
		.limit(5)
		.all();

	return {
		mediaServerStats: {
			totalPlays,
			uniqueItems,
			serversSynced,
			totalFileSize,
			resolutionBreakdown,
			codecBreakdown: codecRows.map((r) => ({
				label: (r.codec ?? 'Unknown').toUpperCase(),
				count: r.count
			})),
			hdrBreakdown,
			audioCodecBreakdown: audioCodecRows.map((r) => ({
				label: (r.codec ?? 'Unknown').toUpperCase(),
				count: r.count
			})),
			containerBreakdown: containerRows.map((r) => ({
				label: (r.container ?? 'Unknown').toUpperCase(),
				count: r.count
			}))
		},
		serverStatuses,
		servers,
		insights,
		allInsights,
		topItems,
		largestItems
	};
};
