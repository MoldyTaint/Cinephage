/**
 * XStream Provider - Improved Implementation
 *
 * Implements the LiveTvProvider interface for XStream Codes IPTV servers.
 * Uses robust error handling and timeouts to handle slow/unreliable servers.
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
	LiveTvCategory,
	ChannelSyncResult,
	EpgProgram,
	LiveTvAccountTestResult,
	XstreamConfig,
	XstreamChannelData
} from '$lib/types/livetv';

// XStream API Response Types
interface XstreamAuthResponse {
	user_info: {
		username: string;
		password: string;
		message?: string;
		auth?: number;
		status?: string;
		exp_date?: string;
		is_trial?: string;
		active_cons?: string;
		created_at?: string;
		max_connections?: string;
		t_allowed_output_formats?: string[];
	};
	server_info: {
		url: string;
		port: string;
		https_port: string;
		server_protocol: string;
		rtmp_port: string;
		timezone: string;
		timestamp_now: number;
		time_now: string;
	};
}

interface XstreamCategory {
	category_id: string;
	category_name: string;
	parent_id: number;
}

interface XstreamStream {
	num: number;
	name: string;
	stream_type: string;
	stream_id: number;
	stream_icon?: string;
	epg_channel_id?: string;
	added?: string;
	category_id?: string;
	custom_sid?: string;
	tv_archive?: number;
	direct_source?: string;
	tv_archive_duration?: number;
}

interface XstreamEpgEntry {
	start_timestamp?: number | string;
	stop_timestamp?: number | string;
	start?: string;
	end?: string;
	title?: string;
	description?: string;
	name?: string;
}

export class XstreamProvider implements LiveTvProvider {
	readonly type = 'xstream';

	readonly capabilities: ProviderCapabilities = {
		supportsEpg: true,
		supportsArchive: true,
		supportsCategories: true,
		requiresAuthentication: true,
		streamUrlExpires: false
	};

	private tokens: Map<string, { token: string; expiry: Date }> = new Map();

	getDisplayName(): string {
		return 'XStream Codes';
	}

	async authenticate(account: LiveTvAccount): Promise<AuthResult> {
		try {
			logger.debug('[XstreamProvider] Starting authentication', { accountId: account.id });
			const result = await this.makeAuthRequest(account);

			if (result.user_info?.auth === 0) {
				return {
					success: false,
					error: result.user_info.message || 'Authentication failed'
				};
			}

			const token = this.generateAuthToken(account);
			const expiry = new Date();
			expiry.setHours(expiry.getHours() + 24);

			this.tokens.set(account.id, { token, expiry });

			logger.debug('[XstreamProvider] Authentication successful', { accountId: account.id });

			return {
				success: true,
				token,
				tokenExpiry: expiry
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('[XstreamProvider] Authentication failed', {
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
			logger.debug('[XstreamProvider] Testing connection', { accountId: account.id });
			const result = await this.makeAuthRequest(account);

			if (result.user_info?.auth === 0) {
				return {
					success: false,
					error: result.user_info.message || 'Authentication failed'
				};
			}

			const expDate = result.user_info?.exp_date
				? new Date(parseInt(result.user_info.exp_date) * 1000).toISOString()
				: null;

			const config = account.xstreamConfig;
			if (!config) {
				throw new Error('XStream config not found');
			}

			let categoryCount = 0;
			let channelCount = 0;

			try {
				const [categories, streams] = await Promise.all([
					this.fetchXstreamCategories(config),
					this.fetchXstreamStreams(config)
				]);
				categoryCount = categories.length;
				channelCount = streams.length;
			} catch (error) {
				logger.warn('[XstreamProvider] Connection test succeeded, but count fetch failed', {
					accountId: account.id,
					error: error instanceof Error ? error.message : String(error)
				});
			}

			logger.info('[XstreamProvider] Connection test successful', {
				accountId: account.id,
				channelCount,
				categoryCount
			});

			return {
				success: true,
				profile: {
					playbackLimit: parseInt(result.user_info?.max_connections || '1'),
					channelCount,
					categoryCount,
					expiresAt: expDate,
					serverTimezone: result.server_info?.timezone || 'UTC',
					status: result.user_info?.status === 'Active' ? 'active' : 'expired'
				}
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('[XstreamProvider] Connection test failed', {
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
		const cached = this.tokens.get(account.id);
		if (!cached) return false;
		return cached.expiry > new Date();
	}

	async syncChannels(accountId: string): Promise<ChannelSyncResult> {
		const startTime = Date.now();
		logger.info('[XstreamProvider] Starting channel sync', { accountId });

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
			const config = account.xstreamConfig;

			if (!config) {
				throw new Error('XStream config not found for account');
			}

			logger.info('[XstreamProvider] Fetching categories', {
				accountId,
				serverUrl: config.baseUrl
			});

			// Fetch categories first
			const categories = await this.fetchXstreamCategories(config);
			logger.info('[XstreamProvider] Categories fetched', { accountId, count: categories.length });

			const existingCategories = await db
				.select()
				.from(livetvCategories)
				.where(eq(livetvCategories.accountId, accountId));

			const categoryMap = new Map(existingCategories.map((c) => [c.externalId, c.id]));
			let categoriesAdded = 0;
			let categoriesUpdated = 0;

			for (const category of categories) {
				const existingId = categoryMap.get(category.category_id);

				if (existingId) {
					await db
						.update(livetvCategories)
						.set({
							title: category.category_name,
							updatedAt: new Date().toISOString()
						})
						.where(eq(livetvCategories.id, existingId));
					categoriesUpdated++;
				} else {
					const newId = randomUUID();
					await db.insert(livetvCategories).values({
						id: newId,
						accountId,
						providerType: 'xstream',
						externalId: category.category_id,
						title: category.category_name,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					});
					categoryMap.set(category.category_id, newId);
					categoriesAdded++;
				}
			}

			logger.info('[XstreamProvider] Fetching streams by category', {
				accountId,
				categoryCount: categories.length
			});

			// Fetch streams in parallel batches for better performance
			const CONCURRENT_REQUESTS = 10;
			const allStreams: XstreamStream[] = [];

			for (let i = 0; i < categories.length; i += CONCURRENT_REQUESTS) {
				const batch = categories.slice(i, i + CONCURRENT_REQUESTS);

				// Fetch all categories in this batch concurrently
				const results = await Promise.all(
					batch.map(async (category) => {
						try {
							return await this.fetchXstreamStreamsByCategory(config, category.category_id);
						} catch (error) {
							const message = error instanceof Error ? error.message : String(error);
							logger.warn('[XstreamProvider] Failed to fetch streams for category', {
								accountId,
								categoryId: category.category_id,
								error: message
							});
							return [];
						}
					})
				);

				// Flatten results and add to allStreams
				results.forEach((streams) => allStreams.push(...streams));

				logger.info('[XstreamProvider] Batch progress', {
					accountId,
					processed: Math.min(i + CONCURRENT_REQUESTS, categories.length),
					total: categories.length,
					streamsSoFar: allStreams.length
				});
			}

			const streams = allStreams;
			logger.info('[XstreamProvider] Streams fetched', { accountId, count: streams.length });

			const existingChannels = await db
				.select()
				.from(livetvChannels)
				.where(eq(livetvChannels.accountId, accountId));

			const channelMap = new Map(existingChannels.map((c) => [c.externalId, c.id]));
			let channelsAdded = 0;
			let channelsUpdated = 0;

			logger.info('[XstreamProvider] Processing streams', { accountId, count: streams.length });

			for (let i = 0; i < streams.length; i++) {
				const stream = streams[i];

				// Log progress every 1000 channels
				if (i % 1000 === 0 && i > 0) {
					logger.info('[XstreamProvider] Processing progress', {
						accountId,
						processed: i,
						total: streams.length
					});
				}

				const xstreamData: XstreamChannelData = {
					streamId: stream.stream_id.toString(),
					streamType: stream.stream_type,
					directStreamUrl: stream.direct_source,
					containerExtension: ''
				};

				const categoryId = stream.category_id ? categoryMap.get(stream.category_id) : null;
				const existingId = channelMap.get(stream.stream_id.toString());

				if (existingId) {
					await db
						.update(livetvChannels)
						.set({
							name: stream.name,
							number: stream.num?.toString(),
							logo: stream.stream_icon,
							categoryId,
							providerCategoryId: stream.category_id,
							xstreamData,
							updatedAt: new Date().toISOString()
						})
						.where(eq(livetvChannels.id, existingId));
					channelsUpdated++;
				} else {
					await db.insert(livetvChannels).values({
						id: randomUUID(),
						accountId,
						providerType: 'xstream',
						externalId: stream.stream_id.toString(),
						name: stream.name,
						number: stream.num?.toString(),
						logo: stream.stream_icon,
						categoryId,
						providerCategoryId: stream.category_id,
						xstreamData,
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
					channelCount: streams.length,
					categoryCount: categories.length,
					lastSyncAt: new Date().toISOString(),
					lastSyncError: null,
					syncStatus: 'success'
				})
				.where(eq(livetvAccounts.id, accountId));

			const duration = Date.now() - startTime;

			logger.info('[XstreamProvider] Channel sync completed', {
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

			logger.error('[XstreamProvider] Channel sync failed', {
				accountId,
				error: message,
				duration
			});

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

	async resolveStreamUrl(
		account: LiveTvAccount,
		channel: LiveTvChannel
	): Promise<StreamResolutionResult> {
		try {
			const config = account.xstreamConfig;
			if (!config) {
				return {
					success: false,
					type: 'unknown',
					error: 'XStream config not found'
				};
			}

			const xstreamData = channel.xstream;

			if (!xstreamData) {
				return {
					success: false,
					type: 'unknown',
					error: 'Channel has no XStream data'
				};
			}

			const baseUrl = config.baseUrl.replace(/\/$/, '');
			const format = config.outputFormat || 'ts';
			const url = `${baseUrl}/live/${config.username}/${config.password}/${xstreamData.streamId}.${format}`;

			return {
				success: true,
				url,
				type: format === 'm3u8' ? 'hls' : 'direct'
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

	hasEpgSupport(): boolean {
		return true;
	}

	async fetchEpg(account: LiveTvAccount, startTime: Date, endTime: Date): Promise<EpgProgram[]> {
		try {
			const config = account.xstreamConfig;
			if (!config) {
				logger.warn('[XstreamProvider] EPG fetch failed: no config');
				return [];
			}

			const channels = await db
				.select()
				.from(livetvChannels)
				.where(eq(livetvChannels.accountId, account.id));

			if (channels.length === 0) {
				logger.debug('[XstreamProvider] No channels found for EPG fetch');
				return [];
			}

			const programs: EpgProgram[] = [];
			const baseUrl = config.baseUrl.replace(/\/$/, '');
			let actionOrder: string[] = ['get_epg', 'get_simple_data_table', 'get_short_epg'];
			const failedChannelSamples: Array<{ channelId: string; streamId: string }> = [];
			const errorChannelSamples: Array<{ channelId: string; streamId: string; error: string }> = [];
			let failedChannelCount = 0;
			let errorChannelCount = 0;
			const sampleLimit = 5;

			for (const channel of channels) {
				const xstreamData = channel.xstreamData;
				if (!xstreamData?.streamId) continue;

				try {
					const channelEpgResult = await this.fetchChannelEpg(
						baseUrl,
						config.username,
						config.password,
						xstreamData.streamId,
						actionOrder
					);

					if (!channelEpgResult) {
						failedChannelCount++;
						if (failedChannelSamples.length < sampleLimit) {
							failedChannelSamples.push({
								channelId: channel.id,
								streamId: xstreamData.streamId
							});
						}
						continue;
					}

					if (channelEpgResult.usedAction && channelEpgResult.usedAction !== actionOrder[0]) {
						actionOrder = [
							channelEpgResult.usedAction,
							...actionOrder.filter((a) => a !== channelEpgResult.usedAction)
						];
					}

					for (const entry of channelEpgResult.entries) {
						const entryStart = this.parseEpgTime(
							entry.start_timestamp ?? entry.start,
							entry.start_timestamp !== undefined
						);
						const entryEnd = this.parseEpgTime(
							entry.stop_timestamp ?? entry.end,
							entry.stop_timestamp !== undefined
						);

						if (!entryStart || !entryEnd) continue;
						// Keep any programme that overlaps the requested window.
						if (entryEnd < startTime || entryStart > endTime) continue;

						const title = this.decodeMaybeBase64(entry.title) ?? entry.name ?? 'Unknown';
						const description = this.decodeMaybeBase64(entry.description);

						programs.push({
							id: randomUUID(),
							channelId: channel.id,
							externalChannelId: channel.externalId,
							accountId: account.id,
							providerType: 'xstream',
							title,
							description: description || null,
							category: null,
							director: null,
							actor: null,
							startTime: entryStart.toISOString(),
							endTime: entryEnd.toISOString(),
							duration: Math.floor((entryEnd.getTime() - entryStart.getTime()) / 1000),
							hasArchive: false,
							cachedAt: new Date().toISOString(),
							updatedAt: new Date().toISOString()
						});
					}
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					errorChannelCount++;
					if (errorChannelSamples.length < sampleLimit) {
						errorChannelSamples.push({
							channelId: channel.id,
							streamId: xstreamData.streamId,
							error: message
						});
					}
				}
			}

			if (failedChannelCount > 0 || errorChannelCount > 0) {
				logger.warn('[XstreamProvider] EPG fetch completed with channel issues', {
					accountId: account.id,
					channelsChecked: channels.length,
					failedChannels: failedChannelCount,
					errorChannels: errorChannelCount,
					failedChannelSamples,
					errorChannelSamples,
					suppressedFailedChannelLogs: Math.max(
						0,
						failedChannelCount - failedChannelSamples.length
					),
					suppressedErrorChannelLogs: Math.max(0, errorChannelCount - errorChannelSamples.length)
				});
			}

			logger.info('[XstreamProvider] EPG fetch complete', {
				accountId: account.id,
				programsFetched: programs.length,
				channelsChecked: channels.length
			});

			return programs;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('[XstreamProvider] EPG fetch failed', { accountId: account.id, error: message });
			return [];
		}
	}

	supportsArchive(): boolean {
		return true;
	}

	async getArchiveStreamUrl(
		account: LiveTvAccount,
		channel: LiveTvChannel,
		startTime: Date,
		duration: number
	): Promise<StreamResolutionResult> {
		try {
			const config = account.xstreamConfig;
			if (!config) {
				return {
					success: false,
					type: 'unknown',
					error: 'XStream config not found'
				};
			}

			const xstreamData = channel.xstream;
			if (!xstreamData) {
				return {
					success: false,
					type: 'unknown',
					error: 'Channel has no XStream data'
				};
			}

			const baseUrl = config.baseUrl.replace(/\/$/, '');
			const startTimestamp = Math.floor(startTime.getTime() / 1000);
			const url = `${baseUrl}/timeshift/${config.username}/${config.password}/${duration}/${startTimestamp}/${xstreamData.streamId}.ts`;

			return {
				success: true,
				url,
				type: 'direct'
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

	private async fetchChannelEpg(
		baseUrl: string,
		username: string,
		password: string,
		streamId: string,
		actionOrder: string[]
	): Promise<{ entries: XstreamEpgEntry[]; usedAction: string | null } | null> {
		for (const action of actionOrder) {
			const extraParams = action === 'get_short_epg' ? '&limit=200' : '';
			const url =
				`${baseUrl}/player_api.php?username=${encodeURIComponent(username)}` +
				`&password=${encodeURIComponent(password)}&action=${action}&stream_id=${streamId}${extraParams}`;

			const response = await fetch(url, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
				},
				signal: AbortSignal.timeout(30000)
			});

			if (!response.ok) {
				if (response.status === 400 || response.status === 404) {
					continue;
				}
				throw new Error(`HTTP ${response.status} on action ${action}`);
			}

			const data = await response.json();
			const entries = this.extractEpgEntries(data);
			return { entries, usedAction: action };
		}

		return null;
	}

	private extractEpgEntries(data: unknown): XstreamEpgEntry[] {
		if (Array.isArray(data)) {
			return data as XstreamEpgEntry[];
		}
		if (data && typeof data === 'object') {
			const record = data as Record<string, unknown>;
			if (Array.isArray(record.epg_listings)) {
				return record.epg_listings as XstreamEpgEntry[];
			}
			if (Array.isArray(record.listings)) {
				return record.listings as XstreamEpgEntry[];
			}
		}
		return [];
	}

	private parseEpgTime(value: number | string | undefined, isTimestamp: boolean): Date | null {
		if (value === undefined || value === null) return null;

		if (isTimestamp) {
			const parsed = Number(value);
			if (!Number.isFinite(parsed) || parsed <= 0) return null;
			const millis = parsed > 1_000_000_000_000 ? parsed : parsed * 1000;
			const date = new Date(millis);
			return Number.isNaN(date.getTime()) ? null : date;
		}

		const date = new Date(String(value));
		return Number.isNaN(date.getTime()) ? null : date;
	}

	private decodeMaybeBase64(value: string | undefined): string | null {
		if (!value) return null;
		const trimmed = value.trim();
		if (!trimmed) return null;

		if (!/^[A-Za-z0-9+/=]+$/.test(trimmed) || trimmed.length % 4 !== 0) {
			return trimmed;
		}

		try {
			const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
			return decoded || trimmed;
		} catch {
			return trimmed;
		}
	}

	private async makeAuthRequest(account: LiveTvAccount): Promise<XstreamAuthResponse> {
		const config = account.xstreamConfig;
		if (!config) {
			throw new Error('XStream config not found');
		}

		const baseUrl = config.baseUrl.replace(/\/$/, '');
		const url = `${baseUrl}/player_api.php?username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`;

		logger.debug('[XstreamProvider] Making auth request', { url: baseUrl });

		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
			}
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		return response.json();
	}

	private async fetchXstreamCategories(config: XstreamConfig): Promise<XstreamCategory[]> {
		const baseUrl = config.baseUrl.replace(/\/$/, '');
		const url = `${baseUrl}/player_api.php?username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}&action=get_live_categories`;

		logger.debug('[XstreamProvider] Fetching categories', { serverUrl: baseUrl });

		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
			}
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();
		return Array.isArray(data) ? data : [];
	}

	private async fetchXstreamStreams(config: XstreamConfig): Promise<XstreamStream[]> {
		const baseUrl = config.baseUrl.replace(/\/$/, '');
		const url = `${baseUrl}/player_api.php?username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}&action=get_live_streams`;

		logger.info(
			'[XstreamProvider] Fetching streams - this may take a while for large channel lists',
			{ serverUrl: baseUrl }
		);

		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
			}
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();
		return Array.isArray(data) ? data : [];
	}

	private async fetchXstreamStreamsByCategory(
		config: XstreamConfig,
		categoryId: string
	): Promise<XstreamStream[]> {
		const baseUrl = config.baseUrl.replace(/\/$/, '');
		const url = `${baseUrl}/player_api.php?username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}&action=get_live_streams&category_id=${categoryId}`;

		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
			}
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();
		return Array.isArray(data) ? data : [];
	}

	private generateAuthToken(account: LiveTvAccount): string {
		return `xstream_${account.id}_${Date.now()}`;
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
}

let xstreamProviderInstance: XstreamProvider | null = null;

export function getXstreamProvider(): XstreamProvider {
	if (!xstreamProviderInstance) {
		xstreamProviderInstance = new XstreamProvider();
	}
	return xstreamProviderInstance;
}
