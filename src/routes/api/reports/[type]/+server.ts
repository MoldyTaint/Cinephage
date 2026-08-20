import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import {
	rejectedReleases,
	importFailures,
	renamingFailures,
	unmatchedFiles,
	metadataConflicts
} from '$lib/server/db/schema.js';
import { count, desc, asc, eq, and, or, like, gt, inArray } from 'drizzle-orm';
import { logger } from '$lib/logging';

const VALID_TYPES = [
	'rejected-releases',
	'import-failures',
	'renaming-failures',
	'unmatched-imports',
	'metadata-conflicts'
] as const;

type ReportType = (typeof VALID_TYPES)[number];

/**
 * GET /api/reports/[type]
 * List diagnostic report records for a given type with pagination.
 *
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 25, max: 100)
 * - status: filter by status string
 * - order: 'asc' | 'desc' (default: 'desc')
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const type = params.type as ReportType;

	if (!VALID_TYPES.includes(type)) {
		return json({ success: false, error: `Unknown report type: ${type}` }, { status: 400 });
	}

	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
	const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '25', 10)));
	const offset = (page - 1) * limit;
	const statusFilter = url.searchParams.get('status');
	const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc';

	try {
		let records: unknown[];
		let total: number;

		switch (type) {
			case 'rejected-releases': {
				const q = db.select().from(rejectedReleases);
				const cq = db.select({ count: count() }).from(rejectedReleases);
				if (statusFilter) {
					q.where(eq(rejectedReleases.status, statusFilter));
					cq.where(eq(rejectedReleases.status, statusFilter));
				}
				const [rows, [cnt]] = await Promise.all([
					q
						.orderBy(
							order === 'desc'
								? desc(rejectedReleases.rejectedAt)
								: asc(rejectedReleases.rejectedAt)
						)
						.limit(limit)
						.offset(offset),
					cq
				]);
				records = rows;
				total = cnt.count;
				break;
			}

			case 'import-failures': {
				const q = db.select().from(importFailures);
				const cq = db.select({ count: count() }).from(importFailures);
				if (statusFilter) {
					q.where(eq(importFailures.status, statusFilter));
					cq.where(eq(importFailures.status, statusFilter));
				}
				const [rows, [cnt]] = await Promise.all([
					q
						.orderBy(
							order === 'desc' ? desc(importFailures.failedAt) : asc(importFailures.failedAt)
						)
						.limit(limit)
						.offset(offset),
					cq
				]);
				records = rows;
				total = cnt.count;
				break;
			}

			case 'renaming-failures': {
				const q = db.select().from(renamingFailures);
				const cq = db.select({ count: count() }).from(renamingFailures);
				if (statusFilter) {
					q.where(eq(renamingFailures.status, statusFilter));
					cq.where(eq(renamingFailures.status, statusFilter));
				}
				const [rows, [cnt]] = await Promise.all([
					q
						.orderBy(
							order === 'desc' ? desc(renamingFailures.failedAt) : asc(renamingFailures.failedAt)
						)
						.limit(limit)
						.offset(offset),
					cq
				]);
				records = rows;
				total = cnt.count;
				break;
			}

			case 'unmatched-imports': {
				const reasonParam = url.searchParams.get('reason');
				const reasonGroupParam = url.searchParams.get('reasonGroup');
				const searchParam = url.searchParams.get('search');
				const sinceParam = url.searchParams.get('since');
				const mediaTypeParam = url.searchParams.get('mediaType');

				const conditions = [];
				if (reasonGroupParam === 'below_threshold') {
					conditions.push(
						inArray(unmatchedFiles.reason, ['low_confidence', 'multiple_matches', 'ambiguous'])
					);
				} else if (reasonParam) {
					conditions.push(eq(unmatchedFiles.reason, reasonParam));
				}
				if (mediaTypeParam) conditions.push(eq(unmatchedFiles.mediaType, mediaTypeParam));
				if (searchParam && searchParam.trim()) {
					const term = `%${searchParam.trim()}%`;
					conditions.push(
						or(like(unmatchedFiles.path, term), like(unmatchedFiles.parsedTitle, term))
					);
				}
				if (sinceParam) {
					const ms =
						sinceParam === '24h'
							? 86_400_000
							: sinceParam === '7d'
								? 604_800_000
								: sinceParam === '30d'
									? 2_592_000_000
									: null;
					if (ms) {
						conditions.push(
							gt(unmatchedFiles.discoveredAt, new Date(Date.now() - ms).toISOString())
						);
					}
				}

				const where = conditions.length > 0 ? and(...conditions) : undefined;
				const q = db.select().from(unmatchedFiles);
				const cq = db.select({ count: count() }).from(unmatchedFiles);
				if (where) {
					q.where(where);
					cq.where(where);
				}
				const [rows, [cnt]] = await Promise.all([
					q
						.orderBy(
							order === 'desc'
								? desc(unmatchedFiles.discoveredAt)
								: asc(unmatchedFiles.discoveredAt)
						)
						.limit(limit)
						.offset(offset),
					cq
				]);
				records = rows;
				total = cnt.count;
				break;
			}

			case 'metadata-conflicts': {
				const q = db.select().from(metadataConflicts);
				const cq = db.select({ count: count() }).from(metadataConflicts);
				if (statusFilter) {
					q.where(eq(metadataConflicts.status, statusFilter));
					cq.where(eq(metadataConflicts.status, statusFilter));
				}
				const [rows, [cnt]] = await Promise.all([
					q
						.orderBy(
							order === 'desc'
								? desc(metadataConflicts.detectedAt)
								: asc(metadataConflicts.detectedAt)
						)
						.limit(limit)
						.offset(offset),
					cq
				]);
				records = rows;
				total = cnt.count;
				break;
			}
		}

		return json({
			success: true,
			data: {
				records,
				pagination: {
					page,
					limit,
					total,
					totalPages: Math.ceil(total / limit)
				}
			}
		});
	} catch (err) {
		logger.error({ err, type }, '[Reports] Failed to load report records');
		return json({ success: false, error: 'Failed to load report records' }, { status: 500 });
	}
};

/**
 * PATCH /api/reports/[type]
 * Bulk-update record status. Body: { ids: string[], status: string }
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const type = params.type as ReportType;

	if (!VALID_TYPES.includes(type)) {
		return json({ success: false, error: `Unknown report type: ${type}` }, { status: 400 });
	}

	let body: { ids: string[]; status: string };
	try {
		body = await request.json();
	} catch {
		return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
	}

	if (!Array.isArray(body.ids) || body.ids.length === 0 || !body.status) {
		return json(
			{ success: false, error: 'ids (array) and status (string) are required' },
			{ status: 400 }
		);
	}

	const resolvedAt = new Date().toISOString();

	try {
		// SQLite doesn't support inArray with drizzle update easily, so we iterate
		// For small batches (UI use) this is fine; a proper bulk update can be added later
		switch (type) {
			case 'rejected-releases':
				for (const id of body.ids) {
					await db
						.update(rejectedReleases)
						.set({ status: body.status })
						.where(eq(rejectedReleases.id, id));
				}
				break;
			case 'import-failures':
				for (const id of body.ids) {
					await db
						.update(importFailures)
						.set({
							status: body.status,
							resolvedAt: body.status === 'resolved' ? resolvedAt : null
						})
						.where(eq(importFailures.id, id));
				}
				break;
			case 'renaming-failures':
				for (const id of body.ids) {
					await db
						.update(renamingFailures)
						.set({
							status: body.status,
							resolvedAt: body.status === 'resolved' ? resolvedAt : null
						})
						.where(eq(renamingFailures.id, id));
				}
				break;
			case 'metadata-conflicts':
				for (const id of body.ids) {
					await db
						.update(metadataConflicts)
						.set({
							status: body.status,
							resolvedAt: body.status === 'resolved' ? resolvedAt : null
						})
						.where(eq(metadataConflicts.id, id));
				}
				break;
			case 'unmatched-imports':
				return json(
					{ success: false, error: 'Unmatched imports are managed via the library page' },
					{ status: 400 }
				);
		}

		return json({ success: true, data: { updated: body.ids.length } });
	} catch (err) {
		logger.error({ err, type }, '[Reports] Failed to update record status');
		return json({ success: false, error: 'Failed to update records' }, { status: 500 });
	}
};
