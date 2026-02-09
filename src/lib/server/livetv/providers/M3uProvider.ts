/**
 * M3U Provider
 *
 * Implements the LiveTvProvider interface for M3U playlist sources.
 * Parses M3U playlists to extract channels and stream URLs.
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
import { XMLParser } from 'fast-xml-parser';
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
	M3uChannelData,
	M3uConfig
} from '$lib/types/livetv';

// Parsed M3U entry
interface M3uEntry {
	tvgId?: string;
	tvgName?: string;
	tvgLogo?: string;
	groupTitle?: string;
	name: string;
	url: string;
	attributes: Record<string, string>;
}

export class M3uProvider implements LiveTvProvider {
	readonly type = 'm3u';

	readonly capabilities: ProviderCapabilities = {
		supportsEpg: true, // Now supported via XMLTV
		supportsArchive: false,
		supportsCategories: true, // Via group-title
		requiresAuthentication: false,
		streamUrlExpires: false // M3U URLs are static
	};

	getDisplayName(): string {
		return 'M3U Playlist';
	}

	// ============================================================================
	// Authentication (M3U doesn't require auth)
	// ============================================================================

	async authenticate(_account: LiveTvAccount): Promise<AuthResult> {
		// M3U playlists don't require authentication
		return {
			success: true,
			token: 'm3u_no_auth_required'
		};
	}

	async testConnection(account: LiveTvAccount): Promise<LiveTvAccountTestResult> {
		try {
			const config = account.m3uConfig;
			if (!config) {
				return {
					success: false,
					error: 'M3U config not found'
				};
			}

			// Test by trying to fetch/parse the playlist
			let playlistContent: string;

			if (config.fileContent) {
				playlistContent = config.fileContent;
			} else if (config.url) {
				const fetchHeaders: Record<string, string> = {
					'User-Agent':
						config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
					...config.headers
				};
				const response = await fetch(config.url, {
					headers: fetchHeaders,
					signal: AbortSignal.timeout(30000)
				});

				if (!response.ok) {
					return {
						success: false,
						error: `Failed to fetch playlist: HTTP ${response.status}`
					};
				}

				playlistContent = await response.text();
			} else {
				return {
					success: false,
					error: 'No M3U URL or file content provided'
				};
			}

			// Try to parse
			const entries = this.parseM3u(playlistContent);

			return {
				success: true,
				profile: {
					playbackLimit: 0,
					channelCount: entries.length,
					categoryCount: new Set(entries.map((e) => e.groupTitle).filter(Boolean)).size,
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
		// M3U is always "authenticated" (no auth required)
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
			const config = account.m3uConfig;

			if (!config) {
				throw new Error('M3U config not found for account');
			}

			// Fetch or use playlist content
			let playlistContent: string;

			if (config.fileContent) {
				playlistContent = config.fileContent;
			} else if (config.url) {
				const fetchHeaders: Record<string, string> = {
					'User-Agent':
						config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
					...config.headers
				};
				const response = await fetch(config.url, {
					headers: fetchHeaders,
					signal: AbortSignal.timeout(30000)
				});

				if (!response.ok) {
					throw new Error(`Failed to fetch playlist: HTTP ${response.status}`);
				}

				playlistContent = await response.text();

				// Update last refresh time if auto-refresh is enabled
				if (config.autoRefresh) {
					await db
						.update(livetvAccounts)
						.set({
							m3uConfig: {
								...config,
								lastRefreshAt: new Date().toISOString()
							}
						})
						.where(eq(livetvAccounts.id, accountId));
				}
			} else {
				throw new Error('No M3U URL or file content provided');
			}

			// Parse M3U
			const entries = this.parseM3u(playlistContent);

			// Get existing categories
			const existingCategories = await db
				.select()
				.from(livetvCategories)
				.where(eq(livetvCategories.accountId, accountId));

			const categoryMap = new Map(existingCategories.map((c) => [c.title, c.id]));
			let categoriesAdded = 0;
			let categoriesUpdated = 0;

			// Create categories from group titles
			const groupTitles = [...new Set(entries.map((e) => e.groupTitle).filter(Boolean))];

			for (const title of groupTitles) {
				if (!title) continue;
				const existingId = categoryMap.get(title);

				if (existingId) {
					categoriesUpdated++;
				} else {
					const newId = randomUUID();
					await db.insert(livetvCategories).values({
						id: newId,
						accountId,
						providerType: 'm3u',
						externalId: title,
						title,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					});
					categoryMap.set(title, newId);
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
			for (let i = 0; i < entries.length; i++) {
				const entry = entries[i];
				const m3uData: M3uChannelData = {
					tvgId: entry.tvgId,
					tvgName: entry.tvgName,
					groupTitle: entry.groupTitle,
					url: entry.url,
					tvgLogo: entry.tvgLogo,
					attributes: entry.attributes
				};

				// Use tvg-id as external ID if available, otherwise generate from name
				const externalId = entry.tvgId || `m3u_${i}`;
				const categoryId = entry.groupTitle ? categoryMap.get(entry.groupTitle) : null;

				const existingId = channelMap.get(externalId);

				if (existingId) {
					await db
						.update(livetvChannels)
						.set({
							name: entry.name,
							logo: entry.tvgLogo,
							categoryId,
							providerCategoryId: entry.groupTitle || null,
							m3uData,
							updatedAt: new Date().toISOString()
						})
						.where(eq(livetvChannels.id, existingId));
					channelsUpdated++;
				} else {
					await db.insert(livetvChannels).values({
						id: randomUUID(),
						accountId,
						providerType: 'm3u',
						externalId,
						name: entry.name,
						logo: entry.tvgLogo,
						categoryId,
						providerCategoryId: entry.groupTitle || null,
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
					channelCount: entries.length,
					categoryCount: groupTitles.length,
					lastSyncAt: new Date().toISOString(),
					lastSyncError: null,
					syncStatus: 'success'
				})
				.where(eq(livetvAccounts.id, accountId));

			const duration = Date.now() - startTime;

			logger.info('[M3uProvider] Channel sync completed', {
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

			logger.error('[M3uProvider] Channel sync failed', { accountId, error: message });

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

			// Detect stream type from URL
			const type = this.detectStreamType(m3uData.url);

			// Build provider headers from M3U config (custom headers/user-agent)
			const config = account.m3uConfig;
			const headers = this.buildRequestHeaders(config);

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
	// EPG (Supported via XMLTV)
	// ============================================================================

	hasEpgSupport(): boolean {
		return true;
	}

	async fetchEpg(account: LiveTvAccount, startTime: Date, endTime: Date): Promise<EpgProgram[]> {
		try {
			const config = account.m3uConfig;
			if (!config?.epgUrl) {
				logger.debug('[M3uProvider] No EPG URL configured');
				return [];
			}

			// Fetch XMLTV data
			logger.info('[M3uProvider] Fetching XMLTV EPG', { epgUrl: config.epgUrl });

			const response = await fetch(config.epgUrl, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
				},
				signal: AbortSignal.timeout(60000) // 60s timeout for potentially large XML files
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch XMLTV: HTTP ${response.status}`);
			}

			const xmlContent = await response.text();

			if (!xmlContent || xmlContent.length === 0) {
				logger.warn('[M3uProvider] Empty XMLTV response');
				return [];
			}

			// Parse XMLTV
			const parser = new XMLParser({
				ignoreAttributes: false,
				attributeNamePrefix: '@_',
				textNodeName: '#text',
				parseAttributeValue: false,
				trimValues: true
			});

			const parsed = parser.parse(xmlContent);

			if (!parsed?.tv) {
				logger.warn('[M3uProvider] Invalid XMLTV format: no <tv> root element');
				return [];
			}

			// Get channels for this account to map tvg-id to our channel IDs
			const channels = await db
				.select()
				.from(livetvChannels)
				.where(eq(livetvChannels.accountId, account.id));

			// Build map of tvg-id to our channel ID
			const channelMap = new Map<string, { id: string; externalId: string }>();
			for (const channel of channels) {
				const m3uData = channel.m3uData;
				if (m3uData?.tvgId) {
					channelMap.set(m3uData.tvgId, { id: channel.id, externalId: channel.externalId });
				}
				// Also map by externalId as fallback
				channelMap.set(channel.externalId, { id: channel.id, externalId: channel.externalId });
			}

			// Parse programmes
			const programmes = Array.isArray(parsed.tv.programme)
				? parsed.tv.programme
				: parsed.tv.programme
					? [parsed.tv.programme]
					: [];

			const programs: EpgProgram[] = [];

			for (const prog of programmes) {
				try {
					const channelId = prog['@_channel'];
					if (!channelId) continue;

					// Find matching channel
					const channelInfo = channelMap.get(channelId);
					if (!channelInfo) continue;

					// Parse timestamps (XMLTV format: YYYYMMDDHHMMSS +TZ)
					const startStr = prog['@_start'];
					const stopStr = prog['@_stop'];

					if (!startStr || !stopStr) continue;

					const progStart = this.parseXmltvTime(startStr);
					const progEnd = this.parseXmltvTime(stopStr);

					if (!progStart || !progEnd) continue;

					// Filter by time range
					if (progStart < startTime || progStart > endTime) continue;

					// Extract program info
					const title = this.extractXmltvText(prog.title);
					const description = this.extractXmltvText(prog.desc);
					const category = this.extractXmltvText(prog.category);

					// Handle credits (director, actors)
					let director: string | null = null;
					let actor: string | null = null;

					if (prog.credits) {
						if (prog.credits.director) {
							director = this.extractXmltvText(prog.credits.director);
						}
						if (prog.credits.actor) {
							const actors = Array.isArray(prog.credits.actor)
								? prog.credits.actor.map((a: unknown) => this.extractXmltvText(a)).filter(Boolean)
								: [this.extractXmltvText(prog.credits.actor)];
							actor = actors.join(', ') || null;
						}
					}

					programs.push({
						id: randomUUID(),
						channelId: channelInfo.id,
						externalChannelId: channelInfo.externalId,
						accountId: account.id,
						providerType: 'm3u',
						title: title || 'Unknown',
						description,
						category,
						director,
						actor,
						startTime: progStart.toISOString(),
						endTime: progEnd.toISOString(),
						duration: Math.floor((progEnd.getTime() - progStart.getTime()) / 1000),
						hasArchive: false, // M3U doesn't support archive
						cachedAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					});
				} catch (_error) {
					// Skip malformed programmes
					continue;
				}
			}

			logger.info('[M3uProvider] XMLTV EPG parsed successfully', {
				accountId: account.id,
				programsFound: programs.length,
				channelsMatched: new Set(programs.map((p) => p.channelId)).size
			});

			return programs;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('[M3uProvider] EPG fetch failed', { accountId: account.id, error: message });
			return [];
		}
	}

	/**
	 * Parse XMLTV timestamp format: YYYYMMDDHHMMSS +HHMM or YYYYMMDDHHMMSS +HH:MM
	 */
	private parseXmltvTime(timeStr: string): Date | null {
		try {
			// XMLTV format: YYYYMMDDHHMMSS +HHMM or YYYYMMDDHHMMSS +HH:MM
			const match = timeStr.match(
				/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{2}):?(\d{2})?$/
			);
			if (!match) return null;

			const [, year, month, day, hour, minute, second, tzHour, tzMin] = match;

			// Create date in UTC
			const date = new Date(
				Date.UTC(
					parseInt(year),
					parseInt(month) - 1,
					parseInt(day),
					parseInt(hour),
					parseInt(minute),
					parseInt(second)
				)
			);

			// Apply timezone offset
			if (tzHour) {
				const tzOffsetHours = parseInt(tzHour);
				const tzOffsetMinutes = parseInt(tzMin || '0');
				const totalOffsetMinutes =
					tzOffsetHours * 60 + (tzOffsetHours < 0 ? -tzOffsetMinutes : tzOffsetMinutes);
				date.setUTCMinutes(date.getUTCMinutes() - totalOffsetMinutes);
			}

			return date;
		} catch {
			return null;
		}
	}

	/**
	 * Extract text from XMLTV text element (handles both string and object formats)
	 */
	private extractXmltvText(value: unknown): string | null {
		if (!value) return null;
		if (typeof value === 'string') return value;
		if (typeof value === 'object' && value !== null) {
			if ('#text' in value) {
				return String((value as Record<string, unknown>)['#text']);
			}
			// If it's an array, take the first element
			if (Array.isArray(value) && value.length > 0) {
				return this.extractXmltvText(value[0]);
			}
		}
		return null;
	}

	// ============================================================================
	// Archive (Not supported by M3U)
	// ============================================================================

	supportsArchive(): boolean {
		return false;
	}

	// ============================================================================
	// Private Helpers
	// ============================================================================

	private parseM3u(content: string): M3uEntry[] {
		const entries: M3uEntry[] = [];
		const lines = content.split('\n');

		let currentAttrs: Record<string, string> = {};
		let currentName = '';

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();

			if (line.startsWith('#EXTINF:')) {
				// Parse EXTINF line
				const match = line.match(/#EXTINF:([^,]*),(.*)/);
				if (match) {
					const attrsString = match[1];
					currentName = match[2].trim();

					// Parse attributes
					currentAttrs = {};
					const attrRegex = /(\w+)="([^"]*)"/g;
					let attrMatch;
					while ((attrMatch = attrRegex.exec(attrsString)) !== null) {
						currentAttrs[attrMatch[1]] = attrMatch[2];
					}
				}
			} else if (line && !line.startsWith('#')) {
				// This is a URL line
				entries.push({
					tvgId: currentAttrs['tvg-id'],
					tvgName: currentAttrs['tvg-name'],
					tvgLogo: currentAttrs['tvg-logo'],
					groupTitle: currentAttrs['group-title'],
					name: currentName || 'Unknown',
					url: line,
					attributes: { ...currentAttrs }
				});

				// Reset for next entry
				currentAttrs = {};
				currentName = '';
			}
		}

		return entries;
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

	/**
	 * Build request headers from M3U config (custom headers + user agent)
	 */
	private buildRequestHeaders(config?: M3uConfig): Record<string, string> {
		const headers: Record<string, string> = {};
		if (config?.userAgent) {
			headers['User-Agent'] = config.userAgent;
		}
		if (config?.headers) {
			Object.assign(headers, config.headers);
		}
		return headers;
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

// Singleton instance
let m3uProviderInstance: M3uProvider | null = null;

export function getM3uProvider(): M3uProvider {
	if (!m3uProviderInstance) {
		m3uProviderInstance = new M3uProvider();
	}
	return m3uProviderInstance;
}
