/**
 * Usenet Protocol Handler
 *
 * Handles usenet-specific operations including:
 * - Retention validation
 * - NZB URL generation
 * - Completion checking
 * - Age-based scoring
 *
 * SECURITY NOTE: API keys in URLs
 * --------------------------------
 * Usenet indexers (NZBgeek, DrunkenSlug, etc.) require API keys to be passed
 * as URL query parameters. This is the standard authentication method for
 * Newznab-based indexers and cannot be changed to header-based auth because:
 * 1. Download clients (SABnzbd, NZBGet) fetch NZBs via direct URL download
 * 2. These clients may not support custom Authorization headers for NZB fetches
 * 3. The indexers themselves expect API keys in the query string
 *
 * To mitigate exposure risks:
 * - URLs with API keys should be redacted when logging (use redactUrl())
 * - URLs should not be displayed to users in full
 * - Download queue entries should redact sensitive URLs in API responses
 */

import {
	BaseProtocolHandler,
	type IUsenetHandler,
	type ProtocolContext,
	type ProtocolDisplayInfo
} from './IProtocolHandler';
import type { ReleaseResult, EnhancedReleaseResult } from '../types/release';
import type { UsenetProtocolSettings } from '../types/protocol';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Score bonuses for usenet-specific features
 */
const USENET_SCORE_BONUSES = {
	completeRelease: 30,
	freshRelease: 20, // < 7 days
	recentRelease: 10, // < 30 days
	passwordFree: 15
};

/**
 * Score penalties for usenet issues
 */
const USENET_SCORE_PENALTIES = {
	passwordProtected: -50,
	missingParts: -30,
	oldRelease: -10, // > 365 days
	nearRetentionLimit: -20 // > 90% of retention
};

/**
 * Default retention assumptions (in days)
 */
const DEFAULT_RETENTION = {
	standard: 1200, // ~3.3 years
	minimum: 365, // 1 year
	maximum: 4000 // ~11 years (some providers)
};

// =============================================================================
// USENET PROTOCOL HANDLER
// =============================================================================

export class UsenetProtocolHandler extends BaseProtocolHandler implements IUsenetHandler {
	readonly protocol = 'usenet' as const;

	/**
	 * Validate usenet-specific fields
	 */
	override validateResult(result: ReleaseResult): boolean {
		if (!super.validateResult(result)) {
			return false;
		}

		// Usenet needs a downloadUrl that looks like an NZB or API endpoint
		if (!result.downloadUrl) {
			return false;
		}

		// Should not have torrent-specific indicators
		if (result.downloadUrl.startsWith('magnet:') || result.infoHash || result.torrent?.infoHash) {
			return false;
		}

		return true;
	}

	/**
	 * Extract usenet-specific metadata
	 */
	extractMetadata(result: ReleaseResult): Record<string, unknown> {
		const usenet = result.usenet;
		return {
			poster: usenet?.poster ?? result.poster,
			group: usenet?.group ?? result.group,
			grabs: usenet?.grabs,
			passwordProtected: usenet?.passwordProtected ?? false,
			fileCount: usenet?.fileCount,
			nzbId: usenet?.nzbId,
			completionPercentage: usenet?.completionPercentage ?? 100,
			ageDays: this.calculateAgeDays(result.publishDate)
		};
	}

	/**
	 * Calculate score adjustment based on usenet-specific factors
	 */
	calculateScoreAdjustment(result: EnhancedReleaseResult, context: ProtocolContext): number {
		let adjustment = 0;
		const settings = context.settings as UsenetProtocolSettings;
		const usenet = result.usenet;

		// Age-based adjustments
		const ageDays = this.calculateAgeDays(result.publishDate);

		if (ageDays < 7) {
			adjustment += USENET_SCORE_BONUSES.freshRelease;
		} else if (ageDays < 30) {
			adjustment += USENET_SCORE_BONUSES.recentRelease;
		} else if (ageDays > 365) {
			adjustment += USENET_SCORE_PENALTIES.oldRelease;
		}

		// Retention scoring
		const maxRetention = settings.maximumRetention ?? DEFAULT_RETENTION.standard;
		const retentionScore = this.calculateRetentionScore(ageDays, maxRetention);
		if (retentionScore < 10) {
			adjustment += USENET_SCORE_PENALTIES.nearRetentionLimit;
		}

		// Completion status
		if (usenet?.completionPercentage !== undefined && usenet.completionPercentage < 100) {
			adjustment += USENET_SCORE_PENALTIES.missingParts;
		} else {
			adjustment += USENET_SCORE_BONUSES.completeRelease;
		}

		// Password protection
		if (usenet?.passwordProtected) {
			adjustment += USENET_SCORE_PENALTIES.passwordProtected;
		} else {
			adjustment += USENET_SCORE_BONUSES.passwordFree;
		}

		return adjustment;
	}

	/**
	 * Generate download URL (may add API key)
	 */
	override async generateDownloadUrl(
		result: ReleaseResult,
		context: ProtocolContext
	): Promise<string> {
		const settings = context.settings as UsenetProtocolSettings;

		// If URL already has API key or is complete, return as-is
		if (result.downloadUrl.includes('apikey=') || result.downloadUrl.includes('api_key=')) {
			return result.downloadUrl;
		}

		// Add API key if available
		if (settings.apiKey) {
			const separator = result.downloadUrl.includes('?') ? '&' : '?';
			return `${result.downloadUrl}${separator}apikey=${settings.apiKey}`;
		}

		return result.downloadUrl;
	}

	/**
	 * Check if release should be rejected
	 */
	shouldReject(result: EnhancedReleaseResult, context: ProtocolContext): string | undefined {
		const settings = context.settings as UsenetProtocolSettings;
		const usenet = result.usenet;
		const ageDays = this.calculateAgeDays(result.publishDate);

		// Reject password-protected if configured
		if (settings.rejectPasswordProtected && usenet?.passwordProtected) {
			return 'Password protected release';
		}

		// Reject based on retention
		if (settings.maximumRetention != null && ageDays > settings.maximumRetention) {
			return `Exceeds retention limit (${ageDays} days > ${settings.maximumRetention} days)`;
		}

		// Reject incomplete releases
		const minCompletion = settings.minimumCompletionPercentage ?? 95;
		if (usenet?.completionPercentage !== undefined && usenet.completionPercentage < minCompletion) {
			return `Incomplete release (${usenet.completionPercentage}% complete, minimum ${minCompletion}%)`;
		}

		// Reject above maximum size
		if (settings.maximumSize !== undefined && result.size > settings.maximumSize) {
			return `Exceeds maximum size (${this.formatSizeDisplay(result.size)})`;
		}

		return undefined;
	}

	/**
	 * Get display information for UI
	 */
	getDisplayInfo(result: ReleaseResult): ProtocolDisplayInfo {
		const usenet = result.usenet;
		const ageDays = this.calculateAgeDays(result.publishDate);

		const details: ProtocolDisplayInfo['details'] = [
			{
				label: 'Age',
				value: this.formatAgeDays(ageDays),
				tooltip: `Published ${ageDays} days ago`
			}
		];

		if (usenet?.group) {
			details.push({
				label: 'Group',
				value: usenet.group,
				tooltip: 'Usenet group'
			});
		}

		if (usenet?.grabs !== undefined) {
			details.push({
				label: 'Grabs',
				value: usenet.grabs.toString(),
				tooltip: `Downloaded ${usenet.grabs} times`
			});
		}

		if (usenet?.fileCount !== undefined) {
			details.push({
				label: 'Files',
				value: usenet.fileCount.toString(),
				tooltip: `Contains ${usenet.fileCount} files`
			});
		}

		if (usenet?.passwordProtected) {
			details.push({
				label: 'Password',
				value: 'Yes',
				tooltip: 'This release requires a password'
			});
		}

		return {
			badge: 'USENET',
			badgeClass: this.getAgeBadgeClass(ageDays),
			icon: 'server',
			availability: this.formatAgeDays(ageDays),
			details
		};
	}

	// =========================================================================
	// USENET-SPECIFIC METHODS
	// =========================================================================

	/**
	 * Calculate retention score (0-100)
	 * Higher score = more margin before expiration
	 */
	calculateRetentionScore(ageDays: number, maxRetentionDays: number): number {
		if (ageDays >= maxRetentionDays) {
			return 0;
		}
		const remaining = maxRetentionDays - ageDays;
		return Math.min(100, Math.floor((remaining / maxRetentionDays) * 100));
	}

	/**
	 * Check if release is complete (no missing parts)
	 */
	isComplete(result: ReleaseResult): boolean {
		const usenet = result.usenet;
		if (!usenet?.completionPercentage) {
			return true; // Assume complete if not specified
		}
		return usenet.completionPercentage >= 99;
	}

	/**
	 * Get NZB direct download URL
	 */
	getNzbUrl(result: ReleaseResult, apiKey?: string): string {
		let url = result.downloadUrl;

		if (apiKey && !url.includes('apikey=') && !url.includes('api_key=')) {
			const separator = url.includes('?') ? '&' : '?';
			url = `${url}${separator}apikey=${apiKey}`;
		}

		return url;
	}

	// =========================================================================
	// PRIVATE METHODS
	// =========================================================================

	/**
	 * Calculate age in days from publish date
	 */
	private calculateAgeDays(publishDate: Date): number {
		const now = new Date();
		const diffMs = now.getTime() - new Date(publishDate).getTime();
		return Math.floor(diffMs / (1000 * 60 * 60 * 24));
	}

	/**
	 * Format age in days for display
	 */
	private formatAgeDays(days: number): string {
		if (days === 0) return 'Today';
		if (days === 1) return '1 day';
		if (days < 7) return `${days} days`;
		if (days < 30) return `${Math.floor(days / 7)} weeks`;
		if (days < 365) return `${Math.floor(days / 30)} months`;
		return `${Math.floor(days / 365)} years`;
	}

	/**
	 * Get badge class based on age
	 */
	private getAgeBadgeClass(ageDays: number): string {
		if (ageDays < 7) return 'badge-success'; // Fresh
		if (ageDays < 30) return 'badge-info'; // Recent
		if (ageDays < 180) return 'badge-warning'; // Getting old
		return 'badge-error'; // Old
	}
}

/**
 * Singleton instance
 */
let instance: UsenetProtocolHandler | null = null;

export function getUsenetHandler(): UsenetProtocolHandler {
	if (!instance) {
		instance = new UsenetProtocolHandler();
	}
	return instance;
}
