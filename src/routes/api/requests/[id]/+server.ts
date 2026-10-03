/**
 * Cancel a request.
 *
 * DELETE /api/requests/[id] — the requester may cancel their own PENDING
 * request; admins may also cancel a pending one (decline is the admin
 * verb for decided outcomes; there is no delete endpoint in v1).
 * Cancellation is not decline: no reason, no cooldown.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getRequestService } from '$lib/server/requests/RequestService.js';
import { toRequestErrorResponse } from '$lib/server/requests/http.js';
import { requesterFromLocals } from '$lib/server/requests/http.js';

export const DELETE: RequestHandler = async (event) => {
	const requester = requesterFromLocals(event.locals);
	if (!requester) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const cancelled = await getRequestService().cancel(event.params.id, requester);
		return json({ success: true, request: cancelled });
	} catch (error) {
		return toRequestErrorResponse(error);
	}
};
