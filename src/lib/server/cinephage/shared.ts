/**
 * Shared helpers for the Cinephage backend gateway.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getFirstString(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value === 'string' && value.trim().length > 0) {
			return value.trim();
		}
	}

	return undefined;
}

export function getHttpErrorStatus(error: unknown): number | undefined {
	if (isRecord(error) && typeof error.status === 'number') {
		return error.status;
	}

	return undefined;
}
