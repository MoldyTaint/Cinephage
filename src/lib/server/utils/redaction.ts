/**
 * Credential Redaction Utilities
 *
 * Shared helpers to redact sensitive fields (API keys, passwords, tokens, etc.)
 * before returning data to the client.
 */

/** Keys whose values should be redacted in settings objects */
const SENSITIVE_KEY_PATTERNS = ['key', 'password', 'secret', 'token', 'cookie'];

/**
 * Redact sensitive values in a settings/config object.
 * Matches keys containing any of the sensitive patterns (case-insensitive).
 *
 * @param settings - The settings object to redact
 * @returns A new object with sensitive values replaced by '[REDACTED]'
 */
export function redactSettings(
	settings: Record<string, unknown> | null | undefined
): Record<string, unknown> {
	if (!settings) return {};

	return Object.fromEntries(
		Object.entries(settings).map(([key, value]) => {
			const lowerKey = key.toLowerCase();
			const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => lowerKey.includes(pattern));
			if (isSensitive) {
				return [key, value ? '[REDACTED]' : null];
			}
			return [key, value];
		})
	);
}

/**
 * Redact an indexer record for API responses.
 * Applies redactSettings to the indexer's settings object.
 */
export function redactIndexer<T extends { settings?: Record<string, unknown> | null }>(
	indexer: T
): T {
	return {
		...indexer,
		settings: redactSettings(indexer.settings)
	};
}
