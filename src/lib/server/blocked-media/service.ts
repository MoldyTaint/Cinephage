import { db } from '$lib/server/db/index.js';
import { blockedMedia, movies, series } from '$lib/server/db/schema.js';
import { eq, and, count, desc, sql } from 'drizzle-orm';
import { createChildLogger } from '$lib/logging';
import { randomUUID } from 'node:crypto';
import { invalidateBlockedCache } from '$lib/server/library/status.js';

const logger = createChildLogger({ logDomain: 'system' as const });

export interface BlockedMediaEntry {
	id: string;
	tmdbId: number;
	mediaType: string;
	title: string;
	posterPath: string | null;
	year: number | null;
	reason: string | null;
	createdAt: string | null;
}

export interface BlockMediaParams {
	tmdbId: number;
	mediaType: 'movie' | 'tv';
	title: string;
	posterPath?: string | null;
	year?: number | null;
	reason?: string;
}

class BlockedMediaService {
	private static instance: BlockedMediaService;

	static getInstance(): BlockedMediaService {
		if (!BlockedMediaService.instance) {
			BlockedMediaService.instance = new BlockedMediaService();
		}
		return BlockedMediaService.instance;
	}

	async blockMedia(params: BlockMediaParams): Promise<BlockedMediaEntry> {
		const { tmdbId, mediaType, title, posterPath, year, reason } = params;

		const existing = await this.findByTmdbId(tmdbId, mediaType);
		if (existing) {
			return existing;
		}

		await this.removeFromLibrary(tmdbId, mediaType);

		const [entry] = await db
			.insert(blockedMedia)
			.values({
				id: randomUUID(),
				tmdbId,
				mediaType,
				title,
				posterPath: posterPath ?? null,
				year: year ?? null,
				reason: reason ?? null
			})
			.returning();

		logger.info({ tmdbId, mediaType, title }, 'Media blocked');

		invalidateBlockedCache();

		return entry as BlockedMediaEntry;
	}

	async unblockMedia(ids: string[]): Promise<void> {
		if (ids.length === 0) return;

		for (const id of ids) {
			await db.delete(blockedMedia).where(eq(blockedMedia.id, id));
		}

		logger.info({ count: ids.length }, 'Media unblocked');

		invalidateBlockedCache();
	}

	async isBlocked(tmdbId: number, mediaType: 'movie' | 'tv' | 'all' = 'all'): Promise<boolean> {
		const conditions = [eq(blockedMedia.tmdbId, tmdbId)];
		if (mediaType !== 'all') {
			conditions.push(eq(blockedMedia.mediaType, mediaType));
		}

		const result = await db
			.select({ count: count() })
			.from(blockedMedia)
			.where(and(...conditions));

		return (result[0]?.count ?? 0) > 0;
	}

	async getBlockedTmdbIds(mediaType: 'movie' | 'tv' | 'all' = 'all'): Promise<Set<number>> {
		const conditions = mediaType !== 'all' ? [eq(blockedMedia.mediaType, mediaType)] : [];

		const rows = await db
			.select({ tmdbId: blockedMedia.tmdbId })
			.from(blockedMedia)
			.where(conditions.length > 0 ? and(...conditions) : undefined);

		return new Set(rows.map((r) => r.tmdbId));
	}

	async getBlockedMedia(options?: {
		search?: string;
		mediaType?: string;
		limit?: number;
		offset?: number;
	}): Promise<{ entries: BlockedMediaEntry[]; total: number }> {
		const conditions = [];

		if (options?.mediaType && options.mediaType !== 'all') {
			conditions.push(eq(blockedMedia.mediaType, options.mediaType));
		}

		if (options?.search) {
			conditions.push(sql`${blockedMedia.title} LIKE ${'%' + options.search + '%'}`);
		}

		const where = conditions.length > 0 ? and(...conditions) : undefined;

		const limit = options?.limit ?? 100;
		const offset = options?.offset ?? 0;

		const [entries, totalResult] = await Promise.all([
			db
				.select()
				.from(blockedMedia)
				.where(where)
				.orderBy(desc(blockedMedia.createdAt))
				.limit(limit)
				.offset(offset),
			db.select({ count: count() }).from(blockedMedia).where(where)
		]);

		return {
			entries: entries as BlockedMediaEntry[],
			total: totalResult[0]?.count ?? 0
		};
	}

	async findByTmdbId(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<BlockedMediaEntry | null> {
		const rows = await db
			.select()
			.from(blockedMedia)
			.where(and(eq(blockedMedia.tmdbId, tmdbId), eq(blockedMedia.mediaType, mediaType)));

		return (rows[0] as BlockedMediaEntry) ?? null;
	}

	private async removeFromLibrary(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<void> {
		if (mediaType === 'movie') {
			await db.delete(movies).where(eq(movies.tmdbId, tmdbId));
		} else {
			await db.delete(series).where(eq(series.tmdbId, tmdbId));
		}
	}
}

export const blockedMediaService = BlockedMediaService.getInstance();
