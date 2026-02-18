/**
 * DownloadClientManager - Central service for managing download clients.
 * Handles client configuration, testing, and download operations.
 */

import { db } from '$lib/server/db';
import { downloadClients as downloadClientsTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { logger } from '$lib/logging';

import type { IDownloadClient, DownloadClientConfig } from './core/interfaces';
import type {
	DownloadClient,
	ConnectionTestResult,
	DownloadClientImplementation,
	DownloadClientHealth
} from '$lib/types/downloadClient';
import { QBittorrentClient } from './qbittorrent/QBittorrentClient';
import { SABnzbdClient, type SABnzbdConfig } from './sabnzbd';
import { NZBGetClient } from './nzbget';
import { NZBMountClient } from './nzbmount/NZBMountClient';

/**
 * Protocol type for download clients.
 */
export type DownloadClientProtocol = 'torrent' | 'usenet';

/**
 * Map implementation to protocol.
 */
const IMPLEMENTATION_PROTOCOL_MAP: Record<string, DownloadClientProtocol> = {
	qbittorrent: 'torrent',
	transmission: 'torrent',
	deluge: 'torrent',
	rtorrent: 'torrent',
	aria2: 'torrent',
	sabnzbd: 'usenet',
	'nzb-mount': 'usenet',
	nzbget: 'usenet'
};

const LEGACY_DOWNLOAD_CLIENT_SELECT = {
	id: downloadClientsTable.id,
	name: downloadClientsTable.name,
	implementation: downloadClientsTable.implementation,
	enabled: downloadClientsTable.enabled,
	host: downloadClientsTable.host,
	port: downloadClientsTable.port,
	useSsl: downloadClientsTable.useSsl,
	username: downloadClientsTable.username,
	password: downloadClientsTable.password,
	urlBase: downloadClientsTable.urlBase,
	mountMode: downloadClientsTable.mountMode,
	movieCategory: downloadClientsTable.movieCategory,
	tvCategory: downloadClientsTable.tvCategory,
	recentPriority: downloadClientsTable.recentPriority,
	olderPriority: downloadClientsTable.olderPriority,
	initialState: downloadClientsTable.initialState,
	seedRatioLimit: downloadClientsTable.seedRatioLimit,
	seedTimeLimit: downloadClientsTable.seedTimeLimit,
	downloadPathLocal: downloadClientsTable.downloadPathLocal,
	downloadPathRemote: downloadClientsTable.downloadPathRemote,
	tempPathLocal: downloadClientsTable.tempPathLocal,
	tempPathRemote: downloadClientsTable.tempPathRemote,
	priority: downloadClientsTable.priority,
	createdAt: downloadClientsTable.createdAt,
	updatedAt: downloadClientsTable.updatedAt
};

/**
 * Configuration for creating/updating a download client.
 */
export interface DownloadClientInput {
	name: string;
	implementation: DownloadClientImplementation;
	enabled?: boolean;
	host: string;
	port: number;
	useSsl?: boolean;
	urlBase?: string | null;
	mountMode?: 'nzbdav' | 'altmount' | null;
	username?: string | null;
	password?: string | null;
	movieCategory?: string;
	tvCategory?: string;
	recentPriority?: 'normal' | 'high' | 'force';
	olderPriority?: 'normal' | 'high' | 'force';
	initialState?: 'start' | 'pause' | 'force';
	seedRatioLimit?: string | null;
	seedTimeLimit?: number | null;
	downloadPathLocal?: string | null;
	downloadPathRemote?: string | null;
	tempPathLocal?: string | null;
	tempPathRemote?: string | null;
	priority?: number;
}

/**
 * Central service for managing download clients.
 */
export class DownloadClientManager {
	private clientInstances: Map<string, IDownloadClient> = new Map();
	private downloadClientHealthColumnsAvailable = true;

	private isMissingDownloadClientHealthColumnsError(error: unknown): boolean {
		const message = this.toErrorMessage(error).toLowerCase();
		if (!message.includes('no such column')) return false;
		return (
			message.includes('health') ||
			message.includes('consecutive_failures') ||
			message.includes('last_success') ||
			message.includes('last_failure') ||
			message.includes('last_failure_message') ||
			message.includes('last_checked_at')
		);
	}

	private async selectClientRows(): Promise<Array<typeof downloadClientsTable.$inferSelect>> {
		if (this.downloadClientHealthColumnsAvailable) {
			try {
				return await db.select().from(downloadClientsTable);
			} catch (error) {
				if (!this.isMissingDownloadClientHealthColumnsError(error)) {
					throw error;
				}
				this.downloadClientHealthColumnsAvailable = false;
				logger.warn(
					'[DownloadClientManager] Missing download client health columns; using legacy row mapping'
				);
			}
		}

		const rows = await db.select(LEGACY_DOWNLOAD_CLIENT_SELECT).from(downloadClientsTable);
		return rows as Array<typeof downloadClientsTable.$inferSelect>;
	}

	private async selectClientRowsById(
		id: string
	): Promise<Array<typeof downloadClientsTable.$inferSelect>> {
		if (this.downloadClientHealthColumnsAvailable) {
			try {
				return await db.select().from(downloadClientsTable).where(eq(downloadClientsTable.id, id));
			} catch (error) {
				if (!this.isMissingDownloadClientHealthColumnsError(error)) {
					throw error;
				}
				this.downloadClientHealthColumnsAvailable = false;
				logger.warn(
					'[DownloadClientManager] Missing download client health columns; using legacy row mapping'
				);
			}
		}

		const rows = await db
			.select(LEGACY_DOWNLOAD_CLIENT_SELECT)
			.from(downloadClientsTable)
			.where(eq(downloadClientsTable.id, id));
		return rows as Array<typeof downloadClientsTable.$inferSelect>;
	}

	/**
	 * Get all configured download clients from database.
	 * Passwords are not returned for security.
	 */
	async getClients(): Promise<DownloadClient[]> {
		const rows = await this.selectClientRows();
		return rows.map((row) => this.rowToClient(row));
	}

	/**
	 * Get a specific client config by ID.
	 */
	async getClient(id: string): Promise<DownloadClient | undefined> {
		const rows = await this.selectClientRowsById(id);
		return rows[0] ? this.rowToClient(rows[0]) : undefined;
	}

	/**
	 * Get a client config with password (for internal use only).
	 */
	private async getClientWithPassword(
		id: string
	): Promise<(DownloadClient & { password?: string | null }) | undefined> {
		const rows = await this.selectClientRowsById(id);
		if (!rows[0]) return undefined;

		const client = this.rowToClient(rows[0]);
		return {
			...client,
			password: rows[0].password
		};
	}

	/**
	 * Create a new download client configuration.
	 */
	async createClient(input: DownloadClientInput): Promise<DownloadClient> {
		const id = randomUUID();
		const now = new Date().toISOString();

		await db.insert(downloadClientsTable).values({
			id,
			name: input.name,
			implementation: input.implementation,
			enabled: input.enabled ?? true,
			host: input.host,
			port: input.port,
			useSsl: input.useSsl ?? false,
			urlBase: input.urlBase ?? null,
			mountMode: input.mountMode ?? null,
			username: input.username,
			password: input.password,
			movieCategory: input.movieCategory ?? 'movies',
			tvCategory: input.tvCategory ?? 'tv',
			recentPriority: input.recentPriority ?? 'normal',
			olderPriority: input.olderPriority ?? 'normal',
			initialState: input.initialState ?? 'start',
			seedRatioLimit: input.seedRatioLimit,
			seedTimeLimit: input.seedTimeLimit,
			downloadPathLocal: input.downloadPathLocal,
			downloadPathRemote: input.downloadPathRemote,
			tempPathLocal: input.tempPathLocal,
			tempPathRemote: input.tempPathRemote,
			priority: input.priority ?? 1,
			createdAt: now,
			updatedAt: now
		});

		logger.info('Download client created', { id, name: input.name });

		const created = await this.getClient(id);
		if (!created) {
			throw new Error('Failed to create download client');
		}

		return created;
	}

	/**
	 * Update a download client configuration.
	 */
	async updateClient(id: string, updates: Partial<DownloadClientInput>): Promise<DownloadClient> {
		const existing = await this.getClient(id);
		if (!existing) {
			throw new Error(`Download client not found: ${id}`);
		}

		const updateData: Record<string, unknown> = {
			updatedAt: new Date().toISOString()
		};

		if (updates.name !== undefined) updateData.name = updates.name;
		if (updates.implementation !== undefined) updateData.implementation = updates.implementation;
		if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
		if (updates.host !== undefined) updateData.host = updates.host;
		if (updates.port !== undefined) updateData.port = updates.port;
		if (updates.useSsl !== undefined) updateData.useSsl = updates.useSsl;
		if (updates.urlBase !== undefined) updateData.urlBase = updates.urlBase;
		if (updates.mountMode !== undefined) updateData.mountMode = updates.mountMode;
		if (updates.username !== undefined) updateData.username = updates.username;
		// Only update password if explicitly provided with a non-empty value
		// (null or empty string means "keep existing password")
		if (updates.password !== undefined && updates.password !== null && updates.password !== '') {
			updateData.password = updates.password;
		}
		if (updates.movieCategory !== undefined) updateData.movieCategory = updates.movieCategory;
		if (updates.tvCategory !== undefined) updateData.tvCategory = updates.tvCategory;
		if (updates.recentPriority !== undefined) updateData.recentPriority = updates.recentPriority;
		if (updates.olderPriority !== undefined) updateData.olderPriority = updates.olderPriority;
		if (updates.initialState !== undefined) updateData.initialState = updates.initialState;
		if (updates.seedRatioLimit !== undefined) updateData.seedRatioLimit = updates.seedRatioLimit;
		if (updates.seedTimeLimit !== undefined) updateData.seedTimeLimit = updates.seedTimeLimit;
		if (updates.downloadPathLocal !== undefined)
			updateData.downloadPathLocal = updates.downloadPathLocal;
		if (updates.downloadPathRemote !== undefined)
			updateData.downloadPathRemote = updates.downloadPathRemote;
		if (updates.tempPathLocal !== undefined) updateData.tempPathLocal = updates.tempPathLocal;
		if (updates.tempPathRemote !== undefined) updateData.tempPathRemote = updates.tempPathRemote;
		if (updates.priority !== undefined) updateData.priority = updates.priority;

		await db.update(downloadClientsTable).set(updateData).where(eq(downloadClientsTable.id, id));

		// Clear cached instance so it gets recreated with new config
		// For SABnzbd, also clear its internal config cache
		const existingInstance = this.clientInstances.get(id);
		if (existingInstance && 'clearConfigCache' in existingInstance) {
			(existingInstance as { clearConfigCache: () => void }).clearConfigCache();
		}
		this.clientInstances.delete(id);

		logger.info('Download client updated', { id });

		const updated = await this.getClient(id);
		if (!updated) {
			throw new Error('Failed to update download client');
		}

		return updated;
	}

	/**
	 * Delete a download client.
	 */
	async deleteClient(id: string): Promise<void> {
		await db.delete(downloadClientsTable).where(eq(downloadClientsTable.id, id));
		this.clientInstances.delete(id);
		logger.info('Download client deleted', { id });
	}

	/**
	 * Test a download client's connectivity.
	 * Can test either an existing client by ID or test config before saving.
	 */
	async testClient(config: DownloadClientConfig): Promise<ConnectionTestResult> {
		const client = this.createClientInstance(config);
		if (!client) {
			return {
				success: false,
				error: `Unsupported implementation: ${(config as { implementation?: string }).implementation ?? 'unknown'}`
			};
		}

		return client.test();
	}

	/**
	 * Test an existing client by ID.
	 */
	async testClientById(id: string): Promise<ConnectionTestResult> {
		const clientConfig = await this.getClientWithPassword(id);
		if (!clientConfig) {
			return {
				success: false,
				error: `Download client not found: ${id}`
			};
		}

		const result = await this.testClient({
			host: clientConfig.host,
			port: clientConfig.port,
			useSsl: clientConfig.useSsl,
			urlBase: clientConfig.urlBase ?? null,
			mountMode: clientConfig.mountMode ?? null,
			username: clientConfig.username,
			password: clientConfig.password,
			implementation: clientConfig.implementation,
			apiKey:
				clientConfig.implementation === 'sabnzbd' || clientConfig.implementation === 'nzb-mount'
					? clientConfig.password
					: undefined
		});

		if (result.success) {
			await this.recordHealthSuccess(id);
		} else {
			await this.recordHealthFailure(id, result.error ?? 'Connection test failed');
		}

		return result;
	}

	/**
	 * Test using updated config values while falling back to stored credentials when password/api key is omitted.
	 */
	async testClientWithCredentialFallback(
		id: string,
		overrides: Partial<DownloadClientConfig>
	): Promise<ConnectionTestResult> {
		const clientConfig = await this.getClientWithPassword(id);
		if (!clientConfig) {
			return {
				success: false,
				error: `Download client not found: ${id}`
			};
		}

		const hasPasswordOverride =
			typeof overrides.password === 'string' && overrides.password.trim().length > 0;
		const effectivePassword = hasPasswordOverride ? overrides.password : clientConfig.password;
		const implementation = overrides.implementation ?? clientConfig.implementation;

		const result = await this.testClient({
			host: overrides.host ?? clientConfig.host,
			port: overrides.port ?? clientConfig.port,
			useSsl: overrides.useSsl ?? clientConfig.useSsl,
			urlBase: overrides.urlBase ?? clientConfig.urlBase ?? null,
			mountMode: overrides.mountMode ?? clientConfig.mountMode ?? null,
			username: overrides.username ?? clientConfig.username,
			password: effectivePassword,
			implementation,
			apiKey:
				implementation === 'sabnzbd' || implementation === 'nzb-mount'
					? effectivePassword
					: undefined
		});

		if (result.success) {
			await this.recordHealthSuccess(id);
		} else {
			await this.recordHealthFailure(id, result.error ?? 'Connection test failed');
		}

		return result;
	}

	/**
	 * Get or create a client instance for operations.
	 */
	async getClientInstance(id: string): Promise<IDownloadClient | undefined> {
		// Check cache first
		let instance = this.clientInstances.get(id);
		if (instance) return instance;

		// Load config with password
		const config = await this.getClientWithPassword(id);
		if (!config) return undefined;

		// Create instance with implementation-specific config
		instance = this.createClientInstance({
			host: config.host,
			port: config.port,
			useSsl: config.useSsl,
			urlBase: config.urlBase ?? null,
			mountMode: config.mountMode ?? null,
			username: config.username,
			password: config.password,
			implementation: config.implementation,
			// For SABnzbd/NZB-Mount, the API key is stored in the password field
			apiKey:
				config.implementation === 'sabnzbd' || config.implementation === 'nzb-mount'
					? config.password
					: undefined
		});

		if (instance) {
			const wrappedInstance = this.wrapClientInstance(id, instance);
			this.clientInstances.set(id, wrappedInstance);
		}

		return this.clientInstances.get(id);
	}

	/**
	 * Get all enabled client instances.
	 */
	async getEnabledClients(): Promise<Array<{ client: DownloadClient; instance: IDownloadClient }>> {
		const clients = await this.getClients();
		const enabledClients = clients.filter((c) => c.enabled);

		const results: Array<{ client: DownloadClient; instance: IDownloadClient }> = [];

		for (const client of enabledClients) {
			const instance = await this.getClientInstance(client.id);
			if (instance) {
				results.push({ client, instance });
			}
		}

		return results;
	}

	/**
	 * Get enabled clients filtered by protocol.
	 */
	async getEnabledClientsForProtocol(
		protocol: DownloadClientProtocol
	): Promise<Array<{ client: DownloadClient; instance: IDownloadClient }>> {
		const allClients = await this.getEnabledClients();
		return allClients.filter(
			({ client }) => IMPLEMENTATION_PROTOCOL_MAP[client.implementation] === protocol
		);
	}

	/**
	 * Get the first enabled client for a protocol, ordered by priority.
	 */
	async getClientForProtocol(
		protocol: DownloadClientProtocol
	): Promise<{ client: DownloadClient; instance: IDownloadClient } | undefined> {
		const clients = await this.getEnabledClientsForProtocol(protocol);
		if (clients.length === 0) {
			return undefined;
		}
		// Sort by priority (lower = higher priority)
		clients.sort((a, b) => a.client.priority - b.client.priority);
		return clients[0];
	}

	/**
	 * Get the protocol for a client implementation.
	 */
	static getProtocolForImplementation(implementation: string): DownloadClientProtocol {
		return IMPLEMENTATION_PROTOCOL_MAP[implementation] || 'torrent';
	}

	/**
	 * Create a client instance from config.
	 */
	private createClientInstance(
		config: DownloadClientConfig & { implementation?: string; apiKey?: string | null }
	): IDownloadClient | undefined {
		const implementation = config.implementation || 'qbittorrent';

		switch (implementation) {
			case 'qbittorrent':
				return new QBittorrentClient(config);

			case 'sabnzbd':
				return new SABnzbdClient(config as SABnzbdConfig);

			case 'nzbget':
				return new NZBGetClient(config);
			case 'nzb-mount':
				return new NZBMountClient(config);

			// Future implementations
			// case 'transmission':
			//   return new TransmissionClient(config);

			default:
				logger.warn(`Unsupported download client implementation: ${implementation}`);
				return undefined;
		}
	}

	private wrapClientInstance(id: string, instance: IDownloadClient): IDownloadClient {
		const trackedMethods = new Set<string>([
			'test',
			'addDownload',
			'getDownloads',
			'getDownload',
			'removeDownload',
			'pauseDownload',
			'resumeDownload',
			'getDefaultSavePath',
			'getCategories',
			'ensureCategory',
			'retryDownload',
			'getNntpServers',
			'getBasePath',
			'markItemAsImported',
			'setSeedingConfig'
		]);

		return new Proxy(instance, {
			get: (target, prop, receiver) => {
				const value = Reflect.get(target, prop, receiver);
				if (typeof prop !== 'string' || typeof value !== 'function' || !trackedMethods.has(prop)) {
					return value;
				}

				return async (...args: unknown[]) => {
					try {
						const result = await value.apply(target, args);
						await this.recordHealthSuccess(id);
						return result;
					} catch (error) {
						// Only mark unhealthy for connectivity/auth/API availability issues.
						if (this.isHealthFailure(error)) {
							await this.recordHealthFailure(id, this.toErrorMessage(error));
						}
						throw error;
					}
				};
			}
		}) as IDownloadClient;
	}

	private toErrorMessage(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}

	private isHealthFailure(error: unknown): boolean {
		const message = this.toErrorMessage(error).toLowerCase();

		// Runtime operation errors that indicate app/business conditions rather than connectivity.
		const nonHealthPatterns = [
			'already exists',
			'not found',
			'invalid category',
			'invalid state',
			'duplicate'
		];
		if (nonHealthPatterns.some((pattern) => message.includes(pattern))) {
			return false;
		}

		// Most runtime exceptions from client calls indicate connection/auth/API availability failures.
		return true;
	}

	private async recordHealthSuccess(id: string): Promise<void> {
		if (!this.downloadClientHealthColumnsAvailable) {
			return;
		}

		const now = new Date().toISOString();
		try {
			await db
				.update(downloadClientsTable)
				.set({
					health: 'healthy',
					consecutiveFailures: 0,
					lastSuccess: now,
					lastCheckedAt: now,
					updatedAt: now
				})
				.where(eq(downloadClientsTable.id, id));
		} catch (error) {
			if (this.isMissingDownloadClientHealthColumnsError(error)) {
				this.downloadClientHealthColumnsAvailable = false;
				return;
			}
			logger.debug('Failed to record download client success state', {
				id,
				error: this.toErrorMessage(error)
			});
		}
	}

	private async recordHealthFailure(id: string, message: string): Promise<void> {
		if (!this.downloadClientHealthColumnsAvailable) {
			return;
		}

		const now = new Date().toISOString();
		try {
			const [row] = await db
				.select({ consecutiveFailures: downloadClientsTable.consecutiveFailures })
				.from(downloadClientsTable)
				.where(eq(downloadClientsTable.id, id));

			const consecutiveFailures = (row?.consecutiveFailures ?? 0) + 1;
			const health: DownloadClientHealth = consecutiveFailures >= 3 ? 'failing' : 'warning';

			await db
				.update(downloadClientsTable)
				.set({
					health,
					consecutiveFailures,
					lastFailure: now,
					lastFailureMessage: message,
					lastCheckedAt: now,
					updatedAt: now
				})
				.where(eq(downloadClientsTable.id, id));
		} catch (error) {
			if (this.isMissingDownloadClientHealthColumnsError(error)) {
				this.downloadClientHealthColumnsAvailable = false;
				return;
			}
			logger.debug('Failed to record download client failure state', {
				id,
				error: this.toErrorMessage(error)
			});
		}
	}

	/**
	 * Convert database row to DownloadClient (without password).
	 */
	private rowToClient(row: typeof downloadClientsTable.$inferSelect): DownloadClient {
		const mountMode =
			row.mountMode === 'nzbdav' || row.mountMode === 'altmount' ? row.mountMode : null;

		return {
			id: row.id,
			name: row.name,
			implementation: row.implementation as DownloadClientImplementation,
			enabled: !!row.enabled,
			host: row.host,
			port: row.port,
			useSsl: !!row.useSsl,
			urlBase: row.urlBase ?? null,
			mountMode,
			username: row.username,
			hasPassword: !!row.password,
			movieCategory: row.movieCategory ?? 'movies',
			tvCategory: row.tvCategory ?? 'tv',
			recentPriority: (row.recentPriority as 'normal' | 'high' | 'force') ?? 'normal',
			olderPriority: (row.olderPriority as 'normal' | 'high' | 'force') ?? 'normal',
			initialState: (row.initialState as 'start' | 'pause' | 'force') ?? 'start',
			seedRatioLimit: row.seedRatioLimit,
			seedTimeLimit: row.seedTimeLimit,
			downloadPathLocal: row.downloadPathLocal,
			downloadPathRemote: row.downloadPathRemote,
			tempPathLocal: row.tempPathLocal,
			tempPathRemote: row.tempPathRemote,
			priority: row.priority ?? 1,
			status: {
				health: (row.health as DownloadClientHealth) ?? 'healthy',
				consecutiveFailures: row.consecutiveFailures ?? 0,
				lastSuccess: row.lastSuccess ?? undefined,
				lastFailure: row.lastFailure ?? undefined,
				lastFailureMessage: row.lastFailureMessage ?? undefined,
				lastCheckedAt: row.lastCheckedAt ?? undefined
			},
			createdAt: row.createdAt ?? undefined,
			updatedAt: row.updatedAt ?? undefined
		};
	}
}

/** Singleton instance */
let managerInstance: DownloadClientManager | null = null;

/** Get the singleton DownloadClientManager */
export function getDownloadClientManager(): DownloadClientManager {
	if (!managerInstance) {
		managerInstance = new DownloadClientManager();
	}
	return managerInstance;
}

/** Reset the singleton (for testing) */
export function resetDownloadClientManager(): void {
	managerInstance = null;
}
