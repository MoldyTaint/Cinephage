export const PLACEHOLDER_PACKAGE_VERSION = '0.0.1';

function readVersion(value: string | undefined): string | null {
	const normalized = value?.trim();
	if (!normalized) return null;
	if (normalized === PLACEHOLDER_PACKAGE_VERSION) return null;
	return normalized;
}

export function resolveAppVersion(): string {
	return (
		readVersion(process.env.APP_VERSION) ??
		readVersion(process.env.npm_package_version) ??
		'dev-local'
	);
}
