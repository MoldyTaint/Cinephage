import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLACEHOLDER_PACKAGE_VERSION } from '$lib/version.js';

function readVersion(value: string | undefined | null): string | null {
	const normalized = value?.trim();
	if (!normalized) return null;
	if (normalized === PLACEHOLDER_PACKAGE_VERSION) return null;
	return normalized;
}

let cachedPackageVersion: string | null | undefined;

function readPackageVersion(): string | null {
	if (cachedPackageVersion !== undefined) {
		return cachedPackageVersion;
	}

	try {
		const packageJsonPath = join(process.cwd(), 'package.json');
		const raw = readFileSync(packageJsonPath, 'utf-8');
		const parsed = JSON.parse(raw) as { version?: string };
		cachedPackageVersion = readVersion(parsed.version);
	} catch {
		cachedPackageVersion = null;
	}

	return cachedPackageVersion;
}

export function resolveAppVersion(): string {
	return (
		readVersion(process.env.APP_VERSION) ??
		readVersion(process.env.PUBLIC_APP_VERSION) ??
		readPackageVersion() ??
		readVersion(process.env.npm_package_version) ??
		'dev-local'
	);
}
