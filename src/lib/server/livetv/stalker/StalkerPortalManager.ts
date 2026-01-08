/**
 * Stalker Portal Manager
 *
 * Manages Stalker Portal URLs for scanning and account discovery.
 * Handles CRUD operations, portal type detection, and connection testing.
 */

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { stalkerPortals, type StalkerPortalRecord } from '$lib/server/db/schema';
import { logger } from '$lib/logging';

export interface StalkerPortal {
	id: string;
	name: string;
	url: string;
	endpoint: string | null;
	serverTimezone: string | null;
	lastScannedAt: string | null;
	lastScanResults: PortalScanSummary | null;
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface PortalScanSummary {
	totalTested: number;
	totalFound: number;
	lastScanType: 'random' | 'sequential' | 'import';
	lastScanDate: string;
}

export interface CreatePortalInput {
	name: string;
	url: string;
	enabled?: boolean;
}

export interface UpdatePortalInput {
	name?: string;
	url?: string;
	enabled?: boolean;
}

export interface PortalDetectionResult {
	success: boolean;
	endpoint?: string;
	serverTimezone?: string;
	error?: string;
}

export interface PortalTestResult {
	success: boolean;
	endpoint?: string;
	serverTimezone?: string;
	error?: string;
}

/**
 * Convert database record to API response type
 */
function recordToPortal(record: StalkerPortalRecord): StalkerPortal {
	let scanResults: PortalScanSummary | null = null;
	if (record.lastScanResults) {
		try {
			scanResults = JSON.parse(record.lastScanResults);
		} catch {
			// Invalid JSON, ignore
		}
	}

	return {
		id: record.id,
		name: record.name,
		url: record.url,
		endpoint: record.endpoint,
		serverTimezone: record.serverTimezone,
		lastScannedAt: record.lastScannedAt,
		lastScanResults: scanResults,
		enabled: record.enabled ?? true,
		createdAt: record.createdAt ?? new Date().toISOString(),
		updatedAt: record.updatedAt ?? new Date().toISOString()
	};
}

/**
 * Normalize a portal URL to a consistent format
 */
function normalizePortalUrl(url: string): string {
	// Remove trailing slashes
	let normalized = url.trim().replace(/\/+$/, '');

	// Remove common path suffixes that users might include
	normalized = normalized
		.replace(/\/portal\.php.*$/i, '')
		.replace(/\/stalker_portal\/server\/load\.php.*$/i, '')
		.replace(/\/stalker_portal.*$/i, '')
		.replace(/\/c\/?$/i, '')
		.replace(/\/server.*$/i, '');

	// Ensure http:// or https://
	if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
		normalized = `http://${normalized}`;
	}

	return normalized;
}

export class StalkerPortalManager {
	/**
	 * Get all portals
	 */
	async getPortals(): Promise<StalkerPortal[]> {
		const records = db.select().from(stalkerPortals).all();
		return records.map(recordToPortal);
	}

	/**
	 * Get enabled portals only
	 */
	async getEnabledPortals(): Promise<StalkerPortal[]> {
		const records = db.select().from(stalkerPortals).where(eq(stalkerPortals.enabled, true)).all();
		return records.map(recordToPortal);
	}

	/**
	 * Get a portal by ID
	 */
	async getPortal(id: string): Promise<StalkerPortal | null> {
		const record = db.select().from(stalkerPortals).where(eq(stalkerPortals.id, id)).get();

		if (!record) {
			return null;
		}

		return recordToPortal(record);
	}

	/**
	 * Get a portal by URL
	 */
	async getPortalByUrl(url: string): Promise<StalkerPortal | null> {
		const normalized = normalizePortalUrl(url);
		const record = db.select().from(stalkerPortals).where(eq(stalkerPortals.url, normalized)).get();

		if (!record) {
			return null;
		}

		return recordToPortal(record);
	}

	/**
	 * Create a new portal
	 * Optionally detects the portal type before saving
	 */
	async createPortal(input: CreatePortalInput, detectType: boolean = true): Promise<StalkerPortal> {
		const now = new Date().toISOString();
		const normalizedUrl = normalizePortalUrl(input.url);

		// Check for duplicates
		const existing = await this.getPortalByUrl(normalizedUrl);
		if (existing) {
			throw new Error(`Portal already exists: ${existing.name}`);
		}

		// Detect portal type if requested
		let endpoint: string | undefined;
		let serverTimezone: string | undefined;

		if (detectType) {
			const detection = await this.detectPortalType(normalizedUrl);
			if (detection.success) {
				endpoint = detection.endpoint;
				serverTimezone = detection.serverTimezone;
			}
			// Don't fail on detection failure - we can still save the portal
		}

		const insertData: typeof stalkerPortals.$inferInsert = {
			name: input.name,
			url: normalizedUrl,
			endpoint: endpoint ?? null,
			serverTimezone: serverTimezone ?? null,
			enabled: input.enabled ?? true,
			createdAt: now,
			updatedAt: now
		};

		const record = db.insert(stalkerPortals).values(insertData).returning().get();

		logger.info('[StalkerPortalManager] Created portal', {
			id: record.id,
			name: record.name,
			url: record.url,
			endpoint: record.endpoint
		});

		return recordToPortal(record);
	}

	/**
	 * Update a portal
	 */
	async updatePortal(id: string, updates: UpdatePortalInput): Promise<StalkerPortal> {
		const existing = await this.getPortal(id);
		if (!existing) {
			throw new Error(`Portal not found: ${id}`);
		}

		const now = new Date().toISOString();
		const updateData: Partial<typeof stalkerPortals.$inferInsert> = {
			updatedAt: now
		};

		if (updates.name !== undefined) {
			updateData.name = updates.name;
		}

		if (updates.url !== undefined) {
			const normalizedUrl = normalizePortalUrl(updates.url);

			// Check for duplicates (excluding self)
			const duplicate = await this.getPortalByUrl(normalizedUrl);
			if (duplicate && duplicate.id !== id) {
				throw new Error(`Portal URL already exists: ${duplicate.name}`);
			}

			updateData.url = normalizedUrl;

			// Re-detect portal type when URL changes
			const detection = await this.detectPortalType(normalizedUrl);
			if (detection.success) {
				updateData.endpoint = detection.endpoint;
				updateData.serverTimezone = detection.serverTimezone;
			}
		}

		if (updates.enabled !== undefined) {
			updateData.enabled = updates.enabled;
		}

		const record = db
			.update(stalkerPortals)
			.set(updateData)
			.where(eq(stalkerPortals.id, id))
			.returning()
			.get();

		logger.info('[StalkerPortalManager] Updated portal', {
			id: record.id,
			name: record.name
		});

		return recordToPortal(record);
	}

	/**
	 * Delete a portal
	 * Also deletes associated scan results and history (via CASCADE)
	 */
	async deletePortal(id: string): Promise<void> {
		const existing = await this.getPortal(id);
		if (!existing) {
			throw new Error(`Portal not found: ${id}`);
		}

		db.delete(stalkerPortals).where(eq(stalkerPortals.id, id)).run();

		logger.info('[StalkerPortalManager] Deleted portal', {
			id,
			name: existing.name
		});
	}

	/**
	 * Detect the portal type by checking known endpoints.
	 * Stalker portals can use different API endpoints.
	 */
	async detectPortalType(url: string): Promise<PortalDetectionResult> {
		const normalizedUrl = normalizePortalUrl(url);

		// Try different portal endpoints
		const endpoints = [
			{ path: '/c/version.js', endpoint: 'portal.php' },
			{ path: '/stalker_portal/c/version.js', endpoint: 'stalker_portal/server/load.php' }
		];

		for (const { path, endpoint } of endpoints) {
			try {
				const testUrl = `${normalizedUrl}${path}`;
				const response = await fetch(testUrl, {
					method: 'GET',
					signal: AbortSignal.timeout(10000),
					headers: {
						'User-Agent':
							'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3'
					}
				});

				if (response.ok) {
					const text = await response.text();
					// Check for version string pattern
					if (text.includes('var ver') || text.includes('version')) {
						logger.debug('[StalkerPortalManager] Detected portal type', {
							url: normalizedUrl,
							endpoint
						});

						return {
							success: true,
							endpoint
						};
					}
				}
			} catch {
				// Try next endpoint
				continue;
			}
		}

		// Try direct portal.php access as fallback
		try {
			const testUrl = `${normalizedUrl}/portal.php?action=handshake&type=stb&token=`;
			const response = await fetch(testUrl, {
				method: 'GET',
				signal: AbortSignal.timeout(10000),
				headers: {
					'User-Agent':
						'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3'
				}
			});

			if (response.ok || response.status === 403) {
				// 403 often means the portal exists but needs proper auth
				return {
					success: true,
					endpoint: 'portal.php'
				};
			}
		} catch {
			// Fallback failed
		}

		// Try stalker_portal path as final fallback
		try {
			const testUrl = `${normalizedUrl}/stalker_portal/server/load.php?action=handshake&type=stb&token=`;
			const response = await fetch(testUrl, {
				method: 'GET',
				signal: AbortSignal.timeout(10000),
				headers: {
					'User-Agent':
						'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3'
				}
			});

			if (response.ok || response.status === 403) {
				return {
					success: true,
					endpoint: 'stalker_portal/server/load.php'
				};
			}
		} catch {
			// Final fallback failed
		}

		return {
			success: false,
			error: 'Could not detect portal type. The URL may be incorrect or the portal is offline.'
		};
	}

	/**
	 * Test portal connection
	 */
	async testPortalConnection(url: string): Promise<PortalTestResult> {
		const detection = await this.detectPortalType(url);

		if (!detection.success) {
			return {
				success: false,
				error: detection.error || 'Failed to detect portal type'
			};
		}

		return {
			success: true,
			endpoint: detection.endpoint,
			serverTimezone: detection.serverTimezone
		};
	}

	/**
	 * Update the last scan results for a portal
	 */
	async updateScanResults(id: string, results: PortalScanSummary): Promise<void> {
		const now = new Date().toISOString();

		db.update(stalkerPortals)
			.set({
				lastScannedAt: now,
				lastScanResults: JSON.stringify(results),
				updatedAt: now
			})
			.where(eq(stalkerPortals.id, id))
			.run();
	}

	/**
	 * Re-detect portal type and update
	 */
	async refreshPortalDetection(id: string): Promise<StalkerPortal> {
		const existing = await this.getPortal(id);
		if (!existing) {
			throw new Error(`Portal not found: ${id}`);
		}

		const detection = await this.detectPortalType(existing.url);
		const now = new Date().toISOString();

		const updateData: Partial<typeof stalkerPortals.$inferInsert> = {
			updatedAt: now
		};

		if (detection.success) {
			updateData.endpoint = detection.endpoint;
			updateData.serverTimezone = detection.serverTimezone;
		}

		const record = db
			.update(stalkerPortals)
			.set(updateData)
			.where(eq(stalkerPortals.id, id))
			.returning()
			.get();

		return recordToPortal(record);
	}
}

// Singleton instance
let portalManager: StalkerPortalManager | null = null;

export function getStalkerPortalManager(): StalkerPortalManager {
	if (!portalManager) {
		portalManager = new StalkerPortalManager();
	}
	return portalManager;
}
