import { resolveAppVersion as resolveAppVersionBase } from '$lib/server/version';

/**
 * Cinephage subsystem version resolution.
 *
 * The running Cinephage server knows its own version (and ideally its commit,
 * baked into the Docker image at build time). This module exposes that identity
 * for use as X-Cinephage-Version / X-Cinephage-Commit headers when calling
 * api.cinephage.net. Users no longer have to populate these manually.
 *
 * Resolution chain (per field):
 *   1. Manual override from cinephage_api_config (escape hatch for custom builds)
 *   2. APP_VERSION / APP_COMMIT env vars (baked into Dockerfile at build)
 *   3. null — subsystem reports "not configured" and test() fails clearly
 *
 * `resolveAppVersion` reuses the existing helper at src/lib/server/version.ts
 * to stay consistent with the rest of the app.
 */

const PLACEHOLDER_VALUES = new Set(['0.0.0-development', '0.1.0', '0.0.0']);

function normalizeString(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	if (PLACEHOLDER_VALUES.has(trimmed)) return null;
	return trimmed;
}

export function resolveAppVersion(): string {
	// Reuses the canonical resolver; falls back to 'dev-local' for dev checkouts.
	return resolveAppVersionBase();
}

export function resolveAppCommit(): string | null {
	return normalizeString(process.env.APP_COMMIT);
}

export interface CinephageServerIdentity {
	/** Resolved version string. Always set (falls back to 'dev-local'). */
	version: string;
	/** Resolved commit short-SHA. Null when neither override nor APP_COMMIT env is set. */
	commit: string | null;
	/** True when both version and commit are non-placeholder. Required for API calls. */
	isConfigured: boolean;
}

export function getServerIdentity(overrides: {
	versionOverride: string | null;
	commitOverride: string | null;
}): CinephageServerIdentity {
	const version = normalizeString(overrides.versionOverride) ?? resolveAppVersion();
	const commit = normalizeString(overrides.commitOverride) ?? resolveAppCommit();

	return {
		version,
		commit,
		isConfigured: Boolean(version) && Boolean(commit) && !PLACEHOLDER_VALUES.has(version)
	};
}
