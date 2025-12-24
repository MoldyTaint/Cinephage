/**
 * File Transfer Service
 *
 * Handles moving/copying/hardlinking files from download location to library.
 * Prefers hardlinks to save disk space while keeping files for seeding.
 */

import { link, copyFile, mkdir, stat, readdir, unlink, rename, lstat, readlink, symlink } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';
import { logger } from '$lib/logging';

/**
 * Transfer mode for files
 */
export type TransferMode = 'hardlink' | 'copy' | 'move' | 'symlink';

/**
 * Result of a file transfer operation
 */
export interface TransferResult {
	success: boolean;
	sourcePath: string;
	destPath: string;
	mode: TransferMode;
	error?: string;
	sizeBytes?: number;
}

/**
 * Check if two paths are on the same filesystem (for hardlink compatibility)
 */
async function isSameFilesystem(path1: string, path2: string): Promise<boolean> {
	try {
		const stat1 = await stat(path1);
		const stat2 = await stat(dirname(path2)); // Check dest directory

		// Compare device IDs
		return stat1.dev === stat2.dev;
	} catch {
		return false;
	}
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
	try {
		await mkdir(dirPath, { recursive: true });
	} catch (error) {
		// Ignore if already exists
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
			throw error;
		}
	}
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
	try {
		await stat(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Get file size in bytes
 */
export async function getFileSize(filePath: string): Promise<number> {
	const stats = await stat(filePath);
	return stats.size;
}

/**
 * Check if a path is a symbolic link
 */
export async function isSymlink(filePath: string): Promise<boolean> {
	try {
		const stats = await lstat(filePath);
		return stats.isSymbolicLink();
	} catch {
		return false;
	}
}

/**
 * Transfer a single file using hardlink (preferred), symlink preservation, or copy
 *
 * @param source - Source file path
 * @param dest - Destination file path
 * @param preferHardlink - Whether to try hardlink first (default: true)
 * @param preserveSymlinks - Whether to preserve symlinks instead of copying content (default: false)
 * @returns Transfer result
 */
export async function transferFile(
	source: string,
	dest: string,
	preferHardlink = true,
	preserveSymlinks = false
): Promise<TransferResult> {
	try {
		// Ensure destination directory exists
		await ensureDirectory(dirname(dest));

		// Check if destination already exists
		if (await fileExists(dest)) {
			logger.warn('Destination file already exists, will overwrite', { dest });
			await unlink(dest);
		}

		// Check if source is a symlink and preservation is enabled
		if (preserveSymlinks && (await isSymlink(source))) {
			const linkTarget = await readlink(source);
			await symlink(linkTarget, dest);

			// Get size from the actual target for reporting (stat follows symlinks)
			const sizeBytes = await getFileSize(source);

			logger.debug('Symlink preserved', { source, dest, target: linkTarget });

			return {
				success: true,
				sourcePath: source,
				destPath: dest,
				mode: 'symlink',
				sizeBytes
			};
		}

		// Get file size
		const sizeBytes = await getFileSize(source);

		// Try hardlink first if preferred
		if (preferHardlink) {
			const sameFs = await isSameFilesystem(source, dest);

			if (sameFs) {
				try {
					await link(source, dest);
					logger.debug('File hardlinked successfully', { source, dest });

					return {
						success: true,
						sourcePath: source,
						destPath: dest,
						mode: 'hardlink',
						sizeBytes
					};
				} catch (error) {
					const err = error as NodeJS.ErrnoException;
					// If hardlink fails (e.g., cross-device, permissions), fall back to copy
					logger.debug('Hardlink failed, falling back to copy', {
						error: err.message,
						code: err.code
					});
				}
			} else {
				logger.debug('Source and dest on different filesystems, using copy', {
					source,
					dest
				});
			}
		}

		// Fall back to copy
		await copyFile(source, dest);
		logger.debug('File copied successfully', { source, dest });

		return {
			success: true,
			sourcePath: source,
			destPath: dest,
			mode: 'copy',
			sizeBytes
		};
	} catch (error) {
		const err = error as Error;
		logger.error('File transfer failed', {
			source,
			dest,
			error: err.message
		});

		return {
			success: false,
			sourcePath: source,
			destPath: dest,
			mode: preferHardlink ? 'hardlink' : 'copy',
			error: err.message
		};
	}
}

/**
 * Move a file (rename if same filesystem, copy+delete if different)
 */
export async function moveFile(source: string, dest: string): Promise<TransferResult> {
	try {
		await ensureDirectory(dirname(dest));

		if (await fileExists(dest)) {
			await unlink(dest);
		}

		const sizeBytes = await getFileSize(source);

		// Try rename first (fast if same filesystem)
		try {
			await rename(source, dest);
			return {
				success: true,
				sourcePath: source,
				destPath: dest,
				mode: 'move',
				sizeBytes
			};
		} catch {
			// Cross-device move, need to copy then delete
			await copyFile(source, dest);
			await unlink(source);

			return {
				success: true,
				sourcePath: source,
				destPath: dest,
				mode: 'move',
				sizeBytes
			};
		}
	} catch (error) {
		return {
			success: false,
			sourcePath: source,
			destPath: dest,
			mode: 'move',
			error: (error as Error).message
		};
	}
}

/**
 * Options for batch transfer
 */
export interface BatchTransferOptions {
	/** Prefer hardlinks over copies */
	preferHardlink?: boolean;
	/** File extensions to transfer (e.g., ['.mkv', '.mp4']) */
	extensions?: string[];
	/** Preserve folder structure relative to source root */
	preserveStructure?: boolean;
}

/**
 * Batch transfer result
 */
export interface BatchTransferResult {
	success: boolean;
	totalFiles: number;
	successfulFiles: number;
	failedFiles: number;
	totalBytes: number;
	hardlinkedCount: number;
	copiedCount: number;
	results: TransferResult[];
	errors: string[];
}

/**
 * Transfer all matching files from a directory
 */
export async function transferDirectory(
	sourceDir: string,
	destDir: string,
	options: BatchTransferOptions = {}
): Promise<BatchTransferResult> {
	const { preferHardlink = true, extensions, preserveStructure = true } = options;

	const result: BatchTransferResult = {
		success: true,
		totalFiles: 0,
		successfulFiles: 0,
		failedFiles: 0,
		totalBytes: 0,
		hardlinkedCount: 0,
		copiedCount: 0,
		results: [],
		errors: []
	};

	try {
		const files = await findFilesRecursive(sourceDir, extensions);
		result.totalFiles = files.length;

		for (const file of files) {
			// Calculate destination path
			let destPath: string;
			if (preserveStructure) {
				const relativePath = file.slice(sourceDir.length).replace(/^\/+/, '');
				destPath = join(destDir, relativePath);
			} else {
				destPath = join(destDir, basename(file));
			}

			const transferResult = await transferFile(file, destPath, preferHardlink);
			result.results.push(transferResult);

			if (transferResult.success) {
				result.successfulFiles++;
				result.totalBytes += transferResult.sizeBytes || 0;

				if (transferResult.mode === 'hardlink') {
					result.hardlinkedCount++;
				} else {
					result.copiedCount++;
				}
			} else {
				result.failedFiles++;
				result.errors.push(`${file}: ${transferResult.error}`);
			}
		}

		result.success = result.failedFiles === 0;
	} catch (error) {
		result.success = false;
		result.errors.push((error as Error).message);
	}

	return result;
}

/**
 * Recursively find files in a directory
 */
async function findFilesRecursive(dir: string, extensions?: string[]): Promise<string[]> {
	const files: string[] = [];

	try {
		const entries = await readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(dir, entry.name);

			if (entry.isDirectory()) {
				// Skip hidden directories and system folders
				if (entry.name.startsWith('.') || entry.name.startsWith('@')) {
					continue;
				}
				const subFiles = await findFilesRecursive(fullPath, extensions);
				files.push(...subFiles);
			} else if (entry.isFile()) {
				// Filter by extension if specified
				if (extensions && extensions.length > 0) {
					const ext = extname(entry.name).toLowerCase();
					if (!extensions.includes(ext)) {
						continue;
					}
				}
				files.push(fullPath);
			}
		}
	} catch (error) {
		logger.warn('Failed to read directory', {
			dir,
			error: (error as Error).message
		});
	}

	return files;
}

/**
 * Video file extensions
 */
export const VIDEO_EXTENSIONS = [
	'.mkv',
	'.mp4',
	'.avi',
	'.mov',
	'.wmv',
	'.flv',
	'.webm',
	'.m4v',
	'.mpg',
	'.mpeg',
	'.ts',
	'.m2ts',
	'.strm'
];

/**
 * Check if a path is a video file
 */
export function isVideoFile(filePath: string): boolean {
	const ext = extname(filePath).toLowerCase();
	return VIDEO_EXTENSIONS.includes(ext);
}

/**
 * Find all video files in a directory
 */
export async function findVideoFiles(dir: string): Promise<string[]> {
	return findFilesRecursive(dir, VIDEO_EXTENSIONS);
}
