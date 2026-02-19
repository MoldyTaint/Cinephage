/**
 * Structured logging utilities.
 * Provides consistent JSON-formatted logs with context.
 * Supports both console and file output.
 */

import { fileLogger, type LogCategory, type FileLoggerConfig } from './FileLogger.js';

export type { LogCategory, FileLoggerConfig };
export { fileLogger };

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
	correlationId?: string;
	userId?: string;
	workerId?: string;
	workerType?: string;
	logCategory?: LogCategory;
	[key: string]: unknown;
}

interface LogEntry {
	timestamp: string;
	level: LogLevel;
	message: string;
	correlationId?: string;
	workerId?: string;
	workerType?: string;
	error?: {
		message: string;
		stack?: string;
		name?: string;
	};
	[key: string]: unknown;
}

const REDACTED = '[REDACTED]';

const SENSITIVE_QUERY_KEYS = [
	'apikey',
	'api_key',
	'api-key',
	'apiKey',
	'password',
	'passwd',
	'pwd',
	'passkey',
	'secret',
	'token',
	'access_token',
	'auth',
	'authorization',
	'cookie',
	'session',
	'credential',
	'key'
];

const SENSITIVE_OBJECT_KEYS = [
	'apikey',
	'api_key',
	'api-key',
	'apiKey',
	'password',
	'passwd',
	'pwd',
	'passkey',
	'secret',
	'token',
	'access_token',
	'auth',
	'authorization',
	'cookie',
	'session',
	'credential'
];

function isSensitiveObjectKey(key: string): boolean {
	if (isRedactionBypassed()) return false;
	const lower = key.toLowerCase();
	return SENSITIVE_OBJECT_KEYS.some((sensitiveKey) => {
		const sensitiveLower = sensitiveKey.toLowerCase();
		return (
			lower === sensitiveLower ||
			lower.endsWith(`_${sensitiveLower}`) ||
			lower.endsWith(`-${sensitiveLower}`)
		);
	});
}

/**
 * Whether log redaction is bypassed.
 * Set LOG_SENSITIVE=true to disable redaction for debugging.
 * Default: false (redaction enabled).
 */
function isRedactionBypassed(): boolean {
	return process.env.LOG_SENSITIVE === 'true';
}

function redactString(input: string): string {
	if (!input) return input;
	if (isRedactionBypassed()) return input;

	const queryKeyPattern = SENSITIVE_QUERY_KEYS.map((key) =>
		key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
	).join('|');

	let redacted = input;

	// Redact credentials in URLs like protocol://user:pass@host
	redacted = redacted.replace(
		/(https?:\/\/)([^/\s:@]+):([^/\s@]+)@/gi,
		(_match, protocol: string) => `${protocol}${REDACTED}:${REDACTED}@`
	);

	// Redact sensitive query parameters in URLs and URL-like strings.
	redacted = redacted.replace(
		new RegExp(`([?&](?:${queryKeyPattern})=)[^&\\s;]+`, 'gi'),
		(_match, prefix: string) => `${prefix}${REDACTED}`
	);

	// Redact common key-value pairs that may appear in plain text.
	redacted = redacted.replace(
		new RegExp(`\\b(${queryKeyPattern})\\b\\s*[:=]\\s*([^\\s,;]+)`, 'gi'),
		(_match, key: string) => `${key}=${REDACTED}`
	);

	// Redact authorization-style headers.
	redacted = redacted.replace(
		/\b(authorization|proxy-authorization)\b\s*[:=]\s*(bearer\s+)?([^\s,;]+)/gi,
		(_match, header: string, bearerPrefix?: string) =>
			`${header}: ${(bearerPrefix ?? '').trim()}${bearerPrefix ? ' ' : ''}${REDACTED}`.trim()
	);

	return redacted;
}

function sanitizeLogValue(value: unknown, seen: WeakSet<object>): unknown {
	if (value === null || value === undefined) return value;

	if (typeof value === 'string') {
		return redactString(value);
	}

	if (typeof value !== 'object') {
		return value;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (value instanceof URL) {
		return redactString(value.toString());
	}

	if (value instanceof Error) {
		return {
			name: value.name,
			message: redactString(value.message),
			...(shouldIncludeErrorStack() && value.stack ? { stack: redactString(value.stack) } : {})
		};
	}

	if (Array.isArray(value)) {
		return value.map((item) => sanitizeLogValue(item, seen));
	}

	if (seen.has(value as object)) {
		return '[Circular]';
	}
	seen.add(value as object);

	const objectValue = value as Record<string, unknown>;
	const sanitized: Record<string, unknown> = {};
	for (const [key, nestedValue] of Object.entries(objectValue)) {
		if (isSensitiveObjectKey(key)) {
			sanitized[key] = REDACTED;
			continue;
		}
		sanitized[key] = sanitizeLogValue(nestedValue, seen);
	}

	return sanitized;
}

function sanitizeLogContext(context: LogContext): LogContext {
	return sanitizeLogValue(context, new WeakSet<object>()) as LogContext;
}

/**
 * Check if we're in development mode.
 */
function isDev(): boolean {
	try {
		return import.meta.env?.DEV ?? process.env.NODE_ENV === 'development';
	} catch {
		return false;
	}
}

/**
 * Whether error stack traces should be included in log output.
 * Defaults to enabled in development, disabled in production.
 * Override with LOG_INCLUDE_STACK=true|false.
 */
function shouldIncludeErrorStack(): boolean {
	const configured = process.env.LOG_INCLUDE_STACK;
	if (configured === 'true') return true;
	if (configured === 'false') return false;
	return isDev();
}

/**
 * Formats a log entry as JSON string.
 */
function formatLog(level: LogLevel, message: string, context: LogContext, error?: Error): string {
	const sanitizedContext = sanitizeLogContext(context);
	const entry: LogEntry = {
		timestamp: new Date().toISOString(),
		level,
		message: redactString(message),
		...sanitizedContext
	};

	if (error) {
		entry.error = {
			message: redactString(error.message),
			name: error.name,
			...(shouldIncludeErrorStack() && error.stack ? { stack: redactString(error.stack) } : {})
		};
	}

	return JSON.stringify(entry);
}

/**
 * Write to file logger if logCategory specified.
 */
function writeToFile(formatted: string, context: LogContext): void {
	const category = context.logCategory || 'main';
	fileLogger.write(category, formatted);
}

/**
 * Structured logger with JSON output.
 * Writes to both console and file (based on category).
 *
 * @example
 * logger.info('User logged in', { userId: '123', correlationId });
 * logger.error('Failed to fetch', error, { correlationId, path: '/api/foo' });
 * logger.info('Stream started', { category: 'streams', workerId: 'abc123' });
 */
export const logger = {
	/**
	 * Debug level logging (only in development, always to file).
	 */
	debug(message: string, context: LogContext = {}): void {
		const formatted = formatLog('debug', message, context);
		writeToFile(formatted, context);
		if (isDev()) {
			console.debug(formatted);
		}
	},

	/**
	 * Info level logging.
	 */
	info(message: string, context: LogContext = {}): void {
		const formatted = formatLog('info', message, context);
		writeToFile(formatted, context);
		console.info(formatted);
	},

	/**
	 * Warning level logging.
	 */
	warn(message: string, context: LogContext = {}): void {
		const formatted = formatLog('warn', message, context);
		writeToFile(formatted, context);
		console.warn(formatted);
	},

	/**
	 * Error level logging with optional Error object.
	 */
	error(message: string, error?: Error | unknown, context: LogContext = {}): void {
		const err = error instanceof Error ? error : undefined;
		const formatted = formatLog('error', message, context, err);
		writeToFile(formatted, context);
		console.error(formatted);
	}
};

/**
 * Creates a child logger with preset context.
 * Useful for request-scoped logging.
 *
 * @example
 * const reqLogger = createChildLogger({ correlationId, path: '/api/foo' });
 * reqLogger.info('Processing request');
 */
export function createChildLogger(baseContext: LogContext) {
	return {
		debug(message: string, context: LogContext = {}): void {
			logger.debug(message, { ...baseContext, ...context });
		},
		info(message: string, context: LogContext = {}): void {
			logger.info(message, { ...baseContext, ...context });
		},
		warn(message: string, context: LogContext = {}): void {
			logger.warn(message, { ...baseContext, ...context });
		},
		error(message: string, error?: Error | unknown, context: LogContext = {}): void {
			logger.error(message, error, { ...baseContext, ...context });
		}
	};
}
