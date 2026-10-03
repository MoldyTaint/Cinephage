/**
 * Approve a request. Admin only (the viewer allowlist blocks non-admins
 * before this handler runs). Approval drives the library-add orchestrators
 * and may park in awaiting_target when no writable target exists.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { requireAdmin } from '$lib/server/auth/authorization.js';
import { getRequestService } from '$lib/server/requests/RequestService.js';
import { toRequestErrorResponse } from '$lib/server/requests/http.js';
import { requesterFromLocals } from '$lib/server/requests/http.js';

export const POST: RequestHandler = async (event) => {
	const authError = requireAdmin(event);
	if (authError) return authError;

	const requester = requesterFromLocals(event.locals);
	if (!requester) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const approved = await getRequestService().approve(event.params.id, requester);
		return json({ success: true, request: approved });
	} catch (error) {
		return toRequestErrorResponse(error);
	}
};
