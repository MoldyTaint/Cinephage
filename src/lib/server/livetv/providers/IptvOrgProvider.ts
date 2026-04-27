/**
 * IPTV-Org Provider
 *
 * Implements the LiveTvProvider interface for IPTV-Org's free IPTV API.
 * Fetches free IPTV channels from https://github.com/iptv-org/api
 */

import { db } from '$lib/server/db';
import { livetvAccounts, livetvChannels, livetvCategories } from '$lib/server/db/schema';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { createChildLogger } from '$lib/logging';
import { randomUUID } from 'crypto';

const logger = createChildLogger({ logDomain: 'livetv' as const });
import type {
	LiveTvProvider,
	AuthResult,
	StreamResolutionResult,
	ProviderCapabilities,
	LiveTvAccount,
	LiveTvChannel,
	LiveTvCategory,
	ChannelSyncResult,
	EpgProgram,
	LiveTvAccountTestResult,
	IptvOrgConfig,
	M3uChannelData
} from '$lib/types/livetv';
import { recordToAccount } from '../LiveTvAccountManager.js';

export class IptvOrgProvider implements LiveTvProvider {
	readonly type = 'iptvorg';

	readonly capabilities: ProviderCapabilities = {
		supportsEpg: true,
		supportsArchive: false,
		supportsCategories: true,
		requiresAuthentication: false,
		streamUrlExpires: false
	};

	getDisplayName(): string {
		return 'IPTV-Org (Free Channels)';
	}

	// ============================================================================
	// Authentication (IPTV-Org doesn't require auth)
	// ============================================================================

	async authenticate(_account: LiveTvAccount): Promise<AuthResult> {
		return {
			success: true,
			token: 'iptvorg_no_auth_required'
		};
	}

	async testConnection(account: LiveTvAccount): Promise<LiveTvAccountTestResult> {
		try {
			const config = account.iptvOrgConfig;
			if (!config) {
				return {
					success: false,
					error: 'IPTV-Org config not found'
				};
			}

			// Test by fetching channels and streams
			const channels = await this.fetchIptvOrgChannels(config);
			const streams = await this.fetchIptvOrgStreams(config);

			// Match channels to streams
			const matchedChannels = this.matchChannelsToStreams(channels, streams, config);

			// Get unique categories
			const categories = new Set<string>();
			for (const channel of channels) {
				if (channel.categories) {
					channel.categories.forEach((c) => categories.add(c));
				}
			}

			return {
				success: true,
				profile: {
					playbackLimit: 0,
					channelCount: matchedChannels.length,
					categoryCount: categories.size,
					expiresAt: null,
					serverTimezone: 'UTC',
					streamVerified: false
				}
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				error: message
			};
		}
	}

	isAuthenticated(_account: LiveTvAccount): boolean {
		return true;
	}

	// ============================================================================
	// Channel Sync
	// ============================================================================

	async syncChannels(accountId: string): Promise<ChannelSyncResult> {
		const startTime = Date.now();

		try {
			const accountRecord = await db
				.select()
				.from(livetvAccounts)
				.where(eq(livetvAccounts.id, accountId))
				.limit(1)
				.then((rows) => rows[0]);

			if (!accountRecord) {
				throw new Error(`Account not found: ${accountId}`);
			}

			const account = recordToAccount(accountRecord);
			const config = account.iptvOrgConfig;

			if (!config) {
				throw new Error('IPTV-Org config not found for account');
			}

			logger.info('[IptvOrgProvider] Fetching blocklist');
			await this.loadBlocklist();

			logger.info('[IptvOrgProvider] Fetching channels');
			const channels = await this.fetchIptvOrgChannels(config);

			logger.info('[IptvOrgProvider] Fetching streams');
			const streams = await this.fetchIptvOrgStreams(config);

			logger.info('[IptvOrgProvider] Fetching categories');
			const categories = await this.fetchIptvOrgCategories();

			logger.info(
				{
					channels: channels.length,
					streams: streams.length
				},
				'[IptvOrgProvider] Matching channels to streams'
			);
			const matchedChannels = this.matchChannelsToStreams(channels, streams, config);

			// Get existing categories
			const existingCategories = await db
				.select()
				.from(livetvCategories)
				.where(eq(livetvCategories.accountId, accountId));

			const categoryMap = new Map(existingCategories.map((c) => [c.externalId, c.id]));
			let categoriesAdded = 0;
			let categoriesUpdated = 0;

			// Create categories from IPTV-Org categories
			const categoryNames = new Set<string>();
			for (const channel of matchedChannels) {
				if (channel.categories) {
					channel.categories.forEach((c) => categoryNames.add(c));
				}
			}

			for (const categoryId of categoryNames) {
				const category = categories.find((c) => c.id === categoryId);
				const title = category?.name || categoryId;
				const existingId = categoryMap.get(categoryId);

				if (existingId) {
					await db
						.update(livetvCategories)
						.set({
							title,
							updatedAt: new Date().toISOString()
						})
						.where(eq(livetvCategories.id, existingId));
					categoriesUpdated++;
				} else {
					const newId = randomUUID();
					await db.insert(livetvCategories).values({
						accountId,
						providerType: 'iptvorg',
						externalId: categoryId,
						title,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					});
					categoryMap.set(categoryId, newId);
					categoriesAdded++;
				}
			}

			// Get existing channels
			const existingChannels = await db
				.select()
				.from(livetvChannels)
				.where(eq(livetvChannels.accountId, accountId));

			const channelMap = new Map(existingChannels.map((c) => [c.externalId, c.id]));
			let channelsAdded = 0;
			let channelsUpdated = 0;
			let channelsRemoved = 0;

			// Sync channels
			for (let i = 0; i < matchedChannels.length; i++) {
				const channel = matchedChannels[i];
				const stream = channel.stream;

				const m3uData: M3uChannelData = {
					tvgId: channel.id,
					tvgName: channel.name,
					groupTitle: channel.categories?.[0],
					url: stream.url,
					tvgLogo: undefined,
					attributes: {
						referrer: stream.referrer || '',
						'user-agent': stream.user_agent || ''
					}
				};

				// Get category ID (use first category)
				const categoryId = channel.categories?.[0] ? categoryMap.get(channel.categories[0]) : null;

				const existingId = channelMap.get(channel.id);

				if (existingId) {
					await db
						.update(livetvChannels)
						.set({
							name: channel.name,
							logo: null,
							categoryId,
							providerCategoryId: channel.categories?.[0] || null,
							m3uData,
							updatedAt: new Date().toISOString()
						})
						.where(eq(livetvChannels.id, existingId));
					channelsUpdated++;
				} else {
					await db.insert(livetvChannels).values({
						accountId,
						providerType: 'iptvorg',
						externalId: channel.id,
						name: channel.name,
						logo: null,
						categoryId,
						providerCategoryId: channel.categories?.[0] || null,
						m3uData,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					});
					channelsAdded++;
				}
			}

			const providerChannelIds = matchedChannels.map((channel) => channel.id);
			if (providerChannelIds.length > 0) {
				const deletedChannels = await db
					.delete(livetvChannels)
					.where(
						and(
							eq(livetvChannels.accountId, accountId),
							notInArray(livetvChannels.externalId, providerChannelIds)
						)
					);
				channelsRemoved = deletedChannels.changes ?? 0;
			}

			const providerCategoryIds = Array.from(categoryNames);
			const staleCategoryIds = existingCategories
				.filter((category) => !providerCategoryIds.includes(category.externalId))
				.map((category) => category.id);

			if (staleCategoryIds.length > 0) {
				await db.delete(livetvCategories).where(inArray(livetvCategories.id, staleCategoryIds));
			}

			// Update account sync status
			await db
				.update(livetvAccounts)
				.set({
					channelCount: matchedChannels.length,
					categoryCount: categoryNames.size,
					lastSyncAt: new Date().toISOString(),
					lastSyncError: null,
					syncStatus: 'success',
					iptvOrgConfig: {
						...config,
						lastSyncAt: new Date().toISOString()
					}
				})
				.where(eq(livetvAccounts.id, accountId));

			const duration = Date.now() - startTime;

			logger.info(
				{
					accountId,
					categoriesAdded,
					categoriesUpdated,
					channelsAdded,
					channelsUpdated,
					channelsRemoved,
					duration
				},
				'[IptvOrgProvider] Channel sync completed'
			);

			return {
				success: true,
				categoriesAdded,
				categoriesUpdated,
				channelsAdded,
				channelsUpdated,
				channelsRemoved,
				duration
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const duration = Date.now() - startTime;

			logger.error({ accountId, err: error }, '[IptvOrgProvider] Channel sync failed');

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
		return [];
	}

	async fetchChannels(_account: LiveTvAccount): Promise<LiveTvChannel[]> {
		return [];
	}

	// ============================================================================
	// Stream Resolution
	// ============================================================================

	async resolveStreamUrl(
		account: LiveTvAccount,
		channel: LiveTvChannel,
		_format?: 'ts' | 'hls'
	): Promise<StreamResolutionResult> {
		try {
			const m3uData = channel.m3u;

			if (!m3uData?.url) {
				return {
					success: false,
					type: 'unknown',
					error: 'Channel has no stream URL'
				};
			}

			const headers: Record<string, string> = {};
			if (m3uData.attributes?.referrer) {
				headers['Referer'] = m3uData.attributes.referrer;
			}
			if (m3uData.attributes?.['user-agent']) {
				headers['User-Agent'] = m3uData.attributes['user-agent'];
			}

			const type = this.detectStreamType(m3uData.url);

			return {
				success: true,
				url: m3uData.url,
				type,
				headers: Object.keys(headers).length > 0 ? headers : undefined
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
	// EPG (Supported via IPTV-Org guides)
	// ============================================================================

	hasEpgSupport(): boolean {
		return true;
	}

	async fetchEpg(account: LiveTvAccount, _startTime: Date, _endTime: Date): Promise<EpgProgram[]> {
		try {
			// IPTV-Org provides guide metadata but not actual EPG data
			// The guides point to external EPG sources that would need to be fetched separately
			// For now, we return empty as we'd need to implement external EPG fetching
			logger.debug(
				'[IptvOrgProvider] EPG fetch not yet implemented - would need external EPG integration'
			);
			return [];
		} catch (error) {
			logger.error({ accountId: account.id, err: error }, '[IptvOrgProvider] EPG fetch failed');
			return [];
		}
	}

	// ============================================================================
	// Archive (Not supported by IPTV-Org)
	// ============================================================================

	supportsArchive(): boolean {
		return false;
	}

	// ============================================================================
	// Private Helpers
	// ============================================================================

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
}

// Singleton instance
let iptvOrgProviderInstance: IptvOrgProvider | null = null;

export function getIptvOrgProvider(): IptvOrgProvider {
	if (!iptvOrgProviderInstance) {
		iptvOrgProviderInstance = new IptvOrgProvider();
	}
	return iptvOrgProviderInstance;
}
