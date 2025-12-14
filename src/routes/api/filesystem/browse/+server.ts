import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readdir, stat } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';
import { RootFolderService } from '$lib/server/downloadClients/RootFolderService';

export interface DirectoryEntry {
	name: string;
	path: string;
	isDirectory: boolean;
}

export interface BrowseResponse {
	currentPath: string;
	parentPath: string | null;
	entries: DirectoryEntry[];
	error?: string;
}

/**
 * Validates that a path is within allowed boundaries (home directory or configured root folders).
 * Prevents path traversal attacks.
 */
async function isPathAllowed(requestedPath: string): Promise<boolean> {
	const normalizedPath = resolve(requestedPath);
	const homeDir = homedir();

	// Always allow paths within home directory
	if (normalizedPath.startsWith(homeDir)) {
		return true;
	}

	// Also allow paths within configured root folders
	const rootFolderService = new RootFolderService();
	const rootFolders = await rootFolderService.getFolders();

	for (const folder of rootFolders) {
		const normalizedRootPath = resolve(folder.path);
		if (
			normalizedPath.startsWith(normalizedRootPath) ||
			normalizedRootPath.startsWith(normalizedPath)
		) {
			return true;
		}
	}

	// Allow common base paths that might contain root folders
	// Include '/' to support Docker volume mounts like /movies, /tv, etc.
	const commonBasePaths = ['/', '/mnt', '/media', '/srv', '/data', '/storage'];
	for (const basePath of commonBasePaths) {
		if (normalizedPath.startsWith(basePath)) {
			return true;
		}
	}

	return false;
}

export const GET: RequestHandler = async ({ url }) => {
	const rawPath = url.searchParams.get('path') || homedir();
	const requestedPath = resolve(rawPath); // Normalize to prevent ../ tricks

	// Validate path is within allowed boundaries
	if (!(await isPathAllowed(requestedPath))) {
		return json(
			{
				currentPath: requestedPath,
				parentPath: null,
				entries: [],
				error: 'Access denied: Path is outside allowed directories'
			} satisfies BrowseResponse,
			{ status: 403 }
		);
	}

	try {
		const stats = await stat(requestedPath);
		if (!stats.isDirectory()) {
			return json({
				currentPath: requestedPath,
				parentPath: dirname(requestedPath),
				entries: [],
				error: 'Path is not a directory'
			} satisfies BrowseResponse);
		}

		const items = await readdir(requestedPath, { withFileTypes: true });

		const entries: DirectoryEntry[] = items
			.filter((item) => item.isDirectory())
			.filter((item) => !item.name.startsWith('.')) // Hide hidden folders
			.map((item) => ({
				name: item.name,
				path: join(requestedPath, item.name),
				isDirectory: true
			}))
			.sort((a, b) => a.name.localeCompare(b.name));

		// Only show parent path if it's within allowed boundaries
		const potentialParent = requestedPath !== '/' ? dirname(requestedPath) : null;
		const parentPath =
			potentialParent && (await isPathAllowed(potentialParent)) ? potentialParent : null;

		return json({
			currentPath: requestedPath,
			parentPath,
			entries
		} satisfies BrowseResponse);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json(
			{
				currentPath: requestedPath,
				parentPath: dirname(requestedPath),
				entries: [],
				error: `Cannot access path: ${message}`
			} satisfies BrowseResponse,
			{ status: 400 }
		);
	}
};
