/**
 * Subtitle Provider Manager
 *
 * Central service for managing subtitle providers.
 * Handles CRUD operations, instance caching, and health tracking.
 */

import { db } from '$lib/server/db';
import { subtitleProviders } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { logger } from '$lib/logging';
import type {
	ISubtitleProvider,
	ProviderDefinition,
	ProviderHealth
} from '../providers/interfaces';
import { getSubtitleProviderFactory } from '../providers/SubtitleProviderFactory';
import type { SubtitleProviderConfig, ProviderImplementation } from '../types';
import {
	isThrottleableError,
	getErrorType,
	TooManyRequests,
	DownloadLimitExceeded,
	type ThrottleableError
} from '../errors/ProviderErrors';
import { getThrottleConfig, PROVIDER_RESET_CALCULATORS } from '../throttle/ThrottleMap';

/**
 * Central service for managing subtitle providers
 */
export class SubtitleProviderManager {
	private static instance: SubtitleProviderManager | null = null;
	private providerInstances: Map<string, ISubtitleProvider> = new Map();
	private initialized: boolean = false;

	private constructor() {}

	/**
	 * Get singleton instance
	 */
	static getInstance(): SubtitleProviderManager {
		if (!SubtitleProviderManager.instance) {
			SubtitleProviderManager.instance = new SubtitleProviderManager();
		}
		return SubtitleProviderManager.instance;
	}

	/**
	 * Initialize the manager
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;

		logger.info('Initializing SubtitleProviderManager');

		// Pre-load enabled providers
		const configs = await this.getProviders();
		for (const config of configs.filter((c) => c.enabled)) {
			try {
				await this.getProviderInstance(config.id);
			} catch (error) {
				logger.warn('Failed to initialize provider', {
					providerId: config.id,
					name: config.name,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		this.initialized = true;
		logger.info('SubtitleProviderManager initialized', {
			providerCount: configs.length,
			enabledCount: configs.filter((c) => c.enabled).length
		});
	}

	// =========================================================================
	// CRUD Operations
	// =========================================================================

	/**
	 * Get all configured providers
	 */
	async getProviders(): Promise<SubtitleProviderConfig[]> {
		const rows = await db.select().from(subtitleProviders);
		return rows.map((row) => this.rowToConfig(row));
	}

	/**
	 * Get a specific provider configuration
	 */
	async getProvider(id: string): Promise<SubtitleProviderConfig | undefined> {
		const rows = await db.select().from(subtitleProviders).where(eq(subtitleProviders.id, id));
		return rows[0] ? this.rowToConfig(rows[0]) : undefined;
	}

	/**
	 * Create a new provider configuration
	 */
	async createProvider(
		config: Omit<SubtitleProviderConfig, 'id' | 'consecutiveFailures'>
	): Promise<SubtitleProviderConfig> {
		const factory = getSubtitleProviderFactory();

		// Validate implementation
		if (!factory.canHandle(config.implementation)) {
			throw new Error(`Unknown provider implementation: ${config.implementation}`);
		}

		const id = randomUUID();

		await db.insert(subtitleProviders).values({
			id,
			name: config.name,
			implementation: config.implementation,
			enabled: config.enabled,
			priority: config.priority,
			apiKey: config.apiKey,
			username: config.username,
			password: config.password,
			settings: config.settings,
			requestsPerMinute: config.requestsPerMinute
		});

		const created = await this.getProvider(id);
		if (!created) {
			throw new Error('Failed to create provider');
		}

		logger.info('Created subtitle provider', { id, name: config.name });
		return created;
	}

	/**
	 * Update a provider configuration
	 */
	async updateProvider(
		id: string,
		updates: Partial<Omit<SubtitleProviderConfig, 'id' | 'implementation'>>
	): Promise<SubtitleProviderConfig> {
		const existing = await this.getProvider(id);
		if (!existing) {
			throw new Error(`Provider not found: ${id}`);
		}

		const updateData: Record<string, unknown> = {
			updatedAt: new Date().toISOString()
		};

		if (updates.name !== undefined) updateData.name = updates.name;
		if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
		if (updates.priority !== undefined) updateData.priority = updates.priority;
		if (updates.apiKey !== undefined) updateData.apiKey = updates.apiKey;
		if (updates.username !== undefined) updateData.username = updates.username;
		if (updates.password !== undefined) updateData.password = updates.password;
		if (updates.settings !== undefined) updateData.settings = updates.settings;
		if (updates.requestsPerMinute !== undefined)
			updateData.requestsPerMinute = updates.requestsPerMinute;

		await db.update(subtitleProviders).set(updateData).where(eq(subtitleProviders.id, id));

		// Clear cached instance so it gets recreated
		this.providerInstances.delete(id);

		const updated = await this.getProvider(id);
		if (!updated) {
			throw new Error('Failed to update provider');
		}

		logger.info('Updated subtitle provider', { id, name: updated.name });
		return updated;
	}

	/**
	 * Delete a provider
	 */
	async deleteProvider(id: string): Promise<void> {
		await db.delete(subtitleProviders).where(eq(subtitleProviders.id, id));
		this.providerInstances.delete(id);
		logger.info('Deleted subtitle provider', { id });
	}

	// =========================================================================
	// Instance Management
	// =========================================================================

	/**
	 * Get or create a provider instance
	 */
	async getProviderInstance(id: string): Promise<ISubtitleProvider | undefined> {
		// Check cache
		let instance = this.providerInstances.get(id);
		if (instance) return instance;

		// Load config
		const config = await this.getProvider(id);
		if (!config) return undefined;

		// Create instance
		const factory = getSubtitleProviderFactory();
		try {
			instance = factory.createProvider(config);
			this.providerInstances.set(id, instance);
			return instance;
		} catch (error) {
			logger.error('Failed to create provider instance', {
				providerId: id,
				error: error instanceof Error ? error.message : String(error)
			});
			return undefined;
		}
	}

	/**
	 * Get all enabled provider instances
	 */
	async getEnabledProviders(): Promise<ISubtitleProvider[]> {
		const configs = await this.getProviders();
		const enabledConfigs = configs
			.filter((c) => c.enabled && !this.isThrottled(c))
			.sort((a, b) => a.priority - b.priority);

		const instances: ISubtitleProvider[] = [];
		for (const config of enabledConfigs) {
			const instance = await this.getProviderInstance(config.id);
			if (instance) {
				instances.push(instance);
			}
		}

		return instances;
	}

	// =========================================================================
	// Health & Status
	// =========================================================================

	/**
	 * Check if a provider is currently throttled
	 */
	isThrottled(config: SubtitleProviderConfig): boolean {
		if (!config.throttledUntil) return false;
		return new Date(config.throttledUntil) > new Date();
	}

	/**
	 * Record a provider error with exception-specific throttling
	 *
	 * @param id Provider ID
	 * @param error Error instance (typed errors get specific throttle durations)
	 */
	async recordError(id: string, error: Error | ThrottleableError | string): Promise<void> {
		const config = await this.getProvider(id);
		if (!config) return;

		const failures = config.consecutiveFailures + 1;
		let throttledUntil: string | undefined;
		let errorType = 'UnknownError';
		let throttleDescription = 'unknown duration';
		let errorMessage: string;

		// Handle string errors (legacy support)
		if (typeof error === 'string') {
			errorMessage = error;
			// Use progressive backoff for string errors
			if (failures >= 2) {
				const minutes = failures === 2 ? 5 : failures === 3 ? 15 : failures === 4 ? 30 : 60;
				throttledUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
				throttleDescription = `${minutes} minutes (progressive backoff)`;
			}
		} else if (isThrottleableError(error)) {
			// Typed error - use exception-specific throttling
			errorType = error.name;
			errorMessage = error.message;

			// Check for provider-specific reset calculator (e.g., midnight reset)
			const resetCalculator = PROVIDER_RESET_CALCULATORS[config.implementation];

			// Handle special cases where the error provides a reset time
			if (error instanceof DownloadLimitExceeded && error.resetTime) {
				throttledUntil = error.resetTime.toISOString();
				throttleDescription = `until ${error.resetTime.toLocaleTimeString()}`;
			} else if (error instanceof TooManyRequests && error.retryAfter) {
				throttledUntil = new Date(Date.now() + error.retryAfter * 1000).toISOString();
				throttleDescription = `${error.retryAfter} seconds`;
			} else if (
				resetCalculator &&
				(error.name === 'DownloadLimitExceeded' || error.name === 'SearchLimitReached')
			) {
				// Use provider's daily reset time
				const msUntilReset = resetCalculator();
				throttledUntil = new Date(Date.now() + msUntilReset).toISOString();
				throttleDescription = `until daily reset (~${Math.round(msUntilReset / 3600000)} hours)`;
			} else {
				// Use configured throttle duration from map
				const throttleConfig = getThrottleConfig(getErrorType(error), config.implementation);
				throttledUntil = new Date(Date.now() + throttleConfig.duration).toISOString();
				throttleDescription = throttleConfig.description;
			}
		} else {
			// Generic Error - use progressive backoff
			errorMessage = error.message;
			if (failures >= 2) {
				const minutes = failures === 2 ? 5 : failures === 3 ? 15 : failures === 4 ? 30 : 60;
				throttledUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
				throttleDescription = `${minutes} minutes (progressive backoff)`;
			}
		}

		await db
			.update(subtitleProviders)
			.set({
				lastError: `${errorType}: ${errorMessage}`,
				lastErrorAt: new Date().toISOString(),
				consecutiveFailures: failures,
				throttledUntil,
				updatedAt: new Date().toISOString()
			})
			.where(eq(subtitleProviders.id, id));

		logger.warn('Provider throttled', {
			providerId: id,
			providerName: config.name,
			implementation: config.implementation,
			errorType,
			errorMessage,
			failures,
			throttledUntil,
			throttleDescription
		});
	}

	/**
	 * Record a successful operation (resets failure count and clears error state)
	 */
	async recordSuccess(id: string): Promise<void> {
		const config = await this.getProvider(id);
		const wasThrottled = config && this.isThrottled(config);
		const hadErrors = config && config.consecutiveFailures > 0;

		await db
			.update(subtitleProviders)
			.set({
				consecutiveFailures: 0,
				throttledUntil: null,
				lastError: null,
				lastErrorAt: null,
				updatedAt: new Date().toISOString()
			})
			.where(eq(subtitleProviders.id, id));

		// Log recovery from error state
		if (wasThrottled || hadErrors) {
			logger.info('Provider recovered from error state', {
				providerId: id,
				providerName: config?.name,
				wasThrottled,
				previousFailures: config?.consecutiveFailures
			});
		}
	}

	/**
	 * Get health status for all providers
	 */
	async getHealthStatus(): Promise<ProviderHealth[]> {
		const configs = await this.getProviders();
		return configs.map((config) => {
			// Parse error type from lastError if available
			const errorMatch = config.lastError?.match(/^(\w+):/);
			const throttleErrorType = errorMatch?.[1] || undefined;

			return {
				providerId: config.id,
				providerName: config.name,
				implementation: config.implementation,
				isHealthy: config.consecutiveFailures === 0,
				lastCheck: config.lastErrorAt,
				lastError: config.lastError,
				consecutiveFailures: config.consecutiveFailures,
				isThrottled: this.isThrottled(config),
				throttledUntil: config.throttledUntil,
				throttleErrorType
			};
		});
	}

	/**
	 * Get throttle reason for a provider
	 */
	async getThrottleReason(id: string): Promise<{ errorType: string; description: string } | null> {
		const config = await this.getProvider(id);
		if (!config || !config.throttledUntil) return null;

		if (new Date(config.throttledUntil) <= new Date()) {
			return null; // Throttle expired
		}

		// Parse error type from lastError
		const errorMatch = config.lastError?.match(/^(\w+):/);
		const errorType = errorMatch?.[1] || 'UnknownError';

		return {
			errorType,
			description: config.lastError || 'Unknown reason'
		};
	}

	/**
	 * Reset throttle for a provider
	 */
	async resetThrottle(id: string): Promise<void> {
		await db
			.update(subtitleProviders)
			.set({
				consecutiveFailures: 0,
				throttledUntil: null,
				updatedAt: new Date().toISOString()
			})
			.where(eq(subtitleProviders.id, id));

		logger.info('Reset provider throttle', { providerId: id });
	}

	// =========================================================================
	// Testing
	// =========================================================================

	/**
	 * Test a provider configuration
	 */
	async testProvider(
		config: Omit<SubtitleProviderConfig, 'id' | 'consecutiveFailures'>
	): Promise<void> {
		const factory = getSubtitleProviderFactory();

		if (!factory.canHandle(config.implementation)) {
			throw new Error(`Unknown provider implementation: ${config.implementation}`);
		}

		const tempConfig: SubtitleProviderConfig = {
			...config,
			id: 'test-' + randomUUID(),
			consecutiveFailures: 0
		};

		const instance = factory.createProvider(tempConfig);
		await instance.test();
	}

	// =========================================================================
	// Definitions
	// =========================================================================

	/**
	 * Get available provider definitions
	 */
	getDefinitions(): ProviderDefinition[] {
		return getSubtitleProviderFactory().getDefinitions();
	}

	/**
	 * Get a specific provider definition
	 */
	getDefinition(implementation: string): ProviderDefinition | undefined {
		return getSubtitleProviderFactory().getDefinition(implementation);
	}

	// =========================================================================
	// Helpers
	// =========================================================================

	/**
	 * Convert database row to config object
	 */
	private rowToConfig(row: typeof subtitleProviders.$inferSelect): SubtitleProviderConfig {
		return {
			id: row.id,
			name: row.name,
			implementation: row.implementation as ProviderImplementation,
			enabled: !!row.enabled,
			priority: row.priority ?? 25,
			apiKey: row.apiKey ?? undefined,
			username: row.username ?? undefined,
			password: row.password ?? undefined,
			settings: (row.settings as Record<string, unknown>) ?? undefined,
			requestsPerMinute: row.requestsPerMinute ?? 60,
			lastError: row.lastError ?? undefined,
			lastErrorAt: row.lastErrorAt ?? undefined,
			consecutiveFailures: row.consecutiveFailures ?? 0,
			throttledUntil: row.throttledUntil ?? undefined
		};
	}
}

/**
 * Get the singleton SubtitleProviderManager
 */
export function getSubtitleProviderManager(): SubtitleProviderManager {
	return SubtitleProviderManager.getInstance();
}

/**
 * Initialize and get the SubtitleProviderManager
 */
export async function initializeSubtitleProviderManager(): Promise<SubtitleProviderManager> {
	const manager = SubtitleProviderManager.getInstance();
	await manager.initialize();
	return manager;
}
