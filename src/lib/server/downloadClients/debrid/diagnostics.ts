export function redactDebridDiagnostic(message: string): string {
	return message
		.replace(/https?:\/\/\S+/g, '[redacted-url]')
		.replace(/token=[^\s&]+/gi, 'token=[redacted]')
		.replace(/signature=[^\s&]+/gi, 'signature=[redacted]');
}

export function debridErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? redactDebridDiagnostic(error.message) : fallback;
}
