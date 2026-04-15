import type { HandleClientError } from '@sveltejs/kit';

import { logger } from '$lib/logging';

interface ClientErrorReportPayload {
	supportId: string;
	message: string;
	status?: number;
	path: string;
	routeId?: string | null;
	userAgent?: string;
	error?: {
		name?: string;
		message?: string;
		stack?: string;
	};
}

function createClientSupportId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID().split('-')[0] ?? crypto.randomUUID();
	}

	return Math.random().toString(36).slice(2, 10);
}

function serializeClientError(error: unknown): ClientErrorReportPayload['error'] | undefined {
	if (!(error instanceof Error)) {
		return undefined;
	}

	return {
		name: error.name,
		message: error.message,
		stack: error.stack
	};
}

function reportClientError(payload: ClientErrorReportPayload): void {
	if (typeof fetch !== 'function') {
		return;
	}

	void fetch('/api/settings/logs/client-report', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		credentials: 'same-origin',
		body: JSON.stringify(payload)
	}).catch(() => {
		// Best-effort reporting only; never disrupt the client error path.
	});
}

export const handleError: HandleClientError = ({ error, event, status }) => {
	const supportId = createClientSupportId();
	const message = 'Unhandled client error';
	const serializedError = serializeClientError(error);

	logger.error(
		{
			err: error,
			logDomain: 'client',
			component: 'hooks.client',
			supportId,
			status,
			path: event.url.pathname,
			routeId: event.route.id ?? null
		},
		message
	);

	reportClientError({
		supportId,
		message,
		status,
		path: event.url.pathname,
		routeId: event.route.id ?? null,
		userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
		error: serializedError
	});

	return {
		message: 'An unexpected error occurred',
		code: 'CLIENT_ERROR',
		supportId
	};
};
