export function getGrabErrorMessage(errorCode?: string, error?: string): string {
	switch (errorCode) {
		case 'NNTP_NOT_CONFIGURED':
			return 'No NNTP server configured. Add one in Settings -> Integrations -> NNTP Servers.';
		case 'NNTP_NOT_ENABLED':
			return 'No enabled NNTP server. Enable at least one server to use Stream.';
		case 'NNTP_UNAVAILABLE':
			return 'NNTP streaming is unavailable right now. Check NNTP server connectivity.';
		case 'NO_ENABLED_DOWNLOAD_CLIENT':
			return 'No enabled download client is configured for this protocol.';
		default:
			return error || 'Failed to grab';
	}
}
