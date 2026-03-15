import type { SSEError, SSEErrorType } from './types.js';

export function classifyError(error: Event | Error): { type: SSEErrorType; message: string } {
	if (error instanceof Error) {
		if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
			return { type: 'timeout', message: error.message };
		}
		if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
			return { type: 'network', message: error.message };
		}
		return { type: 'client', message: error.message };
	}

	return { type: 'network', message: 'Connection failed' };
}

export function createSSEError(type: SSEErrorType, message: string, code?: number): SSEError {
	const error = new Error(message) as SSEError;
	error.type = type;
	error.code = code;
	return error;
}
