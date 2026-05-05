import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { manualImportSchema } from '$lib/validation/schemas.js';
import { manualImportService } from '$lib/server/library/manual-import-service.js';
import { isPathAllowed, isPathInsideManagedRoot } from '$lib/server/filesystem/path-guard.js';
import { logger } from '$lib/logging';
import { requireAdmin } from '$lib/server/auth/authorization.js';

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

		const parsed = manualImportSchema.safeParse(body);
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
