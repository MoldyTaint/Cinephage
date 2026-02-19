/**
 * MediaBrowserManager - Manages Jellyfin and Emby server configurations.
 * Provides CRUD operations and connection testing.
 */

import { db } from '$lib/server/db';
import { mediaBrowserServers, type MediaBrowserServerRecord } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { logger } from '$lib/logging';
import { randomUUID } from 'crypto';
import { MediaBrowserClient } from './MediaBrowserClient';
import type {
	MediaBrowserServerInput,
	MediaBrowserTestConfig,
	MediaBrowserTestResult,
	MediaBrowserServerPublic
} from './types';

/**
 * Convert database record to public info (excludes API key)
 */
function toPublicInfo(record: MediaBrowserServerRecord): MediaBrowserServerPublic {
	return {
		id: record.id,
		name: record.name,
		serverType: record.serverType as 'jellyfin' | 'emby',
		host: record.host,
		enabled: record.enabled,
		onImport: record.onImport,
		onUpgrade: record.onUpgrade,
		onRename: record.onRename,
		onDelete: record.onDelete,
		pathMappings: record.pathMappings,
		serverName: record.serverName,
		serverVersion: record.serverVersion,
		serverId: record.serverId,
		lastTestedAt: record.lastTestedAt,
		testResult: record.testResult,
		testError: record.testError,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt
	};
}

class MediaBrowserManager {
	private clientCache: Map<string, MediaBrowserClient> = new Map();

	/**
	 * Get or create a client for a server
	 */
	getClient(serverId: string): MediaBrowserClient | null {
		return this.clientCache.get(serverId) ?? null;
	}

	/**
	 * Clear cached client for a server
	 */
	private clearClientCache(serverId: string): void {
		this.clientCache.delete(serverId);
	}

	/**
	 * Create and cache a client for a server record
	 */
	private createClient(record: MediaBrowserServerRecord): MediaBrowserClient {
		const client = new MediaBrowserClient({
			host: record.host,
			apiKey: record.apiKey,
			serverType: record.serverType as 'jellyfin' | 'emby'
		});
		this.clientCache.set(record.id, client);
		return client;
	}

	// ========================================================================
	// CRUD Operations
	// ========================================================================

	/**
	 * Get all servers
	 */
	async getServers(): Promise<MediaBrowserServerPublic[]> {
		const records = await db
			.select()
			.from(mediaBrowserServers)
			.orderBy(asc(mediaBrowserServers.name));
		return records.map(toPublicInfo);
	}

	/**
	 * Get all enabled servers (with full record for internal use)
	 */
	async getEnabledServers(): Promise<MediaBrowserServerRecord[]> {
		return db
			.select()
			.from(mediaBrowserServers)
			.where(eq(mediaBrowserServers.enabled, true))
			.orderBy(asc(mediaBrowserServers.name));
	}

	/**
	 * Get a single server by ID
	 */
	async getServer(id: string): Promise<MediaBrowserServerPublic | null> {
		const [record] = await db
			.select()
			.from(mediaBrowserServers)
			.where(eq(mediaBrowserServers.id, id))
			.limit(1);

		return record ? toPublicInfo(record) : null;
	}

	/**
	 * Get a single server record (internal use, includes API key)
	 */
	async getServerRecord(id: string): Promise<MediaBrowserServerRecord | null> {
		const [record] = await db
			.select()
			.from(mediaBrowserServers)
			.where(eq(mediaBrowserServers.id, id))
			.limit(1);

		return record ?? null;
	}

	/**
	 * Create a new server
	 */
	async createServer(input: MediaBrowserServerInput): Promise<MediaBrowserServerPublic> {
		const now = new Date().toISOString();

		const newServer = {
			id: randomUUID(),
			name: input.name,
			serverType: input.serverType,
			host: input.host.replace(/\/+$/, ''), // Normalize URL
			apiKey: input.apiKey,
			enabled: input.enabled ?? true,
			onImport: input.onImport ?? true,
			onUpgrade: input.onUpgrade ?? true,
			onRename: input.onRename ?? true,
			onDelete: input.onDelete ?? true,
			pathMappings: input.pathMappings ?? null,
			createdAt: now,
			updatedAt: now
		};

		const [created] = await db.insert(mediaBrowserServers).values(newServer).returning();
		logger.info('[MediaBrowserManager] Created server', { id: created.id, name: created.name });
		return toPublicInfo(created);
	}

	/**
	 * Update a server
	 */
	async updateServer(
		id: string,
		input: Partial<MediaBrowserServerInput>
	): Promise<MediaBrowserServerPublic | null> {
		const existing = await this.getServerRecord(id);
		if (!existing) {
			return null;
		}

		const updates: Partial<MediaBrowserServerRecord> = {
			updatedAt: new Date().toISOString()
		};

		if (input.name !== undefined) updates.name = input.name;
		if (input.serverType !== undefined) updates.serverType = input.serverType;
		if (input.host !== undefined) updates.host = input.host.replace(/\/+$/, '');
		if (input.apiKey !== undefined) updates.apiKey = input.apiKey;
		if (input.enabled !== undefined) updates.enabled = input.enabled;
		if (input.onImport !== undefined) updates.onImport = input.onImport;
		if (input.onUpgrade !== undefined) updates.onUpgrade = input.onUpgrade;
		if (input.onRename !== undefined) updates.onRename = input.onRename;
		if (input.onDelete !== undefined) updates.onDelete = input.onDelete;
		if (input.pathMappings !== undefined) updates.pathMappings = input.pathMappings;

		// If host or API key changed, clear the client cache
		if (input.host !== undefined || input.apiKey !== undefined) {
			this.clearClientCache(id);
		}

		const [updated] = await db
			.update(mediaBrowserServers)
			.set(updates)
			.where(eq(mediaBrowserServers.id, id))
			.returning();

		logger.info('[MediaBrowserManager] Updated server', { id, name: updated.name });
		return toPublicInfo(updated);
	}

	/**
	 * Delete a server
	 */
	async deleteServer(id: string): Promise<boolean> {
		const existing = await this.getServerRecord(id);
		if (!existing) {
			return false;
		}

		await db.delete(mediaBrowserServers).where(eq(mediaBrowserServers.id, id));
		this.clearClientCache(id);

		logger.info('[MediaBrowserManager] Deleted server', { id, name: existing.name });
		return true;
	}

	// ========================================================================
	// Testing
	// ========================================================================

	/**
	 * Test server configuration (before saving)
	 */
	async testServerConfig(config: MediaBrowserTestConfig): Promise<MediaBrowserTestResult> {
		const client = new MediaBrowserClient({
			host: config.host.replace(/\/+$/, ''),
			apiKey: config.apiKey,
			serverType: config.serverType ?? 'jellyfin'
		});

		return client.test();
	}

	/**
	 * Test a saved server and update its test status
	 */
	async testServer(
		id: string,
		options?: {
			host?: string;
			apiKey?: string;
			serverType?: 'jellyfin' | 'emby';
			persist?: boolean;
		}
	): Promise<MediaBrowserTestResult> {
		const record = await this.getServerRecord(id);
		if (!record) {
			return { success: false, error: 'Server not found' };
		}

		const hasOverrides =
			options?.host !== undefined ||
			options?.apiKey !== undefined ||
			options?.serverType !== undefined;

		const effectiveHost = options?.host?.trim() ? options.host : record.host;
		const effectiveApiKey = options?.apiKey?.trim() ? options.apiKey : record.apiKey;
		const effectiveServerType = (options?.serverType ?? record.serverType) as 'jellyfin' | 'emby';

		const client = hasOverrides
			? new MediaBrowserClient({
					host: effectiveHost,
					apiKey: effectiveApiKey,
					serverType: effectiveServerType
				})
			: this.createClient(record);

		const result = await client.test();

		// For modal/preview tests, allow testing without persisting status on the saved server.
		if (options?.persist === false) {
			return result;
		}

		// Update the server with test results
		const updates: Partial<MediaBrowserServerRecord> = {
			lastTestedAt: new Date().toISOString(),
			testResult: result.success ? 'success' : 'failed',
			testError: result.error ?? null,
			updatedAt: new Date().toISOString()
		};

		if (result.success && result.serverInfo) {
			updates.serverName = result.serverInfo.serverName;
			updates.serverVersion = result.serverInfo.version;
			updates.serverId = result.serverInfo.id;
		}

		await db.update(mediaBrowserServers).set(updates).where(eq(mediaBrowserServers.id, id));

		return result;
	}

	// ========================================================================
	// Client Management
	// ========================================================================

	/**
	 * Get clients for all enabled servers
	 */
	async getEnabledClients(): Promise<
		Array<{ server: MediaBrowserServerRecord; client: MediaBrowserClient }>
	> {
		const servers = await this.getEnabledServers();
		return servers.map((server) => ({
			server,
			client: this.clientCache.get(server.id) ?? this.createClient(server)
		}));
	}
}

// Singleton instance
let managerInstance: MediaBrowserManager | null = null;

/**
 * Get the MediaBrowserManager singleton
 */
export function getMediaBrowserManager(): MediaBrowserManager {
	if (!managerInstance) {
		managerInstance = new MediaBrowserManager();
	}
	return managerInstance;
}

export { MediaBrowserManager };
