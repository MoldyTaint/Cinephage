/**
 * Hash utilities for extracting and normalizing torrent info hashes
 */

/**
 * Extract info hash from a magnet URI
 * Handles both v1 (40-char hex) and v2 (32-char base32) formats
 *
 * @param magnetUrl The magnet URI to extract hash from
 * @returns The lowercase hex hash, or undefined if not found
 */
export function extractInfoHash(magnetUrl?: string | null): string | undefined {
	if (!magnetUrl) return undefined;

	// Try hex format first (40 chars) - xt=urn:btih:HASH
	const hexMatch = magnetUrl.match(/xt=urn:btih:([a-fA-F0-9]{40})/i);
	if (hexMatch) {
		return hexMatch[1].toLowerCase();
	}

	// Try base32 format (32 chars) and convert to hex
	const base32Match = magnetUrl.match(/xt=urn:btih:([A-Z2-7]{32})/i);
	if (base32Match) {
		return base32ToHex(base32Match[1]);
	}

	return undefined;
}

/**
 * Resolve the first valid info hash from a direct value or a magnet/download URL.
 */
export function resolveInfoHash(...values: Array<string | null | undefined>): string | undefined {
	for (const value of values) {
		const normalized = normalizeInfoHash(value) || extractInfoHash(value);
		if (normalized) return normalized;
	}

	return undefined;
}

/**
 * Normalize an info hash to lowercase hex format
 *
 * @param hash The hash to normalize (hex or base32)
 * @returns Lowercase hex hash, or undefined if invalid
 */
export function normalizeInfoHash(hash?: string | null): string | undefined {
	if (!hash) return undefined;
	const normalized = hash.trim();

	// Already hex format (40 chars)
	if (/^[a-fA-F0-9]{40}$/.test(normalized)) {
		return normalized.toLowerCase();
	}

	// Base32 format (32 chars)
	if (/^[A-Z2-7]{32}$/i.test(normalized)) {
		return base32ToHex(normalized);
	}

	return undefined;
}

/**
 * Convert base32 encoded hash to hex
 *
 * @param base32 The base32 encoded hash
 * @returns Lowercase hex hash
 */
function base32ToHex(base32: string): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = '';

	for (const char of base32.toUpperCase()) {
		const val = alphabet.indexOf(char);
		if (val === -1) continue;
		bits += val.toString(2).padStart(5, '0');
	}

	let hex = '';
	for (let i = 0; i < bits.length - 3; i += 4) {
		hex += parseInt(bits.substring(i, i + 4), 2).toString(16);
	}

	return hex.toLowerCase();
}

/**
 * Check if two hashes match (case-insensitive)
 *
 * @param hash1 First hash
 * @param hash2 Second hash
 * @returns True if hashes match
 */
export function hashesMatch(hash1?: string | null, hash2?: string | null): boolean {
	if (!hash1 || !hash2) return false;

	const normalized1 = normalizeInfoHash(hash1);
	const normalized2 = normalizeInfoHash(hash2);

	if (!normalized1 || !normalized2) return false;

	return normalized1 === normalized2;
}
