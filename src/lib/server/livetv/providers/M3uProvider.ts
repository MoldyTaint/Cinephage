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
import { gunzip } from 'zlib';
import { promisify } from 'util';
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

const gunzipAsync = promisify(gunzip);

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

interface ParsedM3u {
	entries: M3uEntry[];
	headerEpgUrl: string | null;
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
			const parsed = this.parseM3u(playlistContent);
			const entries = parsed.entries;

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
			let fetchedFromUrl = false;

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
				fetchedFromUrl = true;
			} else {
				throw new Error('No M3U URL or file content provided');
			}

			// Parse M3U
			const parsed = this.parseM3u(playlistContent);
			const entries = parsed.entries;

			// If EPG URL wasn't configured, try to derive it from the #EXTM3U header.
			const derivedEpgUrl = !config.epgUrl ? parsed.headerEpgUrl : null;
			if ((fetchedFromUrl && config.autoRefresh) || derivedEpgUrl) {
				const now = new Date().toISOString();
				const nextConfig: M3uConfig = {
					...config,
					...(fetchedFromUrl && config.autoRefresh ? { lastRefreshAt: now } : {}),
					...(derivedEpgUrl ? { epgUrl: derivedEpgUrl } : {})
				};

				await db
					.update(livetvAccounts)
					.set({
						m3uConfig: nextConfig,
						updatedAt: now
					})
					.where(eq(livetvAccounts.id, accountId));

				if (derivedEpgUrl) {
					logger.info('[M3uProvider] Derived EPG URL from playlist header', {
						accountId,
						epgUrl: derivedEpgUrl
					});
				}
			}

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
			let duplicateTvgIdCount = 0;
			const tvgIdSeenCount = new Map<string, number>();

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

				const normalizedTvgId = entry.tvgId?.trim();
				let externalId: string;
				if (normalizedTvgId) {
					const seenCount = tvgIdSeenCount.get(normalizedTvgId) ?? 0;
					tvgIdSeenCount.set(normalizedTvgId, seenCount + 1);
					if (seenCount === 0) {
						externalId = normalizedTvgId;
					} else {
						duplicateTvgIdCount++;
						// Keep IDs deterministic across sync runs for duplicate tvg-id entries.
						externalId = `${normalizedTvgId}__${seenCount + 1}`;
					}
				} else {
					// Preserve legacy fallback behavior for playlists with no tvg-id.
					externalId = `m3u_${i}`;
				}
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
					const newId = randomUUID();
					await db.insert(livetvChannels).values({
						id: newId,
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
					channelMap.set(externalId, newId);
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
				duplicateTvgIdCount,
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
			if (!config) {
				logger.debug('[M3uProvider] No M3U config found');
				return [];
			}

			let epgUrl = config.epgUrl;

			if (!epgUrl) {
				let playlistContent: string | null = null;

				if (config.fileContent) {
					playlistContent = config.fileContent;
				} else if (config.url) {
					try {
						const fetchHeaders: Record<string, string> = {
							'User-Agent':
								config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
							...config.headers
						};
						const response = await fetch(config.url, {
							headers: fetchHeaders,
							signal: AbortSignal.timeout(30000)
						});
						if (response.ok) {
							playlistContent = await response.text();
						}
					} catch {
						// Ignore playlist fetch errors here and fall back to "no epg url"
					}
				}

				if (playlistContent) {
					const parsed = this.parseM3u(playlistContent);
					epgUrl = parsed.headerEpgUrl ?? undefined;
				}

				if (epgUrl) {
					await db
						.update(livetvAccounts)
						.set({
							m3uConfig: {
								...config,
								epgUrl
							},
							updatedAt: new Date().toISOString()
						})
						.where(eq(livetvAccounts.id, account.id));

					logger.info('[M3uProvider] Derived EPG URL from playlist for EPG sync', {
						accountId: account.id,
						epgUrl
					});
				}
			}

			if (!epgUrl) {
				logger.debug('[M3uProvider] No EPG URL configured');
				return [];
			}

			// Fetch XMLTV data
			logger.info('[M3uProvider] Fetching XMLTV EPG', { epgUrl });

			const response = await fetch(epgUrl, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
				},
				signal: AbortSignal.timeout(60000) // 60s timeout for potentially large XML files
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch XMLTV: HTTP ${response.status}`);
			}

			const xmlContent = await this.readXmltvContent(response, epgUrl);

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

			// Build map of XMLTV channel IDs -> one or more of our channels.
			const channelMap = new Map<string, Map<string, { id: string; externalId: string }>>();
			const addChannelMapEntry = (
				xmltvChannelId: string | undefined,
				channelInfo: { id: string; externalId: string }
			) => {
				if (!xmltvChannelId) return;
				const key = xmltvChannelId.trim();
				if (!key) return;
				if (!channelMap.has(key)) {
					channelMap.set(key, new Map());
				}
				channelMap.get(key)!.set(channelInfo.id, channelInfo);
			};

			for (const channel of channels) {
				const channelInfo = { id: channel.id, externalId: channel.externalId };
				const m3uData = channel.m3uData;
				addChannelMapEntry(m3uData?.tvgId, channelInfo);
				// Fallback map by externalId for playlists where XMLTV channel uses external IDs.
				addChannelMapEntry(channel.externalId, channelInfo);
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
					const xmltvChannelId = prog['@_channel']?.toString().trim();
					if (!xmltvChannelId) continue;

					// Find matching channels (can be multiple when tvg-id is duplicated in playlist).
					const channelInfos = channelMap.get(xmltvChannelId);
					if (!channelInfos || channelInfos.size === 0) continue;

					// Parse timestamps (XMLTV format: YYYYMMDDHHMMSS +TZ)
					const startStr = prog['@_start'];
					const stopStr = prog['@_stop'];

					if (!startStr || !stopStr) continue;

					const progStart = this.parseXmltvTime(startStr);
					const progEnd = this.parseXmltvTime(stopStr);

					if (!progStart || !progEnd) continue;

					// Keep any programme that overlaps the requested window.
					if (progEnd < startTime || progStart > endTime) continue;

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

					for (const channelInfo of channelInfos.values()) {
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
					}
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

	/**
	 * Read XMLTV response body, transparently handling gzip payloads (.gz).
	 */
	private async readXmltvContent(response: Response, epgUrl: string): Promise<string> {
		const raw = new Uint8Array(await response.arrayBuffer());
		if (raw.length === 0) {
			return '';
		}

		const hasGzipMagic = raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b;
		const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
		const hasGzipMetadata =
			contentType.includes('application/gzip') ||
			contentType.includes('application/x-gzip') ||
			/\.gz(?:$|[?#])/i.test(epgUrl);

		let xmlBuffer = Buffer.from(raw);

		if (hasGzipMagic) {
			try {
				xmlBuffer = await gunzipAsync(xmlBuffer);
				logger.debug('[M3uProvider] Decompressed gzip XMLTV payload', {
					epgUrl,
					compressedBytes: raw.length,
					uncompressedBytes: xmlBuffer.length
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`Failed to decompress XMLTV gzip payload: ${message}`, { cause: error });
			}
		} else if (hasGzipMetadata) {
			// Some servers auto-decompress despite .gz URLs/content-types.
			logger.debug('[M3uProvider] XMLTV marked as gzip but response was plain text', { epgUrl });
		}

		let xmlContent = xmlBuffer.toString('utf-8');
		if (xmlContent.charCodeAt(0) === 0xfeff) {
			xmlContent = xmlContent.slice(1);
		}

		return xmlContent;
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

	private parseM3u(content: string): ParsedM3u {
		const entries: M3uEntry[] = [];
		const lines = content.split('\n');
		let headerEpgUrl: string | null = null;

		let currentAttrs: Record<string, string> = {};
		let currentName = '';

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();

			if (line.startsWith('#EXTM3U')) {
				const headerAttrs = this.parseM3uAttributes(line.slice('#EXTM3U'.length));
				headerEpgUrl = this.extractHeaderEpgUrl(headerAttrs);
				continue;
			}

			if (line.startsWith('#EXTINF:')) {
				// Parse EXTINF line
				const match = line.match(/#EXTINF:([^,]*),(.*)/);
				if (match) {
					const attrsString = match[1];
					currentName = match[2].trim();

					// Parse attributes
					currentAttrs = this.parseM3uAttributes(attrsString);
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

		return { entries, headerEpgUrl };
	}

	private parseM3uAttributes(attributesString: string): Record<string, string> {
		const attributes: Record<string, string> = {};
		const attrRegex = /([A-Za-z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
		let attrMatch: RegExpExecArray | null;

		while ((attrMatch = attrRegex.exec(attributesString)) !== null) {
			const key = attrMatch[1].toLowerCase();
			const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
			attributes[key] = value;
		}

		return attributes;
	}

	private extractHeaderEpgUrl(attributes: Record<string, string>): string | null {
		const raw = attributes['x-tvg-url'] ?? attributes['url-tvg'] ?? attributes['tvg-url'];
		if (!raw) return null;

		for (const candidateRaw of raw.split(',')) {
			const candidate = candidateRaw.trim();
			if (!candidate) continue;
			try {
				return new URL(candidate).toString();
			} catch {
				// Try next candidate
			}
		}

		return null;
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
