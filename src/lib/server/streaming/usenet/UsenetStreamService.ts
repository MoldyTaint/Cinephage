/**
 * UsenetStreamService - Main orchestrator for usenet streaming.
 *
 * Coordinates:
 * - Mount management
 * - Stream lifecycle
 * - NZB parsing and caching
 * - Streamability checks (RAR detection)
 * - Clean resource cleanup
 */

import { createReadStream, existsSync, statSync } from 'fs';
import { basename } from 'path';
import { logger } from '$lib/logging';
import { getNntpManager } from './NntpManager';
import { parseNzb, isRarOnlyNzb, getBestStreamableFile } from './NzbParser';
import { UsenetSeekableStream } from './UsenetSeekableStream';
import {
	type ParsedNzb,
	type CreateStreamResult,
	type ByteRange,
	getContentType,
	parseRangeHeader
} from './types';

// Forward mount manager imports from old location for compatibility
import { getNzbMountManager, type MountInfo } from '../nzb/NzbMountManager';

/**
 * Cached parsed NZB.
 */
interface CachedNzb {
	parsed: ParsedNzb;
	timestamp: number;
}

/**
 * Track active streams per mount for cleanup.
 */
interface MountStreamState {
	activeCount: number;
	cleanupTimer: ReturnType<typeof setTimeout> | null;
	hasExtractedFile: boolean;
}

/**
 * Streamability check result.
 * Compatible with StreamabilityInfo from NzbMountManager.
 */
export interface StreamabilityResult {
	canStream: boolean;
	requiresExtraction: boolean;
	archiveType?: 'rar' | '7z' | 'zip' | 'none';
	error?: string;
	estimatedSize?: number;
}

/**
 * NZB cache TTL (1 hour).
 */
const NZB_CACHE_TTL = 60 * 60 * 1000;

/**
 * Delay before cleanup after streams end (2 minutes).
 */
const STREAM_CLEANUP_DELAY_MS = 2 * 60 * 1000;

/**
 * UsenetStreamService manages streaming operations.
 */
class UsenetStreamService {
	private nzbCache: Map<string, CachedNzb> = new Map();
	private cleanupInterval: ReturnType<typeof setInterval> | null = null;
	private mountStreamStates: Map<string, MountStreamState> = new Map();

	constructor() {
		// Periodic cache cleanup
		this.cleanupInterval = setInterval(() => this.cleanupCache(), 5 * 60 * 1000);
	}

	/**
	 * Create a stream for a mount file.
	 */
	async createStream(
		mountId: string,
		fileIndex: number,
		rangeHeader: string | null
	): Promise<CreateStreamResult> {
		const mountManager = getNzbMountManager();
		const nntpManager = getNntpManager();

		// Get mount info
		const mount = await mountManager.getMount(mountId);
		if (!mount) {
			throw new Error(`Mount not found: ${mountId}`);
		}

		// Check if we have an extracted file ready to stream
		const extractedFilePath = await this.getExtractedFilePath(mountId);
		if (extractedFilePath && existsSync(extractedFilePath)) {
			logger.info('[UsenetStreamService] Streaming from extracted file', {
				mountId,
				extractedFilePath
			});
			return this.createExtractedFileStream(mountId, extractedFilePath, rangeHeader);
		}

		// Check mount status
		if (mount.status === 'requires_extraction') {
			throw new Error(
				'This release contains only RAR files and cannot be streamed directly. Please search for a different release or extract the content first.'
			);
		}

		if (mount.status === 'downloading' || mount.status === 'extracting') {
			throw new Error(`Extraction in progress: ${mount.status}`);
		}

		if (mount.status !== 'ready') {
			throw new Error(`Mount not ready: ${mount.status}`);
		}

		// Get parsed NZB
		const parsed = await this.getParsedNzb(mount);

		// Check if RAR-only (should have been caught earlier, but double-check)
		if (isRarOnlyNzb(parsed)) {
			throw new Error(
				'This release contains only RAR files and cannot be streamed directly. Please search for a different release.'
			);
		}

		// Get the file to stream
		const file = parsed.files.find((f) => f.index === fileIndex);
		if (!file) {
			throw new Error(`File not found at index ${fileIndex}`);
		}

		// Update access time
		await mountManager.touchMount(mountId);

		// Parse range header
		const range = parseRangeHeader(rangeHeader, file.size);

		// Create stream
		const stream = new UsenetSeekableStream({
			file,
			nntpManager,
			range: range ?? undefined
		});

		const contentType = getContentType(file.name);

		logger.info('[UsenetStreamService] Created stream', {
			mountId,
			fileIndex,
			fileName: file.name,
			range: range ? `${range.start}-${range.end}` : 'full',
			contentType
		});

		return {
			stream,
			contentLength: stream.contentLength,
			startByte: stream.startByte,
			endByte: stream.endByte,
			totalSize: stream.totalSize,
			isPartial: range !== null,
			contentType
		};
	}

	/**
	 * Check if a mount's content can be streamed.
	 */
	async checkStreamability(mountId: string): Promise<StreamabilityResult> {
		const mountManager = getNzbMountManager();

		const mount = await mountManager.getMount(mountId);
		if (!mount) {
			return {
				canStream: false,
				error: 'Mount not found',
				requiresExtraction: false,
				archiveType: 'none'
			};
		}

		try {
			const parsed = await this.getParsedNzb(mount);

			// Check for RAR-only content
			if (isRarOnlyNzb(parsed)) {
				return {
					canStream: false,
					error:
						'This release contains only RAR files. RAR streaming is not supported. Please search for a different release.',
					requiresExtraction: true,
					archiveType: 'rar',
					estimatedSize: parsed.totalSize
				};
			}

			// Get best streamable file
			const bestFile = getBestStreamableFile(parsed);
			if (!bestFile) {
				return {
					canStream: false,
					error: 'No streamable media files found',
					requiresExtraction: false,
					archiveType: 'none'
				};
			}

			return {
				canStream: true,
				requiresExtraction: false,
				archiveType: 'none',
				estimatedSize: bestFile.size
			};
		} catch (error) {
			return {
				canStream: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				requiresExtraction: false,
				archiveType: 'none'
			};
		}
	}

	/**
	 * Get file metadata for a mount.
	 */
	async getFileInfo(
		mountId: string,
		fileIndex: number
	): Promise<{ name: string; size: number; contentType: string } | null> {
		const mountManager = getNzbMountManager();

		const mount = await mountManager.getMount(mountId);
		if (!mount) return null;

		try {
			const parsed = await this.getParsedNzb(mount);
			const file = parsed.files.find((f) => f.index === fileIndex);
			if (!file) return null;

			return {
				name: file.name,
				size: file.size,
				contentType: getContentType(file.name)
			};
		} catch {
			return null;
		}
	}

	/**
	 * Check if NNTP service is ready.
	 */
	isReady(): boolean {
		const manager = getNntpManager();
		return manager.isReady;
	}

	/**
	 * Get service status info.
	 */
	getStatus(): {
		ready: boolean;
		providers: number;
		pools: Record<string, unknown>;
		articleCache: { size: number; maxSize: number };
	} {
		const manager = getNntpManager();
		const stats = manager.getStats();
		return {
			ready: manager.isReady,
			providers: manager.providerCount,
			pools: stats.pools,
			articleCache: stats.articleCache
		};
	}

	/**
	 * Shutdown the service.
	 */
	shutdown(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
		this.nzbCache.clear();

		// Clear pending cleanup timers
		for (const state of this.mountStreamStates.values()) {
			if (state.cleanupTimer) {
				clearTimeout(state.cleanupTimer);
			}
		}
		this.mountStreamStates.clear();
	}

	/**
	 * Get parsed NZB from cache or storage.
	 */
	private async getParsedNzb(mount: MountInfo): Promise<ParsedNzb> {
		// Check cache
		const cached = this.nzbCache.get(mount.nzbHash);
		if (cached && Date.now() - cached.timestamp < NZB_CACHE_TTL) {
			return cached.parsed;
		}

		// Check if we have mediaFiles with full segment data
		if (mount.mediaFiles.length > 0 && mount.mediaFiles[0].segments?.length > 0) {
			const parsed: ParsedNzb = {
				hash: mount.nzbHash,
				files: mount.mediaFiles,
				mediaFiles: mount.mediaFiles.filter((f) => !f.isRar),
				totalSize: mount.totalSize,
				groups: mount.mediaFiles.flatMap((f) => f.groups).filter((v, i, a) => a.indexOf(v) === i)
			};

			this.nzbCache.set(mount.nzbHash, { parsed, timestamp: Date.now() });
			return parsed;
		}

		throw new Error('NZB content not available - mount needs to be recreated');
	}

	/**
	 * Cache parsed NZB.
	 */
	cacheNzb(hash: string, parsed: ParsedNzb): void {
		this.nzbCache.set(hash, { parsed, timestamp: Date.now() });
	}

	/**
	 * Create a stream from an extracted local file.
	 */
	private async createExtractedFileStream(
		mountId: string,
		filePath: string,
		rangeHeader: string | null
	): Promise<CreateStreamResult> {
		const stats = statSync(filePath);
		const totalSize = stats.size;

		const range = parseRangeHeader(rangeHeader, totalSize);

		let startByte = 0;
		let endByte = totalSize - 1;

		if (range) {
			startByte = range.start;
			endByte = range.end === -1 ? totalSize - 1 : range.end;
		}

		const contentLength = endByte - startByte + 1;

		const stream = createReadStream(filePath, {
			start: startByte,
			end: endByte
		});

		// Track stream for cleanup
		this.trackStreamStart(mountId, true);

		stream.once('close', () => {
			this.trackStreamEnd(mountId);
		});

		const contentType = getContentType(filePath);

		logger.info('[UsenetStreamService] Created extracted file stream', {
			filePath: basename(filePath),
			range: range ? `${startByte}-${endByte}` : 'full',
			contentLength,
			totalSize
		});

		return {
			stream,
			contentLength,
			startByte,
			endByte,
			totalSize,
			isPartial: range !== null,
			contentType
		};
	}

	/**
	 * Get extracted file path for a mount (placeholder - would need extraction system).
	 */
	private async getExtractedFilePath(_mountId: string): Promise<string | null> {
		// Since we're dropping RAR support, this returns null
		// In the old system this would check ExtractionCoordinator
		return null;
	}

	/**
	 * Track stream start for cleanup scheduling.
	 */
	private trackStreamStart(mountId: string, hasExtractedFile: boolean): void {
		let state = this.mountStreamStates.get(mountId);

		if (!state) {
			state = { activeCount: 0, cleanupTimer: null, hasExtractedFile };
			this.mountStreamStates.set(mountId, state);
		}

		if (state.cleanupTimer) {
			clearTimeout(state.cleanupTimer);
			state.cleanupTimer = null;
		}

		state.activeCount++;
		state.hasExtractedFile = hasExtractedFile;
	}

	/**
	 * Track stream end for cleanup scheduling.
	 */
	private trackStreamEnd(mountId: string): void {
		const state = this.mountStreamStates.get(mountId);
		if (!state) return;

		state.activeCount = Math.max(0, state.activeCount - 1);

		if (state.activeCount === 0 && state.hasExtractedFile) {
			this.scheduleCleanup(mountId);
		}
	}

	/**
	 * Schedule cleanup after delay.
	 */
	private scheduleCleanup(mountId: string): void {
		const state = this.mountStreamStates.get(mountId);
		if (!state) return;

		if (state.cleanupTimer) {
			clearTimeout(state.cleanupTimer);
		}

		state.cleanupTimer = setTimeout(() => {
			const currentState = this.mountStreamStates.get(mountId);
			if (currentState && currentState.activeCount === 0) {
				this.mountStreamStates.delete(mountId);
				// Note: Actual file cleanup would happen here if we had extraction
			}
		}, STREAM_CLEANUP_DELAY_MS);
	}

	/**
	 * Cleanup old cache entries.
	 */
	private cleanupCache(): void {
		const now = Date.now();
		let cleaned = 0;

		for (const [hash, cached] of this.nzbCache) {
			if (now - cached.timestamp > NZB_CACHE_TTL) {
				this.nzbCache.delete(hash);
				cleaned++;
			}
		}

		if (cleaned > 0) {
			logger.debug('[UsenetStreamService] Cleaned NZB cache', { cleaned });
		}
	}
}

// Singleton instance
let instance: UsenetStreamService | null = null;

/**
 * Get the singleton UsenetStreamService.
 */
export function getUsenetStreamService(): UsenetStreamService {
	if (!instance) {
		instance = new UsenetStreamService();
	}
	return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetUsenetStreamService(): void {
	if (instance) {
		instance.shutdown();
		instance = null;
	}
}

// Re-export for convenience
export { parseNzb, isRarOnlyNzb, getBestStreamableFile };
export { parseRangeHeader };
export type { ParsedNzb, CreateStreamResult, ByteRange };
