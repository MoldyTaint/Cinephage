import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';
import { manualImportService } from '$lib/server/library/manual-import-service.js';
import { isPathAllowed, isPathInsideManagedRoot } from '$lib/server/filesystem/path-guard.js';
import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';

const executeSchema = z
	.object({
		sourcePath: z.string().min(1).optional(),
		selectedFilePath: z.string().min(1).optional(),
		mediaType: z.enum(['movie', 'tv']),
		tmdbId: z.number().int().positive(),
		importTarget: z.enum(['new', 'existing']),
		rootFolderId: z.string().optional(),
		libraryId: z.string().optional(),
		seasonNumber: z.number().int().min(0).optional(),
		episodeNumber: z.number().int().min(1).optional()
	})
	.superRefine((value, ctx) => {
		if (!value.sourcePath && !value.selectedFilePath) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'sourcePath or selectedFilePath is required',
				path: ['sourcePath']
			});
		}
	});

function getExecuteErrorMessage(error: unknown): string {
	const fsError = error as NodeJS.ErrnoException;
	if (fsError?.code === 'ENOENT') {
		return 'Selected path no longer exists. Please choose it again.';
	}

	if (fsError?.code === 'EACCES' || fsError?.code === 'EPERM') {
		return 'Permission denied while importing from this path.';
	}

	return error instanceof Error ? error.message : 'Failed to import file';
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

		const parsed = executeSchema.safeParse(body);
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

		const payload = parsed.data;
		const importPath = payload.sourcePath ?? payload.selectedFilePath;

		if (!importPath || !(await isPathAllowed(importPath))) {
			return json(
				{
					success: false,
					error: 'Access denied: Path is outside allowed directories'
				},
				{ status: 403 }
			);
		}
		if (await isPathInsideManagedRoot(importPath)) {
			return json(
				{
					success: false,
					error: 'Import source cannot be inside a managed root folder.'
				},
				{ status: 400 }
			);
		}

		const result = await manualImportService.executeImport(payload);
		return json({ success: true, data: result });
	} catch (error) {
		logger.error('[API] Manual import execute failed', error instanceof Error ? error : undefined);
		return json(
			{
				success: false,
				error: getExecuteErrorMessage(error)
			},
			{ status: 500 }
		);
	}
};
