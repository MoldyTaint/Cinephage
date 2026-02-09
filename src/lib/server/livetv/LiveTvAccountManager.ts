/**
 * Live TV Account Manager
 *
 * Manages Live TV accounts for all provider types (Stalker, XStream, M3U).
 * Provides CRUD operations, testing, and account management.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { livetvAccounts, type LivetvAccountRecord } from '$lib/server/db/schema';
import { createChildLogger } from '$lib/logging';
import { randomUUID } from 'crypto';
import { getProvider, getProviderForAccount } from './providers';
import type { BackgroundService, ServiceStatus } from '$lib/server/services/background-service.js';
import { ExternalServiceError } from '$lib/errors';
import type {
	LiveTvAccount,
	LiveTvAccountInput,
	LiveTvAccountUpdate,
	LiveTvAccountTestResult,
	LiveTvProviderType,
	StalkerConfig,
	XstreamConfig,
	M3uConfig,
	IptvOrgConfig
} from '$lib/types/livetv';

const logger = createChildLogger({ module: 'LiveTvAccountManager' });

/**
 * Generate a random serial number (like MAG devices use)
 */
function generateSerialNumber(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	let sn = '';
	for (let i = 0; i < 12; i++) {
		sn += chars[Math.floor(Math.random() * chars.length)];
	}
	return sn;
}

/**
 * Generate a random device ID (like MAG devices use)
 */
function generateDeviceId(): string {
	const chars = 'ABCDEF0123456789';
	let id = '';
	for (let i = 0; i < 32; i++) {
		id += chars[Math.floor(Math.random() * chars.length)];
	}
	return id;
}

/**
 * Convert database record to API response type
 */
function recordToAccount(record: LivetvAccountRecord): LiveTvAccount {
	return {
		id: record.id,
		name: record.name,
		providerType: record.providerType,
		enabled: record.enabled ?? true,
		// Provider configs
		stalkerConfig: record.stalkerConfig ?? undefined,
		xstreamConfig: record.xstreamConfig ?? undefined,
		m3uConfig: record.m3uConfig ?? undefined,
		iptvOrgConfig: record.iptvOrgConfig ?? undefined,
		// Metadata from provider
		playbackLimit: record.playbackLimit ?? null,
		channelCount: record.channelCount ?? null,
		categoryCount: record.categoryCount ?? null,
		expiresAt: record.expiresAt ?? null,
		serverTimezone: record.serverTimezone ?? null,
		// Health tracking
		lastTestedAt: record.lastTestedAt ?? null,
		lastTestSuccess: record.lastTestSuccess ?? null,
		lastTestError: record.lastTestError ?? null,
		// Sync tracking
		lastSyncAt: record.lastSyncAt ?? null,
		lastSyncError: record.lastSyncError ?? null,
		syncStatus: (record.syncStatus as LiveTvAccount['syncStatus']) ?? 'never',
		// EPG tracking
		lastEpgSyncAt: record.lastEpgSyncAt ?? null,
		lastEpgSyncError: record.lastEpgSyncError ?? null,
		epgProgramCount: record.epgProgramCount ?? 0,
		hasEpg: record.hasEpg ?? null,
		// Timestamps
		createdAt: record.createdAt ?? new Date().toISOString(),
		updatedAt: record.updatedAt ?? new Date().toISOString()
	};
}

export class LiveTvAccountManager implements BackgroundService {
	readonly name = 'LiveTvAccountManager';
	private _status: ServiceStatus = 'pending';
	private _error?: Error;

	get status(): ServiceStatus {
		return this._status;
	}

	get error(): Error | undefined {
		return this._error;
	}

	/**
	 * Start the service (non-blocking)
	 * Implements BackgroundService.start()
	 */
	start(): void {
		if (this._status === 'ready' || this._status === 'starting') {
			logger.debug('LiveTvAccountManager already running');
			return;
		}

		this._status = 'starting';
		logger.info('Starting LiveTvAccountManager');

		// Service initialization is synchronous for this manager
		setImmediate(() => {
			this._status = 'ready';
			logger.info('LiveTvAccountManager ready');
		});
	}

	/**
	 * Stop the service gracefully
	 * Implements BackgroundService.stop()
	 */
	async stop(): Promise<void> {
		if (this._status === 'pending') {
			return;
		}

		logger.info('Stopping LiveTvAccountManager');
		this._status = 'pending';
		logger.info('LiveTvAccountManager stopped');
	}

	/**
	 * Get all Live TV accounts
	 */
	async getAccounts(): Promise<LiveTvAccount[]> {
		const records = await db.select().from(livetvAccounts);
		return records.map(recordToAccount);
	}

	/**
	 * Get accounts by provider type
	 */
	async getAccountsByType(providerType: LiveTvProviderType): Promise<LiveTvAccount[]> {
		const records = await db
			.select()
			.from(livetvAccounts)
			.where(eq(livetvAccounts.providerType, providerType));
		return records.map(recordToAccount);
	}

	/**
	 * Get a Live TV account by ID
	 */
	async getAccount(id: string): Promise<LiveTvAccount | null> {
		const records = await db
			.select()
			.from(livetvAccounts)
			.where(eq(livetvAccounts.id, id))
			.limit(1);

		if (records.length === 0) {
			return null;
		}

		return recordToAccount(records[0]);
	}

	/**
	 * Create a new Live TV account
	 * Optionally tests the connection before saving
	 */
	async createAccount(
		input: LiveTvAccountInput,
		testFirst: boolean = true
	): Promise<LiveTvAccount> {
		const now = new Date().toISOString();

		// Build provider-specific config
		let stalkerConfig: StalkerConfig | undefined;
		let xstreamConfig: XstreamConfig | undefined;
		let m3uConfig: M3uConfig | undefined;
		let iptvOrgConfig: IptvOrgConfig | undefined;

		if (input.providerType === 'stalker' && input.stalkerConfig) {
			stalkerConfig = {
				portalUrl: input.stalkerConfig.portalUrl,
				macAddress: input.stalkerConfig.macAddress.toUpperCase(),
				serialNumber: input.stalkerConfig.serialNumber || generateSerialNumber(),
				deviceId: input.stalkerConfig.deviceId || generateDeviceId(),
				deviceId2: input.stalkerConfig.deviceId2 || generateDeviceId(),
				model: input.stalkerConfig.model || 'MAG254',
				timezone: input.stalkerConfig.timezone || 'Europe/London',
				username: input.stalkerConfig.username,
				password: input.stalkerConfig.password
			};
		} else if (input.providerType === 'xstream' && input.xstreamConfig) {
			xstreamConfig = {
				baseUrl: input.xstreamConfig.baseUrl.replace(/\/$/, ''),
				username: input.xstreamConfig.username,
				password: input.xstreamConfig.password
			};
		} else if (input.providerType === 'm3u' && input.m3uConfig) {
			m3uConfig = {
				url: input.m3uConfig.url,
				fileContent: input.m3uConfig.fileContent,
				refreshIntervalHours: input.m3uConfig.refreshIntervalHours || 24,
				autoRefresh: input.m3uConfig.autoRefresh ?? false
			};
		} else if (input.providerType === 'iptvorg' && input.iptvOrgConfig) {
			iptvOrgConfig = {
				countries: input.iptvOrgConfig.countries || [],
				categories: input.iptvOrgConfig.categories || [],
				languages: input.iptvOrgConfig.languages || [],
				autoSyncIntervalHours: input.iptvOrgConfig.autoSyncIntervalHours || 24
			};
		}

		// Test connection if requested
		let testResult: LiveTvAccountTestResult | null = null;
		if (testFirst) {
			const accountForTest: LiveTvAccount = {
				id: randomUUID(), // Temporary ID for testing
				name: input.name,
				providerType: input.providerType,
				enabled: input.enabled ?? true,
				stalkerConfig,
				xstreamConfig,
				m3uConfig,
				iptvOrgConfig,
				playbackLimit: null,
				channelCount: null,
				categoryCount: null,
				expiresAt: null,
				serverTimezone: null,
				lastTestedAt: null,
				lastTestSuccess: null,
				lastTestError: null,
				lastSyncAt: null,
				lastSyncError: null,
				syncStatus: 'never',
				lastEpgSyncAt: null,
				lastEpgSyncError: null,
				epgProgramCount: 0,
				hasEpg: null,
				createdAt: now,
				updatedAt: now
			};

			const provider = getProvider(input.providerType);
			testResult = await provider.testConnection(accountForTest);

			if (!testResult.success) {
				throw new ExternalServiceError(
					input.providerType,
					testResult.error || 'Connection test failed',
					502
				);
			}
		}

		// Prepare insert data
		const insertData: typeof livetvAccounts.$inferInsert = {
			id: randomUUID(),
			name: input.name,
			providerType: input.providerType,
			enabled: input.enabled ?? true,
			stalkerConfig,
			xstreamConfig,
			m3uConfig,
			iptvOrgConfig,
			createdAt: now,
			updatedAt: now
		};

		// Add test result metadata if available
		if (testResult?.success && testResult.profile) {
			insertData.playbackLimit = testResult.profile.playbackLimit;
			insertData.channelCount = testResult.profile.channelCount;
			insertData.categoryCount = testResult.profile.categoryCount;
			insertData.expiresAt = testResult.profile.expiresAt;
			insertData.serverTimezone = testResult.profile.serverTimezone;
			insertData.lastTestedAt = now;
			insertData.lastTestSuccess = true;
			insertData.lastTestError = null;
		}

		const [record] = await db.insert(livetvAccounts).values(insertData).returning();

		logger.info('Created account', {
			id: record.id,
			name: record.name,
			providerType: record.providerType
		});

		return recordToAccount(record);
	}

	/**
	 * Update an existing Live TV account
	 */
	async updateAccount(id: string, updates: LiveTvAccountUpdate): Promise<LiveTvAccount | null> {
		const existing = await this.getAccount(id);
		if (!existing) {
			return null;
		}

		const now = new Date().toISOString();
		const updateData: Partial<typeof livetvAccounts.$inferInsert> = {
			updatedAt: now
		};

		// Update name
		if (updates.name !== undefined) {
			updateData.name = updates.name;
		}

		// Update enabled status
		if (updates.enabled !== undefined) {
			updateData.enabled = updates.enabled;
		}

		// Update provider configs
		if (updates.stalkerConfig && existing.providerType === 'stalker') {
			updateData.stalkerConfig = {
				...existing.stalkerConfig,
				...updates.stalkerConfig
			} as StalkerConfig;
		}

		if (updates.xstreamConfig && existing.providerType === 'xstream') {
			updateData.xstreamConfig = {
				...existing.xstreamConfig,
				...updates.xstreamConfig
			} as XstreamConfig;
		}

		if (updates.m3uConfig && existing.providerType === 'm3u') {
			updateData.m3uConfig = {
				...existing.m3uConfig,
				...updates.m3uConfig
			} as M3uConfig;
		}

		if (updates.iptvOrgConfig && existing.providerType === 'iptvorg') {
			updateData.iptvOrgConfig = {
				...existing.iptvOrgConfig,
				...updates.iptvOrgConfig
			} as IptvOrgConfig;
		}

		const [record] = await db
			.update(livetvAccounts)
			.set(updateData)
			.where(eq(livetvAccounts.id, id))
			.returning();

		if (!record) {
			return null;
		}

		logger.info('Updated account', { id, name: record.name });
		return recordToAccount(record);
	}

	/**
	 * Delete a Live TV account
	 */
	async deleteAccount(id: string): Promise<boolean> {
		const result = await db.delete(livetvAccounts).where(eq(livetvAccounts.id, id));
		const deleted = (result.changes ?? 0) > 0;

		if (deleted) {
			logger.info('Deleted account', { id });
		}

		return deleted;
	}

	/**
	 * Test a Live TV account connection
	 */
	async testAccount(id: string): Promise<LiveTvAccountTestResult> {
		const account = await this.getAccount(id);
		if (!account) {
			return {
				success: false,
				error: 'Account not found'
			};
		}

		try {
			const provider = getProviderForAccount(account);
			const result = await provider.testConnection(account);

			// Update account with test results
			const now = new Date().toISOString();
			await db
				.update(livetvAccounts)
				.set({
					lastTestedAt: now,
					lastTestSuccess: result.success,
					lastTestError: result.success ? null : (result.error ?? 'Unknown error'),
					updatedAt: now,
					...(result.success && result.profile
						? {
								playbackLimit: result.profile.playbackLimit,
								channelCount: result.profile.channelCount,
								categoryCount: result.profile.categoryCount,
								expiresAt: result.profile.expiresAt,
								serverTimezone: result.profile.serverTimezone
							}
						: {})
				})
				.where(eq(livetvAccounts.id, id));

			return result;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				error: message
			};
		}
	}

	/**
	 * Enable/disable an account
	 */
	async setEnabled(id: string, enabled: boolean): Promise<LiveTvAccount | null> {
		const [record] = await db
			.update(livetvAccounts)
			.set({
				enabled,
				updatedAt: new Date().toISOString()
			})
			.where(eq(livetvAccounts.id, id))
			.returning();

		if (!record) {
			return null;
		}

		logger.info('Account ' + (enabled ? 'enabled' : 'disabled'), {
			id,
			name: record.name
		});

		return recordToAccount(record);
	}

	/**
	 * Update sync status for an account
	 */
	async updateSyncStatus(
		id: string,
		status: LiveTvAccount['syncStatus'],
		error?: string
	): Promise<void> {
		const now = new Date().toISOString();
		await db
			.update(livetvAccounts)
			.set({
				syncStatus: status,
				lastSyncAt: now,
				lastSyncError: error ?? null,
				updatedAt: now
			})
			.where(eq(livetvAccounts.id, id));
	}

	/**
	 * Get account count by provider type
	 */
	async getAccountCounts(): Promise<Map<LiveTvProviderType, number>> {
		const records = await db
			.select({
				providerType: livetvAccounts.providerType,
				count: sql<number>`count(*)`
			})
			.from(livetvAccounts)
			.groupBy(livetvAccounts.providerType);

		const map = new Map<LiveTvProviderType, number>();
		for (const record of records) {
			map.set(record.providerType as LiveTvProviderType, record.count);
		}
		return map;
	}
}

// Singleton instance
let accountManagerInstance: LiveTvAccountManager | null = null;

/**
 * Get the singleton LiveTvAccountManager instance
 */
export function getLiveTvAccountManager(): LiveTvAccountManager {
	if (!accountManagerInstance) {
		accountManagerInstance = new LiveTvAccountManager();
	}
	return accountManagerInstance;
}
