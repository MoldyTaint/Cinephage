import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';
import { stat } from 'node:fs/promises';
import { manualImportService } from '$lib/server/library/manual-import-service.js';
import { isPathAllowed, isPathInsideManagedRoot } from '$lib/server/filesystem/path-guard.js';
import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';

const detectSchema = z.object({
	sourcePath: z.string().min(1),
	mediaType: z.enum(['movie', 'tv']).optional(),
	requireFile: z.boolean().optional()
});

function getDetectErrorMessage(error: unknown): string {
	const fsError = error as NodeJS.ErrnoException;
	if (fsError?.code === 'ENOENT') {
		if (fsError?.syscall === 'scandir') {
			return 'Could not scan one or more folders. Try selecting a specific folder or media file.';
		}
		return 'Selected path no longer exists. Please choose it again.';
	}

	if (fsError?.code === 'EACCES' || fsError?.code === 'EPERM') {
		return 'Permission denied while scanning this path. Choose a folder Cinephage can access.';
	}

	return error instanceof Error ? error.message : 'Failed to detect media from path';
}

export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const { request } = event;
	try {
		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
		}

		const parsed = detectSchema.safeParse(body);
		if (!parsed.success) {
			return json(
				{
					success: false,
					error: 'Validation failed',
					details: parsed.error.flatten()
				},
				{ status: 400 }
			);
		}

		const { sourcePath, mediaType, requireFile } = parsed.data;
		if (!(await isPathAllowed(sourcePath))) {
			return json(
				{
					success: false,
					error: 'Access denied: Path is outside allowed directories'
				},
				{ status: 403 }
			);
		}
		if (await isPathInsideManagedRoot(sourcePath)) {
			return json(
				{
					success: false,
					error: 'Import source cannot be inside a managed root folder.'
				},
				{ status: 400 }
			);
		}
		if (requireFile) {
			const sourceStats = await stat(sourcePath);
			if (!sourceStats.isFile()) {
				return json(
					{
						success: false,
						error: 'Please select a media file for this import.'
					},
					{ status: 400 }
				);
			}
		}

		const result = await manualImportService.detectFromPath(sourcePath, mediaType);
		return json({ success: true, data: result });
	} catch (error) {
		logger.error('[API] Manual import detect failed', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: getDetectErrorMessage(error)
			},
			{ status: 500 }
		);
	}
};
