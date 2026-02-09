/**
 * IPTV-Org Provider
 *
 * Implements the LiveTvProvider interface for IPTV-Org's free IPTV API.
 * Fetches free IPTV channels from https://github.com/iptv-org/api
 */

import { db } from '$lib/server/db';
import {
	livetvAccounts,
	livetvChannels,
	livetvCategories,
	settings,
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
	LiveTvCategory,
	ChannelSyncResult,
	EpgProgram,
	LiveTvAccountTestResult,
	IptvOrgConfig,
	M3uChannelData
} from '$lib/types/livetv';

// IPTV-Org API endpoints
const IPTVORG_API_BASE = 'https://iptv-org.github.io/api';

// IPTV-Org API Response Types
interface IptvOrgChannel {
	id: string;
	name: string;
	alt_names?: string[];
	network?: string | null;
	owners?: string[];
	country: string;
	categories?: string[];
	is_nsfw: boolean;
	launched?: string | null;
	closed?: string | null;
	replaced_by?: string | null;
	website?: string | null;
}

interface IptvOrgStream {
	channel: string;
	feed?: string | null;
	title: string;
	url: string;
	referrer?: string | null;
	user_agent?: string | null;
	quality?: string | null;
}

interface IptvOrgCategory {
	id: string;
	name: string;
	description: string;
}

interface IptvOrgBlocklistEntry {
	channel: string;
	reason: 'dmca' | 'nsfw';
	ref: string;
}

export class IptvOrgProvider implements LiveTvProvider {
	readonly type = 'iptvorg';

	readonly capabilities: ProviderCapabilities = {
		supportsEpg: true,
		supportsArchive: false,
		supportsCategories: true,
		requiresAuthentication: false,
		streamUrlExpires: false
	};

	private blocklist: Set<string> = new Set();

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
					status: 'active'
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

			const account = this.recordToAccount(accountRecord);
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

			logger.info('[IptvOrgProvider] Matching channels to streams', {
				channels: channels.length,
				streams: streams.length
			});
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

			logger.info('[IptvOrgProvider] Channel sync completed', {
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

			logger.error('[IptvOrgProvider] Channel sync failed', { accountId, error: message });

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
		channel: LiveTvChannel
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
			const message = error instanceof Error ? error.message : String(error);
			logger.error('[IptvOrgProvider] EPG fetch failed', { accountId: account.id, error: message });
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

	private async loadBlocklist(): Promise<void> {
		try {
			const response = await fetch(`${IPTVORG_API_BASE}/blocklist.json`, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
				},
				signal: AbortSignal.timeout(30000)
			});

			if (!response.ok) {
				logger.warn('[IptvOrgProvider] Failed to fetch blocklist', { status: response.status });
				return;
			}

			const blocklist: IptvOrgBlocklistEntry[] = await response.json();
			this.blocklist = new Set(blocklist.map((entry) => entry.channel));

			logger.info('[IptvOrgProvider] Blocklist loaded', { count: this.blocklist.size });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.warn('[IptvOrgProvider] Failed to load blocklist', { error: message });
		}
	}

	private async getGlobalAdultFilter(): Promise<boolean> {
		try {
			const result = await db
				.select({ value: settings.value })
				.from(settings)
				.where(eq(settings.key, 'global_filters'))
				.limit(1);

			if (result[0]?.value) {
				const filters = JSON.parse(result[0].value);
				return filters.include_adult ?? false;
			}
		} catch (e) {
			logger.warn('[IptvOrgProvider] Failed to read global adult filter', { error: e });
		}
		return false;
	}

	private async fetchIptvOrgChannels(config: IptvOrgConfig): Promise<IptvOrgChannel[]> {
		const response = await fetch(`${IPTVORG_API_BASE}/channels.json`, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
			},
			signal: AbortSignal.timeout(60000)
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch channels: HTTP ${response.status}`);
		}

		const allChannels: IptvOrgChannel[] = await response.json();

		// Read global adult filter setting
		const includeAdult = await this.getGlobalAdultFilter();

		// Filter channels based on config
		return allChannels.filter((channel) => {
			// Skip blocked channels
			if (this.blocklist.has(channel.id)) {
				return false;
			}

			// Skip NSFW unless globally allowed
			if (channel.is_nsfw && !includeAdult) {
				return false;
			}

			// Filter by countries
			if (config.countries && config.countries.length > 0) {
				if (!config.countries.includes(channel.country)) {
					return false;
				}
			}

			// Filter by categories
			if (config.categories && config.categories.length > 0) {
				if (
					!channel.categories ||
					!channel.categories.some((c) => config.categories?.includes(c))
				) {
					return false;
				}
			}

			return true;
		});
	}

	private async fetchIptvOrgStreams(config: IptvOrgConfig): Promise<IptvOrgStream[]> {
		const response = await fetch(`${IPTVORG_API_BASE}/streams.json`, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
			},
			signal: AbortSignal.timeout(60000)
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch streams: HTTP ${response.status}`);
		}

		const allStreams: IptvOrgStream[] = await response.json();

		// Filter streams by quality if specified
		if (config.preferredQuality) {
			return allStreams.filter((stream) => {
				if (!stream.quality) return true;
				return stream.quality === config.preferredQuality;
			});
		}

		return allStreams;
	}

	private async fetchIptvOrgCategories(): Promise<IptvOrgCategory[]> {
		const response = await fetch(`${IPTVORG_API_BASE}/categories.json`, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
			},
			signal: AbortSignal.timeout(30000)
		});

		if (!response.ok) {
			logger.warn('[IptvOrgProvider] Failed to fetch categories', { status: response.status });
			return [];
		}

		return response.json();
	}

	private matchChannelsToStreams(
		channels: IptvOrgChannel[],
		streams: IptvOrgStream[],
		config: IptvOrgConfig
	): Array<IptvOrgChannel & { stream: IptvOrgStream }> {
		// Create a map of channel ID to streams
		const streamMap = new Map<string, IptvOrgStream[]>();

		for (const stream of streams) {
			if (!stream.channel) continue;

			if (!streamMap.has(stream.channel)) {
				streamMap.set(stream.channel, []);
			}
			streamMap.get(stream.channel)!.push(stream);
		}

		// Match channels to streams
		const matched: Array<IptvOrgChannel & { stream: IptvOrgStream }> = [];

		for (const channel of channels) {
			const channelStreams = streamMap.get(channel.id);
			if (!channelStreams || channelStreams.length === 0) continue;

			// Pick best stream (prefer specified quality, otherwise first available)
			let bestStream = channelStreams[0];

			if (config.preferredQuality) {
				const qualityMatch = channelStreams.find((s) => s.quality === config.preferredQuality);
				if (qualityMatch) {
					bestStream = qualityMatch;
				}
			}

			matched.push({ ...channel, stream: bestStream });
		}

		return matched;
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

	private recordToAccount(record: LivetvAccountRecord): LiveTvAccount {
		return {
			id: record.id,
			name: record.name,
			providerType: record.providerType,
			enabled: record.enabled ?? true,
			stalkerConfig: record.stalkerConfig ?? undefined,
			xstreamConfig: record.xstreamConfig ?? undefined,
			m3uConfig: record.m3uConfig ?? undefined,
			iptvOrgConfig: record.iptvOrgConfig ?? undefined,
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
}

// Singleton instance
let iptvOrgProviderInstance: IptvOrgProvider | null = null;

export function getIptvOrgProvider(): IptvOrgProvider {
	if (!iptvOrgProviderInstance) {
		iptvOrgProviderInstance = new IptvOrgProvider();
	}
	return iptvOrgProviderInstance;
}
