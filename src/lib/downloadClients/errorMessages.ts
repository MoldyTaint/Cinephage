/**
 * Normalize download client errors into user-friendly messages for UI surfaces.
 */
export function toFriendlyDownloadClientError(error?: string | null): string {
	const raw = (error ?? '').trim();
	if (!raw) {
		return 'Connection test failed. Please review the client settings and try again.';
	}

	const msg = raw.toLowerCase();

	if (msg.includes('validation failed')) {
		return 'Please review the required fields and connection settings.';
	}

	if (
		msg.includes('authentication failed') ||
		msg.includes('invalid credentials') ||
		msg.includes('wrong api key') ||
		msg.includes('api key') ||
		msg.includes('unauthorized') ||
		msg.includes('forbidden')
	) {
		return 'Authentication failed. Check username/password or API key.';
	}

	if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('aborterror')) {
		return 'Connection timed out. Verify the service is online and reachable.';
	}

	if (
		msg.includes('fetch failed') ||
		msg.includes('failed to connect') ||
		msg.includes('econnrefused') ||
		msg.includes('enotfound') ||
		msg.includes('ehostunreach') ||
		msg.includes('network error')
	) {
		return 'Unable to reach the download client. Check host, port, SSL, and URL base.';
	}

	if (msg.includes('404') || (msg.includes('not found') && msg.includes('api'))) {
		return 'Download client API endpoint not found. Check host, port, and URL base path.';
	}

	if (
		msg.includes('500') ||
		msg.includes('502') ||
		msg.includes('503') ||
		msg.includes('504') ||
		msg.includes('bad gateway')
	) {
		return 'Download client returned a server error. Check service health and try again.';
	}

	if (msg.includes('download client not found')) {
		return 'Download client no longer exists. Refresh the page and try again.';
	}

	return raw;
}
