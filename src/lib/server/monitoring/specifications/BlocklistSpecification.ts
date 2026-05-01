/**
 * BlocklistSpecification
 *
 * Checks if a release has been blocklisted (failed downloads, manual blocks, etc.)
 * Prevents re-grabbing problematic releases.
 *
 * This specification is release-level - it's applied when evaluating individual
 * releases during search, not at the item level.
 */

import { db } from '$lib/server/db/index.js';
import { blocklist } from '$lib/server/db/schema.js';
import { eq, or, and, gt, isNull, lte, inArray, count } from 'drizzle-orm';
import { reject, accept } from './types.js';
import type { SpecificationResult, ReleaseCandidate } from './types.js';

/**
 * Blocklist reasons
 */
export type BlocklistReason =
	| 'download_failed'
	| 'import_failed'
	| 'quality_mismatch'
	| 'manual'
	| 'duplicate'
	| 'bad_release';

/**
 * BlocklistService
 *
 * Singleton service for managing release blocklist
 */
class BlocklistService {
	private static instance: BlocklistService;

	static getInstance(): BlocklistService {
		if (!BlocklistService.instance) {
			BlocklistService.instance = new BlocklistService();
		}
		return BlocklistService.instance;
	}

	/**
	 * Check if a release is blocklisted
	 * Supports indexer-specific blocking: a release blocked from one indexer
	 * can still be grabbed from a different indexer.
	 */
	async isBlocklisted(
		release: ReleaseCandidate,
		options: {
			movieId?: string;
			seriesId?: string;
		}
	): Promise<{ blocked: boolean; reason?: string }> {
		const now = new Date().toISOString();

		// Build query conditions
		const conditions = [];

		// Check by info hash (most reliable)
		if (release.infoHash) {
			conditions.push(eq(blocklist.infoHash, release.infoHash));
		}

		// Check by source title (fallback for matching)
		if (release.title) {
			conditions.push(eq(blocklist.sourceTitle, release.title));
		}

		// If no identifying info, can't be blocklisted
		if (conditions.length === 0) {
			return { blocked: false };
		}

		// Query with content filter and expiration check
		const entries = await db.query.blocklist.findMany({
			where: and(
				or(...conditions),
				// Must match content type
				options.movieId ? eq(blocklist.movieId, options.movieId) : undefined,
				options.seriesId ? eq(blocklist.seriesId, options.seriesId) : undefined,
				// Must not be expired
				or(isNull(blocklist.expiresAt), gt(blocklist.expiresAt, now)),
				// Indexer-specific blocking: only block if entry has no indexerId (global)
				// or if it matches the release's indexerId
				release.indexerId
					? or(isNull(blocklist.indexerId), eq(blocklist.indexerId, release.indexerId))
					: undefined
			),
			limit: 1
		});

		if (entries.length > 0) {
			const entry = entries[0];
			return {
				blocked: true,
				reason: `Blocklisted: ${entry.reason}${entry.message ? ` - ${entry.message}` : ''}`
			};
		}

		return { blocked: false };
	}

	/**
	 * Add a release to the blocklist
	 */
	async addToBlocklist(
		release: {
			title: string;
			infoHash?: string;
			indexerId?: string;
			quality?: ReleaseCandidate['quality'];
			size?: number;
			protocol?: string;
		},
		options: {
			movieId?: string;
			seriesId?: string;
			episodeIds?: string[];
			reason: BlocklistReason;
			message?: string;
			expiresInHours?: number;
		}
	): Promise<string> {
		const expiresAt = options.expiresInHours
			? new Date(Date.now() + options.expiresInHours * 60 * 60 * 1000).toISOString()
			: null;

		const dedupConditions = [eq(blocklist.title, release.title)];
		if (options.movieId) dedupConditions.push(eq(blocklist.movieId, options.movieId));
		if (options.seriesId) dedupConditions.push(eq(blocklist.seriesId, options.seriesId));
		if (release.infoHash) dedupConditions.push(eq(blocklist.infoHash, release.infoHash));
		else if (release.indexerId)
			dedupConditions.push(
				or(eq(blocklist.indexerId, release.indexerId), isNull(blocklist.indexerId))!
			);

		const entryId = await db.transaction(async (tx) => {
			await tx.delete(blocklist).where(and(...dedupConditions));

			const [entry] = await tx
				.insert(blocklist)
				.values({
					title: release.title,
					infoHash: release.infoHash ?? null,
					indexerId: release.indexerId ?? null,
					movieId: options.movieId ?? null,
					seriesId: options.seriesId ?? null,
					episodeIds: options.episodeIds ?? null,
					reason: options.reason,
					message: options.message ?? null,
					sourceTitle: release.title,
					quality: release.quality ?? null,
					size: release.size ?? null,
					protocol: release.protocol ?? null,
					expiresAt
				})
				.returning();

			return entry.id;
		});

		return entryId;
	}

	/**
	 * Remove a release from the blocklist
	 */
	async removeFromBlocklist(id: string): Promise<void> {
		await db.delete(blocklist).where(eq(blocklist.id, id));
	}

	/**
	 * Remove all blocklist entries for a movie
	 */
	async clearMovieBlocklist(movieId: string): Promise<void> {
		await db.delete(blocklist).where(eq(blocklist.movieId, movieId));
	}

	/**
	 * Remove all blocklist entries for a series
	 */
	async clearSeriesBlocklist(seriesId: string): Promise<void> {
		await db.delete(blocklist).where(eq(blocklist.seriesId, seriesId));
	}

	/**
	 * Get all blocklist entries
	 */
	async getBlocklist(options?: {
		movieId?: string;
		seriesId?: string;
		reason?: string;
		protocol?: string;
		activeOnly?: boolean;
		search?: string;
		limit?: number;
		offset?: number;
	}): Promise<(typeof blocklist.$inferSelect)[]> {
		const conditions = [];

		if (options?.movieId) conditions.push(eq(blocklist.movieId, options.movieId));
		if (options?.seriesId) conditions.push(eq(blocklist.seriesId, options.seriesId));
		if (options?.reason) conditions.push(eq(blocklist.reason, options.reason));
		if (options?.protocol) conditions.push(eq(blocklist.protocol, options.protocol));
		if (options?.activeOnly) {
			const now = new Date().toISOString();
			conditions.push(or(isNull(blocklist.expiresAt), gt(blocklist.expiresAt, now)));
		}

		return db.query.blocklist.findMany({
			where: conditions.length > 0 ? and(...conditions) : undefined,
			limit: options?.limit ?? 100,
			offset: options?.offset ?? 0,
			orderBy: (blocklist, { desc }) => [desc(blocklist.createdAt)]
		});
	}

	/**
	 * Clean expired entries
	 */
	async cleanExpiredEntries(): Promise<number> {
		const now = new Date().toISOString();
		// Delete expired entries - expiresAt is not null and is less than now
		await db.delete(blocklist).where(lte(blocklist.expiresAt, now));

		// SQLite doesn't return count directly, return 0 as placeholder
		return 0;
	}

	async getBlocklistCount(options?: {
		movieId?: string;
		seriesId?: string;
		reason?: string;
		protocol?: string;
		activeOnly?: boolean;
		search?: string;
	}): Promise<number> {
		const conditions = [];

		if (options?.movieId) conditions.push(eq(blocklist.movieId, options.movieId));
		if (options?.seriesId) conditions.push(eq(blocklist.seriesId, options.seriesId));
		if (options?.reason) conditions.push(eq(blocklist.reason, options.reason));
		if (options?.protocol) conditions.push(eq(blocklist.protocol, options.protocol));
		if (options?.activeOnly) {
			const now = new Date().toISOString();
			conditions.push(or(isNull(blocklist.expiresAt), gt(blocklist.expiresAt, now)));
		}

		const [result] = await db
			.select({ count: count() })
			.from(blocklist)
			.where(conditions.length > 0 ? and(...conditions) : undefined);

		return result.count;
	}

	async removeFromBlocklistByIds(ids: string[]): Promise<void> {
		if (ids.length === 0) return;
		await db.delete(blocklist).where(inArray(blocklist.id, ids));
	}
}

/**
 * Export singleton instance
 */
export const blocklistService = BlocklistService.getInstance();

/**
 * MovieBlocklistSpecification
 *
 * Checks if a release is blocklisted for a specific movie.
 * Used during release evaluation in the decision engine.
 */
export class ReleaseBlocklistSpecification {
	private movieId?: string;
	private seriesId?: string;

	constructor(options: { movieId?: string; seriesId?: string }) {
		this.movieId = options.movieId;
		this.seriesId = options.seriesId;
	}

	async isSatisfied(release: ReleaseCandidate): Promise<SpecificationResult> {
		const result = await blocklistService.isBlocklisted(release, {
			movieId: this.movieId,
			seriesId: this.seriesId
		});

		if (result.blocked) {
			return reject(result.reason || 'Release is blocklisted');
		}

		return accept();
	}
}
