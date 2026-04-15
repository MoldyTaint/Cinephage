import { z } from 'zod';

/**
 * Validates file paths to prevent path traversal attacks
 * Rejects any path containing '..' or starting with '/'
 *
 * @param path - The path to validate
 * @returns The validated path
 * @throws Error if path contains traversal patterns
 */
export function validateSafePath(path: string): string {
	// Reject paths with parent directory references
	if (path.includes('..')) {
		throw new Error('Invalid path: path traversal detected');
	}

	// Reject absolute paths
	if (path.startsWith('/')) {
		throw new Error('Invalid path: absolute paths not allowed');
	}

	// Reject paths with null bytes
	if (path.includes('\0')) {
		throw new Error('Invalid path: null bytes not allowed');
	}

	// Normalize the path (remove redundant separators, etc.)
	const normalized = path.replace(/\/+/g, '/').replace(/\/+$/, '');

	// Double-check after normalization
	if (normalized.includes('..')) {
		throw new Error('Invalid path: path traversal detected');
	}

	return normalized;
}

/**
 * Zod schema for safe file paths
 */
export const safePathSchema = z
	.string()
	.refine((path) => !path.includes('..'), {
		message: 'Path cannot contain parent directory references (..)'
	})
	.refine((path) => !path.startsWith('/'), { message: 'Absolute paths are not allowed' })
	.refine((path) => !path.includes('\0'), { message: 'Path cannot contain null bytes' });

/**
 * Validates a backup ID to prevent path traversal
 * Only allows alphanumeric characters, hyphens, underscores, and dots
 */
export function validateBackupId(backupId: string): string {
	const validPattern = /^[a-zA-Z0-9_.-]+$/;

	if (!validPattern.test(backupId)) {
		throw new Error(
			'Invalid backup ID: only alphanumeric characters, hyphens, underscores, and dots are allowed'
		);
	}

	return backupId;
}

/**
 * Zod schema for backup IDs
 */
export const backupIdSchema = z
	.string()
	.regex(
		/^[a-zA-Z0-9_.-]+$/,
		'Backup ID can only contain alphanumeric characters, hyphens, underscores, and dots'
	);

/**
 * Validates folder names to prevent directory traversal
 */
export function validateFolderName(name: string): string {
	const validPattern = /^[a-zA-Z0-9_\-\s]+$/;

	if (!validPattern.test(name)) {
		throw new Error(
			'Invalid folder name: only alphanumeric characters, spaces, hyphens, and underscores are allowed'
		);
	}

	return name.trim();
}

/**
 * Zod schema for folder names
 */
export const folderNameSchema = z
	.string()
	.regex(
		/^[a-zA-Z0-9_\-\s]+$/,
		'Folder name can only contain alphanumeric characters, spaces, hyphens, and underscores'
	)
	.transform((s) => s.trim());

/**
 * Validates file names to prevent directory traversal and dangerous extensions
 */
export function validateFileName(name: string): string {
	// Reject paths with directory separators
	if (name.includes('/') || name.includes('\\')) {
		throw new Error('Invalid file name: directory separators not allowed');
	}

	// Reject parent directory references
	if (name.includes('..')) {
		throw new Error('Invalid file name: path traversal detected');
	}

	// Check for dangerous extensions
	const lowerName = name.toLowerCase();
	const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.php', '.jsp', '.asp'];
	for (const ext of dangerousExtensions) {
		if (lowerName.endsWith(ext)) {
			throw new Error(`Invalid file name: ${ext} files are not allowed`);
		}
	}

	return name;
}

/**
 * Zod schema for file names
 */
export const fileNameSchema = z
	.string()
	.refine((name) => !name.includes('/') && !name.includes('\\'), {
		message: 'File name cannot contain directory separators'
	})
	.refine((name) => !name.includes('..'), {
		message: 'File name cannot contain parent directory references'
	})
	.refine(
		(name) => {
			const lowerName = name.toLowerCase();
			const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.php', '.jsp', '.asp'];
			return !dangerousExtensions.some((ext) => lowerName.endsWith(ext));
		},
		{ message: 'File type not allowed for security reasons' }
	);
