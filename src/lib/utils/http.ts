export async function readResponsePayload<T = unknown>(
	response: Response
): Promise<T | string | null> {
	const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

	if (contentType.includes('application/json')) {
		return (await response.json().catch(() => null)) as T | null;
	}

	const text = await response.text().catch(() => '');
	const trimmed = text.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function getResponseErrorMessage(payload: unknown, fallback: string): string {
	if (!payload) {
		return fallback;
	}

	if (typeof payload === 'string') {
		if (
			(/authentication required/i.test(payload) || /unauthorized/i.test(payload)) &&
			!/api key required/i.test(payload)
		) {
			return 'Request blocked because your session could not be validated. Refresh and sign in again. If you are using Docker, a LAN IP, or a reverse proxy, verify ORIGIN and BETTER_AUTH_URL.';
		}

		if (/cross-site/i.test(payload) && /forbidden/i.test(payload)) {
			return 'Request blocked by origin/CSRF protection. Check ORIGIN and reverse proxy configuration.';
		}

		if (/csrf/i.test(payload) || /origin/i.test(payload)) {
			return 'Request blocked by origin/CSRF protection. Check ORIGIN and reverse proxy configuration.';
		}

		if (/FOREIGN KEY constraint failed/i.test(payload)) {
			return 'The selected root folder or one of its linked library settings is no longer valid. Refresh the page and try again.';
		}

		return payload;
	}

	if (typeof payload !== 'object') {
		return fallback;
	}

	const record = payload as Record<string, unknown>;
	const nestedData =
		record.data && typeof record.data === 'object'
			? (record.data as Record<string, unknown>)
			: null;

	const candidates = [
		record.error,
		record.message,
		nestedData?.error,
		nestedData?.message,
		nestedData?.rootFolderError,
		nestedData?.indexerError
	];

	for (const candidate of candidates) {
		if (typeof candidate === 'string' && candidate.trim().length > 0) {
			if (
				(/authentication required/i.test(candidate) || /unauthorized/i.test(candidate)) &&
				!/api key required/i.test(candidate)
			) {
				return 'Request blocked because your session could not be validated. Refresh and sign in again. If you are using Docker, a LAN IP, or a reverse proxy, verify ORIGIN and BETTER_AUTH_URL.';
			}

			if (
				/csrf/i.test(candidate) ||
				/cross-site/i.test(candidate) ||
				(/origin/i.test(candidate) && /forbidden/i.test(candidate))
			) {
				return 'Request blocked by origin/CSRF protection. Check ORIGIN and reverse proxy configuration.';
			}

			if (/FOREIGN KEY constraint failed/i.test(candidate)) {
				return 'The selected root folder or one of its linked library settings is no longer valid. Refresh the page and try again.';
			}

			return candidate;
		}
	}

	return fallback;
}
