import type { DownloadClientConfig } from './interfaces.js';

export function buildBaseUrl(config: DownloadClientConfig, defaultPath: string): string {
	const protocol = config.useSsl ? 'https' : 'http';
	const base = `${protocol}://${config.host}:${config.port}`;
	const urlBase = config.urlBase?.trim().replace(/^\/+|\/+$/g, '');
	if (!urlBase) {
		return `${base}/${defaultPath.replace(/^\/+/, '')}`;
	}
	return `${base}/${urlBase.replace(/^\/+/, '')}/${defaultPath.replace(/^\/+/, '')}`;
}

export function getBasicAuthHeader(
	username: string | undefined | null,
	password: string | undefined | null
): string | null {
	if (!username) return null;
	const pw = password ?? '';
	const encoded = Buffer.from(`${username}:${pw}`).toString('base64');
	return `Basic ${encoded}`;
}

/**
 * Join a client default path with a category name (Radarr-style `[category]`
 * subdirectory). Returns '' when either side is blank so callers fall back
 * to current behavior. Explicit savePath always wins at the call site.
 */
export function joinCategoryPath(basePath: string, category: string): string {
	const base = basePath.trim().replace(/\/+$/, '');
	const name = category.trim();
	return base && name ? `${base}/${name}` : '';
}
