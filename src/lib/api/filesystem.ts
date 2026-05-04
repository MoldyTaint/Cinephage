import { apiGet } from './client.js';

export async function browseFilesystem(
	path?: string,
	opts?: { includeFiles?: boolean; fileFilter?: string; excludeManagedRoots?: boolean }
) {
	const params: Record<string, string> = {};
	if (path) params.path = path;
	if (opts?.includeFiles) params.includeFiles = 'true';
	if (opts?.fileFilter) params.fileFilter = opts.fileFilter;
	if (opts?.excludeManagedRoots) params.excludeManagedRoots = 'true';
	return apiGet('/api/filesystem/browse', params);
}
