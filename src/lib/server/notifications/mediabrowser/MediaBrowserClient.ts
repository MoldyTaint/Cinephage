/**
 * Media server notification client.
 *
 * Jellyfin and Emby share the MediaBrowser API. Plex uses a different API and
 * falls back to library refresh requests instead of per-file update payloads.
 */

import { XMLParser } from 'fast-xml-parser';
import path from 'node:path';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ logDomain: 'system' as const });
import type {
	MediaBrowserPathMapping,
	MediaBrowserServerType,
	MediaBrowserTestResult,
	LibraryUpdatePayload,
	MediaBrowserSystemInfo,
	PlexIdentityInfo,
	PlexLibraryLocation
} from './types';

const XML_PARSER = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '',
	parseTagValue: false
});

export interface MediaBrowserClientConfig {
	host: string;
	apiKey: string;
	serverType: MediaBrowserServerType;
}

export class MediaBrowserClient {
	private readonly host: string;
	private readonly apiKey: string;
	private readonly serverType: MediaBrowserServerType;

	constructor(config: MediaBrowserClientConfig) {
		// Normalize host - remove trailing slash
		this.host = config.host.replace(/\/+$/, '');
		this.apiKey = config.apiKey;
		this.serverType = config.serverType;
	}

	/**
	 * Test connection to the MediaBrowser server
	 */
	async test(): Promise<MediaBrowserTestResult> {
		try {
			if (this.serverType === 'plex') {
				return await this.testPlex();
			}

			const response = await this.requestMediaBrowser('/System/Info');

			if (!response.ok) {
				if (response.status === 401) {
					return { success: false, error: 'Invalid API key' };
				}
				return {
					success: false,
					error: `Server returned ${response.status}: ${response.statusText}`
				};
			}

			const data = (await response.json()) as MediaBrowserSystemInfo;

			return {
				success: true,
				serverInfo: {
					serverName: data.ServerName,
					version: data.Version,
					id: data.Id
				}
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			if (message.includes('ECONNREFUSED')) {
				return { success: false, error: 'Connection refused - is the server running?' };
			}
			if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
				return { success: false, error: 'Host not found - check the server address' };
			}
			if (message.includes('ETIMEDOUT')) {
				return { success: false, error: 'Connection timed out' };
			}

			return { success: false, error: message };
		}
	}

	private async testPlex(): Promise<MediaBrowserTestResult> {
		const response = await this.requestPlex('/');

		if (!response.ok) {
			if (response.status === 401) {
				return { success: false, error: 'Invalid Plex token' };
			}

			return {
				success: false,
				error: `Server returned ${response.status}: ${response.statusText}`
			};
		}

		const data = this.parsePlexIdentity(await response.text());

		return {
			success: true,
			serverInfo: {
				serverName: data.friendlyName ?? 'Plex',
				version: data.version ?? 'unknown',
				id: data.machineIdentifier ?? 'unknown'
			}
		};
	}

	/**
	 * Notify the server about library updates
	 */
	async notifyLibraryUpdate(payload: LibraryUpdatePayload): Promise<void> {
		if (this.serverType === 'plex') {
			await this.notifyPlexLibraryUpdate(payload);
			return;
		}

		try {
			const response = await this.requestMediaBrowser('/Library/Media/Updated', {
				method: 'POST',
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				logger.warn(
					{
						serverType: this.serverType,
						status: response.status,
						statusText: response.statusText
					},
					'MediaBrowser library update failed'
				);
			} else {
				logger.debug(
					{
						serverType: this.serverType,
						updates: payload.Updates.length
					},
					'MediaBrowser library update sent'
				);
			}
		} catch (error) {
			logger.error(
				{
					serverType: this.serverType,
					error: error instanceof Error ? error.message : String(error)
				},
				'MediaBrowser library update error'
			);
		}
	}

	private async notifyPlexLibraryUpdate(payload: LibraryUpdatePayload): Promise<void> {
		const paths = [
			...new Set(
				payload.Updates.map((update) => update.Path)
					.filter(Boolean)
					.map((updatePath) => this.getPlexRefreshPath(updatePath))
			)
		];

		if (paths.length === 0) {
			return;
		}

		try {
			const sections = await this.getPlexLibraryLocations();
			const refreshedSectionIds = new Set<string>();
			let refreshedAny = false;

			for (const path of paths) {
				const matchingSections = sections.filter(
					(section) =>
						this.pathContains(section.path, path) || this.pathContains(path, section.path)
				);

				if (matchingSections.length === 0) {
					logger.debug('Plex library refresh found no matching section', {
						path,
						knownSections: sections.map((section) => section.path)
					});
					continue;
				}

				for (const section of matchingSections) {
					const refreshPath = `${this.host}/library/sections/${encodeURIComponent(section.id)}/refresh?path=${encodeURIComponent(path)}`;
					const response = await this.requestPlex(refreshPath, { method: 'POST' }, true);

					if (response.ok) {
						refreshedAny = true;
						refreshedSectionIds.add(section.id);
						logger.debug('Plex library refresh triggered', {
							sectionId: section.id,
							sectionPath: section.path,
							refreshPath: path
						});
					} else {
						logger.warn('Plex library refresh failed', {
							status: response.status,
							statusText: response.statusText,
							path,
							sectionId: section.id
						});
					}
				}
			}

			if (!refreshedAny && refreshedSectionIds.size === 0) {
				logger.debug('Plex library refresh falling back to full refresh', {
					paths
				});
				await this.refreshLibrary();
			}
		} catch (error) {
			logger.error('Plex library update error', {
				error: error instanceof Error ? error.message : String(error)
			});
			await this.refreshLibrary();
		}
	}

	/**
	 * Trigger a full library refresh (fallback)
	 */
	async refreshLibrary(): Promise<void> {
		try {
			const response =
				this.serverType === 'plex'
					? await this.requestPlex('/library/sections/all/refresh', { method: 'POST' })
					: await this.requestMediaBrowser('/Library/Refresh', {
							method: 'POST'
						});

			if (!response.ok) {
				logger.warn(
					{
						serverType: this.serverType,
						status: response.status
					},
					'Media server library refresh failed'
				);
			} else {
				logger.debug(
					{
						serverType: this.serverType
					},
					'Media server library refresh triggered'
				);
			}
		} catch (error) {
			logger.error(
				{
					serverType: this.serverType,
					error: error instanceof Error ? error.message : String(error)
				},
				'Media server library refresh error'
			);
		}
	}

	/**
	 * Make an HTTP request to a Jellyfin/Emby server.
	 */
	private async requestMediaBrowser(path: string, options: RequestInit = {}): Promise<Response> {
		const url = `${this.host}${path}`;

		const headers = new Headers(options.headers);
		headers.set('X-MediaBrowser-Token', this.apiKey);
		headers.set('Accept', 'application/json');

		if (options.body) {
			headers.set('Content-Type', 'application/json');
		}

		return fetch(url, {
			...options,
			headers,
			signal: AbortSignal.timeout(10000) // 10 second timeout
		});
	}

	/**
	 * Make an HTTP request to a Plex server.
	 */
	private async requestPlex(
		pathOrUrl: string,
		options: RequestInit = {},
		isAbsoluteUrl = false
	): Promise<Response> {
		const url = isAbsoluteUrl ? pathOrUrl : `${this.host}${pathOrUrl}`;
		const headers = new Headers(options.headers);
		headers.set('X-Plex-Token', this.apiKey);
		headers.set('Accept', 'application/xml');

		return fetch(url, {
			...options,
			headers,
			signal: AbortSignal.timeout(10000)
		});
	}

	private parsePlexIdentity(xml: string): PlexIdentityInfo {
		const parsed = XML_PARSER.parse(xml) as {
			MediaContainer?: PlexIdentityInfo;
		};

		return parsed.MediaContainer ?? {};
	}

	private async getPlexLibraryLocations(): Promise<PlexLibraryLocation[]> {
		const response = await this.requestPlex('/library/sections');

		if (!response.ok) {
			throw new Error(`Plex library lookup failed: ${response.status} ${response.statusText}`);
		}

		const parsed = XML_PARSER.parse(await response.text()) as {
			MediaContainer?: {
				Directory?:
					| Array<{
							key?: string;
							Location?: { path?: string } | Array<{ path?: string }>;
					  }>
					| {
							key?: string;
							Location?: { path?: string } | Array<{ path?: string }>;
					  };
			};
		};

		const sections = this.asArray(parsed.MediaContainer?.Directory);
		const locations: PlexLibraryLocation[] = [];

		for (const section of sections) {
			const sectionId = section.key;
			if (!sectionId) continue;

			for (const location of this.asArray(section.Location)) {
				if (location?.path) {
					locations.push({ id: sectionId, path: location.path });
				}
			}
		}

		return locations;
	}

	private asArray<T>(value: T | T[] | undefined): T[] {
		if (!value) return [];
		return Array.isArray(value) ? value : [value];
	}

	private pathContains(basePath: string, candidatePath: string): boolean {
		const normalizedBase = this.normalizePath(basePath);
		const normalizedCandidate = this.normalizePath(candidatePath);
		return (
			normalizedCandidate === normalizedBase || normalizedCandidate.startsWith(`${normalizedBase}/`)
		);
	}

	private normalizePath(path: string): string {
		return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
	}

	private getPlexRefreshPath(mediaPath: string): string {
		const normalized = mediaPath.replace(/\\/g, '/');
		return path.posix.dirname(normalized);
	}

	/**
	 * Map a local path to a remote path using the configured mappings
	 */
	static mapPath(localPath: string, mappings: MediaBrowserPathMapping[] | null): string {
		if (!mappings || mappings.length === 0) {
			return localPath;
		}

		// Normalize the local path
		const normalizedLocal = localPath.replace(/\/+$/, '');

		for (const mapping of mappings) {
			const normalizedFrom = mapping.localPath.replace(/\/+$/, '');

			if (normalizedLocal.startsWith(normalizedFrom)) {
				const relativePath = normalizedLocal.slice(normalizedFrom.length);
				const normalizedTo = mapping.remotePath.replace(/\/+$/, '');
				return normalizedTo + relativePath;
			}
		}

		// No mapping matched, return original path
		return localPath;
	}
}
