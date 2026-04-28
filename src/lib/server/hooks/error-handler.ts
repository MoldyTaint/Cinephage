import type { HandleServerError } from '@sveltejs/kit';
import { isAppError } from '$lib/errors';
import { logger } from '$lib/logging';
import { createSupportId } from '$lib/server/auth/session-helpers.js';

const handleError: HandleServerError = ({ error, event }) => {
	const correlationId = event.locals.requestId ?? event.locals.correlationId ?? 'unknown';
	const supportId = event.locals.supportId ?? createSupportId();
	const requestLogger = event.locals.logger ?? logger;

	requestLogger.error(
		{
			err: error,
			requestId: correlationId,
			correlationId,
			supportId,
			logDomain: 'http',
			method: event.request.method,
			path: event.url.pathname
		},
		'Uncaught exception'
	);

	if (isAppError(error)) {
		return {
			message: error.message,
			code: error.code,
			supportId
		};
	}

	return {
		message: error instanceof Error ? error.message : 'An unexpected error occurred',
		code: 'INTERNAL_ERROR',
		supportId
	};
};

export { handleError };
