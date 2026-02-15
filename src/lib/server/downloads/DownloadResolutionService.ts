/**
 * DownloadResolutionService
 *
 * Resolves release download URLs to actual torrent data or magnet links.
 * Following the Radarr/Prowlarr pattern, this service fetches torrent files
 * server-side through the indexer (with proper auth/cookies) and extracts
 * info hashes, rather than passing raw URLs directly to download clients.
 */

import { getIndexerManager } from '$lib/server/indexers/IndexerManager';
import {
	parseTorrentFile,
	extractInfoHashFromMagnet,
	buildMagnetFromInfoHash
} from '$lib/server/downloadClients/utils/torrentParser';
import { createChildLogger } from '$lib/logging';
import { redactUrl } from '$lib/server/utils/urlSecurity';

const logger = createChildLogger({ module: 'DownloadResolutionService' });

/**
 * Input for resolving a download.
 */
export interface ResolveDownloadInput {
	/** Download URL (torrent file URL) */
	downloadUrl?: string | null;
	/** Magnet URL if already known */
	magnetUrl?: string | null;
	/** Info hash if already known */
	infoHash?: string | null;
	/** Indexer ID that provided the release */
	indexerId?: string | null;
	/** Release title (for building magnet links) */
	title: string;
	/** URL to the release details/comments page (needed by some indexers for download resolution) */
	commentsUrl?: string | null;
}

/**
 * Result of resolving a download.
 */
export interface ResolvedDownload {
	/** Whether resolution was successful */
	success: boolean;
	/** Magnet URL to use (preferred for download clients) */
	magnetUrl?: string;
	/** Torrent file data (alternative to magnet) */
	torrentFile?: Buffer;
	/** Info hash (always extracted if possible) */
	infoHash?: string;
	/** Error message if resolution failed */
	error?: string;
	/** Whether we fell back to original URL */
	usedFallback?: boolean;
}

/**
 * Service for resolving download URLs to actual download data.
 */
class DownloadResolutionService {
	/**
	 * Resolve a release to downloadable data (magnet or torrent file).
	 *
	 * Resolution priority:
	 * 1. If magnetUrl is provided, extract infoHash and use it
	 * 2. If infoHash is provided (but no magnet), build a magnet URL
	 * 3. If only downloadUrl is provided, fetch through indexer to get torrent/magnet
	 *
	 * @param input - Release download info
	 * @returns Resolved download with magnet URL or torrent file
	 */
	async resolve(input: ResolveDownloadInput): Promise<ResolvedDownload> {
		const { downloadUrl, magnetUrl, infoHash, indexerId, title, commentsUrl } = input;

		logger.debug('Resolving download', {
			title,
			hasMagnetUrl: !!magnetUrl,
			hasDownloadUrl: !!downloadUrl,
			hasInfoHash: !!infoHash,
			indexerId
		});

		// Strategy 1: Use existing magnet URL
		if (magnetUrl) {
			const extractedHash = (await extractInfoHashFromMagnet(magnetUrl)) || infoHash || undefined;
			logger.debug('Using provided magnet URL', { infoHash: extractedHash });
			return {
				success: true,
				magnetUrl,
				infoHash: extractedHash
			};
		}

		// Strategy 2: Build magnet from info hash
		if (infoHash) {
			const builtMagnet = buildMagnetFromInfoHash(infoHash, title);
			logger.debug('Built magnet from infoHash', { infoHash });
			return {
				success: true,
				magnetUrl: builtMagnet,
				infoHash
			};
		}

		// Strategy 3: Fetch torrent file through indexer
		if (downloadUrl && indexerId) {
			return this.fetchThroughIndexer(downloadUrl, indexerId, title, commentsUrl ?? undefined);
		}

		// Strategy 4: Fallback - return the URL as-is and let download client handle it
		// This is not ideal but maintains backwards compatibility
		if (downloadUrl) {
			logger.warn('No indexer available, using downloadUrl as fallback', {
				title,
				downloadUrl: redactUrl(downloadUrl)
			});

			// Check if downloadUrl is already a magnet
			if (downloadUrl.startsWith('magnet:')) {
				const extractedHash = await extractInfoHashFromMagnet(downloadUrl);
				return {
					success: true,
					magnetUrl: downloadUrl,
					infoHash: extractedHash,
					usedFallback: true
				};
			}

			// Return as downloadUrl (download client will try to fetch it)
			return {
				success: true,
				magnetUrl: downloadUrl, // Not actually a magnet, but we pass it through
				usedFallback: true
			};
		}

		return {
			success: false,
			error: 'No download URL, magnet URL, or info hash provided'
		};
	}

	/**
	 * Fetch a torrent file through the indexer with proper authentication.
	 */
	private async fetchThroughIndexer(
		downloadUrl: string,
		indexerId: string,
		title: string,
		commentsUrl?: string
	): Promise<ResolvedDownload> {
		logger.debug('Fetching torrent through indexer', {
			indexerId,
			url: redactUrl(downloadUrl)
		});

		try {
			const indexerManager = await getIndexerManager();
			const indexer = await indexerManager.getIndexerInstance(indexerId);

			if (!indexer) {
				logger.warn('Indexer not found, falling back to direct download', { indexerId });
				return this.fetchDirectly(downloadUrl, title);
			}

			// Check if indexer supports downloadTorrent method
			if (!indexer.downloadTorrent) {
				logger.warn('Indexer does not support downloadTorrent, falling back to direct download', {
					indexerId
				});
				return this.fetchDirectly(downloadUrl, title);
			}

			// Use the indexer's downloadTorrent method
			const result = await indexer.downloadTorrent(downloadUrl, {
				releaseDetailsUrl: commentsUrl
			});

			if (!result.success) {
				logger.warn('Indexer download failed, trying direct fetch', {
					indexerId,
					error: result.error
				});
				return this.fetchDirectly(downloadUrl, title);
			}

			// If we got a magnet URL back (redirect)
			if (result.magnetUrl) {
				logger.debug('Indexer returned magnet URL', { infoHash: result.infoHash });
				return {
					success: true,
					magnetUrl: result.magnetUrl,
					infoHash: result.infoHash
				};
			}

			// If we got torrent file data
			if (result.data) {
				// Build magnet from the info hash so we can use it with download clients
				// Most download clients prefer magnet URLs over torrent files
				if (result.infoHash) {
					const magnet = buildMagnetFromInfoHash(result.infoHash, title);
					logger.debug('Built magnet from fetched torrent', { infoHash: result.infoHash });
					return {
						success: true,
						magnetUrl: magnet,
						torrentFile: result.data,
						infoHash: result.infoHash
					};
				}

				// No info hash extracted, return just the torrent file
				return {
					success: true,
					torrentFile: result.data,
					infoHash: result.infoHash
				};
			}

			return {
				success: false,
				error: 'Indexer returned empty result'
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('Failed to fetch through indexer', { error: message, indexerId });

			// Try direct fetch as fallback
			return this.fetchDirectly(downloadUrl, title);
		}
	}

	/**
	 * Fetch a torrent file directly (without indexer authentication).
	 * Used as a fallback when indexer is unavailable.
	 */
	private async fetchDirectly(downloadUrl: string, title: string): Promise<ResolvedDownload> {
		logger.debug('Fetching torrent directly', { url: redactUrl(downloadUrl) });

		// Check if it's already a magnet
		if (downloadUrl.startsWith('magnet:')) {
			const infoHash = await extractInfoHashFromMagnet(downloadUrl);
			return {
				success: true,
				magnetUrl: downloadUrl,
				infoHash,
				usedFallback: true
			};
		}

		try {
			const maxRedirects = 5;
			let currentUrl = downloadUrl;

			for (let i = 0; i < maxRedirects; i++) {
				const response = await fetch(currentUrl, {
					method: 'GET',
					headers: {
						Accept: 'application/x-bittorrent, */*',
						'User-Agent': 'Cinephage/1.0'
					},
					redirect: 'manual'
				});

				// Handle redirects
				if (
					response.status === 301 ||
					response.status === 302 ||
					response.status === 303 ||
					response.status === 307 ||
					response.status === 308
				) {
					const location = response.headers.get('location');
					if (!location) {
						return { success: false, error: 'Redirect without location', usedFallback: true };
					}

					if (location.startsWith('magnet:')) {
						const infoHash = await extractInfoHashFromMagnet(location);
						return {
							success: true,
							magnetUrl: location,
							infoHash,
							usedFallback: true
						};
					}

					currentUrl = new URL(location, currentUrl).toString();
					continue;
				}

				if (!response.ok) {
					return {
						success: false,
						error: `HTTP ${response.status}: ${response.statusText}`,
						usedFallback: true
					};
				}

				const data = Buffer.from(await response.arrayBuffer());
				const parseResult = await parseTorrentFile(data);

				if (!parseResult.success) {
					return {
						success: false,
						error: parseResult.error || 'Failed to parse torrent',
						usedFallback: true
					};
				}

				if (parseResult.magnetUrl) {
					return {
						success: true,
						magnetUrl: parseResult.magnetUrl,
						infoHash: parseResult.infoHash,
						usedFallback: true
					};
				}

				if (parseResult.infoHash) {
					const magnet = buildMagnetFromInfoHash(parseResult.infoHash, title);
					return {
						success: true,
						magnetUrl: magnet,
						torrentFile: data,
						infoHash: parseResult.infoHash,
						usedFallback: true
					};
				}

				return {
					success: true,
					torrentFile: data,
					usedFallback: true
				};
			}

			return { success: false, error: 'Too many redirects', usedFallback: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error('Direct fetch failed', { error: message });
			return { success: false, error: message, usedFallback: true };
		}
	}
}

// Singleton instance
let serviceInstance: DownloadResolutionService | null = null;

/**
 * Get the DownloadResolutionService singleton.
 */
export function getDownloadResolutionService(): DownloadResolutionService {
	if (!serviceInstance) {
		serviceInstance = new DownloadResolutionService();
	}
	return serviceInstance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetDownloadResolutionService(): void {
	serviceInstance = null;
}
