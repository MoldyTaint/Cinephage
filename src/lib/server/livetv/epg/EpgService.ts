/**
 * EPG Service
 *
 * Manages Electronic Program Guide (EPG) data for Live TV.
 * Fetches EPG from provider accounts (Stalker, XStream) and provides query methods.
 * Updated for multi-provider support.
 */

import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '$lib/server/db';
import {
	livetvAccounts,
	livetvChannels,
	epgPrograms,
	type EpgProgramRecord
} from '$lib/server/db/schema';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ module: 'EpgService' });
import { getProvider } from '../providers';
import type {
	EpgProgram,
	EpgProgramWithProgress,
	EpgSyncResult,
	ChannelNowNext,
	LiveTvAccount
} from '$lib/types/livetv';

const BATCH_SIZE = 1000;
const DEFAULT_RETENTION_HOURS = 48;
const DEFAULT_LOOKAHEAD_HOURS = 72;

export class EpgService {
	/**
	 * Update account EPG tracking columns after sync
	 */
	private async updateAccountEpgStatus(
		accountId: string,
		status: {
			success: boolean;
			programCount?: number;
			hasEpg?: boolean;
			error?: string;
		}
	): Promise<void> {
		const now = new Date().toISOString();

		await db
			.update(livetvAccounts)
			.set({
				lastEpgSyncAt: now,
				lastEpgSyncError: status.success ? null : (status.error ?? null),
				...(status.programCount !== undefined && { epgProgramCount: status.programCount }),
				...(status.hasEpg !== undefined && { hasEpg: status.hasEpg }),
				updatedAt: now
			})
			.where(eq(livetvAccounts.id, accountId));
	}

	/**
	 * Sync EPG data for a single account
	 */
	async syncAccount(accountId: string): Promise<EpgSyncResult> {
		const startTime = Date.now();

		// Get account from new unified table
		const account = await db
			.select()
			.from(livetvAccounts)
			.where(eq(livetvAccounts.id, accountId))
			.limit(1)
			.then((rows) => rows[0]);

		if (!account) {
			return {
				success: false,
				accountId,
				accountName: 'Unknown',
				providerType: 'stalker',
				programsAdded: 0,
				programsUpdated: 0,
				programsRemoved: 0,
				duration: Date.now() - startTime,
				error: 'Account not found'
			};
		}

		if (!account.enabled) {
			return {
				success: false,
				accountId,
				accountName: account.name,
				providerType: account.providerType,
				programsAdded: 0,
				programsUpdated: 0,
				programsRemoved: 0,
				duration: Date.now() - startTime,
				error: 'Account is disabled'
			};
		}

		// Get the appropriate provider
		const provider = getProvider(account.providerType);

		// Check if provider supports EPG
		if (!provider.hasEpgSupport()) {
			return {
				success: true,
				accountId,
				accountName: account.name,
				providerType: account.providerType,
				programsAdded: 0,
				programsUpdated: 0,
				programsRemoved: 0,
				duration: Date.now() - startTime
			};
		}

		try {
			logger.info('Starting EPG sync', {
				accountId,
				name: account.name,
				providerType: account.providerType
			});

			// Convert account record to LiveTvAccount type
			const liveTvAccount: LiveTvAccount = {
				id: account.id,
				name: account.name,
				providerType: account.providerType,
				enabled: account.enabled ?? true,
				stalkerConfig: account.stalkerConfig ?? undefined,
				xstreamConfig: account.xstreamConfig ?? undefined,
				m3uConfig: account.m3uConfig ?? undefined,
				playbackLimit: account.playbackLimit ?? null,
				channelCount: account.channelCount ?? null,
				categoryCount: account.categoryCount ?? null,
				expiresAt: account.expiresAt ?? null,
				serverTimezone: account.serverTimezone ?? null,
				lastTestedAt: account.lastTestedAt ?? null,
				lastTestSuccess: account.lastTestSuccess ?? null,
				lastTestError: account.lastTestError ?? null,
				lastSyncAt: account.lastSyncAt ?? null,
				lastSyncError: account.lastSyncError ?? null,
				syncStatus: account.syncStatus ?? 'never',
				lastEpgSyncAt: account.lastEpgSyncAt ?? null,
				lastEpgSyncError: account.lastEpgSyncError ?? null,
				epgProgramCount: account.epgProgramCount ?? 0,
				hasEpg: account.hasEpg ?? null,
				createdAt: account.createdAt ?? new Date().toISOString(),
				updatedAt: account.updatedAt ?? new Date().toISOString()
			};

			// Calculate time range
			const now = new Date();
			const endTime = new Date(now.getTime() + DEFAULT_LOOKAHEAD_HOURS * 60 * 60 * 1000);

			// Fetch EPG data from provider
			const epgPrograms = await provider.fetchEpg!(liveTvAccount, now, endTime);

			if (epgPrograms.length === 0) {
				logger.info('No EPG data returned from provider', {
					accountId,
					name: account.name,
					providerType: account.providerType
				});

				// Update account status - provider has no EPG data
				await this.updateAccountEpgStatus(accountId, {
					success: true,
					programCount: 0,
					hasEpg: false
				});

				return {
					success: true,
					accountId,
					accountName: account.name,
					providerType: account.providerType,
					programsAdded: 0,
					programsUpdated: 0,
					programsRemoved: 0,
					duration: Date.now() - startTime
				};
			}

			// Build a map of external channel IDs to our local channel IDs
			const channels = await db
				.select({ id: livetvChannels.id, externalId: livetvChannels.externalId })
				.from(livetvChannels)
				.where(eq(livetvChannels.accountId, accountId));

			const channelMap = new Map<string, string>();
			for (const ch of channels) {
				channelMap.set(ch.externalId, ch.id);
			}

			// Process and store EPG data
			const result = await this.storeEpgData(accountId, epgPrograms, channelMap);

			logger.info('EPG sync complete', {
				accountId,
				name: account.name,
				providerType: account.providerType,
				...result,
				duration: Date.now() - startTime
			});

			// Update account status - successful sync with EPG data
			const totalPrograms = result.programsAdded + result.programsUpdated;
			await this.updateAccountEpgStatus(accountId, {
				success: true,
				programCount: totalPrograms > 0 ? await this.getAccountProgramCount(accountId) : 0,
				hasEpg: true
			});

			return {
				success: true,
				accountId,
				accountName: account.name,
				providerType: account.providerType,
				...result,
				duration: Date.now() - startTime
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('EPG sync failed', {
				accountId,
				name: account.name,
				providerType: account.providerType,
				error: message
			});

			// Update account status - sync failed
			await this.updateAccountEpgStatus(accountId, {
				success: false,
				error: message
			});

			return {
				success: false,
				accountId,
				accountName: account.name,
				providerType: account.providerType,
				programsAdded: 0,
				programsUpdated: 0,
				programsRemoved: 0,
				duration: Date.now() - startTime,
				error: message
			};
		}
	}

	/**
	 * Sync EPG data for all enabled accounts that support EPG
	 */
	async syncAll(): Promise<EpgSyncResult[]> {
		const accounts = await db.select().from(livetvAccounts).where(eq(livetvAccounts.enabled, true));

		logger.info('Starting EPG sync for all accounts', {
			accountCount: accounts.length
		});

		const results: EpgSyncResult[] = [];

		for (const account of accounts) {
			const provider = getProvider(account.providerType);
			if (provider.hasEpgSupport()) {
				const result = await this.syncAccount(account.id);
				results.push(result);
			}
		}

		const totalAdded = results.reduce((sum, r) => sum + r.programsAdded, 0);
		const totalUpdated = results.reduce((sum, r) => sum + r.programsUpdated, 0);
		const successful = results.filter((r) => r.success).length;

		logger.info('EPG sync complete for all accounts', {
			accounts: accounts.length,
			successful,
			totalAdded,
			totalUpdated
		});

		return results;
	}

	/**
	 * Store EPG data in the database
	 */
	private async storeEpgData(
		accountId: string,
		epgProgramsData: EpgProgram[],
		channelMap: Map<string, string>
	): Promise<{ programsAdded: number; programsUpdated: number; programsRemoved: number }> {
		let programsAdded = 0;
		let programsUpdated = 0;
		const now = new Date().toISOString();

		// Collect all programs to upsert
		const allPrograms: {
			id: string;
			channelId: string;
			externalChannelId: string;
			accountId: string;
			providerType: string;
			title: string;
			description: string | null;
			category: string | null;
			director: string | null;
			actor: string | null;
			startTime: string;
			endTime: string;
			duration: number;
			hasArchive: boolean;
			cachedAt: string;
			updatedAt: string;
		}[] = [];

		for (const program of epgProgramsData) {
			const localChannelId = channelMap.get(program.externalChannelId);
			if (!localChannelId) {
				// Channel not in our database, skip
				continue;
			}

			allPrograms.push({
				id: randomUUID(),
				channelId: localChannelId,
				externalChannelId: program.externalChannelId,
				accountId,
				providerType: program.providerType,
				title: program.title,
				description: program.description,
				category: program.category,
				director: program.director,
				actor: program.actor,
				startTime: program.startTime,
				endTime: program.endTime,
				duration: program.duration,
				hasArchive: program.hasArchive,
				cachedAt: now,
				updatedAt: now
			});
		}

		// Upsert programs in batches
		for (let i = 0; i < allPrograms.length; i += BATCH_SIZE) {
			const batch = allPrograms.slice(i, i + BATCH_SIZE);

			// Use INSERT OR REPLACE for upsert behavior
			for (const program of batch) {
				// Check if program exists (by unique constraint: account_id, external_channel_id, start_time)
				const existing = await db
					.select({ id: epgPrograms.id })
					.from(epgPrograms)
					.where(
						and(
							eq(epgPrograms.accountId, program.accountId),
							eq(epgPrograms.externalChannelId, program.externalChannelId),
							eq(epgPrograms.startTime, program.startTime)
						)
					)
					.limit(1)
					.then((rows) => rows[0]);

				if (existing) {
					// Update existing
					await db
						.update(epgPrograms)
						.set({
							title: program.title,
							description: program.description,
							category: program.category,
							director: program.director,
							actor: program.actor,
							endTime: program.endTime,
							duration: program.duration,
							hasArchive: program.hasArchive,
							updatedAt: now
						})
						.where(eq(epgPrograms.id, existing.id));
					programsUpdated++;
				} else {
					// Insert new
					await db.insert(epgPrograms).values({
						...program,
						providerType: program.providerType as 'stalker' | 'xstream' | 'm3u' | 'iptvorg'
					});
					programsAdded++;
				}
			}
		}

		// Remove old programs (past retention period)
		const cutoffTime = new Date(
			Date.now() - DEFAULT_RETENTION_HOURS * 60 * 60 * 1000
		).toISOString();
		const deleted = await db
			.delete(epgPrograms)
			.where(and(eq(epgPrograms.accountId, accountId), lte(epgPrograms.endTime, cutoffTime)));

		return {
			programsAdded,
			programsUpdated,
			programsRemoved: deleted.changes ?? 0
		};
	}

	/**
	 * Get current and next program for multiple channels
	 * @param channelIds - Array of local channel IDs (from channel_lineup_items.channel_id)
	 */
	getNowAndNext(channelIds: string[]): Map<string, ChannelNowNext> {
		if (channelIds.length === 0) {
			return new Map();
		}

		const now = new Date();
		const nowIso = now.toISOString();

		const result = new Map<string, ChannelNowNext>();

		// Initialize results
		for (const channelId of channelIds) {
			result.set(channelId, {
				channelId,
				now: null,
				next: null
			});
		}

		// Get all programs that could be current or next
		// (starts before now+2h and ends after now)
		const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

		const programs = db
			.select()
			.from(epgPrograms)
			.where(
				and(
					inArray(epgPrograms.channelId, channelIds),
					lte(epgPrograms.startTime, twoHoursLater),
					gte(epgPrograms.endTime, nowIso)
				)
			)
			.orderBy(epgPrograms.startTime)
			.all();

		// Group by channel
		const byChannel = new Map<string, EpgProgramRecord[]>();
		for (const program of programs) {
			const existing = byChannel.get(program.channelId) || [];
			existing.push(program);
			byChannel.set(program.channelId, existing);
		}

		// Find current and next for each channel
		for (const [channelId, channelPrograms] of byChannel) {
			const entry = result.get(channelId);
			if (!entry) continue;

			for (const program of channelPrograms) {
				const startTime = new Date(program.startTime);
				const endTime = new Date(program.endTime);

				// Check if current (now is between start and end)
				if (startTime <= now && endTime > now) {
					entry.now = this.programToWithProgress(program, now);
				}
				// Check if next (starts after now and we don't have a next yet)
				else if (startTime > now && !entry.next) {
					entry.next = this.programRecordToEpgProgram(program);
				}

				// If we have both, stop
				if (entry.now && entry.next) break;
			}
		}

		return result;
	}

	/**
	 * Get programs for a time range (for guide view)
	 * @param channelIds - Array of local channel IDs
	 * @param start - Start time
	 * @param end - End time
	 */
	getGuideData(channelIds: string[], start: Date, end: Date): Map<string, EpgProgram[]> {
		if (channelIds.length === 0) {
			return new Map();
		}

		const startIso = start.toISOString();
		const endIso = end.toISOString();

		const programs = db
			.select()
			.from(epgPrograms)
			.where(
				and(
					inArray(epgPrograms.channelId, channelIds),
					// Program overlaps with time range if:
					// - starts before end AND ends after start
					lte(epgPrograms.startTime, endIso),
					gte(epgPrograms.endTime, startIso)
				)
			)
			.orderBy(epgPrograms.startTime)
			.all();

		// Group by channel
		const result = new Map<string, EpgProgram[]>();

		for (const program of programs) {
			const existing = result.get(program.channelId) || [];
			existing.push(this.programRecordToEpgProgram(program));
			result.set(program.channelId, existing);
		}

		return result;
	}

	/**
	 * Get programs for a single channel
	 */
	getChannelPrograms(channelId: string, start: Date, end: Date): EpgProgram[] {
		const startIso = start.toISOString();
		const endIso = end.toISOString();

		const programs = db
			.select()
			.from(epgPrograms)
			.where(
				and(
					eq(epgPrograms.channelId, channelId),
					lte(epgPrograms.startTime, endIso),
					gte(epgPrograms.endTime, startIso)
				)
			)
			.orderBy(epgPrograms.startTime)
			.all();

		return programs.map((p) => this.programRecordToEpgProgram(p));
	}

	/**
	 * Cleanup old EPG programs
	 * @param retentionHours - Number of hours to keep past programs
	 * @returns Number of deleted programs
	 */
	cleanup(retentionHours: number = DEFAULT_RETENTION_HOURS): number {
		const cutoffTime = new Date(Date.now() - retentionHours * 60 * 60 * 1000).toISOString();

		const deleted = db.delete(epgPrograms).where(lte(epgPrograms.endTime, cutoffTime)).run();

		if (deleted.changes > 0) {
			logger.info('Cleaned up old EPG programs', {
				deleted: deleted.changes,
				cutoffTime
			});
		}

		return deleted.changes ?? 0;
	}

	/**
	 * Get total program count
	 */
	getProgramCount(): number {
		const result = db
			.select({ count: sql<number>`count(*)` })
			.from(epgPrograms)
			.get();
		return result?.count ?? 0;
	}

	/**
	 * Get program count by account
	 */
	getProgramCountByAccount(): Map<string, number> {
		const results = db
			.select({
				accountId: epgPrograms.accountId,
				count: sql<number>`count(*)`
			})
			.from(epgPrograms)
			.groupBy(epgPrograms.accountId)
			.all();

		const map = new Map<string, number>();
		for (const row of results) {
			map.set(row.accountId, row.count);
		}
		return map;
	}

	/**
	 * Get program count for a specific account
	 */
	private async getAccountProgramCount(accountId: string): Promise<number> {
		const result = await db
			.select({ count: sql<number>`count(*)` })
			.from(epgPrograms)
			.where(eq(epgPrograms.accountId, accountId))
			.then((rows) => rows[0]);
		return result?.count ?? 0;
	}

	/**
	 * Convert database record to EpgProgram type
	 */
	private programRecordToEpgProgram(record: EpgProgramRecord): EpgProgram {
		return {
			id: record.id,
			channelId: record.channelId,
			externalChannelId: record.externalChannelId,
			accountId: record.accountId,
			providerType: record.providerType as 'stalker' | 'xstream' | 'm3u' | 'iptvorg',
			title: record.title,
			description: record.description,
			category: record.category,
			director: record.director,
			actor: record.actor,
			startTime: record.startTime,
			endTime: record.endTime,
			duration: record.duration,
			hasArchive: record.hasArchive ?? false,
			cachedAt: record.cachedAt ?? '',
			updatedAt: record.updatedAt ?? ''
		};
	}

	/**
	 * Convert database record to EpgProgramWithProgress
	 */
	private programToWithProgress(record: EpgProgramRecord, now: Date): EpgProgramWithProgress {
		const startTime = new Date(record.startTime);
		const endTime = new Date(record.endTime);

		const elapsed = now.getTime() - startTime.getTime();
		const total = endTime.getTime() - startTime.getTime();
		const progress = total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 0;
		const remainingMs = endTime.getTime() - now.getTime();
		const remainingMinutes = Math.max(0, Math.floor(remainingMs / 60000));

		return {
			...this.programRecordToEpgProgram(record),
			progress,
			isLive: true,
			remainingMinutes
		};
	}
}

// Singleton instance
let epgServiceInstance: EpgService | null = null;

export function getEpgService(): EpgService {
	if (!epgServiceInstance) {
		epgServiceInstance = new EpgService();
	}
	return epgServiceInstance;
}
