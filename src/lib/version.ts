export const PLACEHOLDER_PACKAGE_VERSION = '0.1.0';

export function ensureVersionPrefix(version: string): string {
	if (version.startsWith('dev-') || version.startsWith('sha-')) return version;
	return version.startsWith('v') ? version : `v${version}`;
}
