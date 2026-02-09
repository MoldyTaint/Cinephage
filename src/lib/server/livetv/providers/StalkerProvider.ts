/**
 * Stalker Provider
 *
 * Implements the LiveTvProvider interface for Stalker/Ministra portals.
 * Wraps the existing StalkerPortalClient to provide a unified provider interface.
 */

import { db } from '$lib/server/db';
import {
	livetvAccounts,
	livetvChannels,
	livetvCategories,
	type LivetvAccountRecord
} from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '$lib/logging';
import { randomUUID } from 'crypto';
import type {
	LiveTvProvider,
	AuthResult,
	StreamResolutionResult,
	ProviderCapabilities,
	LiveTvAccount,
	LiveTvChannel,
	CachedChannel,
	LiveTvCategory,
	ChannelSyncResult,
	EpgProgram,
	LiveTvAccountTestResult,
	StalkerConfig,
	StalkerChannelData
} from '$lib/types/livetv';
import { StalkerPortalClient, type StalkerPortalConfig } from '../stalker/StalkerPortalClient';

export class StalkerProvider implements LiveTvProvider {
	readonly type = 'stalker';

	readonly capabilities: ProviderCapabilities = {
		supportsEpg: true,
		supportsArchive: true,
		supportsCategories: true,
		requiresAuthentication: true,
		streamUrlExpires: true
	};

	// Cache of authenticated clients per account
	private clients: Map<string, StalkerPortalClient> = new Map();

	getDisplayName(): string {
		return 'Stalker Portal';
	}

	// ============================================================================
	// Authentication
	// ============================================================================

	async authenticate(account: LiveTvAccount): Promise<AuthResult> {
		try {
			const config = this.buildClientConfig(account);
			const client = new StalkerPortalClient(config);
			await client.start();

			// Cache the authenticated client
			this.clients.set(account.id, client);

			// Update token in database if it changed
			const newToken = client.getToken();
			const stalkerConfig = account.stalkerConfig;
			if (stalkerConfig && newToken !== stalkerConfig.token) {
				await this.updateAccountToken(account.id, newToken);
			}

			return {
				success: true,
				token: newToken
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('[StalkerProvider] Authentication failed', {
				accountId: account.id,
				error: message
			});
			return {
				success: false,
				error: message
			};
		}
	}

	async testConnection(account: LiveTvAccount): Promise<LiveTvAccountTestResult> {
		try {
			// Don't cache the client for tests
			const config = this.buildClientConfig(account);
			const client = new StalkerPortalClient(config);
			await client.start();

			const profile = await client.getProfile();

			// Parse status from profile
			let status: 'active' | 'blocked' | 'expired' = 'active';
			if (profile.status === 0) {
				status = profile.blocked === '1' ? 'blocked' : 'active';
			} else if (profile.tariff_expired_date) {
				status = 'expired';
			}

			// Parse expiresAt from various fields
			let expiresAt: string | null = null;
			if (profile.tariff_expired_date && profile.tariff_expired_date !== '0000-00-00 00:00:00') {
				expiresAt = new Date(profile.tariff_expired_date).toISOString();
			}

			// Get channel and category count
			const channelCount = await client.getChannelCount();
			const genres = await client.getGenres();

			return {
				success: true,
				profile: {
					playbackLimit: profile.playback_limit ?? 0,
					channelCount: channelCount ?? 0,
					categoryCount: genres.length,
					expiresAt,
					serverTimezone: profile.default_timezone ?? 'UTC',
					status
				}
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('[StalkerProvider] Connection test failed', {
				accountId: account.id,
				error: message
			});
			return {
				success: false,
				error: message
			};
		}
	}

	isAuthenticated(account: LiveTvAccount): boolean {
		const client = this.clients.get(account.id);
		return client?.isAuthenticated() ?? false;
	}

	// ============================================================================
	// Channel Sync
	// ============================================================================

	async syncChannels(accountId: string): Promise<ChannelSyncResult> {
		const startTime = Date.now();

		try {
			// Get account from database
			const accountRecord = await db
				.select()
				.from(livetvAccounts)
				.where(eq(livetvAccounts.id, accountId))
				.limit(1)
				.then((rows) => rows[0]);

			if (!accountRecord) {
				throw new Error(`Account not found: ${accountId}`);
			}

			const account = this.recordToAccount(accountRecord);

			// Get authenticated client
			const client = await this.getClient(account);

			// Fetch categories
			const categories = await client.getGenres();

			// Get existing categories
			const existingCategories = await db
				.select()
				.from(livetvCategories)
				.where(eq(livetvCategories.accountId, accountId));

			const categoryMap = new Map(existingCategories.map((c) => [c.externalId, c.id]));

			let categoriesAdded = 0;
			let categoriesUpdated = 0;

			// Sync categories
			for (const category of categories) {
				const existingId = categoryMap.get(category.id);

				if (existingId) {
					await db
						.update(livetvCategories)
						.set({
							title: category.title,
							alias: category.alias,
							censored: category.censored,
							updatedAt: new Date().toISOString()
						})
						.where(eq(livetvCategories.id, existingId));
					categoriesUpdated++;
				} else {
					const newId = randomUUID();
					await db.insert(livetvCategories).values({
						id: newId,
						accountId,
						providerType: 'stalker',
						externalId: category.id,
						title: category.title,
						alias: category.alias,
						censored: category.censored,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					});
					categoryMap.set(category.id, newId);
					categoriesAdded++;
				}
			}

			// Fetch channels
			const channels = await client.getChannels();

			// Get existing channels
			const existingChannels = await db
				.select()
				.from(livetvChannels)
				.where(eq(livetvChannels.accountId, accountId));

			const channelMap = new Map(existingChannels.map((c) => [c.externalId, c.id]));

			let channelsAdded = 0;
			let channelsUpdated = 0;

			// Sync channels
			for (const channel of channels) {
				const stalkerData: StalkerChannelData = {
					stalkerGenreId: channel.genreId,
					cmd: channel.cmd,
					tvArchive: channel.tvArchive,
					archiveDuration: channel.archiveDuration
				};

				const categoryId = channel.genreId ? categoryMap.get(channel.genreId) : null;

				const existingId = channelMap.get(channel.id);

				if (existingId) {
					await db
						.update(livetvChannels)
						.set({
							name: channel.name,
							number: channel.number,
							logo: channel.logo,
							categoryId,
							providerCategoryId: channel.genreId,
							stalkerData,
							updatedAt: new Date().toISOString()
						})
						.where(eq(livetvChannels.id, existingId));
					channelsUpdated++;
				} else {
					await db.insert(livetvChannels).values({
						id: randomUUID(),
						accountId,
						providerType: 'stalker',
						externalId: channel.id,
						name: channel.name,
						number: channel.number,
						logo: channel.logo,
						categoryId,
						providerCategoryId: channel.genreId,
						stalkerData,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					});
					channelsAdded++;
				}
			}

			// Update category channel counts
			for (const [externalId, categoryId] of categoryMap) {
				const count = channels.filter((c) => c.genreId === externalId).length;
				await db
					.update(livetvCategories)
					.set({ channelCount: count })
					.where(eq(livetvCategories.id, categoryId));
			}

			// Detect stream URL type
			const streamUrlType = await this.detectStreamUrlType(client, channels);

			// Update account sync status and stream URL type
			const existingConfig = account.stalkerConfig;
			if (existingConfig) {
				const updatedStalkerConfig: StalkerConfig = {
					portalUrl: existingConfig.portalUrl,
					macAddress: existingConfig.macAddress,
					serialNumber: existingConfig.serialNumber,
					deviceId: existingConfig.deviceId,
					deviceId2: existingConfig.deviceId2,
					model: existingConfig.model,
					timezone: existingConfig.timezone,
					token: existingConfig.token,
					username: existingConfig.username,
					password: existingConfig.password,
					portalId: existingConfig.portalId,
					discoveredFromScan: existingConfig.discoveredFromScan,
					streamUrlType
				};

				await db
					.update(livetvAccounts)
					.set({
						channelCount: channels.length,
						categoryCount: categories.length,
						lastSyncAt: new Date().toISOString(),
						lastSyncError: null,
						syncStatus: 'success',
						stalkerConfig: updatedStalkerConfig
					})
					.where(eq(livetvAccounts.id, accountId));
			} else {
				await db
					.update(livetvAccounts)
					.set({
						channelCount: channels.length,
						categoryCount: categories.length,
						lastSyncAt: new Date().toISOString(),
						lastSyncError: null,
						syncStatus: 'success'
					})
					.where(eq(livetvAccounts.id, accountId));
			}

			const duration = Date.now() - startTime;

			logger.info('[StalkerProvider] Channel sync completed', {
				accountId,
				categoriesAdded,
				categoriesUpdated,
				channelsAdded,
				channelsUpdated,
				duration
			});

			return {
				success: true,
				categoriesAdded,
				categoriesUpdated,
				channelsAdded,
				channelsUpdated,
				channelsRemoved: 0,
				duration
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const duration = Date.now() - startTime;

			logger.error('[StalkerProvider] Channel sync failed', { accountId, error: message });

			// Update account sync status
			await db
				.update(livetvAccounts)
				.set({
					lastSyncAt: new Date().toISOString(),
					lastSyncError: message,
					syncStatus: 'failed'
				})
				.where(eq(livetvAccounts.id, accountId));

			return {
				success: false,
				categoriesAdded: 0,
				categoriesUpdated: 0,
				channelsAdded: 0,
				channelsUpdated: 0,
				channelsRemoved: 0,
				duration,
				error: message
			};
		}
	}

	async fetchCategories(_account: LiveTvAccount): Promise<LiveTvCategory[]> {
		// Categories are synced to database, fetch from there
		return [];
	}

	async fetchChannels(_account: LiveTvAccount): Promise<LiveTvChannel[]> {
		// Channels are synced to database, fetch from there
		return [];
	}

	// ============================================================================
	// Stream Resolution
	// ============================================================================

	async resolveStreamUrl(
		account: LiveTvAccount,
		channel: CachedChannel
	): Promise<StreamResolutionResult> {
		try {
			const client = await this.getClient(account);
			const stalkerData = channel.stalker;

			if (!stalkerData?.cmd) {
				return {
					success: false,
					type: 'unknown',
					error: 'Channel has no CMD value'
				};
			}

			const streamUrlType = account.stalkerConfig?.streamUrlType ?? 'unknown';

			// Always fetch fresh stream URL to avoid expired tokens in cached stalkerData.cmd
			// getFreshStreamUrl handles both 'direct' and 'create_link' types internally
			const url = await client.getFreshStreamUrl(channel.externalId, streamUrlType);

			// Detect stream type
			const type = this.detectStreamType(url);

			// Get stream headers from client (includes cookies for authentication)
			const clientHeaders = client.getStreamHeaders();
			const headers: Record<string, string> = {};
			if (typeof clientHeaders === 'object' && clientHeaders !== null) {
				if (Array.isArray(clientHeaders)) {
					// Handle [string, string][] format
					clientHeaders.forEach(([key, value]) => {
						headers[key] = value;
					});
				} else {
					// Handle Record<string, string> format
					Object.assign(headers, clientHeaders);
				}
			}

			return {
				success: true,
				url,
				type,
				headers
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('[StalkerProvider] Stream resolution failed', {
				accountId: account.id,
				channelId: channel.id,
				error: message
			});

			return {
				success: false,
				type: 'unknown',
				error: message
			};
		}
	}

	// ============================================================================
	// EPG
	// ============================================================================

	hasEpgSupport(): boolean {
		return true;
	}

	async fetchEpg(account: LiveTvAccount, startTime: Date, endTime: Date): Promise<EpgProgram[]> {
		try {
			const client = await this.getClient(account);

			// Calculate period in hours
			const periodHours = Math.ceil((endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60));

			// Get EPG data from client (returns Map of channelId -> programs)
			const epgData = await client.getEpgInfo(periodHours);

			// Get channels for this account to map external IDs to internal IDs
			const channels = await db
				.select()
				.from(livetvChannels)
				.where(eq(livetvChannels.accountId, account.id));

			const channelMap = new Map(channels.map((c) => [c.externalId, c]));

			const programs: EpgProgram[] = [];

			// Iterate over the EPG data Map
			for (const [channelExternalId, channelPrograms] of epgData.entries()) {
				const channel = channelMap.get(channelExternalId);
				if (!channel) continue;

				for (const program of channelPrograms) {
					// Use Unix timestamps for timezone-independent comparison
					const programStart = new Date(program.start_timestamp * 1000);
					const programEnd = new Date(program.stop_timestamp * 1000);
					if (programStart < startTime || programStart > endTime) continue;

					programs.push({
						id: randomUUID(),
						channelId: channel.id,
						externalChannelId: channelExternalId,
						accountId: account.id,
						providerType: 'stalker',
						title: program.name,
						description: program.descr || null,
						category: program.category || null,
						director: program.director || null,
						actor: program.actor || null,
						startTime: programStart.toISOString(),
						endTime: programEnd.toISOString(),
						duration: program.duration,
						hasArchive: program.mark_archive === 1,
						cachedAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					});
				}
			}

			return programs;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('[StalkerProvider] EPG fetch failed', { accountId: account.id, error: message });
			return [];
		}
	}

	// ============================================================================
	// Archive
	// ============================================================================

	supportsArchive(): boolean {
		return true;
	}

	async getArchiveStreamUrl(
		account: LiveTvAccount,
		channel: CachedChannel,
		startTime: Date,
		_duration: number
	): Promise<StreamResolutionResult> {
		try {
			const client = await this.getClient(account);

			// Build archive command using normalized localhost format
			// Portals expect: "ffmpeg http://localhost/ch/{channelId}_" with archive params
			const normalizedCmd = `ffmpeg http://localhost/ch/${channel.externalId}_`;
			const archiveCmd = `${normalizedCmd}?utc=${Math.floor(startTime.getTime() / 1000)}&lutc=${Math.floor(Date.now() / 1000)}`;
			const url = await client.createLink(archiveCmd);

			const type = this.detectStreamType(url);

			return {
				success: true,
				url,
				type
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				type: 'unknown',
				error: message
			};
		}
	}

	// ============================================================================
	// Private Helpers
	// ============================================================================

	private buildClientConfig(account: LiveTvAccount): StalkerPortalConfig {
		const config = account.stalkerConfig;
		if (!config) {
			throw new Error('Stalker config not found for account');
		}

		return {
			portalUrl: config.portalUrl,
			macAddress: config.macAddress,
			serialNumber: config.serialNumber ?? this.generateSerialNumber(),
			deviceId: config.deviceId ?? this.generateDeviceId(),
			deviceId2: config.deviceId2 ?? this.generateDeviceId(),
			model: config.model ?? 'MAG254',
			timezone: config.timezone ?? 'Europe/London',
			token: config.token,
			username: config.username,
			password: config.password
		};
	}

	private async getClient(account: LiveTvAccount): Promise<StalkerPortalClient> {
		// Check cache
		const cached = this.clients.get(account.id);
		if (cached?.isAuthenticated()) {
			return cached;
		}

		// Stop old client's watchdog timer before replacing
		if (cached) {
			cached.stop();
		}

		// Create new client and authenticate
		const config = this.buildClientConfig(account);
		const client = new StalkerPortalClient(config);
		await client.start();

		// Cache client
		this.clients.set(account.id, client);

		return client;
	}

	private async updateAccountToken(accountId: string, token: string): Promise<void> {
		const account = await db
			.select()
			.from(livetvAccounts)
			.where(eq(livetvAccounts.id, accountId))
			.limit(1)
			.then((rows) => rows[0]);

		if (account?.stalkerConfig) {
			const updatedConfig = { ...account.stalkerConfig, token };
			await db
				.update(livetvAccounts)
				.set({ stalkerConfig: updatedConfig })
				.where(eq(livetvAccounts.id, accountId));
		}
	}

	private recordToAccount(record: LivetvAccountRecord): LiveTvAccount {
		return {
			id: record.id,
			name: record.name,
			providerType: record.providerType,
			enabled: record.enabled ?? true,
			stalkerConfig: record.stalkerConfig ?? undefined,
			xstreamConfig: record.xstreamConfig ?? undefined,
			m3uConfig: record.m3uConfig ?? undefined,
			playbackLimit: record.playbackLimit ?? null,
			channelCount: record.channelCount ?? null,
			categoryCount: record.categoryCount ?? null,
			expiresAt: record.expiresAt ?? null,
			serverTimezone: record.serverTimezone ?? null,
			lastTestedAt: record.lastTestedAt ?? null,
			lastTestSuccess: record.lastTestSuccess ?? null,
			lastTestError: record.lastTestError ?? null,
			lastSyncAt: record.lastSyncAt ?? null,
			lastSyncError: record.lastSyncError ?? null,
			syncStatus: record.syncStatus ?? 'never',
			lastEpgSyncAt: record.lastEpgSyncAt ?? null,
			lastEpgSyncError: record.lastEpgSyncError ?? null,
			epgProgramCount: record.epgProgramCount ?? 0,
			hasEpg: record.hasEpg ?? null,
			createdAt: record.createdAt ?? new Date().toISOString(),
			updatedAt: record.updatedAt ?? new Date().toISOString()
		};
	}

	private generateSerialNumber(): string {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
		let sn = '';
		for (let i = 0; i < 12; i++) {
			sn += chars[Math.floor(Math.random() * chars.length)];
		}
		return sn;
	}

	private generateDeviceId(): string {
		const chars = 'ABCDEF0123456789';
		let id = '';
		for (let i = 0; i < 32; i++) {
			id += chars[Math.floor(Math.random() * chars.length)];
		}
		return id;
	}

	private detectStreamType(url: string): 'hls' | 'direct' | 'unknown' {
		const lowerUrl = url.toLowerCase();
		if (lowerUrl.includes('.m3u8') || lowerUrl.includes('/hls/')) {
			return 'hls';
		}
		if (lowerUrl.includes('.ts') || lowerUrl.includes('.mp4')) {
			return 'direct';
		}
		return 'unknown';
	}

	private async detectStreamUrlType(
		client: StalkerPortalClient,
		channels: Array<{ cmd: string }>
	): Promise<'direct' | 'create_link' | 'unknown'> {
		if (channels.length === 0) return 'unknown';

		// Try the first channel's direct URL
		const testChannel = channels[0];
		const directUrl = testChannel.cmd.replace(/^ffmpeg\s+/, '');

		try {
			const response = await fetch(directUrl, {
				method: 'HEAD',
				headers: {
					'User-Agent':
						'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2116 Mobile Safari/533.3'
				},
				signal: AbortSignal.timeout(5000)
			});

			if (response.ok) {
				logger.info('[StalkerProvider] Detected direct stream URL type');
				return 'direct';
			}
		} catch {
			// Direct URL didn't work, try create_link
		}

		try {
			await client.createLink(testChannel.cmd);
			logger.info('[StalkerProvider] Detected create_link stream URL type');
			return 'create_link';
		} catch {
			// Neither worked
		}

		return 'unknown';
	}
}

// Singleton instance
let stalkerProviderInstance: StalkerProvider | null = null;

export function getStalkerProvider(): StalkerProvider {
	if (!stalkerProviderInstance) {
		stalkerProviderInstance = new StalkerProvider();
	}
	return stalkerProviderInstance;
}
