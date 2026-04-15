import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSubtitleDownloadService } from '$lib/server/subtitles/services/SubtitleDownloadService';

/**
 * DELETE /api/subtitles/[id]
 * Delete a subtitle file from disk and remove the database record.
 * Optionally add to blacklist.
 *
 * Query params:
 *   blacklist=true  - Add to provider blacklist
 *   reason=out_of_sync - Blacklist reason
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
	const { id } = params;

	if (!id) {
		return json({ error: 'Subtitle ID is required' }, { status: 400 });
	}

	const addToBlacklist = url.searchParams.get('blacklist') === 'true';
	const reason = url.searchParams.get('reason') as
		| 'wrong_content'
		| 'out_of_sync'
		| 'poor_quality'
		| 'manual'
		| null;

	const downloadService = getSubtitleDownloadService();

	await downloadService.delete(id, addToBlacklist, addToBlacklist && reason ? reason : undefined);

	return json({ success: true });
};
